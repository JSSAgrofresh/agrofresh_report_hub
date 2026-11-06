"""Crear, editar y borrar analitos y límites de Report exige ser administrador (antes bastaba tener sesión)."""
import pytest
from fastapi.testclient import TestClient

from app.auth import Usuario, usuario_actual
from app.main import app

RUTAS = [
    ("POST", "/api/reportes/analitos", {"codigo": "ZZ", "nombre": "zz", "categoria": "x", "laboratorio": "Quiteca", "unidad": "ppm"}),
    ("PUT", "/api/reportes/analitos/1", {"nombre": "zz"}),
    ("DELETE", "/api/reportes/analitos/1", None),
    ("POST", "/api/reportes/limites", {"analito_id": 1, "especie": "", "tipo_servicio": ""}),
    ("PUT", "/api/reportes/limites/1", {"limite_max": 1}),
    ("DELETE", "/api/reportes/limites/1", None),
]


def _cliente(tipo: str) -> TestClient:
    u = Usuario(id="9", email=f"{tipo}@x.cl", nombre=tipo, tipoAcceso=tipo, area="cromatografia" if tipo == "admin_area" else None, clienteNombre="X" if tipo == "cliente" else None)
    app.dependency_overrides[usuario_actual] = lambda: u
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _limpiar():
    yield
    app.dependency_overrides.pop(usuario_actual, None)


@pytest.mark.parametrize("tipo", ["cliente", "comercial", "muestreador", "analista", "gerencia"])
@pytest.mark.parametrize("metodo,ruta,cuerpo", RUTAS)
def test_quien_no_es_administrador_recibe_403(tipo, metodo, ruta, cuerpo):
    assert _cliente(tipo).request(metodo, ruta, json=cuerpo).status_code == 403


@pytest.mark.parametrize("tipo", ["admin_general", "admin_area"])
def test_un_administrador_pasa_la_puerta(tipo):
    # Sin base de datos la consulta falla después de la puerta (500): lo que importa es que no sea 403.
    r = _cliente(tipo).request("DELETE", "/api/reportes/analitos/1")
    assert r.status_code != 403


def test_leer_el_catalogo_sigue_abierto_a_cualquier_sesion():
    r = _cliente("cliente").get("/api/reportes/analitos")
    assert r.status_code != 403
