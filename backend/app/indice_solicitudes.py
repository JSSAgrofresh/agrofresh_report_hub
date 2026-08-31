"""
El índice de solicitudes: dónde está cada una y qué dice, sin abrir R2.

R2 guarda el archivo —el Excel que la gente descarga— y eso está bien: es un
almacén de archivos y es lo que hace bien. Lo que no sabe hacer es responder
"¿cuántas hay?", "dame las de Agricom" o "dame el siguiente folio sin
repetir". Para eso hay que abrir todas las cajas, y eso es lo que hacía
`leer_todas_las_solicitudes()` en cada request.

Este módulo es el cuaderno: una fila por solicitud, con sus datos completos
en `datos` para que listar no toque R2 en absoluto. Se baja el archivo solo
cuando alguien pide ese documento en particular.
"""
from __future__ import annotations

import json
from typing import Any

from psycopg2.extras import Json

from .db import conexion, cursor_dict

# Columnas que se extraen de `datos` para poder filtrar y ordenar con un
# índice. El resto vive en el jsonb.
_COLUMNAS = (
    "numero_solicitud", "laboratorio", "sold_to", "ship_to",
    "especie", "fecha_solicitud", "fecha_muestreo", "creado_en",
)
# Las que la tabla declara como DATE: un texto vacío no es una fecha, y
# psycopg2 lo mandaría tal cual y Postgres lo rechazaría.
_FECHAS = {"fecha_solicitud", "fecha_muestreo"}


def _valor(datos: dict, columna: str) -> Any:
    valor = datos.get(columna)
    if columna in _FECHAS and not (valor or "").strip():
        return None
    return valor


def guardar(cur, archivo: str, datos: dict, r2_key: str | None = None) -> None:
    """Anota (o vuelve a anotar) una solicitud en el índice.

    Es idempotente por `archivo`: volver a indexar la misma solicitud
    actualiza su fila en vez de duplicarla. Eso es lo que permite correr el
    script de indexación las veces que haga falta sin dejar basura.
    """
    columnas = ", ".join(_COLUMNAS)
    marcadores = ", ".join(["%s"] * len(_COLUMNAS))
    asignaciones = ", ".join(f"{c} = EXCLUDED.{c}" for c in _COLUMNAS)
    cur.execute(
        f"""
        INSERT INTO solicitud_archivo (archivo, r2_key, {columnas}, datos)
        VALUES (%s, %s, {marcadores}, %s)
        ON CONFLICT (archivo) DO UPDATE SET
            r2_key = EXCLUDED.r2_key, {asignaciones},
            datos = EXCLUDED.datos, indexado_en = now()
        """,
        (archivo, r2_key, *(_valor(datos, c) for c in _COLUMNAS), Json(datos)),
    )


def _fila_a_par(fila: dict) -> tuple[str, dict]:
    """(nombre_archivo, datos) — la misma forma que devolvía leer_todas_las_solicitudes,
    para que quien la consumía no tenga que cambiar."""
    datos = fila["datos"]
    return fila["archivo"], (json.loads(datos) if isinstance(datos, str) else datos)


def listar(laboratorio: str | None = None) -> list[tuple[str, dict]]:
    """Todas las solicitudes, o las de un laboratorio. Una consulta, sin R2.

    El orden sale de la base y no de Python: `creado_en` tiene índice, así
    que ordenar 10 solicitudes cuesta lo mismo que ordenar 10.000.
    """
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        if laboratorio is None:
            cur.execute("SELECT archivo, datos FROM solicitud_archivo ORDER BY creado_en DESC")
        else:
            cur.execute(
                "SELECT archivo, datos FROM solicitud_archivo WHERE laboratorio = %s ORDER BY creado_en DESC",
                (laboratorio,),
            )
        return [_fila_a_par(f) for f in cur.fetchall()]


def buscar(archivo: str) -> dict | None:
    """Los datos de una solicitud, o None si no está indexada."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT archivo, datos FROM solicitud_archivo WHERE archivo = %s", (archivo,))
        fila = cur.fetchone()
        return _fila_a_par(fila)[1] if fila else None


def esta_poblado() -> bool:
    """¿Ya se corrió la indexación?

    Mientras el índice esté vacío, los listados siguen leyendo R2 como antes.
    Así, actualizar el sistema sin haber corrido el script todavía no deja a
    nadie sin ver sus solicitudes.
    """
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT EXISTS (SELECT 1 FROM solicitud_archivo) AS hay")
        return bool(cur.fetchone()["hay"])
