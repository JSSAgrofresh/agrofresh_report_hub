"""«OT por revisar» descartada a mano: vale solo para los motivos revisados y se puede reabrir."""
import pytest

from app import revision_ot


@pytest.fixture
def almacen(monkeypatch):
    datos: list[dict] = []
    monkeypatch.setattr(revision_ot.config_store, "leer", lambda nombre, defecto: list(datos))
    monkeypatch.setattr(revision_ot.config_store, "escribir", lambda nombre, nuevos: (datos.clear(), datos.extend(nuevos)))
    return datos


V = {"estado": "revisar", "motivos": ["496563: planta distinta (X)"]}


def test_sin_descarte_la_verificacion_queda_igual(almacen):
    assert revision_ot.aplicar(V, revision_ot.descartadas().get("a.xlsx")) == V


def test_descartada_pasa_a_estado_descartada_con_quien_y_nota(almacen):
    revision_ot.descartar("a.xlsx", V["motivos"], "jorge@agrofresh.com", "Es la misma planta")
    v = revision_ot.aplicar(V, revision_ot.descartadas().get("a.xlsx"))
    assert v["estado"] == "descartada"
    assert v["descartada"]["por"] == "jorge@agrofresh.com" and v["descartada"]["nota"] == "Es la misma planta"
    assert v["motivos"] == V["motivos"]


def test_si_el_aviso_cambia_el_descarte_deja_de_valer(almacen):
    revision_ot.descartar("a.xlsx", V["motivos"], "j@x", "")
    otro = {"estado": "revisar", "motivos": ["496563: fecha de muestreo distinta (2026-10-05)"]}
    assert revision_ot.aplicar(otro, revision_ot.descartadas().get("a.xlsx")) == otro


def test_una_verificacion_confirmada_no_se_toca(almacen):
    revision_ot.descartar("a.xlsx", [], "j@x", "")
    ok = {"estado": "confirmada", "motivos": []}
    assert revision_ot.aplicar(ok, revision_ot.descartadas().get("a.xlsx")) == ok


def test_reabrir_quita_el_descarte(almacen):
    revision_ot.descartar("a.xlsx", V["motivos"], "j@x", "")
    assert revision_ot.reabrir("a.xlsx") is True
    assert revision_ot.descartadas() == {}
    assert revision_ot.reabrir("a.xlsx") is False
