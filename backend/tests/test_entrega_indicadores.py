"""Indicadores de entrega (lead time y cumplimiento): hitos, reglas y acceso."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import config_store
from app import entrega_indicadores as ent
from app.auth import Usuario, usuario_actual
from app.main import app

T = lambda d, h=12: datetime(2026, 9, d, h, 0, tzinfo=timezone.utc)  # noqa: E731


def test_hitos_une_las_fuentes_y_prefiere_la_fecha_que_anoto_una_persona():
    base = [
        {"archivo": "a.xlsx", "emitida": T(1), "subido_en": T(10), "fecha_envio": T(8), "nro_informe": "2026-1", "en_report": True},
        {"archivo": "b.xlsx", "emitida": T(2), "subido_en": T(12), "fecha_envio": None, "nro_informe": "2026-2", "en_report": False},
        {"archivo": "c.xlsx", "emitida": T(3), "subido_en": None, "fecha_envio": None, "nro_informe": None, "en_report": False},
    ]
    h = ent.armar_hitos(base, {"a.xlsx": T(1, 18)}, {"2026-1": T(11)}, {"a.xlsx": T(14)})
    a, b, c = h
    assert a["informe"] == T(8).isoformat() and a["informe_fuente"] == "fecha_envio"
    assert a["enviada"] == T(1, 18).isoformat() and a["report"] == T(11).isoformat() and a["cliente"] == T(14).isoformat()
    assert b["informe"] == T(12).isoformat() and b["informe_fuente"] == "carga" and b["report"] is None
    # Sin informe no hay hito de informe ni de Report, aunque otra solicitud tenga fechas.
    assert c["informe"] is None and c["informe_fuente"] is None and c["report"] is None and not c["en_report"]


def test_reglas_validan_definicion_y_plazos():
    ok = ent.validar_reglas(ent.ReglasIn(entregado="cliente", plazos={" quiteca ": 12, "ALS": None}))
    assert ok == {"entregado": "cliente", "plazos": {"QUITECA": 12}}
    for malo in (
        ent.ReglasIn(entregado="otra"),
        ent.ReglasIn(entregado="cliente", plazos={"ALS": 0}),
        ent.ReglasIn(entregado="cliente", plazos={"ALS": 999}),
    ):
        with pytest.raises(HTTPException) as e:
            ent.validar_reglas(malo)
        assert e.value.status_code == 400


def test_leer_reglas_descarta_lo_invalido_y_sin_archivo_no_asume_plazos(monkeypatch):
    monkeypatch.setattr(config_store, "leer", lambda *a, **k: {})
    assert ent.leer_reglas()["plazos"] == {} and ent.leer_reglas()["entregado"] == "concretado"
    monkeypatch.setattr(config_store, "leer", lambda *a, **k: {
        "entregado": "raro", "plazos": {"alS": 10, "X": 0, "Y": "9", "Z": True}})
    r = ent.leer_reglas()
    assert r["entregado"] == "concretado" and r["plazos"] == {"ALS": 10}


def _como(tipo, modulos=None):
    app.dependency_overrides[usuario_actual] = lambda: Usuario(
        id="1", email="u@x.cl", nombre="U", tipoAcceso=tipo, modulos=modulos)


def test_acceso_ver_con_auditoria_y_guardar_solo_admin_general():
    try:
        c = TestClient(app)
        _como("cliente")
        assert c.get("/api/auditoria-interna/plazos").status_code == 403
        assert c.get("/api/auditoria-interna/hitos").status_code == 403
        _como("analista", ["auditoria_interna"])
        assert c.get("/api/auditoria-interna/plazos").status_code != 403
        assert c.put("/api/auditoria-interna/plazos", json={"entregado": "cliente", "plazos": {}}).status_code == 403
        _como("analista")
        assert c.get("/api/auditoria-interna/plazos").status_code == 403
    finally:
        app.dependency_overrides.clear()
