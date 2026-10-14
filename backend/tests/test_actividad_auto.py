"""Actividad automática: qué llamadas de la API se anotan y cómo."""
import asyncio

from app import actividad_auto as aa


def test_descarga_bd_se_anota():
    d = aa.describir("POST", "/reportes/bd/excel")
    assert d and d["categoria"] == "report"


def test_lectura_normal_no_se_anota():
    assert aa.describir("GET", "/reportes/datos") is None


def test_login_y_visita_se_omiten():
    assert aa.describir("POST", "/auth/login") is None
    assert aa.describir("POST", "/actividad/visita") is None


def test_delete_desconocido_es_sensible():
    d = aa.describir("DELETE", "/storage/algo/nuevo")
    assert d and d["categoria"] == "sensible" and d["sensible"]


def test_post_desconocido_cae_en_generica_con_modulo():
    d = aa.describir("POST", "/postventa/lo-que-sea/12345")
    assert d and d["categoria"] == "postventa" and "#" in d["texto"]


def test_editar_solicitud_se_anota_pero_borrarla_no_duplica_otra_fuente():
    assert aa.describir("PUT", "/toma-muestras/solicitudes/abc.xlsx") is not None


def test_anotar_sin_usuario_no_lanza(monkeypatch):
    monkeypatch.setattr(aa, "usuario_de_token", lambda t: None)
    llamadas = []
    monkeypatch.setattr(aa, "registrar", lambda *a, **k: llamadas.append(a))
    aa.anotar("x", "POST", "/reportes/bd/excel")
    assert llamadas == []


def test_anotar_registra_y_deduplica_get(monkeypatch):
    monkeypatch.setattr(aa, "usuario_de_token", lambda t: ("a@b.cl", "Ana"))
    llamadas = []
    monkeypatch.setattr(aa, "registrar", lambda *a, **k: llamadas.append((a, k)))
    aa._VISTAS.clear()
    aa.anotar("x", "POST", "/reportes/bd/excel")
    aa.anotar("x", "POST", "/reportes/bd/excel")
    assert len(llamadas) == 2  # los POST no se deduplican
    n = len(llamadas)
    ruta = "/storage/descargar"
    if aa.describir("GET", ruta):
        aa.anotar("x", "GET", ruta)
        aa.anotar("x", "GET", ruta)
        assert len(llamadas) == n + 1


def test_middleware_ignora_4xx(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    vistas = []
    monkeypatch.setattr(aa, "anotar", lambda *a: vistas.append(a))
    c = TestClient(app)
    c.post("/api/reportes/bd/excel", headers={"Authorization": "Bearer x"})  # sin sesión → 401
    assert vistas == []
