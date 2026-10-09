"""Diseño del Panel general por tipo de cuenta o por cuenta (ver app/panel_inicio.py)."""
import pytest

from app import panel_inicio as pi
from app.auth import Usuario
from app.panel_inicio import Pieza


def P(id, x, y, w, h):
    return Pieza(id=id, x=x, y=y, w=w, h=h)


def _u(tipo="admin_general", area=None, id="7"):
    return Usuario(id=id, email="a@agrofresh.com", nombre="A", tipoAcceso=tipo, area=area)


# ── validación ───────────────────────────────────────────────────────────

def test_un_diseno_valido_no_tiene_problemas():
    assert pi.validar_piezas([P("kpi:solicitudes", 0, 0, 3, 2), P("kpi:semana", 3, 0, 3, 2)], solo_cliente=False) == []


def test_no_deja_salirse_del_tablero_ni_pisarse():
    assert any("se sale" in p for p in pi.validar_piezas([P("kpi:a", 10, 0, 3, 2)], solo_cliente=False))
    assert any("se pisan" in p for p in pi.validar_piezas([P("kpi:a", 0, 0, 4, 2), P("kpi:b", 3, 1, 4, 2)], solo_cliente=False))
    # pegados (comparten borde) NO se pisan
    assert pi.validar_piezas([P("kpi:a", 0, 0, 3, 2), P("kpi:b", 3, 0, 3, 2), P("kpi:c", 0, 2, 3, 2)], solo_cliente=False) == []


def test_no_acepta_repetidos_ni_ids_raros():
    assert any("repetido" in p for p in pi.validar_piezas([P("kpi:a", 0, 0, 3, 2), P("kpi:a", 3, 0, 3, 2)], solo_cliente=False))
    assert any("desconocido" in p for p in pi.validar_piezas([P("../etc", 0, 0, 3, 2)], solo_cliente=False))


def test_un_diseno_de_clientes_solo_admite_widgets_de_cliente():
    problemas = pi.validar_piezas([P("panel:usuarios_activos", 0, 0, 4, 5)], solo_cliente=True)
    assert any("no es para clientes" in p for p in problemas)
    assert pi.validar_piezas([P("cliente:reporte", 0, 0, 12, 12)], solo_cliente=True) == []


# ── a quién le toca cada diseño ──────────────────────────────────────────

DISENOS = {
    "tipo:cliente": {"piezas": [{"id": "cliente:reporte", "x": 0, "y": 0, "w": 12, "h": 12}]},
    "tipo:admin_area:cromatografia": {"piezas": [{"id": "kpi:semana", "x": 0, "y": 0, "w": 3, "h": 2}]},
    "usuario:7": {"piezas": [{"id": "modulo:report", "x": 0, "y": 0, "w": 3, "h": 3}]},
}


def test_la_cuenta_especifica_gana_al_tipo_y_el_tipo_con_area_gana_al_tipo():
    assert pi.diseno_de(_u("admin_general", id="7"), DISENOS)[0] == "usuario:7"
    assert pi.diseno_de(_u("admin_area", "cromatografia", id="8"), DISENOS)[0] == "tipo:admin_area:cromatografia"
    assert pi.diseno_de(_u("cliente", "cromatografia", id="9"), DISENOS)[0] == "tipo:cliente"


def test_sin_diseno_propio_no_cambia_nada():
    assert pi.diseno_de(_u("gerencia", id="3"), DISENOS) == (None, [])
    assert pi.diseno_de(_u("admin_area", "postventa", id="4"), DISENOS) == (None, [])


def test_a_un_cliente_el_servidor_le_quita_lo_que_no_es_de_clientes():
    sucio = {"tipo:cliente": {"piezas": [
        {"id": "panel:usuarios_activos", "x": 0, "y": 0, "w": 4, "h": 5},
        {"id": "cliente:reporte", "x": 4, "y": 0, "w": 8, "h": 12},
    ]}}
    _, piezas = pi.diseno_de(_u("cliente", "cromatografia", id="9"), sucio)
    assert [p["id"] for p in piezas] == ["cliente:reporte"]
    solo_interno = {"tipo:cliente": {"piezas": [{"id": "kpi:solicitudes", "x": 0, "y": 0, "w": 3, "h": 2}]}}
    assert pi.diseno_de(_u("cliente", "cromatografia", id="9"), solo_interno) == (None, [])


def test_las_rutas_estan_y_exigen_sesion():
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    assert c.get("/api/panel-inicio/mio").status_code == 401
    assert c.get("/api/panel-inicio/config").status_code == 401
    assert c.put("/api/panel-inicio/config", json={"clave": "tipo:cliente", "piezas": []}).status_code == 401
    assert c.delete("/api/panel-inicio/config?clave=tipo:cliente").status_code == 401
