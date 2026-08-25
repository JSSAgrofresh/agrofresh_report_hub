"""
Cliente S3-compatible para Cloudflare R2. Usado por toma_muestras.py
para persistir solicitudes y configuración fuera del disco efímero de Render.
"""
import io
import json

from botocore.exceptions import ClientError

from . import config

_client = None


def disponible() -> bool:
    return bool(config.R2_ENDPOINT_URL and config.R2_ACCESS_KEY_ID and config.R2_SECRET_ACCESS_KEY and config.R2_BUCKET)


def _get_client():
    global _client
    if _client is None:
        import boto3
        _client = boto3.client(
            "s3",
            endpoint_url=config.R2_ENDPOINT_URL,
            aws_access_key_id=config.R2_ACCESS_KEY_ID,
            aws_secret_access_key=config.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _client


def subir(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    _get_client().put_object(Bucket=config.R2_BUCKET, Key=key, Body=data, ContentType=content_type)


def descargar(key: str) -> bytes | None:
    try:
        resp = _get_client().get_object(Bucket=config.R2_BUCKET, Key=key)
        return resp["Body"].read()
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None
        raise


def listar_keys(prefix: str) -> list[str]:
    keys: list[str] = []
    paginator = _get_client().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=config.R2_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])
    return keys


def eliminar(key: str) -> None:
    _get_client().delete_object(Bucket=config.R2_BUCKET, Key=key)


def leer_json(key: str, defecto) -> list:
    data = descargar(key)
    if data is None:
        return defecto
    return json.loads(data.decode("utf-8"))


def escribir_json(key: str, datos) -> None:
    subir(key, json.dumps(datos, ensure_ascii=False, indent=2).encode("utf-8"), "application/json")
