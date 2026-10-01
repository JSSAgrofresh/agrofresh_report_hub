"""Las solicitudes de prueba de Quiteca solo van a las dos direcciones de
prueba; las reales y las de otros laboratorios siguen con sus contactos."""
from __future__ import annotations

from unittest.mock import patch

from app import toma_muestras

CONTACTOS = [
    {"laboratorio": "QUITECA", "tipo": "solicitud", "activo": True, "email": "real@quiteca.cl", "orden": 1},
]


def _contactos(datos: dict, laboratorio: str = "QUITECA") -> dict:
    with patch.object(toma_muestras, "_leer_config", return_value=CONTACTOS):
        return toma_muestras.contactos_de_solicitud_de(laboratorio, datos)


def test_prueba_de_quiteca_solo_va_a_las_dos_direcciones():
    r = _contactos({"es_prueba": True})
    assert r == {
        "to": ["agrofresh@portal.quiteca.cl", "jorge.sandoval@agrofresh.com"],
        "cc": [],
        "bcc": [],
    }


def test_solicitud_real_de_quiteca_sigue_a_sus_contactos():
    assert _contactos({})["to"] == ["real@quiteca.cl"]


def test_prueba_de_otro_laboratorio_no_cambia():
    assert "agrofresh@portal.quiteca.cl" not in _contactos({"es_prueba": True}, "AGROFRESH")["to"]


def test_observacion_de_mas_de_50_caracteres_se_rechaza():
    import pytest
    from pydantic import ValidationError

    base = {"generado_por": "J", "laboratorio": "QUITECA", "solicitante": "J", "sold_to": "X", "especie": "Y"}
    toma_muestras.SolicitudIn(**base, observacion="x" * 50)
    with pytest.raises(ValidationError):
        toma_muestras.SolicitudIn(**base, observacion="x" * 51)
