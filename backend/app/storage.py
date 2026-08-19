import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import config

router = APIRouter(prefix="/api/storage", tags=["storage"])

_NOMBRE_INVALIDO = re.compile(r'[\\/:*?"<>|]')


def _carpeta() -> str:
    os.makedirs(config.STORAGE_DIR, exist_ok=True)
    return config.STORAGE_DIR


def _nombre_seguro(nombre: str) -> str:
    """Solo el nombre de archivo, sin ruta ni caracteres que Windows rechace -evita
    que alguien suba algo como "../../otra_carpeta/archivo" y escriba fuera de Storage."""
    base = os.path.basename(nombre).strip()
    base = _NOMBRE_INVALIDO.sub("_", base)
    if not base or base in (".", ".."):
        raise HTTPException(400, "Nombre de archivo inválido.")
    return base


def _nombre_disponible(carpeta: str, nombre: str) -> str:
    """Si el nombre ya existe, agrega " (2)", " (3)", etc. antes de la extensión."""
    ruta = os.path.join(carpeta, nombre)
    if not os.path.exists(ruta):
        return nombre
    raiz, ext = os.path.splitext(nombre)
    n = 2
    while os.path.exists(os.path.join(carpeta, f"{raiz} ({n}){ext}")):
        n += 1
    return f"{raiz} ({n}){ext}"


class ArchivoInfo(BaseModel):
    nombre: str
    tamano_bytes: int
    modificado: str


@router.get("/archivos")
def listar_archivos() -> list[ArchivoInfo]:
    carpeta = _carpeta()
    archivos = []
    for nombre in os.listdir(carpeta):
        ruta = os.path.join(carpeta, nombre)
        if not os.path.isfile(ruta):
            continue
        stat = os.stat(ruta)
        archivos.append(
            ArchivoInfo(
                nombre=nombre,
                tamano_bytes=stat.st_size,
                modificado=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            )
        )
    archivos.sort(key=lambda a: a.modificado, reverse=True)
    return archivos


@router.post("/subir")
async def subir_archivos(archivos: list[UploadFile]) -> list[ArchivoInfo]:
    carpeta = _carpeta()
    subidos = []
    for archivo in archivos:
        if not archivo.filename:
            continue
        nombre = _nombre_disponible(carpeta, _nombre_seguro(archivo.filename))
        ruta = os.path.join(carpeta, nombre)
        contenido = await archivo.read()
        with open(ruta, "wb") as f:
            f.write(contenido)
        stat = os.stat(ruta)
        subidos.append(
            ArchivoInfo(
                nombre=nombre,
                tamano_bytes=stat.st_size,
                modificado=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            )
        )
    return subidos


@router.get("/archivos/{nombre}/descargar")
def descargar_archivo(nombre: str) -> FileResponse:
    ruta = os.path.join(_carpeta(), _nombre_seguro(nombre))
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Archivo no encontrado.")
    return FileResponse(ruta, filename=nombre)


@router.delete("/archivos/{nombre}")
def eliminar_archivo(nombre: str) -> dict[str, str]:
    ruta = os.path.join(_carpeta(), _nombre_seguro(nombre))
    if not os.path.isfile(ruta):
        raise HTTPException(404, "Archivo no encontrado.")
    os.remove(ruta)
    return {"estado": "eliminado"}
