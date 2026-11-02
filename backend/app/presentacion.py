"""
Presentación del sistema con control remoto (Administración General → Funciones).

La presentación (`public/deck/index.html`, dentro de la app en `/presentacion`) se ve en el computador;
el teléfono, con la misma cuenta, la maneja desde `/presentacion/control`: avanza y retrocede, salta a
una diapositiva, enciende la simulación, abre el ecosistema, activa paneles y deja notas que solo se
ven en el teléfono.

Los dos no se hablan directo: pasan por una fila de `presentacion_remota` (migración 0072), una por
cuenta. No se usa memoria del proceso porque el backend corre con varios workers y no la comparten.

  · El computador llama a `POST /pc/sincronizar` cada segundo: deja lo que muestra la presentación y
    recibe las órdenes que el teléfono dejó. Esa llamada es también su «latido»: sin señal por más de
    `SEGUNDOS_ACTIVO` segundos la presentación se da por cerrada.
  · El teléfono llama a `GET /estado` para ver cómo va y a `POST /comando` para mandar una orden.
  · El aviso «presentación abierta, tócalo para manejarla» NO se guarda en la campana de notificaciones (la
    verían todas las cuentas de administrador general): el teléfono lo arma solo, al leer `GET /estado`
    mientras la presentación siga abierta.

Todo es solo del administrador general. Sin la migración 0072 los endpoints responden 503 con el aviso.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any

import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import Usuario, solo_admin_general
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/presentacion", tags=["presentacion"])

#: Diapositivas, en orden. Espejo de `DIAPOSITIVAS` en `src/features/presentacion/lib/diapositivas.ts`.
DIAPOSITIVAS = ("portada", "indice", "viaje", "sistemas", "motor", "historia", "publicar", "aporte")
#: Órdenes que el teléfono puede mandar y que datos lleva cada una.
COMANDOS = ("ir", "siguiente", "anterior", "simular", "paso", "eco", "pausa_eco", "pestana", "nodo", "engranaje", "decidir")

SEGUNDOS_ACTIVO = 8          # sin señal del computador por más de esto, la presentación está cerrada
MAX_COMANDOS = 40
MAX_NOTA = 2000
MAX_ESTADO_BYTES = 4000

_AVISO_MIGRACION = "Falta correr la migración 0072 en el servidor (presentacion_remota)."


# ── Lógica pura (se prueba sin base) ────────────────────────────────────────

def esta_activo(visto: datetime | None, ahora: datetime, segundos: float = SEGUNDOS_ACTIVO) -> bool:
    """¿Hubo señal hace menos de `segundos`?"""
    if visto is None:
        return False
    return (ahora - visto) <= timedelta(seconds=segundos)


def validar_comando(tipo: str, datos: dict[str, Any] | None) -> dict[str, Any]:
    """Revisa una orden y deja solo los datos que le corresponden. Lanza ValueError si algo no calza."""
    datos = datos or {}
    if tipo not in COMANDOS:
        raise ValueError("Orden desconocida.")
    if tipo == "ir":
        slide = str(datos.get("slide", ""))
        if slide not in DIAPOSITIVAS:
            raise ValueError("Esa diapositiva no existe.")
        return {"slide": slide}
    if tipo == "paso":
        try:
            n = int(datos.get("n"))
        except (TypeError, ValueError):
            raise ValueError("El paso tiene que ser un número.") from None
        if not 0 <= n <= 20:
            raise ValueError("Ese paso no existe.")
        return {"n": n}
    if tipo == "eco":
        return {"abierto": bool(datos.get("abierto"))}
    if tipo == "pausa_eco":
        return {"pausa": bool(datos.get("pausa"))}
    if tipo == "pestana":
        t = str(datos.get("t", ""))
        if t not in ("ico", "tok"):
            raise ValueError("Esa pestaña no existe.")
        return {"t": t}
    if tipo == "decidir":
        v = str(datos.get("v", ""))
        if v not in ("accept", "reject"):
            raise ValueError("La decisión tiene que ser aceptar o rechazar.")
        return {"v": v}
    if tipo in ("nodo", "engranaje"):
        clave = str(datos.get("k") or datos.get("id") or "")[:20]
        if not clave or not clave.replace("_", "").isalnum():
            raise ValueError("Falta qué activar.")
        return {"k": clave}
    return {}  # siguiente, anterior, simular


def agregar_comando(comandos: list[dict], seq: int, tipo: str, datos: dict[str, Any]) -> tuple[list[dict], int]:
    """Suma una orden con su número correlativo y se queda con las últimas MAX_COMANDOS."""
    seq += 1
    comandos = [*comandos, {"seq": seq, "tipo": tipo, "datos": datos}][-MAX_COMANDOS:]
    return comandos, seq


def comandos_desde(comandos: list[dict], desde: int) -> list[dict]:
    """Las órdenes que el computador aún no ejecutó. `desde < 0` = «acabo de abrir»: no ejecuta las viejas."""
    if desde < 0:
        return []
    return [c for c in comandos if c.get("seq", 0) > desde]


def limpiar_nota(texto: str) -> str:
    return (texto or "").replace("\r\n", "\n").strip()[:MAX_NOTA]


def _dentro_de_tamano(estado: dict[str, Any]) -> bool:
    return len(json.dumps(estado, ensure_ascii=False)) <= MAX_ESTADO_BYTES


# ── Entradas ────────────────────────────────────────────────────────────────

class SincronizarIn(BaseModel):
    estado: dict[str, Any] | None = None
    desde: int = -1


class ComandoIn(BaseModel):
    tipo: str = Field(max_length=20)
    datos: dict[str, Any] | None = None


class NotaIn(BaseModel):
    slide: str = Field(max_length=20)
    texto: str = Field(default="", max_length=MAX_NOTA * 2)


# ── Acceso a la base ────────────────────────────────────────────────────────

def _sin_tabla():
    return HTTPException(503, _AVISO_MIGRACION)


def _leer(cur, email: str) -> dict | None:
    cur.execute("SELECT *, now() AS ahora FROM presentacion_remota WHERE email = %s", (email,))
    return cur.fetchone()


def _json(valor: Any, defecto: Any) -> Any:
    if isinstance(valor, str):
        try:
            return json.loads(valor)
        except ValueError:
            return defecto
    return defecto if valor is None else valor


# ── Computador ──────────────────────────────────────────────────────────────

@router.post("/pc/sincronizar")
def sincronizar(body: SincronizarIn, quien: Usuario = Depends(solo_admin_general)) -> dict:
    """Latido del computador: deja el estado de la presentación y devuelve las órdenes pendientes."""
    estado = body.estado or {}
    if not _dentro_de_tamano(estado):
        raise HTTPException(413, "El estado de la presentación es demasiado grande.")
    email = quien.email.lower()
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            antes = _leer(cur, email)
            cur.execute(
                """
                INSERT INTO presentacion_remota (email, pc_visto_en, estado, actualizado_en)
                VALUES (%s, now(), %s::jsonb, now())
                ON CONFLICT (email) DO UPDATE
                   SET pc_visto_en = now(), estado = EXCLUDED.estado, actualizado_en = now()
                """,
                [email, json.dumps(estado)],
            )
            seq = antes["seq"] if antes else 0
            comandos = _json(antes["comandos"], []) if antes else []
            control = bool(antes) and esta_activo(antes["control_visto_en"], antes["ahora"])
    except psycopg2.errors.UndefinedTable:
        raise _sin_tabla() from None
    return {"comandos": comandos_desde(comandos, body.desde), "seq": seq, "control_conectado": control}


@router.post("/pc/cerrar")
def cerrar(quien: Usuario = Depends(solo_admin_general)) -> dict:
    """El computador cerró la presentación: el teléfono lo ve al instante."""
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("UPDATE presentacion_remota SET pc_visto_en = NULL, actualizado_en = now() WHERE email = %s",
                        [quien.email.lower()])
    except psycopg2.errors.UndefinedTable:
        raise _sin_tabla() from None
    return {"ok": True}


# ── Teléfono ────────────────────────────────────────────────────────────────

@router.get("/estado")
def estado(control: bool = False, quien: Usuario = Depends(solo_admin_general)) -> dict:
    """Cómo va la presentación. `control=true` lo manda el control remoto: así el computador sabe que hay un teléfono."""
    email = quien.email.lower()
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            if control:
                cur.execute(
                    """
                    INSERT INTO presentacion_remota (email, control_visto_en) VALUES (%s, now())
                    ON CONFLICT (email) DO UPDATE SET control_visto_en = now()
                    """,
                    [email],
                )
            fila = _leer(cur, email)
    except psycopg2.errors.UndefinedTable:
        raise _sin_tabla() from None
    if fila is None:
        return {"activa": False, "estado": {}, "seq": 0, "notas": {}}
    return {
        "activa": esta_activo(fila["pc_visto_en"], fila["ahora"]),
        "estado": _json(fila["estado"], {}),
        "seq": fila["seq"],
        "notas": _json(fila["notas"], {}),
    }


@router.post("/comando")
def comando(body: ComandoIn, quien: Usuario = Depends(solo_admin_general)) -> dict:
    """Una orden del teléfono para el computador."""
    try:
        datos = validar_comando(body.tipo, body.datos)
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    email = quien.email.lower()
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            fila = _leer(cur, email)
            if fila is None or not esta_activo(fila["pc_visto_en"], fila["ahora"]):
                raise HTTPException(409, "La presentación no está abierta en tu computador.")
            comandos, seq = agregar_comando(_json(fila["comandos"], []), fila["seq"], body.tipo, datos)
            cur.execute(
                "UPDATE presentacion_remota SET comandos = %s::jsonb, seq = %s, control_visto_en = now() WHERE email = %s",
                [json.dumps(comandos), seq, email],
            )
    except psycopg2.errors.UndefinedTable:
        raise _sin_tabla() from None
    return {"ok": True, "seq": seq}


@router.put("/notas")
def guardar_nota(body: NotaIn, quien: Usuario = Depends(solo_admin_general)) -> dict:
    """La nota de una diapositiva. Solo se lee desde el teléfono."""
    if body.slide not in DIAPOSITIVAS:
        raise HTTPException(400, "Esa diapositiva no existe.")
    texto = limpiar_nota(body.texto)
    email = quien.email.lower()
    try:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                """
                INSERT INTO presentacion_remota (email, notas) VALUES (%s, jsonb_build_object(%s::text, %s::text))
                ON CONFLICT (email) DO UPDATE
                   SET notas = presentacion_remota.notas || jsonb_build_object(%s::text, %s::text), actualizado_en = now()
                """,
                [email, body.slide, texto, body.slide, texto],
            )
    except psycopg2.errors.UndefinedTable:
        raise _sin_tabla() from None
    return {"ok": True}
