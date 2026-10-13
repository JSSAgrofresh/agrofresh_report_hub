"""«Enviado al cliente» marcado a mano: contexto (servicio + lista) y mezcla con los envíos reales."""
from fastapi.testclient import TestClient

from app import envio_cliente
from app.entrega_indicadores import armar_hitos
from tests.test_envio_informes import _solicitud_dole, entorno  # noqa: F401


def test_el_contexto_trae_servicio_y_lista_de_la_solicitud(entorno):  # noqa: F811
    c = envio_cliente.contexto_de(_solicitud_dole())
    assert c["servicio"] == "Línea de proceso" and c["sin_lista"] is False
    assert c["para"] == ["cliente1@dole.cl", "cliente2@dole.cl"] and c["sold_to"]


def test_sin_lista_el_contexto_lo_dice(entorno):  # noqa: F811
    from app import config_store
    from tests.test_envio_informes import _contacto
    config_store.escribir("contactos_laboratorio.json", [_contacto("cliente1@dole.cl")])
    c = envio_cliente.contexto_de(_solicitud_dole(ship_to="LONTUE"))
    assert c["sin_lista"] is True and c["para"] == []


def test_la_marca_manual_enciende_el_hito_cliente():
    base = [{"archivo": "a.xlsx", "emitida": "2026-10-01T10:00:00", "subido_en": None, "nro_informe": None}]
    h = armar_hitos(base, {}, {}, {"a.xlsx": "2026-10-05T09:00:00"})
    assert h[0]["cliente"] == "2026-10-05T09:00:00"


def test_las_rutas_existen():
    from app.main import app
    rutas = app.openapi()["paths"]
    for r in ("/api/envio-cliente/marcar", "/api/envio-cliente/desmarcar", "/api/envio-cliente/marcas", "/api/envio-cliente/contexto"):
        assert r in rutas
