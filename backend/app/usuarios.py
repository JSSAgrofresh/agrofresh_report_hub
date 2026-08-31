"""
El padrón de cuentas y sus permisos.

Vivía en `solicitudes/_config/usuarios.json` (R2 o disco). Se movió a la
tabla `usuario` (migración 0019) por dos razones:

  - Ahora guarda contrasenas. Un archivo que se lee entero, se modifica en
    memoria y se reescribe entero pierde el cambio del primero cuando dos
    administradores editan a la vez; perder permisos así no es aceptable.

  - Listar el padrón dejó de necesitar una llamada a R2.

Todo lo de acá exige `admin_general`, salvo el listado, que cualquiera con
sesión puede ver -el frontend lo usa para mostrar nombres-. Nadie puede
cambiarse los permisos a sí mismo: eso vuelve inútil todo lo demás.
"""
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import seguridad
from .auth import (
    TIPOS_ACCESO,
    Usuario,
    cerrar_sesiones_de,
    solo_admin_general,
    usuario_actual,
    usuario_de_fila,
    _CAMPOS,
)
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])

CORREO_MAESTRO = "jorge.sandoval@agrofresh.com"

_PAT_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UsuarioIn(BaseModel):
    email: str
    nombre: str
    tipoAcceso: str
    area: str | None = None
    clienteNombre: str | None = None
    plantaNombre: str | None = None
    modulos: list[str] | None = None
    reportes: list[str] | None = None


class UsuarioCreadoOut(BaseModel):
    """La contrasena temporal se devuelve UNA vez, al crear la cuenta, para
    que el administrador se la dicte a su dueno. No se guarda en claro en
    ninguna parte, así que si se pierde hay que generar otra."""

    usuario: Usuario
    passwordTemporal: str


def _normalizar_email(email: str) -> str:
    limpio = (email or "").strip()
    if not _PAT_EMAIL.match(limpio):
        raise HTTPException(400, f"Correo inválido: {email!r}")
    return limpio


def _validar(body: UsuarioIn) -> None:
    if body.tipoAcceso not in TIPOS_ACCESO:
        raise HTTPException(400, f"Tipo de acceso desconocido: {body.tipoAcceso!r}")
    # Una cuenta de cliente sin cliente asignado no vería nada -o, si el
    # filtro se tomara del navegador, lo vería todo-. No puede existir.
    if body.tipoAcceso == "cliente" and not (body.clienteNombre or "").strip():
        raise HTTPException(400, "Una cuenta de tipo cliente necesita un cliente asignado.")


def _fila_por_id(cur, usuario_id: str) -> dict:
    if not str(usuario_id).isdigit():
        raise HTTPException(404, "Usuario no encontrado.")
    cur.execute(f"SELECT {_CAMPOS} FROM usuario WHERE id = %s", (int(usuario_id),))
    fila = cur.fetchone()
    if fila is None:
        raise HTTPException(404, "Usuario no encontrado.")
    return fila


def _es_maestro(fila: dict) -> bool:
    return fila["email"].lower() == CORREO_MAESTRO.lower()


@router.get("", response_model=list[Usuario])
def listar_usuarios(_: Usuario = Depends(usuario_actual)) -> list[Any]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(f"SELECT {_CAMPOS} FROM usuario ORDER BY nombre")
        return [usuario_de_fila(f) for f in cur.fetchall()]


@router.post("", response_model=UsuarioCreadoOut)
def crear_usuario(body: UsuarioIn, _: Usuario = Depends(solo_admin_general)) -> Any:
    _validar(body)
    email = _normalizar_email(body.email)
    temporal = seguridad.password_temporal()
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT 1 FROM usuario WHERE lower(email) = lower(%s)", (email,))
        if cur.fetchone():
            raise HTTPException(409, "Ya existe un usuario con ese correo.")
        cur.execute(
            f"""
            INSERT INTO usuario
                (email, nombre, tipo_acceso, area, cliente_nombre, planta_nombre,
                 modulos, reportes, password_hash, debe_cambiar)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
            RETURNING {_CAMPOS}
            """,
            (
                email, body.nombre, body.tipoAcceso, body.area,
                body.clienteNombre, body.plantaNombre,
                body.modulos, body.reportes, seguridad.hashear_password(temporal),
            ),
        )
        return UsuarioCreadoOut(usuario=usuario_de_fila(cur.fetchone()), passwordTemporal=temporal)


@router.put("/{usuario_id}", response_model=Usuario)
def editar_usuario(
    usuario_id: str,
    body: UsuarioIn,
    quien: Usuario = Depends(solo_admin_general),
) -> Any:
    _validar(body)
    email = _normalizar_email(body.email)
    with conexion() as conn, cursor_dict(conn) as cur:
        actual = _fila_por_id(cur, usuario_id)

        cur.execute(
            "SELECT 1 FROM usuario WHERE lower(email) = lower(%s) AND id <> %s",
            (email, actual["id"]),
        )
        if cur.fetchone():
            raise HTTPException(409, "Ya existe un usuario con ese correo.")

        # El maestro es la única cuenta que no puede quedarse sin administración
        # general: si se degrada, nadie puede volver a repartir permisos.
        if _es_maestro(actual):
            if body.tipoAcceso != "admin_general":
                raise HTTPException(400, "El usuario maestro no puede perder el acceso de administrador general.")
            if email.lower() != CORREO_MAESTRO.lower():
                raise HTTPException(400, "El correo del usuario maestro no se puede cambiar.")
        # Nadie se cambia sus propios permisos. Sin esto, cualquier
        # administrador podría convertirse en cuenta de cliente y volver, y
        # los límites de acceso dejarían de significar algo.
        elif str(actual["id"]) == quien.id and body.tipoAcceso != quien.tipoAcceso:
            raise HTTPException(400, "No puedes cambiar tu propio tipo de acceso.")

        cur.execute(
            f"""
            UPDATE usuario SET
                email = %s, nombre = %s, tipo_acceso = %s, area = %s,
                cliente_nombre = %s, planta_nombre = %s, modulos = %s, reportes = %s,
                actualizado_en = now()
            WHERE id = %s
            RETURNING {_CAMPOS}
            """,
            (
                email, body.nombre, body.tipoAcceso, body.area,
                body.clienteNombre, body.plantaNombre,
                body.modulos, body.reportes, actual["id"],
            ),
        )
        actualizado = cur.fetchone()

        # Si cambió algo que decide qué puede ver, sus sesiones abiertas
        # quedaron con permisos viejos. Se cierran para que vuelva a entrar
        # con los nuevos: quitarle un acceso a alguien no puede tardar una
        # semana en surtir efecto.
        cambio_el_alcance = any(
            actual[col] != actualizado[col]
            for col in ("tipo_acceso", "area", "cliente_nombre", "planta_nombre", "modulos", "reportes")
        )
        if cambio_el_alcance:
            cerrar_sesiones_de(cur, actual["id"])
        return usuario_de_fila(actualizado)


@router.post("/{usuario_id}/password-temporal", response_model=UsuarioCreadoOut)
def regenerar_password(usuario_id: str, _: Usuario = Depends(solo_admin_general)) -> Any:
    """Para cuando alguien olvidó su contrasena. Devuelve una temporal que su
    dueno debe cambiar al entrar, y cierra sus sesiones abiertas."""
    temporal = seguridad.password_temporal()
    with conexion() as conn, cursor_dict(conn) as cur:
        fila = _fila_por_id(cur, usuario_id)
        cur.execute(
            f"""
            UPDATE usuario SET password_hash = %s, debe_cambiar = TRUE, actualizado_en = now()
            WHERE id = %s RETURNING {_CAMPOS}
            """,
            (seguridad.hashear_password(temporal), fila["id"]),
        )
        actualizado = cur.fetchone()
        cerrar_sesiones_de(cur, fila["id"])
        return UsuarioCreadoOut(usuario=usuario_de_fila(actualizado), passwordTemporal=temporal)


@router.delete("/{usuario_id}")
def eliminar_usuario(usuario_id: str, quien: Usuario = Depends(solo_admin_general)) -> dict[str, str]:
    with conexion() as conn, cursor_dict(conn) as cur:
        fila = _fila_por_id(cur, usuario_id)
        if _es_maestro(fila):
            raise HTTPException(400, "El usuario maestro no se puede eliminar.")
        if str(fila["id"]) == quien.id:
            raise HTTPException(400, "No puedes eliminar tu propia cuenta.")
        # Las sesiones se van con la cuenta por el ON DELETE CASCADE.
        cur.execute("DELETE FROM usuario WHERE id = %s", (fila["id"],))
        return {"estado": "eliminado"}
