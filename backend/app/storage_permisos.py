"""
Quién puede ver cada carpeta de Storage.

La regla completa está en la migración 0043. En corto: una carpeta sin filas es
abierta (la ve todo el que tenga el módulo); con filas, solo esas cuentas -más
admin general y gerencia-; las subcarpetas heredan la regla más cercana hacia
arriba y solo pueden restringirse más, nunca ampliar.

La lógica que decide (`regla_aplicable`, `puede_ver`, `reglas_a_podar`) está
escrita sin base ni request adentro, para poder probarla sola. Lo que toca
Postgres va abajo, y sin la migración corrida todo queda abierto: Storage sigue
funcionando como antes.
"""
from __future__ import annotations

from typing import Iterable

import psycopg2.errors
from fastapi import HTTPException

from .auth import Usuario
from .db import conexion, cursor_dict

ESPACIOS = ("local", "r2")

# Ven todo, sin importar las reglas. Gerencia es solo lectura (lo cuida cada
# endpoint que escribe con `solo_escribiente`).
_VEN_TODO = ("admin_general", "gerencia")

Reglas = dict[str, set[int]]


def normalizar(ruta: str) -> str:
    """'a//b/' -> 'a/b'. Sin barras al principio ni al final."""
    return "/".join(p for p in ruta.replace("\\", "/").split("/") if p not in ("", "."))


def _ancestros(ruta: str) -> Iterable[str]:
    """De la propia ruta hacia la raíz: 'a/b/c', 'a/b', 'a'."""
    partes = normalizar(ruta).split("/") if normalizar(ruta) else []
    for i in range(len(partes), 0, -1):
        yield "/".join(partes[:i])


def regla_aplicable(reglas: Reglas, ruta: str) -> tuple[str, set[int]] | None:
    """La regla de la propia carpeta o, si no tiene, la del ancestro más cercano."""
    for candidata in _ancestros(ruta):
        if candidata in reglas:
            return candidata, reglas[candidata]
    return None


def puede_ver(reglas: Reglas, ruta: str, usuario: Usuario) -> bool:
    if usuario.tipoAcceso in _VEN_TODO:
        return True
    regla = regla_aplicable(reglas, ruta)
    if regla is None:
        return True
    try:
        return int(usuario.id) in regla[1]
    except ValueError:
        return False


def reglas_a_podar(reglas: Reglas) -> list[tuple[str, int]]:
    """Filas que rompen «una subcarpeta solo restringe más»: un usuario con acceso
    a la subcarpeta pero no a la carpeta restringida que la contiene, que no
    podría llegar hasta ella. Devuelve (ruta, usuario_id) a borrar."""
    podar: list[tuple[str, int]] = []
    for ruta in sorted(reglas, key=lambda r: r.count("/")):
        padre = None
        for anc in list(_ancestros(ruta))[1:]:
            if anc in reglas:
                padre = anc
                break
        if padre is None:
            continue
        # Se compara contra lo que quedará del padre, ya podado.
        permitidos = reglas[padre]
        for uid in sorted(reglas[ruta] - permitidos):
            podar.append((ruta, uid))
        reglas[ruta] = reglas[ruta] & permitidos
    return podar


# ── Base de datos ────────────────────────────────────────────────────────

def cargar_reglas(espacio: str) -> Reglas:
    """Todas las reglas de un espacio. Sin la migración 0043, ninguna."""
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT ruta, usuario_id FROM storage_permiso WHERE espacio = %s", (espacio,))
            filas = cur.fetchall()
    except psycopg2.errors.UndefinedTable:
        return {}  # migración 0043 sin correr: todo abierto, como antes
    reglas: Reglas = {}
    for f in filas:
        reglas.setdefault(f["ruta"], set()).add(int(f["usuario_id"]))
    return reglas


def exigir_ver(reglas: Reglas, ruta: str, usuario: Usuario) -> None:
    """403 si la carpeta (o la que la contiene) está restringida y no es para él."""
    if not puede_ver(reglas, ruta, usuario):
        raise HTTPException(403, "No tienes acceso a esta carpeta.")


def guardar(espacio: str, ruta: str, usuario_ids: list[int], quien: str) -> Reglas:
    """Reemplaza quién ve `ruta`. Lista vacía = vuelve a ser abierta.
    Deja el conjunto de reglas consistente y lo devuelve."""
    ruta = normalizar(ruta)
    if not ruta:
        raise HTTPException(400, "La carpeta raíz no se puede restringir; restringe una carpeta dentro de ella.")
    ids = sorted(set(usuario_ids))
    with conexion() as conn, cursor_dict(conn) as cur:
        if ids:
            cur.execute(
                "SELECT id FROM usuario WHERE id = ANY(%s) AND tipo_acceso <> 'cliente'", (ids,)
            )
            validos = {int(f["id"]) for f in cur.fetchall()}
            if validos != set(ids):
                raise HTTPException(400, "Alguna de las cuentas no existe o es de cliente.")
        cur.execute("SELECT ruta, usuario_id FROM storage_permiso WHERE espacio = %s", (espacio,))
        reglas: Reglas = {}
        for f in cur.fetchall():
            reglas.setdefault(f["ruta"], set()).add(int(f["usuario_id"]))
        # Una subcarpeta no puede darle acceso a quien no llega hasta ella.
        for anc in list(_ancestros(ruta))[1:]:
            if anc in reglas and not set(ids) <= reglas[anc]:
                raise HTTPException(
                    400,
                    f"Primero da acceso a esas cuentas en «{anc}», que contiene esta carpeta.",
                )
        cur.execute("DELETE FROM storage_permiso WHERE espacio = %s AND ruta = %s", (espacio, ruta))
        for uid in ids:
            cur.execute(
                "INSERT INTO storage_permiso (espacio, ruta, usuario_id, creado_por) VALUES (%s, %s, %s, %s)",
                (espacio, ruta, uid, quien),
            )
        if ids:
            reglas[ruta] = set(ids)
        else:
            reglas.pop(ruta, None)
        for r, uid in reglas_a_podar(reglas):
            cur.execute(
                "DELETE FROM storage_permiso WHERE espacio = %s AND ruta = %s AND usuario_id = %s",
                (espacio, r, uid),
            )
        return reglas


def reubicar(espacio: str, viejo: str, nuevo: str | None) -> None:
    """Acompaña a una carpeta que se renombra o mueve (`nuevo`) o se borra
    (`nuevo=None`): sus reglas y las de todo lo que hay adentro la siguen.
    Sin esto, mover una carpeta restringida la dejaría abierta sin avisar."""
    viejo = normalizar(viejo)
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            if nuevo is None:
                cur.execute(
                    "DELETE FROM storage_permiso WHERE espacio = %s AND (ruta = %s OR starts_with(ruta, %s))",
                    (espacio, viejo, viejo + "/"),
                )
            else:
                nuevo = normalizar(nuevo)
                cur.execute(
                    """
                    UPDATE storage_permiso
                       SET ruta = %s || substr(ruta, %s)
                     WHERE espacio = %s AND (ruta = %s OR starts_with(ruta, %s))
                    """,
                    (nuevo, len(viejo) + 1, espacio, viejo, viejo + "/"),
                )
            cur.execute("SELECT ruta, usuario_id FROM storage_permiso WHERE espacio = %s", (espacio,))
            reglas: Reglas = {}
            for f in cur.fetchall():
                reglas.setdefault(f["ruta"], set()).add(int(f["usuario_id"]))
            # Al caer dentro de otra carpeta restringida puede quedar gente sobrando.
            for r, uid in reglas_a_podar(reglas):
                cur.execute(
                    "DELETE FROM storage_permiso WHERE espacio = %s AND ruta = %s AND usuario_id = %s",
                    (espacio, r, uid),
                )
    except psycopg2.errors.UndefinedTable:
        return  # sin la migración no hay reglas que acompañar
