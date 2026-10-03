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


# ---------------------------------------------------------------------------
# Listado de Actimist (migración 0049)
#
# Las rutas de arriba son el listado de LÍNEA DE PROCESO y no cambian: Ingesta,
# Converter y Report siguen leyendo `cliente`/`planta`. Actimist tiene sus
# propias tablas (`cliente_actimist`/`planta_actimist`) y por ahora solo las
# usa el formulario de la solicitud cuando el Tipo Aplicación es Actimist.
# ---------------------------------------------------------------------------

import psycopg2  # noqa: E402
from fastapi import File, UploadFile  # noqa: E402

from . import listado_actimist  # noqa: E402

_CLI_ACT, _PLA_ACT = listado_actimist.TABLA_CLIENTES, listado_actimist.TABLA_PLANTAS
_SIN_MIGRACION = (
    "El listado de Actimist todavía no existe en la base: falta correr la migración "
    "0049_listado_actimist.sql en el servidor."
)


class EliminarActimistIn(BaseModel):
    tipo: str  # sold_to | ship_to
    ids: list[int]


def _sin_tabla(exc: Exception) -> HTTPException:
    return HTTPException(503, _SIN_MIGRACION)


@router.get("/actimist/clientes")
def listar_clientes_actimist() -> list[dict[str, Any]]:
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                f"""
                SELECT c.id, c.nombre, c.codigo_sap, c.rut, c.activo,
                       count(p.id) AS total_plantas
                FROM {_CLI_ACT} c
                LEFT JOIN {_PLA_ACT} p ON p.cliente_id = c.id
                GROUP BY c.id
                ORDER BY c.nombre
                """
            )
            return cur.fetchall()
    except psycopg2.errors.UndefinedTable as exc:
        raise _sin_tabla(exc) from exc


@router.post("/actimist/clientes")
def crear_cliente_actimist(body: ClienteIn) -> dict[str, Any]:
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                f"INSERT INTO {_CLI_ACT} (nombre, codigo_sap, rut, activo) VALUES (%s, %s, %s, %s) RETURNING id",
                (body.nombre.strip(), body.codigo_sap, body.rut, body.activo),
            )
            return {"id": cur.fetchone()["id"]}
    except psycopg2.errors.UndefinedTable as exc:
        raise _sin_tabla(exc) from exc
    except psycopg2.errors.UniqueViolation as exc:
        raise HTTPException(409, f"Ya hay un Sold To de Actimist llamado «{body.nombre.strip()}».") from exc


@router.put("/actimist/clientes/{cliente_id}")
def editar_cliente_actimist(cliente_id: int, body: ClienteIn) -> dict[str, str]:
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                f"UPDATE {_CLI_ACT} SET nombre = %s, codigo_sap = %s, rut = %s, activo = %s WHERE id = %s",
                (body.nombre.strip(), body.codigo_sap, body.rut, body.activo, cliente_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(404, "Cliente no encontrado")
            return {"estado": "ok"}
    except psycopg2.errors.UndefinedTable as exc:
        raise _sin_tabla(exc) from exc
    except psycopg2.errors.UniqueViolation as exc:
        raise HTTPException(409, f"Ya hay un Sold To de Actimist llamado «{body.nombre.strip()}».") from exc


@router.get("/actimist/plantas")
def listar_plantas_actimist() -> list[dict[str, Any]]:
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                f"""
                SELECT p.id, p.cliente_id, c.nombre AS cliente_nombre,
                       p.nombre, p.codigo_sap, p.ciudad, p.activo
                FROM {_PLA_ACT} p
                JOIN {_CLI_ACT} c ON c.id = p.cliente_id
                ORDER BY c.nombre, p.nombre
                """
            )
            return cur.fetchall()
    except psycopg2.errors.UndefinedTable as exc:
        raise _sin_tabla(exc) from exc


@router.post("/actimist/plantas")
def crear_planta_actimist(body: PlantaIn) -> dict[str, Any]:
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                f"INSERT INTO {_PLA_ACT} (cliente_id, nombre, codigo_sap, ciudad, activo) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (body.cliente_id, body.nombre.strip(), body.codigo_sap, body.ciudad, body.activo),
            )
            return {"id": cur.fetchone()["id"]}
    except psycopg2.errors.UndefinedTable as exc:
        raise _sin_tabla(exc) from exc
    except psycopg2.errors.UniqueViolation as exc:
        raise HTTPException(409, f"Ese Sold To ya tiene un Ship To llamado «{body.nombre.strip()}».") from exc
    except psycopg2.errors.ForeignKeyViolation as exc:
        raise HTTPException(400, "El Sold To elegido no está en el listado de Actimist.") from exc


@router.put("/actimist/plantas/{planta_id}")
def editar_planta_actimist(planta_id: int, body: PlantaIn) -> dict[str, str]:
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                f"UPDATE {_PLA_ACT} SET cliente_id = %s, nombre = %s, codigo_sap = %s, ciudad = %s, activo = %s "
                "WHERE id = %s",
                (body.cliente_id, body.nombre.strip(), body.codigo_sap, body.ciudad, body.activo, planta_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(404, "Planta no encontrada")
            return {"estado": "ok"}
    except psycopg2.errors.UndefinedTable as exc:
        raise _sin_tabla(exc) from exc
    except psycopg2.errors.UniqueViolation as exc:
        raise HTTPException(409, f"Ese Sold To ya tiene un Ship To llamado «{body.nombre.strip()}».") from exc
    except psycopg2.errors.ForeignKeyViolation as exc:
        raise HTTPException(400, "El Sold To elegido no está en el listado de Actimist.") from exc


@router.post("/actimist/eliminar-lote")
def eliminar_lote_actimist(body: EliminarActimistIn) -> dict[str, int]:
    """Borra Sold To (con sus Ship To) o Ship To del listado de Actimist. Nada
    más apunta a estas tablas, así que no hay datos de Report que se pierdan."""
    if body.tipo not in ("sold_to", "ship_to") or not body.ids:
        raise HTTPException(400, "Selección inválida")
    tabla = _CLI_ACT if body.tipo == "sold_to" else _PLA_ACT
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(f"DELETE FROM {tabla} WHERE id = ANY(%s)", (body.ids,))
            return {"eliminados": cur.rowcount}
    except psycopg2.errors.UndefinedTable as exc:
        raise _sin_tabla(exc) from exc


@router.post("/actimist/importar")
async def importar_actimist(archivo: UploadFile = File(...), aplicar: bool = False) -> dict[str, Any]:
    """Carga Sold To / Ship To de Actimist desde la dinámica del Planner.

    Sin `aplicar` solo devuelve el plan (qué se crearía, qué ya existe, qué no
    se puede cargar) y NO escribe. Con `aplicar=true` crea lo nuevo en una sola
    transacción. Nunca modifica ni borra lo que ya está."""
    contenido = await archivo.read()
    if len(contenido) > 25 * 1024 * 1024:
        raise HTTPException(413, "El archivo pesa más de 25 MB.")
    try:
        filas = listado_actimist.leer_excel(contenido)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    try:
        # Sin `aplicar` la conexión es de solo lectura: hace rollback siempre.
        with conexion(escribir=aplicar) as conn, cursor_dict(conn) as cur:
            plan = listado_actimist.planear(filas, *listado_actimist.leer_actual(cur))
            creados = listado_actimist.aplicar(cur, plan) if aplicar else None
    except psycopg2.errors.UndefinedTable as exc:
        raise _sin_tabla(exc) from exc
    for c in plan["clientes_nuevos"]:
        c.pop("clave", None)
    for p in plan["plantas_nuevas"]:
        p.pop("cliente_clave", None)
    return {**plan, "aplicado": aplicar, "creados": creados}
