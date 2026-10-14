"""Quita las restricciones de uso (copiar, imprimir, editar) de un PDF al MOSTRARLO.

Chrome pinta «Este archivo tiene permisos limitados» sobre los PDF con restricciones (los de Quiteca las traen). Solo se
reescribe la copia que se entrega: el original guardado en R2 no se toca. Si el PDF no está cifrado, no se lee o necesita
una clave real para abrirse, se devuelve tal cual (nunca lanza).
"""
from __future__ import annotations

import io
import logging

log = logging.getLogger(__name__)


def sin_restricciones(datos: bytes) -> bytes:
    try:
        from pypdf import PdfReader, PdfWriter

        lector = PdfReader(io.BytesIO(datos))
        if not lector.is_encrypted:
            return datos
        if not lector.decrypt(""):
            return datos  # pide una clave real: no se toca
        escritor = PdfWriter(clone_from=lector)
        salida = io.BytesIO()
        escritor.write(salida)
        return salida.getvalue()
    except Exception:  # noqa: BLE001 - mostrar el PDF original es mejor que no mostrar nada
        log.warning("No se pudieron quitar las restricciones del PDF; se entrega el original.", exc_info=True)
        return datos
