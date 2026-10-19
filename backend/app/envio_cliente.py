"""Marca manual de «informe enviado al cliente».

Subir un informe por Converter es el fin del ciclo en el sistema, pero el informe puede salir
al cliente por fuera (o después). Aquí una persona lo deja anotado: al subir el informe
(casilla «Envío a cliente» de Converter) o, para los cruces solicitud↔informe antiguos, desde
Solicitudes e informes. Alimenta el hito `cliente` del Panel de control interno junto a los envíos
reales de «Envío de informes» (gana la fecha más antigua).

Todo tolera que falte la migración 0058: las lecturas devuelven vacío y las escrituras avisan.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import Usuario, solo_interno
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/envio-cliente", tags=["envio-cliente"])

ETIQUETA_SERVICIO = {"actimist": "Actimist", "ecofog": "Ecofog", "ryd": "RYD"}


class Marcas(BaseModel):
    archivos: list[str] = Field(min_length=1, max_length=2000)
    # fecha del envío real, si se conoce (ISO); si no, la de hoy
    fecha: str | None = None


def _fecha(texto: str | None) -> datetime | None:
    if not texto:
        return None
    try:
        return datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "La fecha no es válida.")


def marcadas(cur) -> dict[str, Any]:
    """{archivo: fecha de la marca}. Vacío si falta la tabla."""
    try:
        cur.execute("SAVEPOINT envio_cliente_manual")
        cur.execute("SELECT archivo, enviado_en FROM envio_cliente_manual")
        filas = cur.fetchall()
        cur.execute("RELEASE SAVEPOINT envio_cliente_manual")
        return {f["archivo"]: f["enviado_en"] for f in filas}
    except psycopg2.errors.UndefinedTable:
        cur.execute("ROLLBACK TO SAVEPOINT envio_cliente_manual")
        return {}


def marcar(cur, archivos: list[str], usuario: Usuario, origen: str, fecha: datetime | None = None) -> int:
    cur.execute(
        """
        INSERT INTO envio_cliente_manual (archivo, enviado_en, marcado_por, origen)
        SELECT sa.archivo, COALESCE(%s, now()), %s, %s FROM solicitud_archivo sa WHERE sa.archivo = ANY(%s)
        ON CONFLICT (archivo) DO UPDATE SET enviado_en = COALESCE(%s, envio_cliente_manual.enviado_en),
            marcado_por = EXCLUDED.marcado_por
        """,
        (fecha, usuario.email, origen, archivos, fecha),
    )
    return cur.rowcount


def _sin_tabla() -> HTTPException:
    return HTTPException(503, "Falta la migración 0058_envio_cliente_manual.sql en el servidor.")


@router.post("/marcar")
def marcar_enviados(cuerpo: Marcas, usuario: Usuario = Depends(solo_interno)) -> dict[str, int]:
    fecha = _fecha(cuerpo.fecha)
    try:
        with conexion(escribir=True) as conn, conn.cursor() as cur:
            return {"marcadas": marcar(cur, cuerpo.archivos, usuario, "solicitudes", fecha)}
    except psycopg2.errors.UndefinedTable:
        raise _sin_tabla()


@router.post("/desmarcar")
def desmarcar_enviados(cuerpo: Marcas, usuario: Usuario = Depends(solo_interno)) -> dict[str, int]:
    try:
        with conexion(escribir=True) as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM envio_cliente_manual WHERE archivo = ANY(%s)", (cuerpo.archivos,))
            return {"desmarcadas": cur.rowcount}
    except psycopg2.errors.UndefinedTable:
        raise _sin_tabla()


@router.get("/marcas")
def listar_marcas(usuario: Usuario = Depends(solo_interno)) -> dict[str, str]:
    """{archivo: fecha} de las solicitudes marcadas como enviadas al cliente."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        return {a: t.isoformat() for a, t in marcadas(cur).items()}


def contexto_de(datos: dict) -> dict[str, Any]:
    """Tipo de servicio y lista de distribución de una solicitud, para decidir si el informe sale al cliente."""
    from .envio_informes import plan_desde_solicitud
    from .servicios import servicio_de_datos

    servicio = servicio_de_datos(datos)
    plan = plan_desde_solicitud(datos)
    return {
        "servicio": ETIQUETA_SERVICIO.get(servicio, "Línea de proceso"),
        "sold_to": datos.get("sold_to") or "",
        "ship_to": datos.get("ship_to") or "",
        "sin_lista": bool(plan.get("sin_lista")),
        "para": list(plan.get("to") or []),
        "cc": list(plan.get("cc") or []),
        "bcc": list(plan.get("bcc") or []),
    }


@router.get("/contexto")
def contexto(ot: str, usuario: Usuario = Depends(solo_interno)) -> dict[str, Any]:
    """Servicio y lista de distribución de la solicitud con ese N° de OT (o archivo)."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT archivo, numero_solicitud, datos FROM solicitud_archivo"
            " WHERE upper(btrim(numero_solicitud)) = upper(btrim(%s)) OR archivo = %s LIMIT 1",
            (ot, ot),
        )
        fila = cur.fetchone()
    if not fila:
        raise HTTPException(404, "No encuentro esa solicitud.")
    return {"archivo": fila["archivo"], "ot": fila["numero_solicitud"], **contexto_de(fila["datos"] or {})}
