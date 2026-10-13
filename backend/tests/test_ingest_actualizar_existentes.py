"""«Subir y actualizar»: el Converter manda `actualizar_existentes` y el servidor lo pasa a `_procesar_filas`."""
from contextlib import contextmanager

from app import ingest
from app.auth import Usuario


def _usuario():
    return Usuario(id="1", email="x@agrofresh.com", nombre="X", tipoAcceso="admin_general")


def _falso(monkeypatch, vistos):
    @contextmanager
    def conexion(escribir=False):
        yield object()

    @contextmanager
    def cursor_dict(conn):
        yield object()

    def procesar(cur, filas, escribir, **kw):
        vistos.append({"escribir": escribir, **kw})
        return {"resumen": {"solicitudes_nuevas": 0, "resultados": 0, "pendientes_revision": 0}, "detalle": [], "advertencias": []}

    monkeypatch.setattr(ingest, "conexion", conexion)
    monkeypatch.setattr(ingest, "cursor_dict", cursor_dict)
    monkeypatch.setattr(ingest, "crear_carga", lambda *a, **k: 1)
    monkeypatch.setattr(ingest, "insertar_notif", lambda *a, **k: None)
    monkeypatch.setattr(ingest, "_procesar_filas", procesar)


def test_por_defecto_no_actualiza(monkeypatch):
    vistos: list[dict] = []
    _falso(monkeypatch, vistos)
    ingest.confirmar(ingest.CargaRequest(filas=[{}], origen="converter"), _usuario())
    assert vistos[0]["actualizar"] is False


def test_subir_y_actualizar_se_pasa_al_procesador(monkeypatch):
    vistos: list[dict] = []
    _falso(monkeypatch, vistos)
    ingest.confirmar(ingest.CargaRequest(filas=[{}], origen="converter", actualizar_existentes=True), _usuario())
    assert vistos[0]["actualizar"] is True


def test_la_revision_previa_nunca_actualiza(monkeypatch):
    vistos: list[dict] = []
    _falso(monkeypatch, vistos)
    ingest.preview(ingest.CargaRequest(filas=[{}], origen="converter", actualizar_existentes=True))
    assert vistos[0]["escribir"] is False and "actualizar" not in vistos[0]
