"""¿Hay una base con el esquema aplicado a mano?

Las pruebas que la necesitan se saltan solas cuando no la hay: en el
computador de alguien que solo toca el frontend no tiene por qué existir. En
el servidor y en CI sí, y ahí corren.
"""
from __future__ import annotations


def hay_base(tabla: str = "solicitud") -> bool:
    try:
        from app.db import conexion, cursor_dict
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(f"SELECT 1 FROM {tabla} LIMIT 1")
        return True
    except Exception:
        return False
