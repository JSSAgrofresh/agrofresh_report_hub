"""«Sample Identification (IN)» del informe de ALS: el JSON que se adjunta a la
solicitud trae ese texto ya armado, siempre `N° solicitud - Posición - Fecha`."""
import json

from app import toma_muestras as tm


def _json(datos):
    return json.loads(tm._generar_json_solicitud(datos))


def test_sample_identification_une_solicitud_posicion_y_fecha():
    salida = _json({
        "laboratorio": "ALS",
        "numero_solicitud": "OT-ALS0004",
        "posicion_muestreo": "Pozo Vaciado",
        "fecha_muestreo": "2026-09-28",
    })
    assert salida["sample_identification"] == "OT-ALS0004 - Pozo Vaciado - 28-09-2026"


def test_parte_vacia_queda_marcada_y_no_se_omite():
    salida = _json({"laboratorio": "ALS", "numero_solicitud": "OT-ALS0005", "posicion_muestreo": None, "fecha_muestreo": "28-09-2026"})
    assert salida["sample_identification"] == "OT-ALS0005 - — - 28-09-2026"


def test_solo_als_recibe_sample_identification():
    base = {"numero_solicitud": "OT-X1", "posicion_muestreo": "Pozo", "fecha_muestreo": "28-09-2026"}
    assert "sample_identification" in _json({**base, "laboratorio": "ALS"})
    assert "sample_identification" in _json({**base, "laboratorio": "als"})
    assert "sample_identification" not in _json({**base, "laboratorio": "QUITECA"})
