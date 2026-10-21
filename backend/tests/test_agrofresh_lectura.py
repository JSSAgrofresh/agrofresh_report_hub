"""Lector del informe propio de AgroFresh (port de `leerAgrofreshNuevo`), con los PDF reales que llegaron al correo."""
import email
from email import policy
from pathlib import Path

import pytest

from app import agrofresh_lectura, quiteca_lectura
from app.informe_lectura import texto_quiteca

FIXT = Path(__file__).parent / "fixtures" / "correos"


def _pdfs(nombre: str) -> list[tuple[str, bytes]]:
    msg = email.message_from_bytes((FIXT / nombre).read_bytes(), policy=policy.default)
    return [(p.get_filename(), p.get_payload(decode=True)) for p in msg.walk()
            if (p.get_filename() or "").lower().endswith(".pdf")]


def test_informe_47_completo():
    nombre, datos = _pdfs("agrofresh_47.eml")[0]
    texto = texto_quiteca(datos)
    assert agrofresh_lectura.es_informe_nuevo(texto)
    inf = agrofresh_lectura.leer_agrofresh(texto)
    d = inf["datos"]
    assert d["N° Solicitud"] == "AGF2026-47" and d["OT"] == "OT-AGF0102"
    assert (d["Sold To"], d["Ship To"]) == ("DOLE CHILE S.A.", "DOLE PLANTA CODEGUA")
    assert d["Especie"] == "Limón" and d["Fecha Muestreo"] == "06-10-2026" and d["Fecha entrada"] == "09-10-2026"
    assert inf["resultados"] == {"TBZ ppm": "0,85"} and inf["sueltos"] == [] and inf["avisos"] == []
    fila = quiteca_lectura.fila_cruda(inf)
    assert fila["Informe"] == "AGF2026-47" and fila["Laboratorio"] == "Agrofresh" and fila["TBZ ppm"] == "0,85"


def test_varios_en_un_correo_dan_dos_analitos():
    for nombre, datos in _pdfs("agrofresh_varios.eml"):
        inf = agrofresh_lectura.leer_agrofresh(texto_quiteca(datos))
        assert set(inf["resultados"]) == {"FDL ppm", "IMZ ppm"}, nombre


def test_romper_el_lector_falla():
    _, datos = _pdfs("agrofresh_48.eml")[0]
    inf = agrofresh_lectura.leer_agrofresh(texto_quiteca(datos).replace("5. RESULTADOS", ""))
    assert inf["resultados"] == {}
