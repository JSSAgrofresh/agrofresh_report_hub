"""
Contrasenas y tokens de sesión.

Todo lo de acá usa la biblioteca estándar a propósito. Las dos operaciones
que necesitamos —derivar una clave y comparar sin filtrar tiempo— ya vienen
en `hashlib` y `hmac`, y una dependencia menos es una dependencia menos que
mantener, auditar y hacer funcionar en el venv de Windows del servidor.

Nada de esto guarda una contrasena. Se guarda el resultado de pasarla por
scrypt, que no se puede deshacer: si alguien se lleva la base, no se lleva
las contrasenas de nadie.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

# Parámetros de scrypt. `n` es el costo: subirlo hace más lento tanto probar
# la contrasena correcta (una vez, imperceptible) como probarlas todas por
# fuerza bruta (millones de veces, prohibitivo). 2**15 con r=8 ocupa ~32 MB
# por intento, que es justamente lo que vuelve caro atacar en paralelo.
_N = 2 ** 15
_R = 8
_P = 1
_LARGO_CLAVE = 32
_LARGO_SAL = 16
# OpenSSL rechaza scrypt por encima de 32 MB salvo que se le autorice más, y
# 2**15 con r=8 pide ~33 MB. Es el costo que buscamos, así que se autoriza el
# doble y queda margen para subir `n` sin volver a tocar esto.
_MAXMEM = 128 * _N * _R * 2

# Va escrito adentro de cada hash. Si algún día hay que subir el costo, este
# número permite reconocer los hashes viejos y recalcularlos cuando su dueno
# entre, sin invalidar la contrasena de nadie.
_ETIQUETA = "scrypt1"

LARGO_MINIMO_PASSWORD = 10


class PasswordInvalida(ValueError):
    """La contrasena no cumple el mínimo exigido."""


def validar_password(password: str) -> None:
    """Rechaza contrasenas que no valen la pena proteger.

    El largo es lo único que se exige. Las reglas de "una mayúscula, un
    número y un símbolo" empujan a la gente hacia `Verano2026!`, que es más
    corta y más adivinable que cualquier frase larga.
    """
    if len(password or "") < LARGO_MINIMO_PASSWORD:
        raise PasswordInvalida(
            f"La contrasena debe tener al menos {LARGO_MINIMO_PASSWORD} caracteres."
        )


def hashear_password(password: str) -> str:
    """Huella de una contrasena, lista para guardar en la base.

    Cada contrasena lleva su propia sal aleatoria: dos personas con la misma
    contrasena quedan con hashes distintos, así que romper uno no delata al
    otro y las tablas precalculadas no sirven de nada.
    """
    validar_password(password)
    sal = secrets.token_bytes(_LARGO_SAL)
    clave = hashlib.scrypt(
        password.encode("utf-8"), salt=sal,
        n=_N, r=_R, p=_P, dklen=_LARGO_CLAVE, maxmem=_MAXMEM,
    )
    return "$".join([
        _ETIQUETA,
        str(_N), str(_R), str(_P),
        base64.b64encode(sal).decode("ascii"),
        base64.b64encode(clave).decode("ascii"),
    ])


def verificar_password(password: str, guardado: str | None) -> bool:
    """¿Esta contrasena corresponde a esta huella?

    Devuelve False -nunca una excepción- ante cualquier cosa rara: una cuenta
    sin contrasena asignada (`guardado` en None), un hash escrito por una
    versión futura, o un valor corrupto. Un error acá no debe distinguirse de
    una contrasena equivocada, porque la diferencia le diría a quien está
    probando algo que no le corresponde saber.
    """
    if not password or not guardado:
        return False
    try:
        etiqueta, n, r, p, sal_b64, clave_b64 = guardado.split("$")
        if etiqueta != _ETIQUETA:
            return False
        sal = base64.b64decode(sal_b64)
        esperado = base64.b64decode(clave_b64)
        calculado = hashlib.scrypt(
            password.encode("utf-8"), salt=sal,
            n=int(n), r=int(r), p=int(p), dklen=len(esperado), maxmem=_MAXMEM,
        )
    except (ValueError, TypeError):
        return False
    # compare_digest y no `==`: comparar byte a byte se corta en la primera
    # diferencia, y ese tiempo de más revela cuántos caracteres se acertaron.
    return hmac.compare_digest(calculado, esperado)


# ── Tokens de sesión ────────────────────────────────────────────────────

# 32 bytes de aleatoriedad del sistema operativo. Adivinarlo es tan
# improbable como adivinar una clave de cifrado; no hace falta más.
_BYTES_TOKEN = 32


def nuevo_token() -> str:
    """Token de sesión en claro. Se entrega una sola vez, al iniciar sesión:
    la base guarda su huella, no esto."""
    return secrets.token_urlsafe(_BYTES_TOKEN)


def huella_token(token: str) -> str:
    """Cómo se guarda un token en la tabla `sesion`.

    SHA-256 a secas y no scrypt: un token son 32 bytes aleatorios, no una
    palabra que alguien pueda adivinar probando, así que no hay nada que
    encarecer. Y esta huella se calcula en CADA request — con scrypt, mirar
    una página costaría 32 MB de memoria.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def password_temporal() -> str:
    """Contrasena de un solo uso para una cuenta nueva, para que un
    administrador se la dicte a su dueno y este la cambie al entrar.

    Sin caracteres que se confundan al leerlos en voz alta o copiarlos de un
    papel: nada de 0/O ni 1/l/I.
    """
    alfabeto = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alfabeto) for _ in range(14))
