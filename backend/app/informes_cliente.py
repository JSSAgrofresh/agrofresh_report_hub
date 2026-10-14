"""
Storage del portal de cliente: SOLO los informes de su Ship To.

Los informes viven en R2 como `informes/<PLANTA>/<FECHA>/<ANÁLISIS>/<LABORATORIO>/<archivo>.pdf`
(`informes_storage`). Una cuenta `cliente` no entra al Storage de AgroFresh: aquí ve únicamente la(s) carpeta(s)
de SU planta y no puede salir de ahí. Una cuenta de sucursal (con Ship To) ve su planta; una de Sold To sin
sucursal ve las plantas de su cliente. Las carpetas se resuelven con `informes_storage.carpeta_planta`, la
MISMA función que las crea, así que coinciden aunque el nombre de la planta se repita entre clientes.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from . import r2
from .pdf_permisos import sin_restricciones
from .auth import Usuario, usuario_actual
from .db import conexion, cursor_dict
from .informes_storage import RAIZ, carpeta_planta

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/informes-cliente", tags=["informes-cliente"])


class EntradaInforme(BaseModel):
    nombre: str
    ruta: str  # relativa a `informes/`
    tipo: str  # "carpeta" | "archivo"
    tamano_bytes: int | None = None
    modificado: str = ""


class ListadoInformes(BaseModel):
    ruta: str
    entradas: list[EntradaInforme]


def _plantas_del_cliente(sold_to: str) -> list[str]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT p.nombre FROM planta p JOIN cliente c ON c.id = p.cliente_id "
            "WHERE lower(btrim(c.nombre)) = lower(btrim(%s))",
            (sold_to,),
        )
        return [f["nombre"] for f in cur.fetchall()]


def carpetas_permitidas(usuario: Usuario) -> set[str]:
    """Nombres de carpeta (en minúsculas) de `informes/` que esta cuenta puede ver. Vacío = nada."""
    if usuario.tipoAcceso != "cliente":
        return set()
    sold_to = (usuario.clienteNombre or "").strip()
    if usuario.plantaNombre:
        plantas = [usuario.plantaNombre]
    elif sold_to:
        try:
            plantas = _plantas_del_cliente(sold_to)
        except Exception:
            logger.exception("No se pudieron leer las plantas de %r", sold_to)
            plantas = []
    else:
        plantas = []
    return {carpeta_planta(p, sold_to).casefold() for p in plantas if p}


def _partes(ruta: str) -> list[str]:
    partes = [p for p in (ruta or "").replace("\\", "/").split("/") if p not in ("", ".")]
    if any(p == ".." for p in partes):
        raise HTTPException(400, "Ruta inválida.")
    return partes


def _exigir_alcance(partes: list[str], usuario: Usuario) -> None:
    if usuario.tipoAcceso != "cliente":
        raise HTTPException(403, "Esta sección es del portal de cliente.")
    if partes and partes[0].casefold() not in carpetas_permitidas(usuario):
        raise HTTPException(404, "No encontrado.")


@router.get("/listar")
def listar(ruta: str = "", usuario: Usuario = Depends(usuario_actual)) -> ListadoInformes:
    partes = _partes(ruta)
    _exigir_alcance(partes, usuario)
    if not r2.disponible():
        raise HTTPException(503, "El almacenamiento no está disponible en este momento.")
    permitidas = carpetas_permitidas(usuario)
    prefijo = "/".join([RAIZ, *partes]) + "/"
    carpetas: list[EntradaInforme] = []
    archivos: list[EntradaInforme] = []
    try:
        for pagina in r2._get_client().get_paginator("list_objects_v2").paginate(
            Bucket=r2.config.R2_BUCKET, Prefix=prefijo, Delimiter="/"
        ):
            for cp in pagina.get("CommonPrefixes", []):
                nombre = cp["Prefix"].rstrip("/").split("/")[-1]
                if not partes and nombre.casefold() not in permitidas:
                    continue  # en la raíz solo SU carpeta
                carpetas.append(EntradaInforme(nombre=nombre, ruta="/".join([*partes, nombre]), tipo="carpeta"))
            for obj in pagina.get("Contents", []):
                key: str = obj["Key"]
                nombre = key.split("/")[-1]
                if key == prefijo or not nombre or not nombre.lower().endswith(".pdf"):
                    continue
                archivos.append(EntradaInforme(
                    nombre=nombre,
                    ruta="/".join([*partes, nombre]),
                    tipo="archivo",
                    tamano_bytes=obj.get("Size"),
                    modificado=obj["LastModified"].isoformat() if obj.get("LastModified") else "",
                ))
    except HTTPException:
        raise
    except Exception:
        logger.exception("No se pudo listar %s", prefijo)
        raise HTTPException(502, "No pudimos leer tus informes. Intenta de nuevo en unos minutos.")
    carpetas.sort(key=lambda e: e.nombre.lower(), reverse=bool(partes))  # fechas: la más reciente primero
    archivos.sort(key=lambda e: e.nombre.lower())
    return ListadoInformes(ruta="/".join(partes), entradas=carpetas + archivos)


@router.get("/descargar")
def descargar(ruta: str, usuario: Usuario = Depends(usuario_actual)):
    partes = _partes(ruta)
    if len(partes) < 2 or not partes[-1].lower().endswith(".pdf"):
        raise HTTPException(400, "Ruta inválida.")
    _exigir_alcance(partes, usuario)
    if not r2.disponible():
        raise HTTPException(503, "El almacenamiento no está disponible en este momento.")
    try:
        resp = r2._get_client().get_object(Bucket=r2.config.R2_BUCKET, Key="/".join([RAIZ, *partes]))
    except Exception:
        raise HTTPException(404, "No encontrado.")
    nombre = partes[-1]
    ascii_ = nombre.encode("ascii", "ignore").decode() or "informe.pdf"
    from urllib.parse import quote
    return Response(
        content=sin_restricciones(resp["Body"].read()),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_}\"; filename*=UTF-8''{quote(nombre)}"},
    )
