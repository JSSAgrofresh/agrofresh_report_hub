"""Una solicitud guardada con observación de más de 50 caracteres no debe
desaparecer del listado (caso OT-AGF0050). El tope sigue valiendo al crear."""
import pytest
from pydantic import ValidationError

from app.toma_muestras import Solicitud, SolicitudIn

LARGA = "Pozo hit: 150ppm IMZ\nCaso especial de la muestra enviada por Exportadora Propal S.A"


def _base(**extra):
    return {
        "laboratorio": "AGROFRESH", "solicitante": "x", "sold_to": "Cliente",
        "generado_por": "x", **extra,
    }


def test_leer_acepta_observacion_larga():
    s = Solicitud(archivo="OT-AGF0050.xlsx", numero_solicitud="OT-AGF0050",
                  fecha_solicitud="2026-09-25", creado_en="2026-09-25T10:00:00",
                  **_base(observacion=LARGA))
    assert s.observacion == LARGA


def test_crear_sigue_limitando_a_50():
    with pytest.raises(ValidationError):
        SolicitudIn(**_base(observacion=LARGA))
