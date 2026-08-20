"""
Toma de muestras — Fase 1: listado y creación básica de solicitudes de
muestreo. No hay tabla en base de datos todavía (igual que Storage): cada
solicitud se guarda como un archivo JSON dentro de la carpeta de Storage
del proyecto (config.STORAGE_DIR / "Toma de muestras"), reutilizando el
mismo mecanismo de almacenamiento en disco que storage.py.
"""
import json
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config

router = APIRouter(prefix="/api/toma-muestras", tags=["toma-muestras"])

_CARPETA = "Toma de muestras"
_PAT_NUMERO = re.compile(r"^SOL-(\d+)$")


def _carpeta_solicitudes() -> str:
    ruta = os.path.join(config.STORAGE_DIR, _CARPETA)
    os.makedirs(ruta, exist_ok=True)
    return ruta


class SolicitudIn(BaseModel):
    generado_por: str
    laboratorio: str
    tipo_aplicacion: str


class Solicitud(BaseModel):
    archivo: str
    numero_solicitud: str
    fecha_solicitud: str
    generado_por: str
    laboratorio: str
    tipo_aplicacion: str
    creado_en: str


def _siguiente_numero(carpeta: str) -> str:
    maximo = 0
    for nombre in os.listdir(carpeta):
        m = _PAT_NUMERO.match(os.path.splitext(nombre)[0])
        if m:
            maximo = max(maximo, int(m.group(1)))
    return f"SOL-{maximo + 1:04d}"


def _ruta_archivo(archivo: str) -> str:
    # os.path.basename descarta cualquier componente de ruta ("../etc") -
    # la carpeta es plana, así que basta con esto para no salir de ella.
    return os.path.join(_carpeta_solicitudes(), os.path.basename(archivo))


@router.get("/solicitudes")
def listar_solicitudes() -> list[Solicitud]:
    carpeta = _carpeta_solicitudes()
    solicitudes = []
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
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Solicitud no encontrada.")
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    return Solicitud(archivo=os.path.basename(ruta), **datos)


@router.post("/solicitudes")
def crear_solicitud(body: SolicitudIn) -> Solicitud:
    carpeta = _carpeta_solicitudes()
    numero = _siguiente_numero(carpeta)
    ahora = datetime.now(timezone.utc)
    datos = {
        "numero_solicitud": numero,
        "fecha_solicitud": ahora.date().isoformat(),
        "generado_por": body.generado_por.strip(),
        "laboratorio": body.laboratorio.strip(),
        "tipo_aplicacion": body.tipo_aplicacion.strip(),
        "creado_en": ahora.isoformat(),
    }
    nombre_archivo = f"{numero}.json"
    with open(os.path.join(carpeta, nombre_archivo), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    return Solicitud(archivo=nombre_archivo, **datos)


@router.delete("/solicitudes/{archivo}")
def eliminar_solicitud(archivo: str) -> dict[str, str]:
    ruta = _ruta_archivo(archivo)
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Solicitud no encontrada.")
    os.remove(ruta)
    return {"estado": "eliminado"}
