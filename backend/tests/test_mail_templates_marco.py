"""
El marco del correo (logo, colores, pie) es compartido por las solicitudes, los
reanálisis y los informes. Al sacarlo a `_layout`, el correo de una solicitud no
puede cambiar ni un carácter: esta prueba lo compara con lo que generaba el
código ANTERIOR a esa extracción (fixture guardada en `tests/datos/`).
"""
import json
import os

import pytest

from app import config, mail_templates as m

FIXTURE = os.path.join(os.path.dirname(__file__), "datos", "correo_solicitud_y_reanalisis.json")


@pytest.fixture
def sin_config(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr("app.r2.disponible", lambda: False)


def test_solicitud_y_reanalisis_salen_igual_que_antes(sin_config):
    datos = dict(
        numero_solicitud="OT-AGF0075", laboratorio="AGROFRESH", solicitante="AGROFRESH", sold_to="X <y>",
        ship_to="Z", fecha_solicitud="2026-10-01", motivo_reanalisis="m", solicitud_original_archivo="OT-1.xlsx",
    )
    a = m.renderizar("AGROFRESH", datos)
    b = m.renderizar_reanalisis("AGROFRESH", datos)
    actual = [a[0], a[1], a[2], b[0], b[1], b[2], [i.content_id for i in a[3]]]
    with open(FIXTURE, encoding="utf-8") as f:
        assert actual == json.load(f)


def test_el_informe_es_sobrio_y_las_solicitudes_siguen_con_su_franja(sin_config):
    _, _, html, imagenes = m.renderizar_informe({"sold_to": "DOLE", "ship_to": "SAN FERNANDO"})
    solicitud = m.renderizar("AGROFRESH", {"numero_solicitud": "OT-1"})[2]
    # el informe: sin franja verde, con el logo, el título en mayúsculas y la planta
    assert "#24391a" not in html and "#6dad3c" not in html
    assert "INFORME DE ENSAYO" in html and "Laboratorio de Cromatografía" in html
    assert html.index("INFORME DE ENSAYO") < html.index("Laboratorio de Cromatografía")
    assert "DOLE — SAN FERNANDO" in html  # la planta va en el texto del correo
    assert f"cid:{m.LOGO_CONTENT_ID}" in html
    assert [i.content_id for i in imagenes] == [m.LOGO_CONTENT_ID]
    assert "Enviado automáticamente por AgroFresh Report Hub." in html
    # la solicitud no cambió
    assert "background:#24391a" in solicitud


def test_el_texto_del_informe_se_escapa_en_el_html(sin_config):
    _, _, html, _ = m.renderizar_informe({}, cuerpo="<script>alert(1)</script>\nlínea 2")
    assert "<script>" not in html and "&lt;script&gt;" in html and "<br>" in html
