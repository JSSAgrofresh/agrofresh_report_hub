"""
Toma de muestras — listado y creación de solicitudes de muestreo. No hay
tabla en base de datos todavía (igual que Storage): cada solicitud se
guarda como un archivo JSON en disco, reutilizando el mismo mecanismo de
almacenamiento que storage.py.

Estructura de carpetas dentro de Storage:

    solicitudes/
        QUITECA/
        AGROFRESH/
        ALS/
        DIAGNOFRUIT/

Cada laboratorio tiene su propia carpeta; el N° de solicitud (folio
"SOL-NNNN") es correlativo y único across todas las carpetas.
"""
import json
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config

router = APIRouter(prefix="/api/toma-muestras", tags=["toma-muestras"])

_CARPETA_RAIZ = "solicitudes"
LABORATORIOS = ("QUITECA", "AGROFRESH", "ALS", "DIAGNOFRUIT")
_PAT_NUMERO = re.compile(r"^SOL-(\d+)$")


def _carpeta_raiz() -> str:
    ruta = os.path.join(config.STORAGE_DIR, _CARPETA_RAIZ)
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _carpeta_laboratorio(laboratorio: str) -> str:
    if laboratorio not in LABORATORIOS:
        raise HTTPException(400, f"Laboratorio inválido: {laboratorio}")
    ruta = os.path.join(_carpeta_raiz(), laboratorio)
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _ruta_archivo(archivo: str) -> str:
    # os.path.basename descarta cualquier componente de ruta ("../etc") -
    # cada carpeta de laboratorio es plana, así que basta con esto para no
    # salir de "solicitudes/<LABORATORIO>/".
    nombre = os.path.basename(archivo)
    for laboratorio in LABORATORIOS:
        ruta = os.path.join(_carpeta_raiz(), laboratorio, nombre)
        if os.path.isfile(ruta):
            return ruta
    raise HTTPException(404, "Solicitud no encontrada.")


def _siguiente_numero() -> str:
    """Folio correlativo único entre las 4 carpetas de laboratorio."""
    maximo = 0
    for laboratorio in LABORATORIOS:
        carpeta = os.path.join(_carpeta_raiz(), laboratorio)
        if not os.path.isdir(carpeta):
            continue
        for nombre in os.listdir(carpeta):
            m = _PAT_NUMERO.match(os.path.splitext(nombre)[0])
            if m:
                maximo = max(maximo, int(m.group(1)))
    return f"SOL-{maximo + 1:04d}"


class SolicitudIn(BaseModel):
    laboratorio: str
    solicitante: str
    sold_to: str
    ship_to: str | None = None
    especie: str | None = None
    variedad: str | None = None
    linea_proceso: str | None = None
    csg: str | None = None
    lote: str | None = None
    posicion_muestreo: str | None = None
    numero_camara: str | None = None
    numero_orden: str | None = None
    kilos_procesados: float | None = None
    producto_utilizado: str | None = None
    tipo_muestra: str | None = None
    fecha_muestreo: str | None = None
    hora_muestreo: str | None = None
    nombre_muestreador: str | None = None
    generado_por: str
    email_solicitante: str | None = None
    email_laboratorio: str | None = None
    observacion: str | None = None
    # Campos propios del laboratorio elegido (etiqueta -> valor). Solo debe
    # traer los campos aplicables al `laboratorio` de esta solicitud.
    campos_laboratorio: dict[str, str] = {}


class Solicitud(SolicitudIn):
    archivo: str
    numero_solicitud: str
    fecha_solicitud: str
    creado_en: str


@router.get("/solicitudes")
def listar_solicitudes() -> list[Solicitud]:
    solicitudes = []
    for laboratorio in LABORATORIOS:
        carpeta = os.path.join(_carpeta_raiz(), laboratorio)
        if not os.path.isdir(carpeta):
            continue
        for nombre in os.listdir(carpeta):
            if not nombre.endswith(".json"):
                continue
            with open(os.path.join(carpeta, nombre), encoding="utf-8") as f:
                datos = json.load(f)
            solicitudes.append(Solicitud(archivo=nombre, **datos))
    solicitudes.sort(key=lambda s: s.creado_en, reverse=True)
    return solicitudes


@router.get("/solicitudes/{archivo}")
def obtener_solicitud(archivo: str) -> Solicitud:
    ruta = _ruta_archivo(archivo)
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    return Solicitud(archivo=os.path.basename(ruta), **datos)


@router.post("/solicitudes")
def crear_solicitud(body: SolicitudIn) -> Solicitud:
    carpeta_lab = _carpeta_laboratorio(body.laboratorio)
    numero = _siguiente_numero()
    ahora = datetime.now(timezone.utc)
    datos = body.model_dump()
    datos.update(
        numero_solicitud=numero,
        fecha_solicitud=ahora.date().isoformat(),
        creado_en=ahora.isoformat(),
    )
    nombre_archivo = f"{numero}.json"
    with open(os.path.join(carpeta_lab, nombre_archivo), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    return Solicitud(archivo=nombre_archivo, **datos)


@router.delete("/solicitudes/{archivo}")
def eliminar_solicitud(archivo: str) -> dict[str, str]:
    ruta = _ruta_archivo(archivo)
    os.remove(ruta)
    return {"estado": "eliminado"}
