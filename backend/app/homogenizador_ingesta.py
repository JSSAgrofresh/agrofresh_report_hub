"""
Flujo nuevo de ingesta: el usuario sube el Excel, ve los valores únicos de Sold
To / Ship To / Especie / Variedad con sus sugerencias automáticas y las confirma
(o descarta las filas sin mapeo) antes de que nada entre a la base.

Endpoints:
  POST /api/homogenizador-ingesta/analizar
      Recibe el archivo Excel por multipart. Devuelve los valores únicos de
      las 4 columnas con su sugerencia automática y un token de sesión.

  POST /api/homogenizador-ingesta/confirmar
      Recibe el token + los mapeos decididos por el usuario y ejecuta la
      ingesta real (o un preview). Descarta las filas cuyo mapeo sea "".
"""
from __future__ import annotations

import datetime
import json
import os
import pathlib
import tempfile
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from psycopg2.extras import execute_values
from pydantic import BaseModel

from .auth import Usuario, usuario_actual
from .db import conexion, cursor_dict
from .homogenizador import clave as clave_hom, Homogenizador
from .ingest import (
    _cargar_analitos,
    _cargar_catalogos,
    _cargar_mapas_listados,
    _procesar_filas,
    clave_normalizada_empresa,
    crear_carga,
)
from .listados import clave_normalizada

router = APIRouter(prefix="/api/homogenizador-ingesta", tags=["homogenizador-ingesta"])

# Directorio compartido en disco: todos los workers lo ven aunque el upload
# y el confirm los atienda workers distintos.
_DIR_PENDIENTES = pathlib.Path(tempfile.gettempdir()) / "hom_ingesta"
_DIR_PENDIENTES.mkdir(exist_ok=True)


def _ruta_token(token: str) -> pathlib.Path:
    # Solo caracteres UUID válidos, sin path traversal posible.
    safe = "".join(c for c in token if c in "0123456789abcdef-")
    return _DIR_PENDIENTES / f"{safe}.xlsx"

# ──────────────────────────────────────────────
#  Lectura del Excel
# ──────────────────────────────────────────────

def _importar_openpyxl():
    try:
        import openpyxl
        return openpyxl
    except ImportError as exc:
        raise HTTPException(500, "openpyxl no está instalado en el servidor") from exc


def _leer_filas(ruta: str) -> list[dict[str, Any]]:
    """Lee la hoja 'BD' del Excel y devuelve una lista de dicts col→valor.

    El encabezado está en la fila 2 (fila 1 es decorativa o título). Se acepta
    también que el encabezado esté en la fila 1 si 'N° Informe' aparece ahí.
    """
    ox = _importar_openpyxl()
    wb = ox.load_workbook(ruta, read_only=True, data_only=True)

    nombre_hoja = "BD" if "BD" in wb.sheetnames else wb.sheetnames[0]
    ws = wb[nombre_hoja]

    filas_raw = list(ws.iter_rows(values_only=True))
    wb.close()

    if not filas_raw:
        return []

    # Detecta si el encabezado está en fila 1 o fila 2
    enc_fila1 = [str(c).strip() if c is not None else "" for c in filas_raw[0]]
    if "N° Informe" in enc_fila1 or "N° Solicitud" in enc_fila1 or "Sold To" in enc_fila1:
        encabezados = enc_fila1
        inicio = 1
    elif len(filas_raw) > 1:
        encabezados = [str(c).strip() if c is not None else "" for c in filas_raw[1]]
        inicio = 2
    else:
        return []

    filas: list[dict[str, Any]] = []
    for fila in filas_raw[inicio:]:
        d: dict[str, Any] = {}
        for i in range(min(len(encabezados), len(fila))):
            v = fila[i]
            # openpyxl devuelve celdas de fecha como datetime/date; las convertimos
            # a ISO string para que sean JSON-serializables al guardar en pendiente_revision
            if isinstance(v, (datetime.datetime, datetime.date)):
                v = v.isoformat()
            d[encabezados[i]] = v
        # Omitir filas completamente vacías
        if any(v is not None and str(v).strip() for v in d.values()):
            filas.append(d)
    return filas


# ──────────────────────────────────────────────
#  Mapas canónicos (para sugerencias)
# ──────────────────────────────────────────────

def _valores_canonicos_sold_to(cur) -> list[str]:
    cur.execute("SELECT nombre FROM cliente WHERE activo ORDER BY nombre")
    return [r["nombre"] for r in cur.fetchall()]


def _valores_canonicos_ship_to(cur, cliente_nombre: str | None = None) -> list[str]:
    if cliente_nombre:
        cur.execute(
            "SELECT p.nombre FROM planta p JOIN cliente c ON c.id = p.cliente_id "
            "WHERE p.activo AND c.activo AND c.nombre = %s ORDER BY p.nombre",
            (cliente_nombre,),
        )
    else:
        cur.execute(
            "SELECT p.nombre FROM planta p JOIN cliente c ON c.id = p.cliente_id "
            "WHERE p.activo AND c.activo ORDER BY p.nombre"
        )
    return [r["nombre"] for r in cur.fetchall()]


def _valores_canonicos_especies(cur) -> list[str]:
    cur.execute(
        "SELECT valor FROM valor_lista WHERE tipo = 'especie' AND es_estandar = true AND activo ORDER BY valor"
    )
    return [r["valor"] for r in cur.fetchall()]


def _valores_canonicos_variedades(cur, especie: str | None = None) -> list[str]:
    if especie:
        cur.execute(
            "SELECT vv.valor FROM valor_lista vv "
            "JOIN valor_lista ve ON ve.id = vv.especie_id "
            "WHERE vv.tipo = 'variedad' AND vv.es_estandar = true AND vv.activo "
            "AND ve.valor = %s ORDER BY vv.valor",
            (especie,),
        )
    else:
        cur.execute(
            "SELECT valor FROM valor_lista WHERE tipo = 'variedad' AND es_estandar = true AND activo ORDER BY valor"
        )
    return [r["valor"] for r in cur.fetchall()]


# ──────────────────────────────────────────────
#  Análisis de valores únicos
# ──────────────────────────────────────────────

def _analizar_columna(
    valores_crudos: list[str],
    canonicos: list[str],
) -> list[dict[str, Any]]:
    """Por cada valor único crudo, corre el Homogenizador y devuelve el
    resultado con sugerencias."""
    homog = Homogenizador(canonicos)
    vistos: dict[str, int] = {}  # valor_crudo -> count
    for v in valores_crudos:
        k = (v or "").strip()
        if k:
            vistos[k] = vistos.get(k, 0) + 1

    resultado: list[dict[str, Any]] = []
    for valor_crudo, count in sorted(vistos.items(), key=lambda x: (-x[1], x[0])):
        res = homog.resolver(valor_crudo)
        resultado.append(
            {
                "valor_crudo": valor_crudo,
                "filas": count,
                "sugerencia_auto": res.valor,
                "automatico": res.automatico,
                "regla": res.regla,
                "sugerencias": [{"valor": s, "confianza": round(c, 2)} for s, c in res.sugerencias[:5]],
            }
        )
    return resultado


# ──────────────────────────────────────────────
#  Endpoint: analizar
# ──────────────────────────────────────────────

@router.post("/analizar")
async def analizar(
    archivo: UploadFile = File(...),
    _usuario: Usuario = Depends(usuario_actual),
) -> dict[str, Any]:
    """Sube el Excel y devuelve los valores únicos de las 4 columnas con sus
    sugerencias de mapeo y un token para la etapa de confirmación."""

    # Guardar en el directorio compartido con ruta predecible por token.
    # Así cualquier worker encuentra el archivo al confirmar.
    token = str(uuid.uuid4())
    ruta = _ruta_token(token)
    try:
        contenido = await archivo.read()
        ruta.write_bytes(contenido)
    except Exception:
        ruta.unlink(missing_ok=True)
        raise

    # Leer filas
    try:
        filas = _leer_filas(str(ruta))
    except Exception as exc:
        ruta.unlink(missing_ok=True)
        raise HTTPException(400, f"No se pudo leer el Excel: {exc}") from exc

    if not filas:
        ruta.unlink(missing_ok=True)
        raise HTTPException(400, "El archivo no tiene filas con datos.")

    # Extraer columnas de interés
    col_sold = [str(f.get("Sold To") or "").strip() for f in filas]
    col_ship = [str(f.get("Ship To") or "").strip() for f in filas]
    col_esp = [str(f.get("Especie") or "").strip() for f in filas]
    col_var = [str(f.get("Variedad") or "").strip() for f in filas]

    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            can_sold = _valores_canonicos_sold_to(cur)
            can_ship = _valores_canonicos_ship_to(cur)
            can_esp = _valores_canonicos_especies(cur)
            can_var = _valores_canonicos_variedades(cur)

    return {
        "token": token,
        "total_filas": len(filas),
        "columnas": {
            "sold_to": _analizar_columna(col_sold, can_sold),
            "ship_to": _analizar_columna(col_ship, can_ship),
            "especie": _analizar_columna(col_esp, can_esp),
            "variedad": _analizar_columna(col_var, can_var),
        },
    }


# ──────────────────────────────────────────────
#  Endpoint: confirmar / ingestar
# ──────────────────────────────────────────────

class MapeoColumna(BaseModel):
    # valor_crudo -> valor_canonico (o "" para descartar)
    mapeo: dict[str, str]


class ConfirmarRequest(BaseModel):
    token: str
    sold_to: MapeoColumna
    ship_to: MapeoColumna
    especie: MapeoColumna
    variedad: MapeoColumna
    preview: bool = False
    # Nombre del Excel, solo para el historial de cargas.
    archivo: str | None = None


@router.post("/confirmar")
def confirmar(
    payload: ConfirmarRequest,
    usuario: Usuario = Depends(usuario_actual),
) -> dict[str, Any]:
    """Aplica los mapeos a todas las filas del Excel y las ingesta (o hace
    preview). Las filas cuyo Sold To, Especie o Variedad hayan sido mapeados a
    "" se descartan antes de tocar la base."""

    ruta = _ruta_token(payload.token)
    if not ruta.exists():
        raise HTTPException(404, "Token inválido o sesión expirada. Vuelve a subir el archivo.")

    filas_raw = _leer_filas(str(ruta))
    if not filas_raw:
        raise HTTPException(400, "El archivo no tiene filas con datos.")

    map_st = payload.sold_to.mapeo
    map_sh = payload.ship_to.mapeo
    map_esp = payload.especie.mapeo
    map_var = payload.variedad.mapeo

    filas_procesadas: list[dict[str, Any]] = []
    descartadas = 0

    for fila in filas_raw:
        sold_crudo = str(fila.get("Sold To") or "").strip()
        ship_crudo = str(fila.get("Ship To") or "").strip()
        esp_crudo = str(fila.get("Especie") or "").strip()
        var_crudo = str(fila.get("Variedad") or "").strip()

        # Aplicar mapeo o descartar
        sold_ok = map_st.get(sold_crudo, sold_crudo) if sold_crudo else ""
        ship_ok = map_sh.get(ship_crudo, ship_crudo) if ship_crudo else ""
        esp_ok = map_esp.get(esp_crudo, esp_crudo) if esp_crudo else ""
        var_ok = map_var.get(var_crudo, var_crudo) if var_crudo else ""

        # "" significa "descartar filas con este valor"
        if sold_crudo and sold_ok == "":
            descartadas += 1
            continue
        if esp_crudo and esp_ok == "":
            descartadas += 1
            continue

        # Reescribir los campos en la fila
        fila_mod = dict(fila)
        if sold_crudo:
            fila_mod["Sold To"] = sold_ok
        if ship_crudo:
            fila_mod["Ship To"] = ship_ok if ship_ok else None
        if esp_crudo:
            fila_mod["Especie"] = esp_ok
        if var_crudo:
            fila_mod["Variedad"] = var_ok if var_ok else None

        def _txt(v: Any) -> str | None:
            if v is None:
                return None
            s = str(v).strip()
            return s or None

        # Inyectar los valores ya resueltos para que _procesar_filas no los
        # vuelva a buscar por calce (ya los resolvimos acá arriba).
        # _txt() garantiza str|None: openpyxl puede devolver 0 (int) en celdas
        # vacías, que Postgres rechaza al insertar en columnas text.
        fila_mod["__homogenizacion__"] = {
            "sold_to_raw": _txt(fila_mod.get("Sold To")),
            "ship_to_raw": _txt(fila_mod.get("Ship To")),
            "especie": _txt(fila_mod.get("Especie")),
            "variedad": _txt(fila_mod.get("Variedad")),
        }

        filas_procesadas.append(fila_mod)

    if not filas_procesadas and not payload.preview:
        # Limpiar si no hay nada que hacer
        if not payload.preview:
            _limpiar_token(payload.token)
        raise HTTPException(400, "Todas las filas fueron descartadas. No hay nada que ingestar.")

    escribir = not payload.preview

    with conexion(escribir=escribir) as conn:
        with cursor_dict(conn) as cur:
            carga_id = (
                crear_carga(cur, "ingest", payload.archivo, len(filas_procesadas), usuario.nombre or usuario.email)
                if escribir
                else None
            )
            resultado = _procesar_filas(
                cur, filas_procesadas, escribir=escribir, acumular_detalle=False, carga_id=carga_id
            )

    resumen = resultado["resumen"]
    resumen["descartadas"] = descartadas

    if escribir:
        _limpiar_token(payload.token)

    return resumen


@router.delete("/cancelar/{token}")
def cancelar(
    token: str,
    _usuario: Usuario = Depends(usuario_actual),
) -> dict[str, str]:
    _limpiar_token(token)
    return {"ok": "token eliminado"}


def _limpiar_token(token: str) -> None:
    _ruta_token(token).unlink(missing_ok=True)
