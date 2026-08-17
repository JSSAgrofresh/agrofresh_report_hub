from typing import Any

import psycopg2.errors
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


# ---------------------------------------------------------------------------
# Datos para los gráficos: formato largo, una fila por analito medido.
# ---------------------------------------------------------------------------

DATOS_QUERY = """
    SELECT
        r.solicitud_id,
        s.nro_solicitud,
        s.laboratorio,
        s.fecha_muestreo,
        s.fecha_entrada,
        s.especie,
        s.variedad,
        s.semana_muestreo,
        s.mes,
        s.temporada,
        COALESCE(c.nombre, s.sold_to_raw) AS cliente,
        COALESCE(p.nombre, s.ship_to_raw) AS planta,
        pa.tipo_aplicacion,
        COALESCE(a.codigo, r.analito_raw) AS ingrediente,
        r.valor_num,
        r.valor_texto
    FROM resultado r
    JOIN solicitud s ON s.id = r.solicitud_id
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
    LEFT JOIN analito a ON a.id = r.analito_id
    LEFT JOIN producto_aplicado pa ON pa.solicitud_id = r.solicitud_id AND pa.analito_id = r.analito_id
    WHERE s.vigente
    ORDER BY s.fecha_muestreo DESC NULLS LAST, r.solicitud_id DESC
"""


@router.get("/datos")
def datos() -> dict[str, Any]:
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            cur.execute(DATOS_QUERY)
            filas = cur.fetchall()
            # Aparte del join con resultado (que solo trae solicitudes con al menos un
            # analito medido), se cuenta el total real de solicitudes cargadas: esto es
            # lo que se muestra como "Total de registros" en el KPI inicial de Report.
            cur.execute("SELECT count(*) AS total FROM solicitud WHERE vigente")
            total_solicitudes = cur.fetchone()["total"]
    return {"filas": filas, "total": len(filas), "total_solicitudes": total_solicitudes}


# ---------------------------------------------------------------------------
# Catálogo de analitos: consulta para todos, edición solo para administradores
# (el frontend controla quién ve los botones; el backend no valida roles
# porque hoy no hay autenticación real todavía).
# ---------------------------------------------------------------------------


class AnalitoIn(BaseModel):
    codigo: str
    nombre: str
    categoria: str
    laboratorio: str
    unidad: str
    limite_deteccion: str | None = None
    matriz: str | None = None
    activo: bool = True
    limite_min: float | None = None
    limite_central: float | None = None
    limite_max: float | None = None


class AnalitoUpdate(BaseModel):
    codigo: str | None = None
    nombre: str | None = None
    categoria: str | None = None
    laboratorio: str | None = None
    unidad: str | None = None
    limite_deteccion: str | None = None
    matriz: str | None = None
    activo: bool | None = None
    limite_min: float | None = None
    limite_central: float | None = None
    limite_max: float | None = None


ANALITOS_QUERY = """
    SELECT id, codigo, nombre, categoria, laboratorio, unidad, limite_deteccion,
           matriz, activo, limite_min, limite_central, limite_max
    FROM analito
    ORDER BY laboratorio, codigo
"""


@router.get("/analitos")
def listar_analitos() -> list[dict[str, Any]]:
    with conexion(escribir=False) as conn:
        with cursor_dict(conn) as cur:
            cur.execute(ANALITOS_QUERY)
            return cur.fetchall()


RETURNING_COLS = (
    "id, codigo, nombre, categoria, laboratorio, unidad, limite_deteccion, "
    "matriz, activo, limite_min, limite_central, limite_max"
)


@router.post("/analitos")
def crear_analito(payload: AnalitoIn) -> dict[str, Any]:
    datos = payload.model_dump()
    columnas = list(datos.keys())
    placeholders = ", ".join(["%s"] * len(columnas))
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            try:
                cur.execute(
                    f"INSERT INTO analito ({', '.join(columnas)}) VALUES ({placeholders}) RETURNING {RETURNING_COLS}",
                    [datos[c] for c in columnas],
                )
            except psycopg2.errors.UniqueViolation as err:
                raise HTTPException(
                    409, f"Ya existe un analito con el código '{payload.codigo}' en el laboratorio '{payload.laboratorio}'."
                ) from err
            return cur.fetchone()


@router.put("/analitos/{analito_id}")
def actualizar_analito(analito_id: int, payload: AnalitoUpdate) -> dict[str, Any]:
    cambios = payload.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(400, "No se enviaron campos para actualizar.")
    set_clause = ", ".join(f"{campo} = %s" for campo in cambios)
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            try:
                cur.execute(
                    f"UPDATE analito SET {set_clause} WHERE id = %s RETURNING {RETURNING_COLS}",
                    [*cambios.values(), analito_id],
                )
            except psycopg2.errors.UniqueViolation as err:
                raise HTTPException(409, "Ya existe otro analito con ese código y laboratorio.") from err
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(404, "Analito no encontrado.")
    return fila


@router.delete("/analitos/{analito_id}")
def eliminar_analito(analito_id: int) -> dict[str, Any]:
    with conexion(escribir=True) as conn:
        with cursor_dict(conn) as cur:
            try:
                cur.execute("DELETE FROM analito WHERE id = %s RETURNING id", (analito_id,))
            except psycopg2.errors.ForeignKeyViolation as err:
                raise HTTPException(
                    409,
                    "No se puede eliminar: este analito ya tiene resultados o aplicaciones cargadas en la base. "
                    "Puedes desactivarlo en vez de eliminarlo (edítalo y desmarca 'Activo').",
                ) from err
            fila = cur.fetchone()
            if fila is None:
                raise HTTPException(404, "Analito no encontrado.")
    return {"id": analito_id}
