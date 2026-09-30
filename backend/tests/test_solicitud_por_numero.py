"""
Converter trae la solicitud de un informe por su N° OT (`GET
/api/emitir/cromatografia/solicitud/{numero}`) para completar cliente,
sucursal, muestreador... en vez de volver a tipearlos.

No necesita Postgres: se reemplaza la lectura de solicitudes.
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import emitir  # noqa: E402

SOLICITUD = {
    "numero_solicitud": "OT-AGF0050",
    "sold_to": "SOCIEDAD AGRICOLA EL PORVENIR SA",
    "ship_to": "EL PORVENIR (VERFRUT) PLANTA RAPEL",
    "especie": "Mandarina",
    "analitos_solicitados": ["FDL", "IMZ", "PYR", "AZOX", "TBZ"],
}


def _con_solicitudes(monkeypatch, datos):
    monkeypatch.setattr(emitir, "leer_solicitudes_de", lambda _lab: datos)


def test_encuentra_la_solicitud_por_su_numero(monkeypatch):
    _con_solicitudes(monkeypatch, [("otra.json", {"numero_solicitud": "OT-AGF0001"}), ("a.json", SOLICITUD)])

    r = emitir.solicitud_por_numero("OT-AGF0050")

    assert r.archivo == "a.json"
    assert r.campos["Sold To (Nombre)"] == "SOCIEDAD AGRICOLA EL PORVENIR SA"
    assert r.analitos_solicitados == ["FDL", "IMZ", "PYR", "AZOX", "TBZ"]


def test_ignora_mayusculas_y_espacios(monkeypatch):
    _con_solicitudes(monkeypatch, [("a.json", SOLICITUD)])

    assert emitir.solicitud_por_numero("  ot-agf0050 ").archivo == "a.json"


def test_numero_inexistente_es_404_con_mensaje_claro(monkeypatch):
    _con_solicitudes(monkeypatch, [("a.json", SOLICITUD)])

    with pytest.raises(HTTPException) as e:
        emitir.solicitud_por_numero("OT-AGF9999")

    assert e.value.status_code == 404
    assert "OT-AGF9999" in e.value.detail
