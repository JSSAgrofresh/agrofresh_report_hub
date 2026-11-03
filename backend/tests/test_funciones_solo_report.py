"""Los botones de Administración General → Funciones (qué tipos de servicio se ven) valen SOLO para Report.

El Panel de control interno pide `ambito=control` y el personal interno ve todos los servicios; los clientes y
comerciales siempre quedan acotados, pidan lo que pidan."""
from app import funciones, reportes
from app.auth import Usuario


def _usuario(tipo: str) -> Usuario:
    return Usuario(id="1", email="a@x.cl", nombre="A", tipoAcceso=tipo, clienteNombre="DOLE" if tipo == "cliente" else None)


def _solo_linea(monkeypatch):
    monkeypatch.setattr(funciones, "condicion_report", lambda alias="s": (f"AND COALESCE({alias}.servicio,'') = ANY(%(servicios_report)s)", {"servicios_report": [""]}))


def test_report_normal_se_limita_a_los_servicios_encendidos(monkeypatch):
    _solo_linea(monkeypatch)
    sql, params = reportes._filtro_alcance(_usuario("admin_general"), None, None)
    assert "servicios_report" in sql and "servicios_report" in params


def test_panel_de_control_interno_ve_todos_los_servicios(monkeypatch):
    _solo_linea(monkeypatch)
    sql, params = reportes._filtro_alcance(_usuario("admin_general"), None, None, limitar_servicios=False)
    assert "servicios_report" not in sql and "servicios_report" not in params


def test_un_cliente_nunca_se_salta_el_filtro(monkeypatch):
    _solo_linea(monkeypatch)
    sql, params = reportes._filtro_alcance(_usuario("cliente"), None, None, limitar_servicios=False)
    assert "servicios_report" in sql
