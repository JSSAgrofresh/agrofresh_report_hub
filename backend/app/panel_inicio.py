"""Diseño del Panel general (la pantalla de inicio) por tipo de cuenta o por cuenta.

El administrador general arma, desde Administración General → «Panel de inicio», qué widgets ve cada
tipo de cuenta (o una cuenta en particular) y dónde, en un tablero de 12 columnas. Se guarda en
`panel_inicio.json` (`_config/`, como los demás mantenedores): **sin migración**.

Cada diseño es una lista de piezas `{id, x, y, w, h}` (unidades de la grilla). La clave dice a quién aplica:
  · `usuario:<id>`            una cuenta en particular
  · `tipo:<tipo>:<area>`      un tipo de cuenta de un área (p. ej. `tipo:cliente:cromatografia`)
  · `tipo:<tipo>`             un tipo de cuenta (p. ej. `tipo:gerencia`)
Una cuenta ve el primero que exista, en ese orden; sin ninguno, ve su panel de siempre (no cambia nada).

Seguridad: un widget `cliente:*` es el único que puede ver una cuenta de cliente; el servidor los filtra al
leer y rechaza guardar otros en un diseño de clientes (lo que cargue un widget interno igual lo cierra su propia API).
Las reglas de la grilla (12 columnas, sin choques ni salirse) se espejan en `src/features/panelInicio/lib/grilla.ts`.
"""
from __future__ import annotations

import re
import threading
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import actividad, config_store
from .auth import Usuario, solo_admin_general, usuario_actual
from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/panel-inicio", tags=["panel-inicio"])

ARCHIVO = "panel_inicio.json"
COLUMNAS = 12
MAX_FILAS = 80
MAX_PIEZAS = 40
_PAT_ID = re.compile(r"^[a-z_]+:[a-z_]+$")
_PAT_CLAVE = re.compile(r"^(usuario:\d+|tipo:[a-z_]+(:[a-z_]+)?)$")
PREFIJO_CLIENTE = "cliente:"
TIPOS = ("admin_general", "admin_area", "analista", "cliente", "muestreador", "gerencia")

_BLOQUEO = threading.Lock()
_CACHE: dict[str, Any] = {"datos": None, "hasta": 0.0}
_SEGUNDOS_CACHE = 10.0


class Pieza(BaseModel):
    id: str
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)


class DisenoIn(BaseModel):
    clave: str
    piezas: list[Pieza]


# ---------------------------------------------------------------------------
# Reglas puras (sin base ni R2: se prueban solas)
# ---------------------------------------------------------------------------

def tipo_de_clave(clave: str) -> str | None:
    """El tipo de cuenta al que apunta una clave `tipo:...`; None si es de una cuenta."""
    partes = clave.split(":")
    return partes[1] if partes[0] == "tipo" and len(partes) > 1 else None


def validar_piezas(piezas: list[Pieza], *, solo_cliente: bool) -> list[str]:
    """Los problemas de un diseño, en palabras; lista vacía = es válido."""
    problemas: list[str] = []
    if len(piezas) > MAX_PIEZAS:
        problemas.append(f"Demasiados widgets (máximo {MAX_PIEZAS}).")
    vistos: set[str] = set()
    for p in piezas:
        if not _PAT_ID.match(p.id):
            problemas.append(f"Widget desconocido: {p.id!r}.")
        if p.id in vistos:
            problemas.append(f"El widget {p.id!r} está repetido.")
        vistos.add(p.id)
        if solo_cliente and not p.id.startswith(PREFIJO_CLIENTE):
            problemas.append(f"El widget {p.id!r} no es para clientes.")
        if p.x + p.w > COLUMNAS:
            problemas.append(f"{p.id!r} se sale del tablero (máximo {COLUMNAS} columnas).")
        if p.y + p.h > MAX_FILAS:
            problemas.append(f"{p.id!r} queda demasiado abajo.")
    for i, a in enumerate(piezas):
        for b in piezas[i + 1:]:
            if a.x < b.x + b.w and b.x < a.x + a.w and a.y < b.y + b.h and b.y < a.y + a.h:
                problemas.append(f"{a.id!r} y {b.id!r} se pisan.")
    return problemas


def claves_de(usuario: Usuario) -> list[str]:
    """Las claves que le aplican a una cuenta, de la más específica a la más general."""
    claves = [f"usuario:{usuario.id}"]
    if usuario.area:
        claves.append(f"tipo:{usuario.tipoAcceso}:{usuario.area}")
    claves.append(f"tipo:{usuario.tipoAcceso}")
    return claves


def diseno_de(usuario: Usuario, disenos: dict[str, Any]) -> tuple[str | None, list[dict[str, Any]]]:
    """(clave, piezas) que le toca a la cuenta, o (None, []) si no tiene diseño propio."""
    for clave in claves_de(usuario):
        d = disenos.get(clave)
        piezas = d.get("piezas") if isinstance(d, dict) else None
        if isinstance(piezas, list) and piezas:
            if usuario.tipoAcceso == "cliente":
                piezas = [p for p in piezas if str(p.get("id", "")).startswith(PREFIJO_CLIENTE)]
                if not piezas:
                    continue
            return clave, piezas
    return None, []


# ---------------------------------------------------------------------------
# Almacén
# ---------------------------------------------------------------------------

def _leer() -> dict[str, Any]:
    ahora = time.monotonic()
    with _BLOQUEO:
        if _CACHE["datos"] is not None and ahora < _CACHE["hasta"]:
            return _CACHE["datos"]
    try:
        cfg = config_store.leer(ARCHIVO, {})  # type: ignore[arg-type]
    except (OSError, ValueError):
        cfg = {}
    disenos = cfg.get("disenos") if isinstance(cfg, dict) and isinstance(cfg.get("disenos"), dict) else {}
    with _BLOQUEO:
        _CACHE["datos"] = disenos
        _CACHE["hasta"] = ahora + _SEGUNDOS_CACHE
    return disenos


def _guardar(disenos: dict[str, Any]) -> None:
    config_store.escribir(ARCHIVO, {"disenos": disenos})  # type: ignore[arg-type]
    with _BLOQUEO:
        _CACHE["datos"] = disenos
        _CACHE["hasta"] = time.monotonic() + _SEGUNDOS_CACHE


def invalidar() -> None:
    with _BLOQUEO:
        _CACHE["datos"] = None
        _CACHE["hasta"] = 0.0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/mio")
def mi_diseno(usuario: Usuario = Depends(usuario_actual)) -> dict[str, Any]:
    """El diseño del Panel general de quien pregunta (cualquier cuenta, clientes incluidos)."""
    clave, piezas = diseno_de(usuario, _leer())
    return {"clave": clave, "piezas": piezas}


@router.get("/config")
def todos_los_disenos(_: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    return {"disenos": _leer()}


def _tipo_de_cuenta(usuario_id: str) -> str | None:
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT tipo_acceso FROM usuario WHERE id = %s", (usuario_id,))
            fila = cur.fetchone()
            return fila["tipo_acceso"] if fila else None
    except Exception:
        return None


@router.put("/config")
def guardar_diseno(body: DisenoIn, admin: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    if not _PAT_CLAVE.match(body.clave):
        raise HTTPException(400, "Clave de diseño inválida.")
    tipo = tipo_de_clave(body.clave)
    if tipo is not None and tipo not in TIPOS:
        raise HTTPException(400, f"Tipo de cuenta desconocido: {tipo!r}.")
    if tipo is None:
        tipo = _tipo_de_cuenta(body.clave.split(":", 1)[1])
        if tipo is None:
            raise HTTPException(404, "Esa cuenta no existe.")
    problemas = validar_piezas(body.piezas, solo_cliente=(tipo == "cliente"))
    if problemas:
        raise HTTPException(422, " ".join(problemas))
    disenos = dict(_leer())
    disenos[body.clave] = {
        "piezas": [p.model_dump() for p in body.piezas],
        "actualizado_por": admin.email,
    }
    _guardar(disenos)
    actividad.registrar(admin.email, admin.nombre, "sensible", "panel_inicio", f"cambió el panel de inicio de {body.clave}", sensible=True)
    return {"clave": body.clave, "piezas": disenos[body.clave]["piezas"]}


@router.delete("/config")
def restaurar_diseno(clave: str, admin: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    """Vuelve al panel de siempre para esa clave."""
    if not _PAT_CLAVE.match(clave):
        raise HTTPException(400, "Clave de diseño inválida.")
    disenos = dict(_leer())
    if disenos.pop(clave, None) is not None:
        _guardar(disenos)
        actividad.registrar(admin.email, admin.nombre, "sensible", "panel_inicio", f"restauró el panel de inicio de {clave}", sensible=True)
    return {"clave": clave}
