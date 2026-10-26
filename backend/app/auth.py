"""
Quién está entrando y qué puede ver.

Acá viven tres cosas que antes no existían:

  - El login de verdad. El anterior (`src/features/auth/api/authApi.ts`)
    aceptaba cualquier contrasena no vacía y resolvía la cuenta por correo.

  - La dependencia `usuario_actual`, que se aplica a nivel de router en
    `main.py`. Ponerla por router y no endpoint por endpoint es a propósito:
    un router nuevo nace protegido y nadie tiene que acordarse de nada.

  - `alcance_de_datos`, que decide qué cliente ve una sesión. Es la frontera
    que separa a un cliente de otro y por eso está escrita como una función
    aparte, sin base de datos ni request adentro: así se puede probar sola,
    y hay una prueba que falla si alguien la afloja.
"""
from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from . import seguridad
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Cuánto dura una sesión sin volver a pedir contrasena. Una semana: el sistema
# se usa a diario en planta y pedir la clave cada mañana empuja a la gente a
# elegir contrasenas malas o a dejarlas anotadas al lado del computador.
DURACION_SESION = timedelta(days=7)

# `ultimo_uso` sirve para ver sesiones abandonadas, no para cronometrar. Se
# actualiza cada tanto y no en cada request: una escritura por página vista
# costaría más que todo lo demás junto.
_GRANO_ULTIMO_USO = timedelta(hours=1)

TIPOS_ACCESO = ("admin_general", "admin_area", "analista", "cliente", "muestreador", "gerencia", "comercial")

# `auto_error=False` para que la falta de encabezado la conteste este módulo
# con su propio mensaje, en vez del 403 genérico de HTTPBearer.
_bearer = HTTPBearer(auto_error=False)

_CAMPOS = """
    id, email, nombre, tipo_acceso, area, cliente_nombre, planta_nombre,
    modulos, reportes, plantas_asignadas, password_hash, debe_cambiar
"""


class Usuario(BaseModel):
    """Una cuenta, como la ve el resto del sistema. El hash de la contrasena
    NO va acá: este modelo se serializa hacia el navegador."""

    id: str
    email: str
    nombre: str
    tipoAcceso: str
    area: str | None = None
    clienteNombre: str | None = None
    plantaNombre: str | None = None
    modulos: list[str] | None = None
    reportes: list[str] | None = None
    # Cuentas «comercial» y «cliente» con varios accesos: [{clienteNombre, plantaNombre?, especie?}]. Sin plantaNombre =
    # todo ese Sold To; sin especie = todas las especies. Una especie por entrada (varias especies = varias entradas).
    plantasAsignadas: list[dict[str, str | None]] | None = None
    debeCambiarPassword: bool = False


def usuario_de_fila(fila: dict) -> Usuario:
    return Usuario(
        id=str(fila["id"]),
        email=fila["email"],
        nombre=fila["nombre"],
        tipoAcceso=fila["tipo_acceso"],
        area=fila["area"],
        clienteNombre=fila["cliente_nombre"],
        plantaNombre=fila["planta_nombre"],
        modulos=fila["modulos"],
        reportes=fila["reportes"],
        plantasAsignadas=fila.get("plantas_asignadas") or None,
        debeCambiarPassword=fila["debe_cambiar"],
    )


# ── La frontera entre clientes ──────────────────────────────────────────

def alcance_de_datos(
    usuario: Usuario,
    cliente_pedido: str | None,
    planta_pedida: str | None,
) -> tuple[str | None, str | None]:
    """Qué cliente y qué sucursal puede ver realmente esta sesión.

    Antes, `/api/reportes/datos` recibía `?cliente=` del navegador y le creía.
    Una cuenta de Dole cambiaba ese parámetro en la barra de direcciones y
    veía los resultados de Agricom.

    Para una cuenta tipo `cliente`, lo pedido se DESCARTA y manda lo que dice
    su fila. Para el resto -gente de AgroFresh- el parámetro sigue siendo un
    filtro normal, porque su trabajo es justamente mirar a todos los clientes.
    """
    if usuario.tipoAcceso == "cliente":
        return usuario.clienteNombre, usuario.plantaNombre
    return cliente_pedido, planta_pedida


def _plano(valor: str | None) -> str:
    return " ".join(str(valor or "").split()).casefold()


def planta_permitida(usuario: Usuario, sold_to: str | None, ship_to: str | None) -> bool:
    """¿Esta cuenta puede ver una fila de ESTE Sold To / Ship To? Los demás tipos de cuenta: sí (su alcance lo decide
    cada módulo). Un comercial, o un cliente con lista de accesos, solo si la planta (o todo su Sold To) está entre las
    que se le asignaron; sin plantas asignadas, nunca. Se compara sin mayúsculas ni espacios de más. (La especie no
    cuenta acá: lo que no trae especie —carpetas, informes Accu-Tab— se abre por planta.)"""
    if not con_lista_de_accesos(usuario):
        return True
    cli, pla = _plano(sold_to), _plano(ship_to)
    for cliente, planta in plantas_de_comercial(usuario):
        if _plano(cliente) == cli and (planta is None or _plano(planta) == pla):
            return True
    return False


def es_comercial(usuario: Usuario) -> bool:
    return usuario.tipoAcceso == "comercial"


def plantas_de_comercial(usuario: Usuario) -> list[tuple[str, str | None]]:
    """(Sold To, Ship To o None) que esta cuenta (comercial o cliente con lista de accesos) puede ver. None en el
    Ship To = todo ese Sold To. Vacío = no ve nada (una cuenta sin plantas asignadas nunca ve todo). Sin repetir."""
    salida: list[tuple[str, str | None]] = []
    for cliente, planta, _especie in accesos_de_cuenta(usuario):
        if (cliente, planta) not in salida:
            salida.append((cliente, planta))
    return salida


def accesos_de_cuenta(usuario: Usuario) -> list[tuple[str, str | None, str | None]]:
    """(Sold To, Ship To o None, Especie o None) de la lista de accesos de la cuenta. None = todo ese nivel."""
    salida: list[tuple[str, str | None, str | None]] = []
    for p in usuario.plantasAsignadas or []:
        cliente = str(p.get("clienteNombre") or "").strip()
        planta = str(p.get("plantaNombre") or "").strip() or None
        especie = str(p.get("especie") or "").strip() or None
        if cliente and (cliente, planta, especie) not in salida:
            salida.append((cliente, planta, especie))
    return salida


def con_lista_de_accesos(usuario: Usuario) -> bool:
    """Un comercial siempre se acota por su lista (vacía = nada). Un cliente solo si tiene una lista guardada; sin
    ella manda su cliente y su sucursal de siempre (las cuentas antiguas siguen igual)."""
    if usuario.tipoAcceso == "comercial":
        return True
    return usuario.tipoAcceso == "cliente" and bool(accesos_de_cuenta(usuario))


# ── Freno de fuerza bruta ───────────────────────────────────────────────

_MAX_INTENTOS = 10
_VENTANA_INTENTOS = 15 * 60
# Intentos fallidos por correo. Vive en memoria del proceso: con varios
# workers cada uno lleva su propia cuenta, así que el tope real es el número
# de workers por este valor. Alcanza para frenar a alguien probando claves a
# mano; un ataque en serio se frena antes, en el proxy.
_fallidos: dict[str, list[float]] = defaultdict(list)


def _registrar_fallo(email: str) -> None:
    ahora = time.monotonic()
    intentos = [t for t in _fallidos[email] if ahora - t < _VENTANA_INTENTOS]
    intentos.append(ahora)
    _fallidos[email] = intentos


def _esta_frenado(email: str) -> bool:
    ahora = time.monotonic()
    intentos = [t for t in _fallidos[email] if ahora - t < _VENTANA_INTENTOS]
    _fallidos[email] = intentos
    return len(intentos) >= _MAX_INTENTOS


# ── Consultas ───────────────────────────────────────────────────────────

def _fila_por_email(cur, email: str) -> dict | None:
    cur.execute(f"SELECT {_CAMPOS} FROM usuario WHERE lower(email) = lower(%s)", (email.strip(),))
    return cur.fetchone()


def _crear_sesion(cur, usuario_id: int) -> str:
    token = seguridad.nuevo_token()
    cur.execute(
        "INSERT INTO sesion (token_hash, usuario_id, expira_en) VALUES (%s, %s, %s)",
        (seguridad.huella_token(token), usuario_id, datetime.now(timezone.utc) + DURACION_SESION),
    )
    return token


def cerrar_sesiones_de(cur, usuario_id: int, salvo: str | None = None) -> None:
    """Deja fuera las sesiones abiertas de una cuenta.

    Se llama al cambiar su contrasena y al cambiarle los permisos: si alguien
    entró con la clave vieja, o con permisos que ya no tiene, esa sesión no
    puede seguir sirviendo. Es exactamente lo que un JWT no permite hacer.

    `salvo` es la huella de una sesión que sobrevive: quien está cambiando su
    propia contrasena no debería quedar expulsado por hacerlo bien.
    """
    if salvo:
        cur.execute("DELETE FROM sesion WHERE usuario_id = %s AND token_hash <> %s", (usuario_id, salvo))
    else:
        cur.execute("DELETE FROM sesion WHERE usuario_id = %s", (usuario_id,))


# ── La dependencia ──────────────────────────────────────────────────────

def usuario_actual(
    credencial: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Usuario:
    """La cuenta detrás del token, o 401.

    Un token vencido, borrado o inventado dan todos el mismo 401 con el mismo
    texto: distinguirlos le diría a quien está probando cuál de sus intentos
    se acercó más.
    """
    if credencial is None or not credencial.credentials:
        raise HTTPException(401, "Inicia sesión para continuar.")
    huella = seguridad.huella_token(credencial.credentials)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            f"""
            SELECT u.id AS _uid, s.ultimo_uso, {_CAMPOS}
            FROM sesion s JOIN usuario u ON u.id = s.usuario_id
            WHERE s.token_hash = %s AND s.expira_en > now()
            """,
            (huella,),
        )
        fila = cur.fetchone()
        if fila is None:
            raise HTTPException(401, "Tu sesión expiró. Vuelve a iniciar sesión.")
        if datetime.now(timezone.utc) - fila["ultimo_uso"] > _GRANO_ULTIMO_USO:
            cur.execute("UPDATE sesion SET ultimo_uso = now() WHERE token_hash = %s", (huella,))
        return usuario_de_fila(fila)


def solo_admin_general(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    """Para lo que reparte poder: crear cuentas, cambiar permisos, borrar."""
    if usuario.tipoAcceso != "admin_general":
        raise HTTPException(403, "Necesitas permisos de administrador general.")
    return usuario


def solo_interno(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    """Cierra el paso a las cuentas de cliente.

    Un cliente entra a ver SUS resultados y nada más: no carga datos, no toca
    catálogos, no crea solicitudes, no manda correos, no ve el padrón de
    cuentas. En el frontend eso ya era así -una cuenta de cliente no recibe
    ningún módulo-, pero eso solo escondía los botones: la API respondía igual
    a quien la llamara directo.
    """
    if usuario.tipoAcceso == "cliente":
        raise HTTPException(403, "Tu cuenta solo tiene acceso a sus propios resultados.")
    # El comercial mira solo lo de sus plantas (Report y sus informes): el resto de la API le queda cerrado.
    if usuario.tipoAcceso == "comercial":
        raise HTTPException(403, "Tu cuenta de comercial solo ve los resultados de tus plantas.")
    return usuario


def solo_escribiente(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    """Bloquea escritura a cuentas de gerencia y cliente.

    Gerencia tiene acceso visual a todo el sistema pero no puede modificar
    datos. Este guard se aplica en los endpoints POST/PUT/DELETE de los módulos
    operativos para hacer cumplir esa restricción en el backend.
    """
    if usuario.tipoAcceso == "cliente":
        raise HTTPException(403, "Tu cuenta solo tiene acceso a sus propios resultados.")
    if usuario.tipoAcceso == "gerencia":
        raise HTTPException(403, "Tu cuenta de gerencia es de solo lectura.")
    if usuario.tipoAcceso == "comercial":
        raise HTTPException(403, "Tu cuenta de comercial es de solo lectura.")
    return usuario


# Lo ÚNICO que un comercial puede pedir de los módulos internos acotados (Toma de muestras → Solicitudes e informes y
# Panel de control interno), como (método, ruta). Todo lo demás de esos routers le da 403: un endpoint nuevo nace
# cerrado para él. Cada una de estas rutas filtra por sus plantas (`planta_permitida` / `_es_propia`).
RUTAS_COMERCIAL: frozenset[tuple[str, str]] = frozenset({
    ("GET", "/api/toma-muestras/solicitudes"),
    ("GET", "/api/toma-muestras/solicitudes/exportar-todo"),
    ("GET", "/api/toma-muestras/solicitudes/{archivo}/pdf"),
    ("POST", "/api/toma-muestras/solicitudes/pdf-zip"),
    ("GET", "/api/toma-muestras/solicitudes-informes"),
    ("GET", "/api/toma-muestras/solicitudes/{archivo}/informe/pdf"),
    ("GET", "/api/auditoria-interna/solicitudes"),
    ("GET", "/api/auditoria-interna/hitos"),
    ("GET", "/api/auditoria-interna/plazos"),
    ("GET", "/api/auditoria-interna/informes/{informe_id}/pdf"),
})


def interno_o_comercial(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    """Como `solo_interno`, pero deja pasar al comercial (el endpoint tiene que acotar a sus plantas)."""
    if usuario.tipoAcceso == "cliente":
        raise HTTPException(403, "Tu cuenta solo tiene acceso a sus propios resultados.")
    return usuario


def interno_o_comercial_acotado(request: Request, usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    """Puerta de los routers que un comercial puede abrir A MEDIAS: el personal interno pasa como siempre, el cliente
    nunca, y el comercial solo por las rutas de `RUTAS_COMERCIAL`."""
    if usuario.tipoAcceso == "cliente":
        raise HTTPException(403, "Tu cuenta solo tiene acceso a sus propios resultados.")
    if usuario.tipoAcceso == "comercial":
        ruta = getattr(request.scope.get("route"), "path", None)
        if (request.method.upper(), ruta) not in RUTAS_COMERCIAL:
            raise HTTPException(403, "Tu cuenta de comercial es de solo lectura y solo ve lo de tus plantas.")
    return usuario


# ── Endpoints ───────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    email: str
    password: str


class LoginOut(BaseModel):
    token: str
    usuario: Usuario


class CambiarPasswordIn(BaseModel):
    password_actual: str
    password_nueva: str


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn) -> Any:
    email = (body.email or "").strip()
    if _esta_frenado(email.lower()):
        raise HTTPException(429, "Demasiados intentos fallidos. Espera unos minutos.")

    with conexion() as conn, cursor_dict(conn) as cur:
        fila = _fila_por_email(cur, email)
        # La misma respuesta para "no existe la cuenta", "no tiene contrasena
        # asignada" y "la contrasena está mala": si fueran distintas, este
        # endpoint serviría para averiguar quién tiene cuenta en el sistema.
        if fila is None or not seguridad.verificar_password(body.password, fila["password_hash"]):
            _registrar_fallo(email.lower())
            from . import actividad  # import tardío: actividad importa de este módulo

            actividad.registrar(email, fila["nombre"] if fila else None, "acceso", "login_fallido",
                                None if fila else "la cuenta no existe", sensible=False)
            raise HTTPException(401, "Correo o contrasena incorrectos.")

        # Barrido de sesiones vencidas. Va acá porque el login es poco
        # frecuente y así la tabla no necesita una tarea programada aparte.
        cur.execute("DELETE FROM sesion WHERE expira_en < now()")
        _fallidos.pop(email.lower(), None)
        from . import actividad  # import tardío: actividad importa de este módulo

        actividad.registrar(fila["email"], fila["nombre"], "acceso", "login")
        return LoginOut(token=_crear_sesion(cur, fila["id"]), usuario=usuario_de_fila(fila))


@router.post("/logout")
def logout(credencial: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict[str, str]:
    """Cierra ESTA sesión. Otras sesiones de la misma persona -el teléfono, el
    computador de la planta- siguen abiertas, que es lo que se espera."""
    if credencial and credencial.credentials:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "DELETE FROM sesion WHERE token_hash = %s",
                (seguridad.huella_token(credencial.credentials),),
            )
    return {"estado": "sesion cerrada"}


@router.get("/yo", response_model=Usuario)
def yo(usuario: Usuario = Depends(usuario_actual)) -> Any:
    """La cuenta vigente. El frontend la consulta al arrancar para no seguir
    mostrando el nombre o los permisos que tenía guardados de antes."""
    return usuario


class VerificarClaveIn(BaseModel):
    password: str


@router.post("/verificar-clave")
def verificar_clave(
    body: VerificarClaveIn, usuario: Usuario = Depends(usuario_actual)
) -> dict[str, bool]:
    """Comprueba que la contraseña corresponde al usuario autenticado.
    No crea sesión ni cambia nada. Sirve para confirmar acciones críticas."""
    with conexion() as conn, cursor_dict(conn) as cur:
        fila = _fila_por_email(cur, usuario.email)
        if fila is None or not seguridad.verificar_password(body.password, fila["password_hash"]):
            raise HTTPException(401, "Contraseña incorrecta.")
    return {"ok": True}


@router.post("/cambiar-password", response_model=Usuario)
def cambiar_password(
    body: CambiarPasswordIn,
    usuario: Usuario = Depends(usuario_actual),
    credencial: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Any:
    with conexion() as conn, cursor_dict(conn) as cur:
        fila = _fila_por_email(cur, usuario.email)
        if fila is None or not seguridad.verificar_password(body.password_actual, fila["password_hash"]):
            raise HTTPException(400, "La contrasena actual no es correcta.")
        try:
            nuevo_hash = seguridad.hashear_password(body.password_nueva)
        except seguridad.PasswordInvalida as e:
            raise HTTPException(400, str(e)) from e
        cur.execute(
            """
            UPDATE usuario SET password_hash = %s, debe_cambiar = FALSE, actualizado_en = now()
            WHERE id = %s
            """,
            (nuevo_hash, fila["id"]),
        )
        # Cambiar la contrasena es lo que hace alguien que cree que se la
        # vieron. Dejar abiertas las sesiones anteriores volvería inútil el
        # gesto: se cierran todas, menos desde la que se está cambiando.
        cerrar_sesiones_de(
            cur, fila["id"],
            salvo=seguridad.huella_token(credencial.credentials) if credencial else None,
        )
        return usuario_de_fila(_fila_por_email(cur, usuario.email))
