"""«OT por revisar» descartada a mano.

Un informe cuyo cruce con la OT no se pudo confirmar (otra OT impresa, planta o fecha distinta, OT sin confirmar)
queda marcado «OT por revisar». Cuando una persona ya lo revisó y está bien, el administrador general lo **descarta**:
deja de contar como problema, pero sigue a la vista como «OT revisada» (con quién, cuándo y su nota) y se puede
volver a abrir. Se guarda en `revision_ot_descartadas.json` (`_config/`), sin migración.

**Un descarte vale solo para los motivos que se revisaron**: si después el informe cambia (otra planta, otra fecha) y
el aviso es distinto, el descarte deja de aplicar y el problema vuelve a salir.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from . import config_store

logger = logging.getLogger(__name__)

ARCHIVO = "revision_ot_descartadas.json"


def _leer() -> list[dict[str, Any]]:
    try:
        datos = config_store.leer(ARCHIVO, [])
    except (OSError, ValueError):
        logger.exception("No se pudo leer %s", ARCHIVO)
        return []
    return [d for d in datos if isinstance(d, dict) and d.get("archivo")] if isinstance(datos, list) else []


def descartadas() -> dict[str, dict[str, Any]]:
    """{archivo de la solicitud: {motivos, por, en, nota}}."""
    return {d["archivo"]: d for d in _leer()}


def aplicar(verificacion: dict, descarte: dict[str, Any] | None) -> dict:
    """La verificación con el descarte aplicado (estado «descartada»), si el descarte sigue valiendo."""
    if not descarte or verificacion.get("estado") not in ("revisar", "sin_confirmar"):
        return verificacion
    if list(descarte.get("motivos") or []) != list(verificacion.get("motivos") or []):
        return verificacion
    return {
        **verificacion,
        "estado": "descartada",
        "descartada": {"por": descarte.get("por"), "en": descarte.get("en"), "nota": descarte.get("nota") or ""},
    }


def descartar(archivo: str, motivos: list[str], por: str, nota: str) -> None:
    resto = [d for d in _leer() if d["archivo"] != archivo]
    resto.append({
        "archivo": archivo,
        "motivos": list(motivos),
        "por": por,
        "en": datetime.now(timezone.utc).isoformat(),
        "nota": (nota or "").strip()[:300],
    })
    config_store.escribir(ARCHIVO, resto)


def reabrir(archivo: str) -> bool:
    datos = _leer()
    resto = [d for d in datos if d["archivo"] != archivo]
    if len(resto) == len(datos):
        return False
    config_store.escribir(ARCHIVO, resto)
    return True
