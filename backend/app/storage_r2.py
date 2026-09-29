"""
Storage sobre el bucket R2: escribir, mover, borrar y buscar.

R2 no tiene carpetas: una "carpeta" es un prefijo, y renombrarla o moverla es
copiar cada objeto a su clave nueva y borrar el original. Una carpeta vacía se
representa con un objeto de 0 bytes cuya clave termina en "/".

Lo que se permite depende de DÓNDE se toque (`permitir`). Esto es lo delicado
del módulo, porque parte del bucket no es de Storage sino de la aplicación:

  * `accutab/mail`  Nadie del sistema lo lee: son los correos de Accutab que
                    llegan de afuera. Se puede administrar entero.
  * `solicitudes`   La aplicación encuentra cada solicitud por el NOMBRE de su
                    archivo, en cualquier subcarpeta, y sus fotos por la carpeta
                    donde está. Por eso se pueden crear, renombrar y mover
                    CARPETAS, pero no subir archivos ajenos (el reindexado los
                    tomaría por solicitudes) ni borrar (se borra desde Toma de
                    muestras, que también limpia el índice). `_config` es del
                    sistema y no se toca nunca.
  * el resto        no se toca.

La política es pura (sin R2 adentro) para poder probarla sola.
"""
from __future__ import annotations

import unicodedata

from botocore.exceptions import ClientError
from fastapi import HTTPException

from . import config
from . import r2

RAIZ_ACCUTAB = "accutab/mail"
RAIZ_SOLICITUDES = "solicitudes"
_CONFIG = "_config"

OPERACIONES = ("crear", "subir", "renombrar", "mover", "eliminar")


def normalizar(ruta: str) -> str:
    return "/".join(p for p in ruta.replace("\\", "/").split("/") if p not in ("", "."))


def _dentro(ruta: str, raiz: str, estricto: bool) -> bool:
    if ruta == raiz:
        return not estricto
    return ruta.startswith(raiz + "/")


def zona(ruta: str) -> str | None:
    ruta = normalizar(ruta)
    if _dentro(ruta, RAIZ_ACCUTAB, False):
        return "accutab"
    if _dentro(ruta, RAIZ_SOLICITUDES, False):
        return "solicitudes"
    return None


def permitir(operacion: str, ruta: str, es_carpeta: bool = True) -> str | None:
    """None si se puede; si no, el motivo en palabras para quien lo intentó.

    `ruta` es la carpeta donde se crea/sube, o el elemento que se renombra,
    mueve o elimina."""
    ruta = normalizar(ruta)
    if _CONFIG in ruta.split("/"):
        return "Esa carpeta es configuración del sistema y no se puede modificar."
    z = zona(ruta)
    if z is None:
        return "Esta zona del almacenamiento no se puede modificar desde aquí."
    raiz = RAIZ_ACCUTAB if z == "accutab" else RAIZ_SOLICITUDES
    if operacion in ("renombrar", "mover", "eliminar") and not _dentro(ruta, raiz, True):
        return "La carpeta base no se puede renombrar, mover ni eliminar."
    if z == "accutab":
        return None
    # solicitudes: la aplicación es dueña de los archivos, no de las carpetas.
    if operacion == "subir":
        return "Aquí solo se guardan solicitudes creadas desde la aplicación."
    if operacion == "eliminar":
        return "Para borrar una solicitud usa Toma de muestras → Solicitudes."
    if operacion in ("renombrar", "mover") and not es_carpeta:
        return "Los archivos de una solicitud no se mueven ni renombran: es la aplicación quien los ordena."
    return None


def exigir(operacion: str, ruta: str, es_carpeta: bool = True) -> None:
    motivo = permitir(operacion, ruta, es_carpeta)
    if motivo:
        raise HTTPException(403, motivo)


def puede_llamar_r2() -> None:
    if not r2.disponible():
        raise HTTPException(503, "R2 no está configurado en este servidor.")


# ── Operaciones ──────────────────────────────────────────────────────────

def _cliente():
    return r2._get_client()


def _claves(prefijo: str) -> list[str]:
    """Todas las claves bajo `prefijo/` (incluida la marca de carpeta vacía)."""
    claves: list[str] = []
    paginador = _cliente().get_paginator("list_objects_v2")
    for pagina in paginador.paginate(Bucket=config.R2_BUCKET, Prefix=normalizar(prefijo) + "/"):
        claves.extend(o["Key"] for o in pagina.get("Contents", []))
    return claves


def _hay_bajo(ruta: str) -> bool:
    resp = _cliente().list_objects_v2(Bucket=config.R2_BUCKET, Prefix=ruta + "/", MaxKeys=1)
    return bool(resp.get("Contents"))


def tipo_de(ruta: str) -> str | None:
    """'carpeta', 'archivo' o None si no existe."""
    ruta = normalizar(ruta)
    if _hay_bajo(ruta):
        return "carpeta"
    try:
        _cliente().head_object(Bucket=config.R2_BUCKET, Key=ruta)
        return "archivo"
    except ClientError:
        return None


def existe(ruta: str) -> bool:
    return tipo_de(ruta) is not None


def nombre_disponible(carpeta: str, nombre: str) -> str:
    """'x' -> 'x (2)' si ya hay algo con ese nombre en `carpeta`."""
    base, punto, ext = nombre.rpartition(".") if "." in nombre.lstrip(".") else (nombre, "", "")
    candidato, n = nombre, 2
    while existe(f"{normalizar(carpeta)}/{candidato}"):
        candidato = f"{base} ({n}){punto}{ext}"
        n += 1
    return candidato


def crear_carpeta(padre: str, nombre: str) -> str:
    padre = normalizar(padre)
    nombre = nombre_disponible(padre, nombre)
    ruta = f"{padre}/{nombre}"
    r2.subir(ruta + "/", b"", "application/x-directory")
    return ruta


def subir_archivo(carpeta: str, nombre: str, datos: bytes) -> str:
    carpeta = normalizar(carpeta)
    nombre = nombre_disponible(carpeta, nombre)
    ruta = f"{carpeta}/{nombre}"
    r2.subir(ruta, datos)
    return ruta


def _trasladar(origen: str, destino: str) -> None:
    """Copia todo lo de `origen` (archivo o carpeta) a `destino` y borra el original."""
    origen, destino = normalizar(origen), normalizar(destino)
    cli = _cliente()
    if tipo_de(origen) == "archivo":
        pares = [(origen, destino)]
    else:
        pares = [(k, destino + "/" + k[len(origen) + 1:]) for k in _claves(origen)]
    for viejo, nuevo in pares:
        cli.copy_object(
            Bucket=config.R2_BUCKET, Key=nuevo, CopySource={"Bucket": config.R2_BUCKET, "Key": viejo}
        )
    for viejo, _ in pares:
        cli.delete_object(Bucket=config.R2_BUCKET, Key=viejo)


def renombrar(ruta: str, nombre_nuevo: str) -> str:
    ruta = normalizar(ruta)
    padre = ruta.rpartition("/")[0]
    destino = f"{padre}/{nombre_nuevo}"
    if destino != ruta and existe(destino):
        raise HTTPException(409, "Ya existe un archivo o carpeta con ese nombre.")
    if destino != ruta:
        _trasladar(ruta, destino)
    return destino


def mover(ruta: str, carpeta_destino: str) -> str:
    ruta, carpeta_destino = normalizar(ruta), normalizar(carpeta_destino)
    if ruta.rpartition("/")[0] == carpeta_destino:
        return ruta
    if carpeta_destino == ruta or carpeta_destino.startswith(ruta + "/"):
        raise HTTPException(400, "No puedes mover una carpeta dentro de sí misma.")
    nombre = nombre_disponible(carpeta_destino, ruta.rpartition("/")[2])
    destino = f"{carpeta_destino}/{nombre}"
    _trasladar(ruta, destino)
    return destino


def eliminar(ruta: str) -> int:
    ruta = normalizar(ruta)
    tipo = tipo_de(ruta)
    if tipo is None:
        raise HTTPException(404, "No encontrado.")
    claves = [ruta] if tipo == "archivo" else _claves(ruta)
    cli = _cliente()
    for i in range(0, len(claves), 1000):
        lote = claves[i : i + 1000]
        cli.delete_objects(Bucket=config.R2_BUCKET, Delete={"Objects": [{"Key": k} for k in lote]})
    return len(claves)


# ── Búsqueda ─────────────────────────────────────────────────────────────

def sin_tildes(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if not unicodedata.combining(c)).lower()


def coincide(nombre: str, palabras: list[str]) -> bool:
    n = sin_tildes(nombre)
    return all(p in n for p in palabras)


def buscar_en_claves(claves: list[tuple[str, int | None, str]], palabras: list[str], limite: int) -> list[dict]:
    """De una lista de (clave, tamaño, fecha) saca los archivos y carpetas cuyo
    NOMBRE contiene todas las palabras. Las carpetas se deducen de las claves."""
    carpetas: dict[str, None] = {}
    archivos: list[dict] = []
    for clave, tam, fecha in claves:
        partes = clave.split("/")
        for i in range(1, len(partes)):
            ruta = "/".join(partes[:i])
            if ruta not in carpetas and coincide(partes[i - 1], palabras):
                carpetas[ruta] = None
        if clave.endswith("/"):
            continue
        if coincide(partes[-1], palabras):
            archivos.append({"nombre": partes[-1], "ruta": clave, "tipo": "archivo", "tamano_bytes": tam, "modificado": fecha})
    salida = [{"nombre": r.rsplit("/", 1)[-1], "ruta": r, "tipo": "carpeta", "tamano_bytes": None, "modificado": ""} for r in carpetas]
    salida.sort(key=lambda e: (not sin_tildes(e["nombre"]).startswith(palabras[0]), e["nombre"].lower()))
    archivos.sort(key=lambda e: (not sin_tildes(e["nombre"]).startswith(palabras[0]), e["nombre"].lower()))
    return (salida + archivos)[:limite]


def claves_de(prefijo: str) -> list[tuple[str, int | None, str]]:
    out = []
    paginador = _cliente().get_paginator("list_objects_v2")
    for pagina in paginador.paginate(Bucket=config.R2_BUCKET, Prefix=prefijo + "/"):
        for o in pagina.get("Contents", []):
            if _CONFIG in o["Key"].split("/"):
                continue
            lm = o.get("LastModified")
            out.append((o["Key"], o.get("Size"), lm.isoformat() if lm else ""))
    return out
