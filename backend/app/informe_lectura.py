"""
Lectura del PDF de un informe de AgroFresh: de ahí salen el Sold To, el Ship To,
la especie y el tipo de aplicación, que son los que dicen a qué lista de
distribución va el correo (Envío de informes).

El PDF propio (`informe_pdf.py`) pone cada dato como una etiqueta en mayúsculas
y, debajo o al lado, su valor («SOLD TO» / «MULTIFRUTA SA»). Al extraer el texto
las etiquetas y los valores quedan en líneas seguidas, así que se busca cada
etiqueta y se toma lo que viene después, hasta la siguiente etiqueta.

`pypdf` es la única dependencia. Sin ella, `leer_pdf` lanza
`LecturaNoDisponible` y el módulo sigue funcionando con la lista elegida a mano.
"""
from __future__ import annotations

import io
import re
import unicodedata

from .servicios import clave_servicio


class LecturaNoDisponible(RuntimeError):
    """Falta `pypdf` en el servidor."""


def _norm(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().upper()


# Lo que se busca (campo → etiqueta tal como sale en el informe, normalizada).
CAMPOS = {
    "sold_to": "SOLD TO",
    "ship_to": "SHIP TO",
    "especie": "ESPECIE",
    "tipo_aplicacion": "TIPO APLICACION",
    "numero_solicitud": "N° SOLICITUD",
}

# Todas las etiquetas del informe: sirven para saber dónde termina un valor.
ETIQUETAS = {
    "SOLICITANTE", "N° SOLICITUD", "SOLD TO", "GENERADO POR", "SHIP TO", "FECHA SOLICITUD",
    "TIPO MUESTRA", "CSG", "TIPO APLICACION", "MUESTREADOR", "ESPECIE", "FECHA MUESTREO",
    "VARIEDAD", "HORA MUESTREO", "N° CAMARA", "N° ORDEN", "PRODUCTO", "LOTE", "POSICION",
    "OBSERVACIONES", "ID MUESTRA", "FECHA RECEPCION", "FECHA ANALISIS", "N° MUESTRA",
    "IDENTIFICACION DE LA SOLICITUD", "IDENTIFICACION DE LA MUESTRA", "IDENTIFICACION DEL ANALISIS",
    "DETERMINACIONES / RESULTADOS DE LOS ENSAYOS", "ENSAYO / ACTIVO", "RESULTADO", "UNIDAD",
}

_VACIO = {"", "—", "-", "–", "N/A", "NA", "S/D"}


def parsear_texto(texto: str) -> dict[str, str]:
    """Los datos del informe a partir del texto del PDF. Lo que no está queda
    como cadena vacía. Toma la PRIMERA aparición de cada etiqueta."""
    lineas = [l.strip() for l in (texto or "").splitlines()]
    normales = [_norm(l) for l in lineas]
    salida = {campo: "" for campo in CAMPOS}
    for campo, etiqueta in CAMPOS.items():
        for i, n in enumerate(normales):
            if n == etiqueta:
                valores: list[str] = []
                for j in range(i + 1, min(i + 4, len(lineas))):
                    if not lineas[j]:
                        continue
                    if normales[j] in ETIQUETAS:
                        break
                    valores.append(lineas[j])
                    # Un valor largo puede partirse en dos líneas; más que eso ya es otra cosa.
                    if len(valores) == 2:
                        break
                valor = " ".join(valores).strip()
                salida[campo] = "" if _norm(valor) in _VACIO else valor
                break
            if n.startswith(etiqueta + " ") and etiqueta in ("SOLD TO", "SHIP TO"):
                # «SOLD TO MULTIFRUTA SA» en una sola línea.
                valor = lineas[i][len(etiqueta):].strip()
                salida[campo] = "" if _norm(valor) in _VACIO else valor
                break
    return salida


def datos_de_informe(texto: str) -> dict[str, str]:
    """`parsear_texto` más el servicio que corresponde al tipo de aplicación."""
    datos = parsear_texto(texto)
    datos["servicio"] = clave_servicio(datos["tipo_aplicacion"])
    return datos


def leer_pdf(contenido: bytes) -> dict[str, str]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - depende del servidor
        raise LecturaNoDisponible("Falta instalar pypdf en el servidor.") from exc
    lector = PdfReader(io.BytesIO(contenido))
    texto = "\n".join((p.extract_text() or "") for p in lector.pages[:3])
    return datos_de_informe(texto)
