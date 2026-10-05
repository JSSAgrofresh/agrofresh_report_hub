"""
Registro de actividad de usuarios: lo que no queda anotado en otra tabla.

Inicios de sesión (y fallidos), visitas a cada módulo y cambios sensibles. Es
una bitácora: **nunca** puede romper lo que se está haciendo, así que
`registrar` se traga cualquier error (también si falta la migración 0047).
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .auth import Usuario, solo_interno
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/actividad", tags=["actividad"])

# Ruta del navegador → nombre del módulo. Se mira el prefijo más largo primero.
MODULOS: list[tuple[str, str]] = [
    ("/modulos/toma-muestras", "Toma de muestras"),
    ("/modulos/agrofresh-lab/verificaciones", "Verificaciones"),
    ("/modulos/agrofresh-lab/envio-informes", "Envío de informes"),
    ("/modulos/agrofresh-lab", "AgroFresh Lab"),
    ("/modulos/ingesta", "Ingesta de datos"),
    ("/modulos/convertidor", "Converter"),
    ("/modulos/datacore", "DataCore"),
    ("/modulos/reportes", "Report"),
    ("/modulos/storage", "Storage"),
    ("/modulos/auditoria-interna", "Auditoría interna"),
    ("/admin/administracion-general", "Administración General"),
    ("/admin/usuarios", "Usuarios"),
    ("/admin/listados", "Listados"),
    ("/admin/laboratorios", "Laboratorios"),
    ("/admin/notificaciones", "Notificaciones"),
]
_MODULOS_ORDENADOS = sorted(MODULOS, key=lambda m: -len(m[0]))

# Una misma pantalla abierta varias veces seguidas cuenta una vez cada tanto.
MINUTOS_ENTRE_VISITAS = 10


def modulo_de_ruta(ruta: str) -> str | None:
    limpia = (ruta or "").split("?")[0].split("#")[0].rstrip("/") or "/"
    for prefijo, nombre in _MODULOS_ORDENADOS:
        if limpia == prefijo or limpia.startswith(prefijo + "/"):
            return nombre
    return None


def registrar(
    email: str | None,
    nombre: str | None,
    categoria: str,
    accion: str,
    detalle: str | None = None,
    *,
    modulo: str | None = None,
    sensible: bool = False,
) -> None:
    """Anota una acción. Nunca lanza: la bitácora no puede tumbar nada."""
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                INSERT INTO actividad_usuario (email, nombre, categoria, accion, modulo, detalle, sensible)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                ((email or "").strip().lower() or None, nombre, categoria, accion, modulo,
                 (detalle or "")[:500] or None, sensible),
            )
    except Exception:
        logger.warning("No se pudo registrar la actividad %r.", accion, exc_info=True)


class VisitaIn(BaseModel):
    ruta: str


@router.post("/visita")
def registrar_visita(body: VisitaIn, usuario: Usuario = Depends(solo_interno)) -> dict[str, Any]:
    """El navegador avisa que abrió una pantalla. Se anota por módulo, sin
    repetir la misma visita dentro de `MINUTOS_ENTRE_VISITAS`."""
    modulo = modulo_de_ruta(body.ruta)
    if not modulo:
        return {"registrada": False}
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                SELECT 1 FROM actividad_usuario
                WHERE categoria = 'visita' AND email = %s AND modulo = %s
                  AND creado_en > now() - make_interval(mins => %s)
                LIMIT 1
                """,
                (usuario.email.lower(), modulo, MINUTOS_ENTRE_VISITAS),
            )
            if cur.fetchone():
                return {"registrada": False}
            cur.execute(
                "INSERT INTO actividad_usuario (email, nombre, categoria, accion, modulo) "
                "VALUES (%s, %s, 'visita', 'visita', %s)",
                (usuario.email.lower(), usuario.nombre, modulo),
            )
        return {"registrada": True}
    except Exception:
        logger.warning("No se pudo registrar la visita.", exc_info=True)
        return {"registrada": False}
