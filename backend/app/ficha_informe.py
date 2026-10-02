"""
Ficha de un informe, para la ventana que se abre al hacer clic en un punto de
Report: todos los datos de la solicitud, sus resultados con el producto y la
dosis aplicados, de qué carga viene, lo que dice la solicitud de Toma de
muestras y -si existe- el PDF del informe, para mostrarlo en pantalla.

Solo personal interno: los PDF son de los laboratorios y de AgroFresh, y la
cuenta de un cliente no tiene por qué verlos (ver `solo_interno`).

El PDF se busca en dos lugares, en este orden:
  1. `informe_auditoria`: el que se subió por Converter, que trae el N° de
     informe del laboratorio (Quiteca, ALS…).
  2. Storage → Informes (`informes/<planta>/…`): la copia ordenada por planta,
     donde también quedan los informes propios de AgroFresh (`<folio>.pdf`).

Todo lo que se lee de la base va con `.get()`: si una migración no se corrió en
el servidor, la ficha sale con menos datos en vez de fallar.
"""
from __future__ import annotations

import logging
import unicodedata
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import quote

import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from . import informes_storage, r2
from . import r2_auditoria as r2a
from .auditoria_interna import errores_r2
from .auth import solo_interno
from .db import conexion, cursor_dict
from .r2_auditoria import segmento_seguro

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reportes/informe", tags=["reportes"], dependencies=[Depends(solo_interno)])

# Lo que se muestra de la solicitud, en el orden de la ficha.
CAMPOS_SOLICITUD = (
    "nro_solicitud", "laboratorio", "referencia", "referencia_proceso", "codigo_ensayo", "nro_ensayo", "nro_orden",
    "fecha_solicitud", "fecha_muestreo", "hora_muestreo", "fecha_entrada", "fecha_recepcion", "fecha_analisis", "fecha_informe",
    "semana_muestreo", "semana_entrada", "mes", "temporada",
    "especie", "variedad", "tipo_servicio", "tipo_muestra", "posicion_muestreo",
    "lote", "nro_camara", "nro_linea", "kg_procesados", "csg",
    "nombre_muestreador", "solicitante", "generado_por", "email_solicitante", "email_laboratorio",
    "producto_utilizado", "observacion", "observacion_2", "sold_to_raw", "ship_to_raw", "origen",
)

# De la solicitud de Toma de muestras: lo que la base de Report no suele traer.
CAMPOS_TOMA = (
    "tipo_muestra", "nombre_muestreador", "linea_proceso", "numero_camara", "kilos_procesados", "producto_utilizado",
    "csg_productor", "csg_packing", "lote", "numero_orden", "hora_muestreo", "posicion_muestreo", "observacion",
    "email_solicitante", "generado_por", "fecha_solicitud",
)


def _limpio(valor: Any) -> Any:
    """JSON-seguro: fechas en ISO, decimales como número, texto vacío como None."""
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, str):
        return valor.strip() or None
    return valor


def _lleno(valor: Any) -> bool:
    return valor is not None and str(valor).strip() != ""


def elegir_clave(claves: list[str], nro: str | None) -> str | None:
    """Entre las claves de R2 de una planta, el PDF de este informe.

    Primero el que se llama exactamente como el informe (`AGF0001.pdf`), después
    el que lo contiene en el nombre (`2026-1885-PC Copefrut Romeral.pdf`).
    Si hay varios, el más corto: es el más parecido al N° de informe.
    """
    numero = (nro or "").strip().casefold()
    if not numero:
        return None
    pdfs = [k for k in claves if k.lower().endswith(".pdf")]

    def nombre(k: str) -> str:
        return k.rsplit("/", 1)[-1].rsplit(".", 1)[0].strip().casefold()

    exactos = [k for k in pdfs if nombre(k) == numero]
    if exactos:
        return sorted(exactos)[0]
    contienen = [k for k in pdfs if numero in nombre(k)]
    return sorted(contienen, key=lambda k: (len(k), k))[0] if contienen else None


def datos_de_toma(datos: dict | None) -> dict:
    """Los campos útiles de la solicitud de Toma de muestras, sin los vacíos."""
    return {c: _limpio(datos[c]) for c in CAMPOS_TOMA if datos and _lleno(datos.get(c))}


def construir_ficha(
    sol: dict, resultados: list[dict], productos: list[dict], carga: dict | None, toma: dict | None, pdf: dict | None,
) -> dict:
    """Arma la respuesta a partir de las filas ya leídas (sin tocar la base)."""
    por_analito: dict[Any, dict] = {}
    for p in productos:
        por_analito[p.get("analito_id") if p.get("analito_id") is not None else (p.get("analito_raw") or "").upper()] = p

    filas = []
    for r in resultados:
        p = por_analito.get(r.get("analito_id")) or por_analito.get((r.get("analito_raw") or "").upper()) or {}
        codigo = r.get("codigo") or r.get("analito_raw")
        filas.append({
            "codigo": codigo,
            "nombre": r.get("nombre") or codigo,
            "categoria": _limpio(r.get("categoria")),
            "unidad": _limpio(r.get("unidad")) or "ppm",
            "valor_num": _limpio(r.get("valor_num")),
            "valor_texto": _limpio(r.get("valor_texto")),
            "producto": _limpio(p.get("producto_raw")),
            "dosis": _limpio(p.get("dosis")),
            "gasto": _limpio(p.get("gasto")),
            "tipo_aplicacion": _limpio(p.get("tipo_aplicacion")),
            "linea_proceso": _limpio(p.get("linea_proceso")),
        })
    filas.sort(key=lambda f: (f["codigo"] or "").casefold())

    return {
        "solicitud": {
            "id": sol.get("id"),
            **{c: _limpio(sol.get(c)) for c in CAMPOS_SOLICITUD},
            "cliente": _limpio(sol.get("cliente")),
            "planta": _limpio(sol.get("planta")),
        },
        "resultados": filas,
        "carga": {k: _limpio(v) for k, v in carga.items()} if carga else None,
        "toma": datos_de_toma(toma) or None,
        "pdf": ({"disponible": True, "nombre": pdf["nombre"], "origen": pdf["origen"]} if pdf else {"disponible": False}),
    }


# ---------------------------------------------------------------------------
# Lecturas de la base y de R2
# ---------------------------------------------------------------------------

def _solicitud(cur, solicitud_id: int) -> dict | None:
    cur.execute(
        """
        SELECT s.*, COALESCE(c.nombre, s.sold_to_raw) AS cliente, COALESCE(p.nombre, s.ship_to_raw) AS planta
          FROM solicitud s
          LEFT JOIN planta p ON p.id = s.planta_id
          LEFT JOIN cliente c ON c.id = p.cliente_id
         WHERE s.id = %s
        """,
        (solicitud_id,),
    )
    return cur.fetchone()


def _resultados(cur, solicitud_id: int) -> list[dict]:
    cur.execute(
        """
        SELECT r.analito_id, r.analito_raw, r.valor_num, r.valor_texto,
               COALESCE(a.codigo, r.analito_raw) AS codigo, COALESCE(a.nombre, r.analito_raw) AS nombre,
               a.unidad, a.categoria
          FROM resultado r LEFT JOIN analito a ON a.id = r.analito_id
         WHERE r.solicitud_id = %s
        """,
        (solicitud_id,),
    )
    return cur.fetchall()


def _carga(cur, carga_id: Any) -> dict | None:
    if carga_id is None:
        return None
    try:
        cur.execute("SELECT archivo, origen, creado_por, creado_en FROM carga_datos WHERE id = %s", (carga_id,))
    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
        return None
    return cur.fetchone()


def _toma(cur, referencia: str | None) -> dict | None:
    if not _lleno(referencia):
        return None
    try:
        cur.execute("SELECT datos FROM solicitud_archivo WHERE numero_solicitud = %s LIMIT 1", (referencia,))
    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
        return None
    fila = cur.fetchone()
    return fila["datos"] if fila else None


def _buscar_pdf(cur, sol: dict) -> dict | None:
    """Dónde está el PDF de esta solicitud: {origen, nombre, clave} o None."""
    nro = (sol.get("nro_solicitud") or "").strip()
    if not nro:
        return None
    try:
        cur.execute(
            "SELECT nombre_archivo, r2_key FROM informe_auditoria"
            " WHERE btrim(nro_informe) = %s AND lower(btrim(laboratorio)) = lower(btrim(%s))"
            " ORDER BY subido_en DESC LIMIT 1",
            (nro, sol.get("laboratorio") or ""),
        )
        fila = cur.fetchone()
        if fila and r2a.disponible():
            return {"origen": "auditoria", "nombre": fila["nombre_archivo"], "clave": fila["r2_key"]}
    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedColumn):
        pass

    if r2.disponible():
        planta = informes_storage.carpeta_planta(sol.get("planta") or sol.get("ship_to_raw"), sol.get("cliente") or sol.get("sold_to_raw"))
        prefijo = f"{informes_storage.RAIZ}/{segmento_seguro(planta, 'Sin planta')}/"
        try:
            clave = elegir_clave(r2.listar_keys(prefijo), nro)
        except Exception:
            logger.exception("No se pudo listar %s en R2", prefijo)
            clave = None
        if clave:
            return {"origen": "informes", "nombre": clave.rsplit("/", 1)[-1], "clave": clave}
    return None


def _disposicion_inline(nombre: str) -> str:
    # Los encabezados HTTP no son UTF-8 (ver CLAUDE.md): filename* + un filename sin tildes.
    ascii_seguro = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().replace('"', "") or "informe.pdf"
    return f"inline; filename=\"{ascii_seguro}\"; filename*=UTF-8''{quote(nombre)}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{solicitud_id}")
def ficha(solicitud_id: int) -> dict:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        sol = _solicitud(cur, solicitud_id)
        if sol is None:
            raise HTTPException(404, "Informe no encontrado.")
        resultados = _resultados(cur, solicitud_id)
        cur.execute("SELECT * FROM producto_aplicado WHERE solicitud_id = %s", (solicitud_id,))
        productos = cur.fetchall()
        carga = _carga(cur, sol.get("carga_id"))
        toma = _toma(cur, sol.get("referencia"))
        pdf = _buscar_pdf(cur, sol)
    return construir_ficha(sol, resultados, productos, carga, toma, pdf)


@router.get("/{solicitud_id}/pdf")
def pdf_del_informe(solicitud_id: int) -> Response:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        sol = _solicitud(cur, solicitud_id)
        if sol is None:
            raise HTTPException(404, "Informe no encontrado.")
        pdf = _buscar_pdf(cur, sol)
    if pdf is None:
        raise HTTPException(404, "Este informe todavía no tiene un PDF guardado.")
    with errores_r2():
        datos = r2a.descargar(pdf["clave"]) if pdf["origen"] == "auditoria" else r2.descargar(pdf["clave"])
    if datos is None:
        raise HTTPException(404, "El PDF ya no está en el almacenamiento.")
    return Response(
        content=datos,
        media_type="application/pdf",
        headers={"Content-Disposition": _disposicion_inline(pdf["nombre"]), "Cache-Control": "private, max-age=300"},
    )
