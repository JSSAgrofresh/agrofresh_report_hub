"""
Administración General → Funciones.

Interruptores del sistema que solo el administrador principal mueve, y siempre
con su contraseña. Hoy hay uno: **qué tipos de servicio muestra Report**.

Cada solicitud cargada por Ingesta o Converter lleva su tipo de servicio
(`solicitud.servicio`, migración 0055). NULL o '' es Línea de proceso (todo lo
cargado hasta hoy). Report y todo lo que se alimenta de él muestran SOLO los
servicios que estén encendidos acá. De fábrica, solo Línea de proceso: lo cargado
de Actimist, Ecofog y RYD queda guardado pero no aparece en Report hasta que se
encienda.

Esto NO afecta a Auditoría interna, Solicitudes e informes, Envío de informes ni a
ninguna otra pantalla: solo a Report.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import actividad, config_store, seguridad
from .auth import Usuario, solo_admin_general
from .db import conexion, cursor_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/funciones", tags=["funciones"])

ARCHIVO = "funciones.json"

# Clave de cada servicio -la que ve la pantalla- y su valor en `solicitud.servicio`
# (Línea de proceso es el vacío: NULL o '').
SERVICIOS_REPORT: dict[str, str] = {
    "linea_proceso": "",
    "actimist": "actimist",
    "ecofog": "ecofog",
    "ryd": "ryd",
}
ETIQUETAS: dict[str, str] = {
    "linea_proceso": "Línea de proceso",
    "actimist": "Actimist",
    "ecofog": "Ecofog",
    "ryd": "RYD",
}
# De fábrica: solo Línea de proceso.
POR_DEFECTO: dict[str, bool] = {"linea_proceso": True, "actimist": False, "ecofog": False, "ryd": False}


# La configuración viene de R2 y Report la consulta en cada pantalla: se recuerda unos
# segundos por proceso (el guardado la invalida; otro de los workers tarda a lo más esto en verlo).
_SEGUNDOS_CACHE = 15.0
_CACHE_CONFIG: dict[str, Any] = {"datos": None, "hasta": 0.0}


def invalidar() -> None:
    _CACHE_CONFIG["datos"] = None
    _CACHE_CONFIG["hasta"] = 0.0
    invalidar_columna()


def _leer_archivo() -> dict[str, Any]:
    ahora = time.monotonic()
    if _CACHE_CONFIG["datos"] is not None and ahora < _CACHE_CONFIG["hasta"]:
        return _CACHE_CONFIG["datos"]
    try:
        cfg = config_store.leer(ARCHIVO, {})  # type: ignore[arg-type]
    except (OSError, ValueError):
        cfg = {}
    cfg = cfg if isinstance(cfg, dict) else {}
    _CACHE_CONFIG["datos"] = cfg
    _CACHE_CONFIG["hasta"] = ahora + _SEGUNDOS_CACHE
    return cfg


def servicios_en_report() -> dict[str, bool]:
    """{clave: encendido}. Un archivo ausente, dañado o con una clave rara deja
    el valor de fábrica: nunca se muestra de más por un error de lectura."""
    cfg = _leer_archivo()
    report = cfg.get("report") if isinstance(cfg.get("report"), dict) else {}
    guardado = report.get("servicios") if isinstance(report.get("servicios"), dict) else {}
    return {k: (guardado[k] if isinstance(guardado.get(k), bool) else d) for k, d in POR_DEFECTO.items()}


def valores_visibles_en_report() -> list[str]:
    """Los valores de `solicitud.servicio` que Report puede mostrar ('' = Línea de proceso)."""
    encendidos = servicios_en_report()
    return [SERVICIOS_REPORT[k] for k in SERVICIOS_REPORT if encendidos.get(k)]


# ---------------------------------------------------------------------------
# Condición SQL para Report

_CACHE_COLUMNA: dict[str, Any] = {"existe": None, "hasta": 0.0}
_SEGUNDOS_SIN_COLUMNA = 60.0


def invalidar_columna() -> None:
    _CACHE_COLUMNA["existe"] = None
    _CACHE_COLUMNA["hasta"] = 0.0


def columna_servicio_existe() -> bool:
    """¿Ya se corrió la migración 0055? Si existe se recuerda para siempre; si no,
    se vuelve a mirar cada minuto (el servidor se migra con el backend prendido)."""
    ahora = time.monotonic()
    if _CACHE_COLUMNA["existe"] is True:
        return True
    if _CACHE_COLUMNA["existe"] is False and ahora < _CACHE_COLUMNA["hasta"]:
        return False
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(
                "SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'solicitud' "
                "AND column_name = 'servicio' AND table_schema = ANY(current_schemas(false))"
            )
            existe = cur.fetchone() is not None
    except Exception:  # noqa: BLE001 - sin base no hay nada que filtrar
        logger.exception("No se pudo comprobar la columna solicitud.servicio")
        return False
    _CACHE_COLUMNA["existe"] = existe
    _CACHE_COLUMNA["hasta"] = ahora + _SEGUNDOS_SIN_COLUMNA
    return existe


def condicion_report(alias: str = "s") -> tuple[str, dict[str, Any]]:
    """El `AND ...` que deja en Report solo los servicios encendidos, y sus
    parámetros. Sin la migración 0055 no hay nada que filtrar (todo es Línea de
    proceso) y devuelve vacío."""
    if not columna_servicio_existe():
        return "", {}
    return f"AND COALESCE({alias}.servicio, '') = ANY(%(servicios_report)s)", {
        "servicios_report": valores_visibles_en_report()
    }


# ---------------------------------------------------------------------------
# API

def _estado() -> dict[str, Any]:
    cfg = _leer_archivo()
    report = cfg.get("report") if isinstance(cfg.get("report"), dict) else {}
    return {
        "report": {
            "servicios": [
                {"clave": k, "etiqueta": ETIQUETAS[k], "activo": v}
                for k, v in servicios_en_report().items()
            ],
            "cambiado_por": report.get("cambiado_por"),
            "cambiado_en": report.get("cambiado_en"),
        },
        "migracion_pendiente": not columna_servicio_existe(),
    }


@router.get("")
def obtener(_: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    return _estado()


class ServicioReportIn(BaseModel):
    servicio: str
    activo: bool
    password: str | None = None


def _es_principal(usuario: Usuario) -> bool:
    from .toma_muestras import _SUPER_ADMIN_EMAIL

    return usuario.tipoAcceso == "admin_general" and usuario.email.strip().lower() == _SUPER_ADMIN_EMAIL


def _clave_correcta(usuario: Usuario, password: str | None) -> bool:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT password_hash FROM usuario WHERE id = %s", (usuario.id,))
        fila = cur.fetchone()
    return bool(fila and seguridad.verificar_password(password or "", fila.get("password_hash")))


@router.put("/report")
def cambiar_servicio_report(body: ServicioReportIn, usuario: Usuario = Depends(solo_admin_general)) -> dict[str, Any]:
    """Enciende o apaga un servicio en Report. Solo el administrador principal y
    siempre con su contraseña, tanto para encender como para apagar."""
    if body.servicio not in SERVICIOS_REPORT:
        raise HTTPException(400, f"Servicio desconocido: {body.servicio or '(vacío)'}")
    if not _es_principal(usuario):
        raise HTTPException(403, "Solo el administrador principal puede cambiar estas funciones.")
    if not _clave_correcta(usuario, body.password):
        # 403 y no 401: un 401 cierra la sesión de quien solo se equivocó al escribir la clave.
        raise HTTPException(403, "Contraseña incorrecta.")
    actual = servicios_en_report()
    if actual[body.servicio] != body.activo:
        actual[body.servicio] = body.activo
        cfg = _leer_archivo()
        cfg["report"] = {
            "servicios": actual,
            "cambiado_por": usuario.nombre,
            "cambiado_en": datetime.now(timezone.utc).isoformat(),
        }
        config_store.escribir(ARCHIVO, cfg)  # type: ignore[arg-type]
        invalidar()
        actividad.registrar(
            usuario.email, usuario.nombre, "sensible", "funciones_report",
            f"{'encendió' if body.activo else 'apagó'} {ETIQUETAS[body.servicio]} en Report",
            sensible=True,
        )
    return _estado()
