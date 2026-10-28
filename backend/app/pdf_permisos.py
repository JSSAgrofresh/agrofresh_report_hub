"""Deja un PDF listo para MOSTRARLO: sin restricciones de uso ni avisos de firma digital.

Chrome pinta «Este archivo tiene permisos limitados» sobre los PDF con restricciones (copiar, imprimir, editar: los de
Quiteca las traen) y, sobre los PDF firmados digitalmente (los de ALS), el recuadro de la firma («Este documento está
firmado digitalmente. No se pudieron comprobar algunas firmas.») tapando la hoja. Solo se reescribe la copia que se
entrega: el original guardado en R2 no se toca (y su firma tampoco; la copia deja de estar firmada a propósito). Si el PDF
no tiene nada de eso, no se lee o necesita una clave real para abrirse, se devuelve tal cual (nunca lanza).
"""
from __future__ import annotations

import io
import logging

log = logging.getLogger(__name__)


def _es_firma(campo) -> bool:
    """¿Este campo o anotación es una firma digital? (el tipo puede venir en el mismo objeto o en su padre)"""
    for _ in range(8):  # los campos anidados no son profundos; el tope evita ciclos
        campo = campo.get_object() if hasattr(campo, "get_object") else campo
        if campo is None:
            return False
        tipo = campo.get("/FT")
        if tipo is not None:
            return str(tipo) == "/Sig"
        campo = campo.get("/Parent")
    return False


def _tiene_firma(lector) -> bool:
    raiz = lector.trailer["/Root"]
    if "/Perms" in raiz:
        return True
    formulario = raiz.get("/AcroForm")
    if formulario is not None and any(_es_firma(f) for f in formulario.get_object().get("/Fields", [])):
        return True
    for pagina in lector.pages:
        for anotacion in pagina.get("/Annots", []) or []:
            anotacion = anotacion.get_object()
            if anotacion.get("/Subtype") == "/Widget" and _es_firma(anotacion):
                return True
    return False


def _quitar_firmas(escritor) -> None:
    """Saca de la copia los campos de firma (su recuadro es lo que Chrome dibuja sobre la hoja) y el sello de permisos."""
    from pypdf.generic import ArrayObject, NameObject

    raiz = escritor._root_object  # noqa: SLF001 - pypdf no expone la raíz de otra forma
    raiz.pop("/Perms", None)
    formulario = raiz.get("/AcroForm")
    if formulario is not None:
        formulario = formulario.get_object()
        campos = [f for f in formulario.get("/Fields", []) if not _es_firma(f)]
        if campos:
            formulario[NameObject("/Fields")] = ArrayObject(campos)
            formulario.pop("/SigFlags", None)
        else:
            del raiz["/AcroForm"]
    for pagina in escritor.pages:
        anotaciones = pagina.get("/Annots")
        if not anotaciones:
            continue
        restantes = [a for a in anotaciones if not (a.get_object().get("/Subtype") == "/Widget" and _es_firma(a))]
        if restantes:
            pagina[NameObject("/Annots")] = ArrayObject(restantes)
        else:
            del pagina["/Annots"]


def sin_restricciones(datos: bytes) -> bytes:
    try:
        from pypdf import PdfReader, PdfWriter

        lector = PdfReader(io.BytesIO(datos))
        cifrado = lector.is_encrypted
        if cifrado and not lector.decrypt(""):
            return datos  # pide una clave real: no se toca
        firmado = _tiene_firma(lector)
        if not cifrado and not firmado:
            return datos
        escritor = PdfWriter(clone_from=lector)
        if firmado:
            _quitar_firmas(escritor)
        salida = io.BytesIO()
        escritor.write(salida)
        return salida.getvalue()
    except Exception:  # noqa: BLE001 - mostrar el PDF original es mejor que no mostrar nada
        log.warning("No se pudo dejar el PDF listo para mostrar; se entrega el original.", exc_info=True)
        return datos
