"""«Reporte observado»: deja anotado cuándo una cuenta de cliente vio por primera vez
los resultados de una solicitud en Report.

Solo registra cuentas de tipo `cliente`; el personal de AgroFresh que mira el Report
no cuenta como «el cliente lo vio». Es una bitácora: NUNCA lanza, porque anotar una
vista no puede tumbar la carga del Report (si falta la migración 0057, simplemente no
anota nada).
"""
from __future__ import annotations

import logging
from typing import Iterable

from .auth import Usuario
from .db import conexion

logger = logging.getLogger(__name__)


def registrar(usuario: Usuario, solicitud_ids: Iterable[int | None]) -> None:
    if usuario.tipoAcceso != "cliente":
        return
    ids = sorted({int(i) for i in solicitud_ids if i is not None})
    if not ids:
        return
    try:
        with conexion(escribir=True) as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO informe_visto (solicitud_id, usuario_email, cliente, planta)
                SELECT x, %s, %s, %s FROM unnest(%s::bigint[]) AS x
                ON CONFLICT (solicitud_id, usuario_email) DO NOTHING
                """,
                (usuario.email, usuario.clienteNombre, usuario.plantaNombre, ids),
            )
    except Exception:
        logger.warning("No se pudo anotar la vista del cliente (¿falta la migración 0057?).", exc_info=True)
