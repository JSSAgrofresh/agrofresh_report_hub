"""
La observación de una solicitud tiene tope de 50 caracteres; una solicitud de ENSAYO (Sold To AGROFRESH
y Ship To ENSAYO, de cualquier tipo de servicio) puede describir más, hasta 500. El tope solo rige al
crear o editar: lo ya emitido no cambia.

No necesita Postgres.
"""
import io

import pytest
from pydantic import ValidationError

from app import toma_muestras as tm
from app.toma_muestras_pdf import _contar_paginas, generar_pdf_solicitud

TIPOS = ["Línea de proceso", "Actimist", "Ecofog", "RYD"]


def _cuerpo(observacion: str | None, sold_to="AGROFRESH", ship_to="ENSAYO", tipo="Línea de proceso") -> tm.SolicitudIn:
    return tm.SolicitudIn(
        laboratorio="AGROFRESH", solicitante="J", sold_to=sold_to, ship_to=ship_to, generado_por="J",
        especie="Manzana", observacion=observacion, campos_laboratorio={"Tipo Aplicación": tipo},
    )


def test_cuando_es_un_ensayo():
    assert tm.es_ensayo("AGROFRESH", "ENSAYO")
    assert tm.es_ensayo(" agrofresh ", "Ensayos")           # sin importar mayúsculas, espacios ni plural
    assert not tm.es_ensayo("AGROFRESH", "LABORATORIO DE POSTCOSECHA")
    assert not tm.es_ensayo("DOLE CHILE S.A.", "ENSAYO")
    assert not tm.es_ensayo(None, None) and not tm.es_ensayo("AGROFRESH", None)


@pytest.mark.parametrize("tipo", TIPOS)
def test_un_ensayo_admite_hasta_500_en_cualquier_tipo_de_servicio(tipo):
    assert _cuerpo("x" * 500, tipo=tipo).observacion == "x" * 500
    with pytest.raises(ValidationError, match="500 caracteres"):
        _cuerpo("x" * 501, tipo=tipo)


@pytest.mark.parametrize("tipo", TIPOS)
def test_cualquier_otro_sold_to_o_ship_to_sigue_en_50(tipo):
    for sold, ship in (("DOLE CHILE S.A.", "ENSAYO"), ("AGROFRESH", "LABORATORIO DE POSTCOSECHA"), ("DOLE", "PLANTA 1")):
        assert _cuerpo("x" * 50, sold, ship, tipo).observacion == "x" * 50
        with pytest.raises(ValidationError, match="50 caracteres"):
            _cuerpo("x" * 51, sold, ship, tipo)


def test_sin_observacion_no_pasa_nada():
    assert _cuerpo(None).observacion is None
    assert _cuerpo("", "DOLE", "PLANTA 1").observacion == ""


def test_una_solicitud_ya_emitida_con_observacion_larga_se_sigue_leyendo():
    """Al LEER no se exige el tope (la AGF0050 tenía más de 50): no debe salir del listado."""
    datos = _cuerpo("corta", "DOLE", "PLANTA 1").model_dump()
    datos.update(archivo="a.xlsx", numero_solicitud="OT-AGF0050", fecha_solicitud="01-10-2026",
                 creado_en="2026-10-01T10:00:00", observacion="y" * 120)
    assert tm.Solicitud(**datos).observacion == "y" * 120


def test_el_pdf_de_un_ensayo_trae_la_observacion_completa_en_una_pagina():
    texto = " ".join(f"palabra{i}" for i in range(1, 70))[:500]
    datos = _cuerpo(texto).model_dump()
    datos.update(numero_solicitud="OT-AGF0100", fecha_solicitud="08-10-2026")
    pdf = generar_pdf_solicitud(datos)
    assert pdf.startswith(b"%PDF") and _contar_paginas(pdf) == 1
    from pypdf import PdfReader
    extraido = " ".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
    assert texto.split()[-2] in extraido        # llega hasta el final, no se corta
