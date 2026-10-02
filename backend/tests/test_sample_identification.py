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


ROTULACION = "{numero_solicitud} - {posicion_muestreo} - {fecha_muestreo_dmy}"


def test_correo_dice_lo_mismo_que_el_json(monkeypatch):
    from app import mail_templates as mt

    monkeypatch.setattr(mt, "obtener", lambda lab: {"asunto": "x", "cuerpo": ROTULACION})
    monkeypatch.setattr(mt, "obtener_reanalisis", lambda lab: {"asunto": "x", "cuerpo": ROTULACION})
    casos = [
        {"numero_solicitud": "OT-ALS0007", "posicion_muestreo": "Pozo vaciado", "fecha_muestreo": "2026-10-01"},
        {"numero_solicitud": "OT-ALS0006", "posicion_muestreo": None, "fecha_muestreo": "2026-09-30"},
        {"numero_solicitud": "OT-ALS0008", "posicion_muestreo": "   ", "fecha_muestreo": "2026-10-01"},
        {"numero_solicitud": "OT-ALS0009", "posicion_muestreo": " Pozo Vaciado ", "fecha_muestreo": ""},
    ]
    for caso in casos:
        datos = {"laboratorio": "ALS", **caso}
        assert mt.renderizar("ALS", datos)[1] == _json(datos)["sample_identification"]
        assert mt.renderizar_reanalisis("ALS", datos)[1] == _json(datos)["sample_identification"]


def test_variables_nuevas_son_validas_en_el_template():
    from app import mail_templates as mt

    mt.validar(ROTULACION)
    mt.validar_reanalisis(ROTULACION)


def test_fecha_muestreo_y_solicitud_no_cambian_para_otros_templates(monkeypatch):
    from app import mail_templates as mt

    monkeypatch.setattr(mt, "obtener", lambda lab: {"asunto": "x", "cuerpo": "{fecha_muestreo}"})
    assert mt.renderizar("QUITECA", {"fecha_muestreo": "2026-10-01"})[1] == "2026-10-01"
