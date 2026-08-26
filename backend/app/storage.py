import os
import re
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import config

router = APIRouter(prefix="/api/storage", tags=["storage"])

_NOMBRE_INVALIDO = re.compile(r'[\\/:*?"<>|]')


def _carpeta_raiz() -> str:
    os.makedirs(config.STORAGE_DIR, exist_ok=True)
    return os.path.normpath(config.STORAGE_DIR)


def _nombre_seguro(nombre: str) -> str:
    """Solo el nombre, sin ruta ni caracteres que Windows rechace."""
    base = os.path.basename(nombre).strip()
    base = _NOMBRE_INVALIDO.sub("_", base)
    if not base or base in (".", ".."):
        raise HTTPException(400, "Nombre inválido.")
    return base


def _segmentos(ruta: str) -> list[str]:
    partes = [p for p in ruta.replace("\\", "/").split("/") if p not in ("", ".")]
    if any(p == ".." for p in partes):
        raise HTTPException(400, "Ruta inválida.")
    return [_nombre_seguro(p) for p in partes]


def _resolver(ruta: str) -> str:
    """Ruta relativa (con "/" como separador) -> ruta absoluta dentro de Storage.
    Nunca deja salir de la carpeta raíz, así una ruta con ".." o similar no
    puede escribir/leer/borrar fuera de Storage."""
    raiz = _carpeta_raiz()
    absoluto = os.path.normpath(os.path.join(raiz, *_segmentos(ruta)))
    if absoluto != raiz and not absoluto.startswith(raiz + os.sep):
        raise HTTPException(400, "Ruta inválida.")
    return absoluto


def _ruta_relativa(raiz: str, absoluto: str) -> str:
    return os.path.relpath(absoluto, raiz).replace(os.sep, "/")


def _nombre_disponible(carpeta: str, nombre: str) -> str:
    """Si el nombre ya existe (archivo o carpeta), agrega " (2)", " (3)", etc."""
    ruta = os.path.join(carpeta, nombre)
    if not os.path.exists(ruta):
        return nombre
    raiz, ext = os.path.splitext(nombre)
    n = 2
    while os.path.exists(os.path.join(carpeta, f"{raiz} ({n}){ext}")):
        n += 1
    return f"{raiz} ({n}){ext}"


def _info(raiz: str, absoluto: str) -> "EntradaStorage":
    stat = os.stat(absoluto)
    return EntradaStorage(
        nombre=os.path.basename(absoluto),
        ruta=_ruta_relativa(raiz, absoluto),
        tipo="carpeta" if os.path.isdir(absoluto) else "archivo",
        tamano_bytes=None if os.path.isdir(absoluto) else stat.st_size,
        modificado=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
    )


class EntradaStorage(BaseModel):
    nombre: str
    ruta: str
    tipo: str
    tamano_bytes: int | None
    modificado: str


class ListadoStorage(BaseModel):
    ruta: str
    entradas: list[EntradaStorage]


class CrearCarpetaIn(BaseModel):
    ruta_padre: str = ""
    nombre: str


class RenombrarIn(BaseModel):
    ruta: str
    nombre_nuevo: str


class MoverIn(BaseModel):
    ruta: str
    ruta_destino: str = ""


@router.get("/listar")
def listar(ruta: str = "") -> ListadoStorage:
    raiz = _carpeta_raiz()
    carpeta_abs = _resolver(ruta)
    if not os.path.isdir(carpeta_abs):
        raise HTTPException(404, "Carpeta no encontrada.")
    entradas = [_info(raiz, os.path.join(carpeta_abs, n)) for n in os.listdir(carpeta_abs)]
    entradas.sort(key=lambda e: (e.tipo != "carpeta", e.nombre.lower()))
    return ListadoStorage(ruta=_ruta_relativa(raiz, carpeta_abs) if carpeta_abs != raiz else "", entradas=entradas)


@router.post("/carpetas")
def crear_carpeta(datos: CrearCarpetaIn) -> EntradaStorage:
    raiz = _carpeta_raiz()
    padre_abs = _resolver(datos.ruta_padre)
    if not os.path.isdir(padre_abs):
        raise HTTPException(404, "Carpeta no encontrada.")
    nombre = _nombre_disponible(padre_abs, _nombre_seguro(datos.nombre))
    absoluto = os.path.join(padre_abs, nombre)
    os.makedirs(absoluto)
    return _info(raiz, absoluto)


@router.post("/subir")
async def subir_archivos(ruta: str = Form(""), archivos: list[UploadFile] = File(...)) -> list[EntradaStorage]:
    raiz = _carpeta_raiz()
    carpeta_abs = _resolver(ruta)
    if not os.path.isdir(carpeta_abs):
        raise HTTPException(404, "Carpeta no encontrada.")
    subidos = []
    for archivo in archivos:
        if not archivo.filename:
            continue
        nombre = _nombre_disponible(carpeta_abs, _nombre_seguro(archivo.filename))
        absoluto = os.path.join(carpeta_abs, nombre)
        contenido = await archivo.read()
        with open(absoluto, "wb") as f:
            f.write(contenido)
        subidos.append(_info(raiz, absoluto))
    return subidos


@router.put("/renombrar")
def renombrar(datos: RenombrarIn) -> EntradaStorage:
    raiz = _carpeta_raiz()
    origen_abs = _resolver(datos.ruta)
    if origen_abs == raiz:
        raise HTTPException(400, "No puedes renombrar la carpeta raíz.")
    if not os.path.exists(origen_abs):
        raise HTTPException(404, "No encontrado.")
    padre_abs = os.path.dirname(origen_abs)
    nombre_nuevo = _nombre_seguro(datos.nombre_nuevo)
    destino_abs = os.path.join(padre_abs, nombre_nuevo)
    if destino_abs != origen_abs and os.path.exists(destino_abs):
        raise HTTPException(409, "Ya existe un archivo o carpeta con ese nombre.")
    os.rename(origen_abs, destino_abs)
    return _info(raiz, destino_abs)


@router.put("/mover")
def mover(datos: MoverIn) -> EntradaStorage:
    raiz = _carpeta_raiz()
    origen_abs = _resolver(datos.ruta)
    destino_carpeta_abs = _resolver(datos.ruta_destino)
    if origen_abs == raiz:
        raise HTTPException(400, "No puedes mover la carpeta raíz.")
    if not os.path.exists(origen_abs):
        raise HTTPException(404, "No encontrado.")
    if not os.path.isdir(destino_carpeta_abs):
        raise HTTPException(404, "Carpeta de destino no encontrada.")
    if destino_carpeta_abs == os.path.dirname(origen_abs):
        return _info(raiz, origen_abs)  # ya está ahí, no hace nada
    if os.path.isdir(origen_abs) and (
        destino_carpeta_abs == origen_abs or destino_carpeta_abs.startswith(origen_abs + os.sep)
    ):
        raise HTTPException(400, "No puedes mover una carpeta dentro de sí misma.")
    nombre = _nombre_disponible(destino_carpeta_abs, os.path.basename(origen_abs))
    destino_abs = os.path.join(destino_carpeta_abs, nombre)
    shutil.move(origen_abs, destino_abs)
    return _info(raiz, destino_abs)


@router.get("/descargar")
def descargar_archivo(ruta: str) -> FileResponse:
    absoluto = _resolver(ruta)
    if not os.path.isfile(absoluto):
        raise HTTPException(404, "Archivo no encontrado.")
    return FileResponse(absoluto, filename=os.path.basename(absoluto))


@router.delete("/eliminar")
def eliminar(ruta: str) -> dict[str, str]:
    absoluto = _resolver(ruta)
    if absoluto == _carpeta_raiz():
        raise HTTPException(400, "No puedes eliminar la carpeta raíz.")
    if os.path.isdir(absoluto):
        shutil.rmtree(absoluto)
    elif os.path.isfile(absoluto):
        os.remove(absoluto)
    else:
        raise HTTPException(404, "No encontrado.")
    return {"estado": "eliminado"}


# ---------------------------------------------------------------------------
# Navegación de R2 (solo lectura — AccuTab y otros prefijos)
# ---------------------------------------------------------------------------

from . import r2 as _r2  # noqa: E402


@router.get("/r2/listar")
def r2_listar(prefijo: str = "") -> ListadoStorage:
    """
    Lista el contenido de R2 como si fuera un explorador de carpetas.
    'prefijo' es la ruta relativa dentro del bucket (ej. "" para raíz, "accutab/mail/" para AccuTab).
    Devuelve el mismo formato que /listar para que el frontend lo reutilice.
    """
    if not _r2.disponible():
        raise HTTPException(503, "R2 no está configurado en este servidor.")

    # Normalizar: siempre termina en "/" salvo si es raíz
    base = prefijo.strip("/")
    prefijo_r2 = (base + "/") if base else ""

    try:
        paginator = _r2._get_client().get_paginator("list_objects_v2")
        page_iter = paginator.paginate(
            Bucket=_r2.config.R2_BUCKET,
            Prefix=prefijo_r2,
            Delimiter="/",
        )

        carpetas: list[EntradaStorage] = []
        archivos: list[EntradaStorage] = []

        for page in page_iter:
            for cp in page.get("CommonPrefixes", []):
                nombre = cp["Prefix"].rstrip("/").split("/")[-1]
                carpetas.append(EntradaStorage(
                    nombre=nombre,
                    ruta=cp["Prefix"].rstrip("/"),
                    tipo="carpeta",
                    tamano_bytes=None,
                    modificado="",
                ))
            for obj in page.get("Contents", []):
                key: str = obj["Key"]
                if key == prefijo_r2:
                    continue  # entrada de "carpeta vacía", no listar
                nombre = key.split("/")[-1]
                if not nombre:
                    continue
                archivos.append(EntradaStorage(
                    nombre=nombre,
                    ruta=key,
                    tipo="archivo",
                    tamano_bytes=obj.get("Size"),
                    modificado=obj["LastModified"].isoformat() if obj.get("LastModified") else "",
                ))

        entradas = sorted(carpetas, key=lambda e: e.nombre.lower()) + sorted(archivos, key=lambda e: e.nombre.lower())
        return ListadoStorage(ruta=prefijo_r2, entradas=entradas)

    except Exception as exc:
        raise HTTPException(502, f"Error al listar R2: {exc}")


from fastapi.responses import StreamingResponse  # noqa: E402


@router.get("/r2/descargar")
def r2_descargar(key: str):
    """Descarga un archivo de R2 directamente (proxy streaming)."""
    if not _r2.disponible():
        raise HTTPException(503, "R2 no está configurado en este servidor.")
    if not key or ".." in key:
        raise HTTPException(400, "Key inválida.")

    try:
        resp = _r2._get_client().get_object(Bucket=_r2.config.R2_BUCKET, Key=key)
    except Exception as exc:
        raise HTTPException(404, f"No encontrado en R2: {exc}")

    filename = key.split("/")[-1] or "archivo"
    content_type = resp.get("ContentType", "application/octet-stream")

    def _iter():
        for chunk in resp["Body"].iter_chunks(chunk_size=65536):
            yield chunk

    return StreamingResponse(
        _iter(),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
