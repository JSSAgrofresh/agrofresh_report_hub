"""
Cliente de R2 para las carpetas de Auditoría interna.

Las rutas que entran y salen de acá son RELATIVAS a la carpeta de auditoría
("Quiteca/Dole Codegua/x.pdf"); el prefijo real en el bucket ("auditoria/")
se agrega y se quita en este archivo y en ningún otro. Así lo que se guarda en
la base no cambia si un día la carpeta se muda a un bucket propio.

Aparte de r2.py a propósito: es otro bucket, y sus llaves pueden ser otras. Acá
también viven las reglas de la carpeta: la raíz del bucket no se borra nunca, y
las "carpetas" no existen en R2 -son prefijos-, así que una carpeta nace con su
primer archivo y desaparece con el último. Nadie pre-crea 200 carpetas.
"""
import re

from botocore.exceptions import ClientError

from . import config

_client = None

_INVALIDO = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def _real(key: str) -> str:
    """Ruta relativa -> clave real en el bucket."""
    p = config.R2_AUDITORIA_PREFIJO
    return f"{p}/{key}" if p else key


def _relativa(key: str) -> str:
    p = config.R2_AUDITORIA_PREFIJO
    return key[len(p) + 1:] if p and key.startswith(p + "/") else key


def disponible() -> bool:
    return bool(
        config.R2_AUDITORIA_ENDPOINT_URL
        and config.R2_AUDITORIA_ACCESS_KEY_ID
        and config.R2_AUDITORIA_SECRET_ACCESS_KEY
        and config.R2_AUDITORIA_BUCKET
    )


def _cliente():
    global _client
    if _client is None:
        import boto3
        _client = boto3.client(
            "s3",
            endpoint_url=config.R2_AUDITORIA_ENDPOINT_URL,
            aws_access_key_id=config.R2_AUDITORIA_ACCESS_KEY_ID,
            aws_secret_access_key=config.R2_AUDITORIA_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _client


def segmento_seguro(texto: str | None, defecto: str) -> str:
    """Un nombre de carpeta o archivo válido: sin separadores ni caracteres que
    Windows rechace, sin puntos al borde (un ".." no puede colarse)."""
    limpio = _INVALIDO.sub("_", (texto or "").strip())
    limpio = re.sub(r"\s+", " ", limpio).strip(" .")
    return limpio or defecto


def ruta_segura(ruta: str | None) -> str:
    """Ruta relativa con "/" ('' = raíz). Rechaza ".." y descarta vacíos."""
    partes = [p for p in (ruta or "").replace("\\", "/").split("/") if p not in ("", ".")]
    if any(p == ".." for p in partes):
        raise ValueError("Ruta inválida.")
    return "/".join(partes)


def subir(key: str, data: bytes, content_type: str = "application/pdf") -> None:
    _cliente().put_object(Bucket=config.R2_AUDITORIA_BUCKET, Key=_real(key), Body=data, ContentType=content_type)


def descargar(key: str) -> bytes | None:
    try:
        return _cliente().get_object(Bucket=config.R2_AUDITORIA_BUCKET, Key=_real(key))["Body"].read()
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None
        raise


def existe(key: str) -> bool:
    try:
        _cliente().head_object(Bucket=config.R2_AUDITORIA_BUCKET, Key=_real(key))
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("NoSuchKey", "404", "NotFound"):
            return False
        raise


def eliminar(key: str) -> None:
    _cliente().delete_object(Bucket=config.R2_AUDITORIA_BUCKET, Key=_real(key))


def copiar(origen: str, destino: str) -> None:
    _cliente().copy_object(
        Bucket=config.R2_AUDITORIA_BUCKET,
        Key=_real(destino),
        CopySource={"Bucket": config.R2_AUDITORIA_BUCKET, "Key": _real(origen)},
    )


def listar_nivel(ruta: str) -> tuple[list[str], list[dict]]:
    """Carpetas y archivos que cuelgan DIRECTO de `ruta` ('' = raíz).

    Devuelve (nombres de carpeta, archivos con key/tamano/modificado).
    """
    base = _real(ruta) if ruta else config.R2_AUDITORIA_PREFIJO
    prefijo = f"{base}/" if base else ""
    carpetas: list[str] = []
    archivos: list[dict] = []
    paginador = _cliente().get_paginator("list_objects_v2")
    for pagina in paginador.paginate(Bucket=config.R2_AUDITORIA_BUCKET, Prefix=prefijo, Delimiter="/"):
        for cp in pagina.get("CommonPrefixes", []):
            carpetas.append(cp["Prefix"][len(prefijo):].rstrip("/"))
        for obj in pagina.get("Contents", []):
            if obj["Key"] == prefijo:
                continue
            archivos.append({
                "key": _relativa(obj["Key"]),
                "nombre": obj["Key"][len(prefijo):],
                "tamano_bytes": obj["Size"],
                "modificado": obj["LastModified"].isoformat(),
            })
    return sorted(carpetas, key=str.lower), sorted(archivos, key=lambda a: a["nombre"].lower())


def listar_recursivo(prefijo: str) -> list[str]:
    keys: list[str] = []
    paginador = _cliente().get_paginator("list_objects_v2")
    for pagina in paginador.paginate(Bucket=config.R2_AUDITORIA_BUCKET, Prefix=_real(prefijo)):
        keys.extend(_relativa(o["Key"]) for o in pagina.get("Contents", []))
    return keys
