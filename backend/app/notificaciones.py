"""Bandeja de notificaciones del sistema AgroFresh."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import Usuario, solo_admin_general, usuario_actual
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])

_CATEGORIAS = {"actualizacion", "sistema", "cromatografia"}
_AUDIENCIAS = {"todos", "admin_general", "cromatografia"}


def _audiencias_para(quien: Usuario) -> list[str]:
    """Audiencias visibles para este usuario."""
    audiencias = ["todos"]
    if quien.tipoAcceso == "admin_general":
        audiencias += ["admin_general", "cromatografia"]
    elif (
        (quien.tipoAcceso == "admin_area" or quien.tipoAcceso == "analista")
        and getattr(quien, "area", None) == "cromatografia"
    ):
        audiencias.append("cromatografia")
    return audiencias


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
    """Notificaciones visibles para el usuario actual (publicadas, filtradas por audiencia)."""
    aud = _audiencias_para(quien)
    ph = ",".join(["%s"] * len(aud))
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(f"""
            SELECT n.id, n.titulo, n.resumen, n.cuerpo, n.categoria, n.audiencia,
                   n.publicado, n.creado_en, n.creado_por, n.metadata,
                   (nl.usuario_id IS NOT NULL) AS leida
            FROM notificacion n
            LEFT JOIN notificacion_leida nl
                ON nl.notificacion_id = n.id AND nl.usuario_id = %s
            WHERE n.publicado = TRUE AND n.audiencia IN ({ph})
            ORDER BY n.creado_en DESC
            LIMIT 60
        """, (int(quien.id), *aud))
        return [_row(r) for r in cur.fetchall()]


@router.get("/no-leidas")
def no_leidas(quien: Usuario = Depends(usuario_actual)) -> dict:
    aud = _audiencias_para(quien)
    ph = ",".join(["%s"] * len(aud))
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(f"""
            SELECT count(*) AS total FROM notificacion n
            LEFT JOIN notificacion_leida nl
                ON nl.notificacion_id = n.id AND nl.usuario_id = %s
            WHERE n.publicado = TRUE AND n.audiencia IN ({ph})
              AND nl.usuario_id IS NULL
        """, (int(quien.id), *aud))
        return {"total": int(cur.fetchone()["total"])}


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
    aud = _audiencias_para(quien)
    ph = ",".join(["%s"] * len(aud))
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(f"""
            INSERT INTO notificacion_leida (notificacion_id, usuario_id)
            SELECT n.id, %s FROM notificacion n
            WHERE n.publicado = TRUE AND n.audiencia IN ({ph})
            ON CONFLICT DO NOTHING
        """, (int(quien.id), *aud))
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
