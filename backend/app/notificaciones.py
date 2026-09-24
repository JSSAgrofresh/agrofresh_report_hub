"""Bandeja de notificaciones del sistema AgroFresh."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import Usuario, solo_admin_general, usuario_actual, usuario_de_fila
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])

_CATEGORIAS = {"actualizacion", "sistema", "cromatografia"}
_AUDIENCIAS = {"todos", "admin_general", "cromatografia"}


def insertar_notif(
    cur,
    titulo: str,
    resumen: str,
    creado_por: str,
    categoria: str = "cromatografia",
    audiencia: str = "cromatografia",
    cuerpo: str = "",
    metadata: dict | None = None,
) -> None:
    """Inserta una notificación dentro del cursor/transacción actual.

    Llámalo desde dentro de un bloque `with conexion() as conn, cursor_dict(conn) as cur:`
    ya existente. El commit lo hace el bloque `with` al cerrarse.
    """
    cur.execute(
        """
        INSERT INTO notificacion
            (titulo, resumen, cuerpo, categoria, audiencia, publicado, creado_por, metadata)
        VALUES (%s, %s, %s, %s, %s, TRUE, %s, %s::jsonb)
        """,
        [titulo, resumen, cuerpo, categoria, audiencia, creado_por,
         json.dumps(metadata) if metadata else None],
    )


def notificar(
    titulo: str,
    resumen: str,
    creado_por: str,
    categoria: str = "cromatografia",
    audiencia: str = "cromatografia",
    cuerpo: str = "",
    metadata: dict | None = None,
) -> None:
    """Abre su propia conexión e inserta una notificación.

    Úsalo cuando no hay una transacción abierta (toma_muestras, emitir).
    Los errores se silencian para que no fallen los endpoints que la llaman.
    """
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            insertar_notif(cur, titulo, resumen, creado_por, categoria, audiencia, cuerpo, metadata)
    except Exception:  # noqa: BLE001
        pass  # Una notificación fallida nunca debe fallar el endpoint principal


def _audiencias_para(quien: Usuario) -> list[str]:
    """Audiencias visibles para este usuario (solo cuentan en los avisos)."""
    audiencias = ["todos"]
    if quien.tipoAcceso == "admin_general":
        audiencias += ["admin_general", "cromatografia"]
    elif (
        (quien.tipoAcceso == "admin_area" or quien.tipoAcceso == "analista")
        and getattr(quien, "area", None) == "cromatografia"
    ):
        audiencias.append("cromatografia")
    return audiencias


# ── Tipos de notificación y quién recibe cuáles ────────────────────────────

# El `tipo` va en `metadata->>'tipo'`. Una notificación sin tipo es un aviso
# escrito a mano en el mantenedor: esos cuentan como `anuncio`.
TIPOS: list[dict] = [
    {"id": "solicitud", "nombre": "Nueva solicitud de análisis",
     "descripcion": "Cada vez que se crea una solicitud en Toma de solicitudes."},
    {"id": "reanalisis", "nombre": "Reanálisis",
     "descripcion": "Cuando se pide un reanálisis de una solicitud existente."},
    {"id": "verificacion", "nombre": "Verificaciones diarias",
     "descripcion": "Registro o edición del control diario de equipos (REG-03)."},
    {"id": "descarga_gc", "nombre": "Descarga de resultado GC",
     "descripcion": "Cuando alguien descarga el resultado estandarizado del cromatógrafo."},
    {"id": "carga_datos", "nombre": "Carga de datos",
     "descripcion": "Cuando se confirma una carga de archivo en Data Core."},
    {"id": "anuncio", "nombre": "Avisos del sistema",
     "descripcion": "Los avisos escritos a mano en este mantenedor (respetan su audiencia)."},
]
TIPO_IDS = [t["id"] for t in TIPOS]
_TIPOS_LAB = ["verificacion", "descarga_gc", "carga_datos"]

# Expresión SQL con el tipo efectivo de una notificación.
_TIPO_SQL = "COALESCE(n.metadata->>'tipo', 'anuncio')"


def tipos_predeterminados(quien: Usuario) -> list[str]:
    """Lo que recibe un usuario al que nadie le configuró nada.

    Reproduce lo que veía cada perfil con el filtro por audiencia. Las
    cuentas `cliente` no tienen acceso a este router (SOLO_AGROFRESH en
    main.py): no reciben nada y no aparecen en el mantenedor.
    """
    if quien.tipoAcceso == "cliente":
        return []
    if quien.tipoAcceso == "admin_general" or (
        quien.tipoAcceso in ("admin_area", "analista")
        and getattr(quien, "area", None) == "cromatografia"
    ):
        return list(TIPO_IDS)
    return ["solicitud", "reanalisis", "anuncio"]


def _tipos_guardados(cur, usuario_id: int) -> list[str] | None:
    cur.execute(
        "SELECT tipos FROM notificacion_suscripcion WHERE usuario_id = %s",
        (usuario_id,),
    )
    fila = cur.fetchone()
    return None if fila is None else list(fila["tipos"] or [])


def tipos_de(cur, quien: Usuario) -> list[str]:
    """Tipos que recibe `quien`: lo configurado o, si no hay nada, lo predeterminado."""
    guardados = _tipos_guardados(cur, int(quien.id))
    return tipos_predeterminados(quien) if guardados is None else guardados


def filtro_visibles(tipos: list[str], audiencias: list[str]) -> tuple[str, list]:
    """Condición SQL (sobre el alias `n`) de las notificaciones que ve el usuario.

    El tipo decide. La audiencia solo se mira en los avisos escritos a mano,
    que es donde el que escribe elige a quién va dirigido.
    """
    sql = (
        f"n.publicado = TRUE AND {_TIPO_SQL} = ANY(%s::text[]) "
        f"AND ({_TIPO_SQL} <> 'anuncio' OR n.audiencia = ANY(%s::text[]))"
    )
    return sql, [list(tipos), list(audiencias)]


def _filtro_para(cur, quien: Usuario) -> tuple[str, list]:
    return filtro_visibles(tipos_de(cur, quien), _audiencias_para(quien))


def _row(r: dict) -> dict:
    return {
        "id": r["id"],
        "titulo": r["titulo"],
        "resumen": r["resumen"],
        "cuerpo": r["cuerpo"],
        "categoria": r["categoria"],
        "audiencia": r["audiencia"],
        "publicado": r["publicado"],
        "creado_en": r["creado_en"].isoformat() if r["creado_en"] else None,
        "creado_por": r["creado_por"],
        "leida": bool(r.get("leida", False)),
        "metadata": r.get("metadata"),
    }


@router.get("")
def listar(quien: Usuario = Depends(usuario_actual)) -> list[dict]:
    """Notificaciones visibles para el usuario actual (según los tipos que recibe)."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        where, params = _filtro_para(cur, quien)
        cur.execute(f"""
            SELECT n.id, n.titulo, n.resumen, n.cuerpo, n.categoria, n.audiencia,
                   n.publicado, n.creado_en, n.creado_por, n.metadata,
                   (nl.usuario_id IS NOT NULL) AS leida
            FROM notificacion n
            LEFT JOIN notificacion_leida nl
                ON nl.notificacion_id = n.id AND nl.usuario_id = %s
            WHERE {where}
            ORDER BY n.creado_en DESC
            LIMIT 60
        """, (int(quien.id), *params))
        return [_row(r) for r in cur.fetchall()]


@router.get("/no-leidas")
def no_leidas(quien: Usuario = Depends(usuario_actual)) -> dict:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        where, params = _filtro_para(cur, quien)
        cur.execute(f"""
            SELECT count(*) AS total FROM notificacion n
            LEFT JOIN notificacion_leida nl
                ON nl.notificacion_id = n.id AND nl.usuario_id = %s
            WHERE {where}
              AND nl.usuario_id IS NULL
        """, (int(quien.id), *params))
        return {"total": int(cur.fetchone()["total"])}


@router.get("/mis-tipos")
def mis_tipos(quien: Usuario = Depends(usuario_actual)) -> dict:
    """Qué tipos recibe el usuario actual. Vacío = no tiene el módulo (sin campana)."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        return {"tipos": tipos_de(cur, quien)}


@router.post("/{notif_id}/leer")
def marcar_leida(notif_id: int, quien: Usuario = Depends(usuario_actual)) -> dict:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("""
            INSERT INTO notificacion_leida (notificacion_id, usuario_id)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (notif_id, int(quien.id)))
    return {"estado": "ok"}


@router.post("/leer-todas")
def marcar_todas(quien: Usuario = Depends(usuario_actual)) -> dict:
    with conexion() as conn, cursor_dict(conn) as cur:
        where, params = _filtro_para(cur, quien)
        cur.execute(f"""
            INSERT INTO notificacion_leida (notificacion_id, usuario_id)
            SELECT n.id, %s FROM notificacion n
            WHERE {where}
            ON CONFLICT DO NOTHING
        """, (int(quien.id), *params))
    return {"estado": "ok"}


# ── Admin ──────────────────────────────────────────────────────────────────


class NotificacionIn(BaseModel):
    titulo: str
    resumen: str
    cuerpo: str = ""
    categoria: str
    audiencia: str = "todos"
    publicado: bool = True


@router.get("/admin/todas")
def admin_listar(_: Usuario = Depends(solo_admin_general)) -> list[dict]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("""
            SELECT n.id, n.titulo, n.resumen, n.cuerpo, n.categoria, n.audiencia,
                   n.publicado, n.creado_en, n.creado_por, n.metadata,
                   count(nl.usuario_id) AS leidas_por
            FROM notificacion n
            LEFT JOIN notificacion_leida nl ON nl.notificacion_id = n.id
            GROUP BY n.id
            ORDER BY n.creado_en DESC
        """)
        return [
            {**_row(r), "leidas_por": int(r["leidas_por"] or 0)}
            for r in cur.fetchall()
        ]


@router.post("", status_code=201)
def crear(body: NotificacionIn, quien: Usuario = Depends(solo_admin_general)) -> dict:
    if body.categoria not in _CATEGORIAS:
        raise HTTPException(400, f"Categoría inválida: {body.categoria!r}")
    if body.audiencia not in _AUDIENCIAS:
        raise HTTPException(400, f"Audiencia inválida: {body.audiencia!r}")
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("""
            INSERT INTO notificacion
                (titulo, resumen, cuerpo, categoria, audiencia, publicado, creado_por)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, titulo, resumen, cuerpo, categoria, audiencia,
                      publicado, creado_en, creado_por
        """, (body.titulo.strip(), body.resumen.strip(), body.cuerpo.strip(),
              body.categoria, body.audiencia, body.publicado, quien.nombre))
        return {**_row(cur.fetchone()), "leidas_por": 0}


@router.put("/{notif_id}")
def editar(notif_id: int, body: NotificacionIn, _: Usuario = Depends(solo_admin_general)) -> dict:
    if body.categoria not in _CATEGORIAS:
        raise HTTPException(400, f"Categoría inválida: {body.categoria!r}")
    if body.audiencia not in _AUDIENCIAS:
        raise HTTPException(400, f"Audiencia inválida: {body.audiencia!r}")
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("""
            UPDATE notificacion
            SET titulo=%s, resumen=%s, cuerpo=%s,
                categoria=%s, audiencia=%s, publicado=%s
            WHERE id=%s
            RETURNING id, titulo, resumen, cuerpo, categoria, audiencia,
                      publicado, creado_en, creado_por
        """, (body.titulo.strip(), body.resumen.strip(), body.cuerpo.strip(),
              body.categoria, body.audiencia, body.publicado, notif_id))
        r = cur.fetchone()
        if r is None:
            raise HTTPException(404, "Notificación no encontrada.")
        return {**_row(r), "leidas_por": 0}


@router.delete("/{notif_id}")
def eliminar(notif_id: int, _: Usuario = Depends(solo_admin_general)) -> dict:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM notificacion WHERE id=%s RETURNING id", (notif_id,))
        if cur.fetchone() is None:
            raise HTTPException(404, "Notificación no encontrada.")
    return {"estado": "eliminada"}


# ── Admin: quién recibe qué ────────────────────────────────────────────────


class SuscripcionIn(BaseModel):
    tipos: list[str]


def _validar_tipos(tipos: list[str]) -> list[str]:
    invalidos = [t for t in tipos if t not in TIPO_IDS]
    if invalidos:
        raise HTTPException(400, f"Tipo de notificación inválido: {invalidos[0]!r}")
    # Sin duplicados y en el orden del catálogo.
    return [t for t in TIPO_IDS if t in set(tipos)]


def _fila_suscripcion(fila: dict) -> dict:
    usuario = usuario_de_fila({**fila, "password_hash": None, "debe_cambiar": False})
    personalizado = fila["tipos"] is not None
    return {
        "usuario_id": int(fila["id"]),
        "nombre": fila["nombre"],
        "email": fila["email"],
        "tipoAcceso": fila["tipo_acceso"],
        "area": fila["area"],
        "tipos": list(fila["tipos"]) if personalizado else tipos_predeterminados(usuario),
        "personalizado": personalizado,
    }


_SQL_SUSCRIPCIONES = """
    SELECT u.id, u.email, u.nombre, u.tipo_acceso, u.area, u.cliente_nombre,
           u.planta_nombre, u.modulos, u.reportes, s.tipos
    FROM usuario u
    LEFT JOIN notificacion_suscripcion s ON s.usuario_id = u.id
    WHERE u.tipo_acceso <> 'cliente'
"""


@router.get("/admin/suscripciones")
def admin_suscripciones(_: Usuario = Depends(solo_admin_general)) -> dict:
    """Catálogo de tipos y, por cada usuario, qué tipos recibe."""
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(_SQL_SUSCRIPCIONES + " ORDER BY lower(u.nombre)")
        return {"tipos": TIPOS, "usuarios": [_fila_suscripcion(f) for f in cur.fetchall()]}


@router.put("/admin/suscripciones/{usuario_id}")
def admin_guardar_suscripcion(
    usuario_id: int, body: SuscripcionIn, quien: Usuario = Depends(solo_admin_general),
) -> dict:
    tipos = _validar_tipos(body.tipos)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT tipo_acceso FROM usuario WHERE id = %s", (usuario_id,))
        fila = cur.fetchone()
        if fila is None:
            raise HTTPException(404, "Usuario no encontrado.")
        if fila["tipo_acceso"] == "cliente":
            raise HTTPException(400, "Las cuentas cliente no tienen notificaciones.")
        cur.execute("""
            INSERT INTO notificacion_suscripcion (usuario_id, tipos, actualizado_por)
            VALUES (%s, %s::text[], %s)
            ON CONFLICT (usuario_id) DO UPDATE
               SET tipos = EXCLUDED.tipos, actualizado_en = now(),
                   actualizado_por = EXCLUDED.actualizado_por
        """, (usuario_id, tipos, quien.nombre))
        cur.execute(_SQL_SUSCRIPCIONES + " AND u.id = %s", (usuario_id,))
        return _fila_suscripcion(cur.fetchone())


@router.delete("/admin/suscripciones/{usuario_id}")
def admin_restablecer_suscripcion(
    usuario_id: int, _: Usuario = Depends(solo_admin_general),
) -> dict:
    """Vuelve el usuario a lo predeterminado para su perfil."""
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM notificacion_suscripcion WHERE usuario_id = %s", (usuario_id,))
        cur.execute(_SQL_SUSCRIPCIONES + " AND u.id = %s", (usuario_id,))
        fila = cur.fetchone()
        if fila is None:
            raise HTTPException(404, "Usuario no encontrado.")
        return _fila_suscripcion(fila)
