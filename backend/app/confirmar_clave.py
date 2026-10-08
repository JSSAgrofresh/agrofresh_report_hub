"""
Confirmar con la contraseña, EN EL SERVIDOR, una acción que solo hace el administrador principal.

Pedir la clave solo en la pantalla no protege: quien llame a la API directo con una sesión abierta se la
salta. Las acciones destructivas que son solo de `jorge.sandoval@agrofresh.com` la revisan acá además.
Responden 403 y nunca 401: un 401 cierra la sesión de quien solo se equivocó al escribir la clave.
"""
from __future__ import annotations

from fastapi import HTTPException

from . import seguridad
from .auth import Usuario
from .db import conexion, cursor_dict


def es_principal(usuario: Usuario) -> bool:
    from .toma_muestras import _SUPER_ADMIN_EMAIL

    return usuario.tipoAcceso == "admin_general" and usuario.email.strip().lower() == _SUPER_ADMIN_EMAIL


def clave_correcta(usuario: Usuario, password: str | None) -> bool:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT password_hash FROM usuario WHERE id = %s", (usuario.id,))
        fila = cur.fetchone()
    return bool(fila and seguridad.verificar_password(password or "", fila.get("password_hash")))


def exigir_principal_con_clave(usuario: Usuario, password: str | None, accion: str) -> None:
    """403 si no es el administrador principal o si la contraseña no es la suya."""
    if not es_principal(usuario):
        raise HTTPException(403, f"Solo el administrador principal puede {accion}.")
    if not clave_correcta(usuario, password):
        raise HTTPException(403, "Contraseña incorrecta.")
