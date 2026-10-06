"""Lectura, en el servidor, de lo que trae el PDF de un informe de Quiteca.

El Converter lee estos mismos datos en el navegador al subir el informe
(`leerQuiteca` en `public/modules/converter.html`). Esto existe para completar
los informes que YA están cargados, leyendo el PDF que guardó el sistema, sin
volver a subirlos uno por uno: ver `scripts/completar_desde_pdf_quiteca.py`.

Solo lee lo que a la base le suele faltar: el N° de muestra, la hora de
muestreo y las fechas de análisis e informe.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date

_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
    "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _sin_tildes(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))


def _fecha_numerica(t: str) -> date | None:
    m = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", t)
    if not m:
        return None
    d, mes, y = int(m[1]), int(m[2]), int(m[3])
    if y < 100:
        y += 2000
    if mes > 12 and d <= 12:  # venía en mes/día
        d, mes = mes, d
    try:
        return date(y, mes, d)
    except ValueError:
        return None


def _fecha_larga(t: str) -> date | None:
    m = re.search(r"(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+(?:de\s+)?(\d{4})", t)
    if not m:
        return None
    mes = _MESES.get(_sin_tildes(m[2]).lower())
    if not mes:
        return None
    try:
        return date(int(m[3]), mes, int(m[1]))
    except ValueError:
        return None


def leer_quiteca(texto: str) -> dict[str, object]:
    """{codigo_muestra, hora_muestreo, fecha_analisis, fecha_informe}; None en lo que no está."""
    texto = texto or ""
    salida: dict[str, object] = {
        "codigo_muestra": None, "hora_muestreo": None, "fecha_analisis": None, "fecha_informe": None,
    }
    # «Identificación de la Muestra N° 85849» (o «Muestra N°85849»).
    m = re.search(r"Muestra\s*N\s*[°º.]*\s*(\d+)", texto, re.I)
    if m:
        salida["codigo_muestra"] = m[1]

    # «Fecha de Muestreo : 22-09-2026 Hora : 14:30»; si el texto sale en otro orden, la primera «Hora».
    m = re.search(r"Fecha\s+de\s+Muestreo\s*:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*Hora\s*:?\s*(\d{1,2}):(\d{2})", texto, re.I)
    if not m:
        m = re.search(r"\bHora\s*:?\s*(\d{1,2}):(\d{2})", texto, re.I)
    if m and int(m[1]) < 24 and int(m[2]) < 60:
        salida["hora_muestreo"] = f"{int(m[1]):02d}:{m[2]}"

    m = re.search(r"Fecha\s+de\s+An[áa]lisis\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", texto, re.I)
    if m:
        salida["fecha_analisis"] = _fecha_numerica(m[1])

    m = re.search(
        r"Fecha\s+Informe\s*:?\s*(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+\s+(?:de\s+)?\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        texto, re.I,
    )
    if m:
        salida["fecha_informe"] = _fecha_larga(m[1]) or _fecha_numerica(m[1])
    return salida
