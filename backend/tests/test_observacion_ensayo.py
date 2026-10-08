"""
La observación de una solicitud tiene tope de 50 caracteres; un ENSAYO (Tipo Aplicación RYD) puede
describir más, hasta 500. El tope solo rige al crear o editar: lo ya emitido no cambia.

No necesita Postgres.
"""
import pytest
from pydantic import ValidationError

from app import toma_muestras as tm
from app.toma_muestras_pdf import _contar_paginas, generar_pdf_solicitud


def _cuerpo(tipo: str, observacion: str | None) -> tm.SolicitudIn:
    return tm.SolicitudIn(
        laboratorio="AGROFRESH", solicitante="J", sold_to="AGROFRESH", ship_to="ENSAYO", generado_por="J",
        especie="Manzana", observacion=observacion, campos_laboratorio={"Tipo Aplicación": tipo},
    )


def test_el_tope_de_cada_tipo():
    assert tm.tope_observacion({"Tipo Aplicación": "RYD"}) == 500
    assert tm.tope_observacion({"Tipo Aplicación": " ryd "}) == 500
    assert tm.tope_observacion({"Tipo Aplicación": "Línea de proceso"}) == 50
    assert tm.tope_observacion({"Tipo Aplicación": "Actimist"}) == 50
    assert tm.tope_observacion({}) == 50 and tm.tope_observacion(None) == 50


def test_un_ensayo_acepta_hasta_500_y_rechaza_501():
    assert _cuerpo("RYD", "x" * 500).observacion == "x" * 500
    with pytest.raises(ValidationError, match="500 caracteres"):
        _cuerpo("RYD", "x" * 501)


@pytest.mark.parametrize("tipo", ["Línea de proceso", "Actimist", "Ecofog"])
def test_los_demas_tipos_siguen_en_50(tipo):
    assert _cuerpo(tipo, "x" * 50).observacion == "x" * 50
    with pytest.raises(ValidationError, match="50 caracteres"):
        _cuerpo(tipo, "x" * 51)
    with pytest.raises(ValidationError):
        _cuerpo(tipo, "x" * 500)


def test_sin_observacion_no_pasa_nada():
    assert _cuerpo("RYD", None).observacion is None
    assert _cuerpo("Línea de proceso", "").observacion == ""


def test_una_solicitud_ya_emitida_con_observacion_larga_se_sigue_leyendo():
    """Al LEER no se exige el tope (la AGF0050 tenía más de 50): no debe salir del listado."""
    datos = _cuerpo("Línea de proceso", "corta").model_dump()
    datos.update(archivo="a.xlsx", numero_solicitud="OT-AGF0050", fecha_solicitud="01-10-2026",
                 creado_en="2026-10-01T10:00:00", observacion="y" * 120)
    assert tm.Solicitud(**datos).observacion == "y" * 120


def test_el_pdf_de_un_ensayo_trae_la_observacion_completa():
    texto = " ".join(f"palabra{i}" for i in range(1, 70))[:500]
    datos = _cuerpo("RYD", texto).model_dump()
    datos.update(numero_solicitud="OT-AGF0100", fecha_solicitud="08-10-2026")
    pdf = generar_pdf_solicitud(datos)
    assert pdf.startswith(b"%PDF") and _contar_paginas(pdf) >= 1
    from pypdf import PdfReader
    import io
    extraido = " ".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
    assert texto.split()[-2] in extraido        # llega hasta el final, no se corta
