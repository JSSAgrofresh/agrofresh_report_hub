"""
Usuarios del sistema. Igual que los mantenedores de Toma de muestras, se
guardan como un JSON en `solicitudes/_config/` (R2 o disco) en vez de una
tabla: no hay base de datos para configuración.

Antes vivían solo en el localStorage del navegador. Eso hacía que editar el
nombre de una cuenta no tuviera efecto para su dueña: cada navegador tenía su
propia copia sembrada, así que el cambio del administrador nunca llegaba a la
sesión de la persona editada. Al centralizarlos acá, cualquier navegador que
consulte el listado ve el mismo dato.

Esto NO es autenticación: las contraseñas siguen sin validarse (el login es
un stub a la espera del backend de sesiones). Este módulo solo mantiene el
padrón de cuentas y sus permisos.
"""
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config_store

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])

_ARCHIVO = "usuarios.json"

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


class Usuario(UsuarioIn):
    id: str


# Cuentas con las que nace el sistema. Se siembran la primera vez y desde ahí
# el padrón vive en el archivo: editar estos valores no altera lo ya guardado.
_USUARIOS_DEFECTO: list[dict] = [
    {
        "id": "u-1",
        "email": CORREO_MAESTRO,
        "nombre": "Jorge Sandoval",
        "tipoAcceso": "admin_general",
    },
    {
        "id": "u-2",
        "email": "psalazar@agrofresh.com",
        "nombre": "Patricia Salazar",
        "tipoAcceso": "admin_area",
        "area": "cromatografia",
        "modulos": ["converter", "reports", "storage", "toma_muestras"],
        "reportes": ["laboratorio", "emitir"],
    },
    {
        "id": "u-3",
        "email": "rpoblete@agrofresh.com",
        "nombre": "Rodrigo Poblete",
        "tipoAcceso": "admin_area",
        "area": "postventa",
        "modulos": ["trace", "reports"],
        "reportes": ["postventa"],
    },
]


def _cargar() -> list[dict]:
    return config_store.leer(_ARCHIVO, _USUARIOS_DEFECTO)


def _normalizar_email(email: str) -> str:
    limpio = (email or "").strip()
    if not _PAT_EMAIL.match(limpio):
        raise HTTPException(400, f"Correo inválido: {email!r}")
    return limpio


def _email_en_uso(usuarios: list[dict], email: str, excepto_id: str | None = None) -> bool:
    buscado = email.lower()
    return any(
        u["email"].lower() == buscado and u["id"] != excepto_id
        for u in usuarios
    )


def _siguiente_id(usuarios: list[dict]) -> str:
    """IDs de la forma `u-N`. Se toma el mayor N existente y se suma uno, así
    un id nunca se reutiliza aunque se borren cuentas del medio."""
    maximo = 0
    for u in usuarios:
        m = re.fullmatch(r"u-(\d+)", str(u.get("id", "")))
        if m:
            maximo = max(maximo, int(m.group(1)))
    return f"u-{maximo + 1}"


@router.get("", response_model=list[Usuario])
def listar_usuarios() -> list[Any]:
    return [Usuario(**u) for u in _cargar()]


@router.get("/por-email/{email}", response_model=Usuario)
def obtener_usuario_por_email(email: str) -> Any:
    """Usado por el login para resolver la cuenta a partir del correo. Es
    también lo que permite que un cambio de nombre se vea en la sesión de su
    dueña: la sesión se re-sincroniza contra este endpoint."""
    buscado = (email or "").strip().lower()
    for u in _cargar():
        if u["email"].lower() == buscado:
            return Usuario(**u)
    raise HTTPException(404, "Usuario no encontrado.")


@router.post("", response_model=Usuario)
def crear_usuario(body: UsuarioIn) -> Any:
    usuarios = _cargar()
    email = _normalizar_email(body.email)
    if _email_en_uso(usuarios, email):
        raise HTTPException(409, "Ya existe un usuario con ese correo.")
    nuevo = Usuario(id=_siguiente_id(usuarios), **{**body.model_dump(), "email": email})
    usuarios.append(nuevo.model_dump())
    config_store.escribir(_ARCHIVO, usuarios)
    return nuevo


@router.put("/{usuario_id}", response_model=Usuario)
def editar_usuario(usuario_id: str, body: UsuarioIn) -> Any:
    usuarios = _cargar()
    idx = next((i for i, u in enumerate(usuarios) if u["id"] == usuario_id), None)
    if idx is None:
        raise HTTPException(404, "Usuario no encontrado.")

    actual = usuarios[idx]
    email = _normalizar_email(body.email)
    if _email_en_uso(usuarios, email, excepto_id=usuario_id):
        raise HTTPException(409, "Ya existe un usuario con ese correo.")

    # El maestro es la única cuenta que no puede quedarse sin administración
    # general: si se degrada, nadie puede volver a repartir permisos.
    es_maestro = actual["email"].lower() == CORREO_MAESTRO.lower()
    if es_maestro and body.tipoAcceso != "admin_general":
        raise HTTPException(400, "El usuario maestro no puede perder el acceso de administrador general.")
    if es_maestro and email.lower() != CORREO_MAESTRO.lower():
        raise HTTPException(400, "El correo del usuario maestro no se puede cambiar.")

    actualizado = Usuario(id=usuario_id, **{**body.model_dump(), "email": email})
    usuarios[idx] = actualizado.model_dump()
    config_store.escribir(_ARCHIVO, usuarios)
    return actualizado


@router.delete("/{usuario_id}")
def eliminar_usuario(usuario_id: str) -> dict[str, str]:
    usuarios = _cargar()
    objetivo = next((u for u in usuarios if u["id"] == usuario_id), None)
    if objetivo is None:
        raise HTTPException(404, "Usuario no encontrado.")
    if objetivo["email"].lower() == CORREO_MAESTRO.lower():
        raise HTTPException(400, "El usuario maestro no se puede eliminar.")
    config_store.escribir(_ARCHIVO, [u for u in usuarios if u["id"] != usuario_id])
    return {"estado": "eliminado"}
