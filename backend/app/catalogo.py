"""
CRUD del catálogo oficial de Sold To (cliente) / Ship To (planta). Es la
fuente de verdad contra la que Ingest/Converter homogenizan sold_to_raw/
ship_to_raw antes de cargar solicitudes nuevas (ver ingest.py). Se edita
desde el módulo "Listados" en el frontend.
"""
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/catalogo", tags=["catalogo"])


class ClienteIn(BaseModel):
    nombre: str
    codigo_sap: str | None = None
    rut: str | None = None
    activo: bool = True


class PlantaIn(BaseModel):
    cliente_id: int
    nombre: str
    codigo_sap: str | None = None
    ciudad: str | None = None
    activo: bool = True


@router.get("/clientes")
def listar_clientes() -> list[dict[str, Any]]:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            SELECT c.id, c.nombre, c.codigo_sap, c.rut, c.activo,
                   count(p.id) AS total_plantas
            FROM cliente c
            LEFT JOIN planta p ON p.cliente_id = c.id
            GROUP BY c.id
            ORDER BY c.nombre
            """
        )
        return cur.fetchall()


@router.post("/clientes")
def crear_cliente(body: ClienteIn) -> dict[str, Any]:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "INSERT INTO cliente (nombre, codigo_sap, rut, activo) VALUES (%s, %s, %s, %s) RETURNING id",
            (body.nombre.strip(), body.codigo_sap, body.rut, body.activo),
        )
        return {"id": cur.fetchone()["id"]}


@router.put("/clientes/{cliente_id}")
def editar_cliente(cliente_id: int, body: ClienteIn) -> dict[str, str]:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "UPDATE cliente SET nombre = %s, codigo_sap = %s, rut = %s, activo = %s WHERE id = %s",
            (body.nombre.strip(), body.codigo_sap, body.rut, body.activo, cliente_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Cliente no encontrado")
        return {"estado": "ok"}


@router.get("/plantas")
def listar_plantas() -> list[dict[str, Any]]:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            SELECT p.id, p.cliente_id, c.nombre AS cliente_nombre,
                   p.nombre, p.codigo_sap, p.ciudad, p.activo
            FROM planta p
            JOIN cliente c ON c.id = p.cliente_id
            ORDER BY c.nombre, p.nombre
            """
        )
        return cur.fetchall()


@router.post("/plantas")
def crear_planta(body: PlantaIn) -> dict[str, Any]:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "INSERT INTO planta (cliente_id, nombre, codigo_sap, ciudad, activo) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (body.cliente_id, body.nombre.strip(), body.codigo_sap, body.ciudad, body.activo),
        )
        return {"id": cur.fetchone()["id"]}


@router.put("/plantas/{planta_id}")
def editar_planta(planta_id: int, body: PlantaIn) -> dict[str, str]:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "UPDATE planta SET cliente_id = %s, nombre = %s, codigo_sap = %s, ciudad = %s, activo = %s WHERE id = %s",
            (body.cliente_id, body.nombre.strip(), body.codigo_sap, body.ciudad, body.activo, planta_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Planta no encontrada")
        return {"estado": "ok"}
