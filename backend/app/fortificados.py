"""
Ingreso de fortificados (AgroFresh Lab → Ingreso al laboratorio).

Un fortificado no tiene solicitud: se anota su N° de fortificado y el peso de
la muestra extraída (g); la fecha y la hora de ingreso las pone el servidor
(hora de Chile). Van en la segunda hoja de la descarga «con muestra».

Sin la migración 0051 los endpoints responden 503 con el aviso, y la descarga
sigue saliendo sin la hoja de fortificados.
"""
from __future__ import annotations

import logging
from typing import Any

import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import Usuario, solo_admin_general, usuario_actual
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fortificados", tags=["fortificados"])

ZONA = "America/Santiago"
AVISO_MIGRACION = "Falta correr la migración 0051_fortificados.sql en el servidor."

_SELECT = f"""
    SELECT id, numero, peso_extraido::float8 AS peso_extraido,
           to_char(ingresado_en AT TIME ZONE '{ZONA}', 'YYYY-MM-DD') AS fecha_ingreso,
           to_char(ingresado_en AT TIME ZONE '{ZONA}', 'HH24:MI')    AS hora_ingreso,
           ingresado_por
      FROM fortificado
"""


class FortificadoIn(BaseModel):
    numero: str
    peso: float


def _limpiar(body: FortificadoIn) -> tuple[str, float]:
    numero = " ".join(body.numero.split())
    if not numero:
        raise HTTPException(400, "Escribe el N° de fortificado.")
    if not (body.peso > 0):
        raise HTTPException(400, "El peso extraído debe ser mayor a cero.")
    return numero, body.peso


def listar_para_excel() -> list[dict[str, Any]]:
    """Los fortificados para la descarga, del más antiguo al más nuevo. Si falta
    la migración devuelve lista vacía: la descarga no puede caerse por esto."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(_SELECT + " ORDER BY ingresado_en, id")
            return [dict(r) for r in cur.fetchall()]
    except psycopg2.errors.UndefinedTable:
        return []
    except Exception:
        logger.exception("No se pudieron leer los fortificados para el Excel")
        return []


@router.get("")
def listar() -> list[dict[str, Any]]:
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(_SELECT + " ORDER BY ingresado_en DESC, id DESC")
            return [dict(r) for r in cur.fetchall()]
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.post("")
def crear(body: FortificadoIn, usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    numero, peso = _limpiar(body)
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "INSERT INTO fortificado (numero, peso_extraido, ingresado_por, ingresado_email)"
                " VALUES (%s, %s, %s, %s) RETURNING id",
                (numero, peso, usuario.nombre, usuario.email.lower()),
            )
            nuevo = cur.fetchone()["id"]
            cur.execute(_SELECT + " WHERE id = %s", (nuevo,))
            return dict(cur.fetchone())
    except psycopg2.errors.UniqueViolation as e:
        raise HTTPException(409, f"Ya hay un fortificado con el N° {numero}.") from e
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.put("/{fortificado_id}")
def corregir(
    fortificado_id: int, body: FortificadoIn, usuario: Usuario = Depends(usuario_actual),
) -> dict[str, Any]:
    """Corrige el N° o el peso. La fecha y hora de ingreso no cambian."""
    numero, peso = _limpiar(body)
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "UPDATE fortificado SET numero = %s, peso_extraido = %s, editado_en = now()"
                " WHERE id = %s RETURNING id",
                (numero, peso, fortificado_id),
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "Ese fortificado no existe.")
            cur.execute(_SELECT + " WHERE id = %s", (fortificado_id,))
            return dict(cur.fetchone())
    except psycopg2.errors.UniqueViolation as e:
        raise HTTPException(409, f"Ya hay un fortificado con el N° {numero}.") from e
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e


@router.delete("/{fortificado_id}", status_code=204)
def borrar(fortificado_id: int, _: Usuario = Depends(solo_admin_general)) -> None:
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM fortificado WHERE id = %s", (fortificado_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Ese fortificado no existe.")
    except psycopg2.errors.UndefinedTable as e:
        raise HTTPException(503, AVISO_MIGRACION) from e
