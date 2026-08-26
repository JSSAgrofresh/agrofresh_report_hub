"""
Histórico de cargas de Trace (equipos Accu-Tab) para el dashboard de Post Venta.

Trace analiza los archivos pH/ORP que salen del pendrive del equipo y hasta
ahora todo ese trabajo vivía solo en el navegador: al cerrar la pestaña se
perdía. Acá se guarda cada carga en su propia carpeta dentro de
STORAGE_DIR/Accutab, nombrada con la fecha y hora del guardado:

    Storage/Accutab/2026-08-24_14-32-07/
        registro.json     <- metadatos + filas normalizadas + estadísticas
        informe.pdf       <- el mismo PDF que genera Trace (si se adjuntó)
        originales/       <- los archivos crudos del pendrive, tal cual

El dashboard lista esas carpetas y abre cualquiera. Se guarda `registro.json`
ya normalizado -y no solo los archivos crudos- para que el dashboard no tenga
que volver a parsear formatos de pendrive: esa lógica vive en Trace y no se
duplica acá.
"""
import base64
import json
import os
import re
import shutil
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import config

router = APIRouter(prefix="/api/postventa", tags=["postventa"])

CARPETA_ACCUTAB = "Accutab"
ARCHIVO_REGISTRO = "registro.json"
ARCHIVO_PDF = "informe.pdf"
CARPETA_ORIGINALES = "originales"

# Nombre de carpeta que genera este módulo: 2026-08-24_14-32-07
_PATRON_CARPETA = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$")
_NOMBRE_INVALIDO = re.compile(r'[\\/:*?"<>|]')

# Un pendrive de Accu-Tab trae archivos de texto chicos; el tope evita que una
# carga mal formada llene el disco del servidor.
MAX_BYTES_ADJUNTO = 25 * 1024 * 1024


def _raiz_accutab() -> str:
    ruta = os.path.normpath(os.path.join(config.STORAGE_DIR, CARPETA_ACCUTAB))
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _carpeta_registro(carpeta: str) -> str:
    """Valida el nombre de carpeta contra el patrón de fecha y devuelve su ruta
    absoluta. Al exigir el patrón exacto -no solo "sin .."- cualquier intento de
    salir de Accutab queda descartado antes de tocar el disco."""
    if not _PATRON_CARPETA.match(carpeta or ""):
        raise HTTPException(400, "Identificador de carga inválido.")
    ruta = os.path.join(_raiz_accutab(), carpeta)
    if not os.path.isdir(ruta):
        raise HTTPException(404, "Esa carga no existe.")
    return ruta


class ArchivoAdjunto(BaseModel):
    nombre: str
    # Contenido en base64 -los archivos del pendrive son texto, pero se
    # transportan en base64 para no pelear con codificaciones raras-.
    contenido_b64: str


class RegistroIn(BaseModel):
    # Datos del informe que ya pide Trace en pantalla.
    cliente: str | None = None
    planta: str | None = None
    equipo: str | None = None
    responsable: str | None = None
    limites: dict[str, Any] | None = None
    # Filas ya normalizadas y unificadas pH+ORP, y sus estadísticas.
    filas: list[dict[str, Any]]
    estadisticas: dict[str, Any] | None = None
    archivos: list[ArchivoAdjunto] = []
    pdf_b64: str | None = None


def _decodificar(b64: str, etiqueta: str) -> bytes:
    try:
        datos = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(400, f"{etiqueta}: contenido no es base64 válido.")
    if len(datos) > MAX_BYTES_ADJUNTO:
        raise HTTPException(400, f"{etiqueta}: supera el máximo de {MAX_BYTES_ADJUNTO // (1024 * 1024)} MB.")
    return datos


def _resumen(carpeta: str, registro: dict[str, Any]) -> dict[str, Any]:
    """Lo justo para pintar una fila de la lista, sin cargar todas las filas."""
    est = registro.get("estadisticas") or {}
    ph = est.get("ph") or {}
    mv = est.get("mv") or {}
    return {
        "carpeta": carpeta,
        "guardado_en": registro.get("guardado_en"),
        "cliente": registro.get("cliente"),
        "planta": registro.get("planta"),
        "equipo": registro.get("equipo"),
        "responsable": registro.get("responsable"),
        "n_registros": len(registro.get("filas") or []),
        "ph_promedio": ph.get("prom"),
        "mv_promedio": mv.get("prom"),
        "tiene_pdf": registro.get("tiene_pdf", False),
        "n_archivos": len(registro.get("archivos") or []),
        "origen": registro.get("origen", "manual"),
    }


@router.post("/registros")
def guardar_registro(datos: RegistroIn) -> dict[str, Any]:
    """Guarda una carga de Trace en su propia carpeta, nombrada con la fecha y
    hora del guardado."""
    if not datos.filas:
        raise HTTPException(400, "La carga no trae ninguna fila para guardar.")

    raiz = _raiz_accutab()
    # Dos guardados en el mismo segundo chocarían. El nombre de carpeta ES el
    # identificador y tiene que seguir calzando con _PATRON_CARPETA, así que en
    # vez de agregarle un sufijo se corre al siguiente segundo libre.
    momento = datetime.now()
    for _ in range(60):
        marca = momento.strftime("%Y-%m-%d_%H-%M-%S")
        try:
            os.makedirs(os.path.join(raiz, marca))
            break
        except FileExistsError:
            momento += timedelta(seconds=1)
    else:
        raise HTTPException(409, "No se pudo reservar una carpeta para esta carga, reintenta.")

    destino = os.path.join(raiz, marca)
    try:
        nombres_guardados: list[str] = []
        if datos.archivos:
            carpeta_orig = os.path.join(destino, CARPETA_ORIGINALES)
            os.makedirs(carpeta_orig)
            for adj in datos.archivos:
                nombre = _NOMBRE_INVALIDO.sub("_", os.path.basename(adj.nombre).strip())
                if not nombre or nombre in (".", ".."):
                    continue
                with open(os.path.join(carpeta_orig, nombre), "wb") as f:
                    f.write(_decodificar(adj.contenido_b64, nombre))
                nombres_guardados.append(nombre)

        tiene_pdf = False
        if datos.pdf_b64:
            with open(os.path.join(destino, ARCHIVO_PDF), "wb") as f:
                f.write(_decodificar(datos.pdf_b64, "Informe PDF"))
            tiene_pdf = True

        registro = {
            "guardado_en": datetime.now(tz=timezone.utc).isoformat(),
            "cliente": datos.cliente,
            "planta": datos.planta,
            "equipo": datos.equipo,
            "responsable": datos.responsable,
            "limites": datos.limites,
            "estadisticas": datos.estadisticas,
            "filas": datos.filas,
            "archivos": nombres_guardados,
            "tiene_pdf": tiene_pdf,
        }
        with open(os.path.join(destino, ARCHIVO_REGISTRO), "w", encoding="utf-8") as f:
            json.dump(registro, f, ensure_ascii=False)
    except Exception:
        # Una carga a medio escribir confundiría al dashboard: se limpia.
        shutil.rmtree(destino, ignore_errors=True)
        raise

    return {"carpeta": marca, "resumen": _resumen(marca, registro)}


@router.get("/registros")
def listar_registros() -> list[dict[str, Any]]:
    """Todas las cargas guardadas, de la más reciente a la más antigua."""
    raiz = _raiz_accutab()
    salida = []
    for nombre in os.listdir(raiz):
        if not _PATRON_CARPETA.match(nombre):
            continue
        ruta_json = os.path.join(raiz, nombre, ARCHIVO_REGISTRO)
        if not os.path.isfile(ruta_json):
            continue
        try:
            with open(ruta_json, encoding="utf-8") as f:
                salida.append(_resumen(nombre, json.load(f)))
        except (OSError, json.JSONDecodeError):
            # Una carpeta corrupta no puede tumbar el listado completo.
            continue
    salida.sort(key=lambda r: r["carpeta"], reverse=True)
    return salida


@router.get("/registros/{carpeta}")
def ver_registro(carpeta: str) -> dict[str, Any]:
    ruta = os.path.join(_carpeta_registro(carpeta), ARCHIVO_REGISTRO)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Esa carga no tiene datos guardados.")
    with open(ruta, encoding="utf-8") as f:
        registro = json.load(f)
    registro["carpeta"] = carpeta
    if "origen" not in registro:
        registro["origen"] = "manual"
    return registro


@router.get("/registros/{carpeta}/pdf")
def descargar_pdf(carpeta: str) -> FileResponse:
    ruta = os.path.join(_carpeta_registro(carpeta), ARCHIVO_PDF)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Esta carga no tiene informe PDF guardado.")
    return FileResponse(ruta, media_type="application/pdf", filename=f"Trace_{carpeta}.pdf")


@router.get("/registros/{carpeta}/originales/{nombre}")
def descargar_original(carpeta: str, nombre: str) -> FileResponse:
    base = _carpeta_registro(carpeta)
    seguro = _NOMBRE_INVALIDO.sub("_", os.path.basename(nombre).strip())
    ruta = os.path.join(base, CARPETA_ORIGINALES, seguro)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Ese archivo no existe en esta carga.")
    return FileResponse(ruta, filename=seguro)


@router.delete("/registros/{carpeta}")
def eliminar_registro(carpeta: str) -> dict[str, bool]:
    shutil.rmtree(_carpeta_registro(carpeta))
    return {"ok": True}
