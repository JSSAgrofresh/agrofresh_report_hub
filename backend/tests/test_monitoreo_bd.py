"""Latido del monitoreo contra Postgres real (se salta sola si no hay base ni la migración 0069)."""
import pytest

from app import monitoreo
from app.auth import Usuario
from app.db import conexion, cursor_dict
from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(not hay_base("presencia"), reason="sin Postgres con las migraciones 0068 y 0069")

EMAIL = "test-latido@prueba.cl"


def _usuario():
    return Usuario(id="9", email=EMAIL, nombre="Prueba Latido", tipoAcceso="analista", area="cromatografia", modulos=[])


def _fila():
    with conexion() as c, cursor_dict(c) as cur:
        cur.execute("SELECT *, now() AS ahora FROM presencia WHERE email = %s", (EMAIL,))
        return cur.fetchone()


@pytest.fixture(autouse=True)
def limpiar():
    def borrar():
        with conexion() as c, cursor_dict(c) as cur:
            cur.execute("DELETE FROM presencia WHERE email = %s", (EMAIL,))
    borrar()
    yield
    borrar()


def test_el_latido_guarda_el_detalle_y_la_pantalla_desde_cuando():
    r = monitoreo.latido(monitoreo.LatidoIn(ruta="/modulos/reportes", inactivo_segundos=200, visible=True,
                                            dispositivo="Móvil · Chrome · app", version="abc1234"), _usuario())
    assert r == {"ok": True}
    f = _fila()
    assert f["modulo"] == "Report" and f["dispositivo"] == "Móvil · Chrome · app" and f["version"] == "abc1234"
    assert 195 <= (f["ahora"] - f["ultima_interaccion"]).total_seconds() <= 215
    assert f["visible"] is True and f["ruta_desde"] is not None


def test_ruta_desde_solo_cambia_al_cambiar_de_pantalla():
    monitoreo.latido(monitoreo.LatidoIn(ruta="/modulos/reportes"), _usuario())
    primera = _fila()["ruta_desde"]
    monitoreo.latido(monitoreo.LatidoIn(ruta="/modulos/reportes"), _usuario())
    assert _fila()["ruta_desde"] == primera
    monitoreo.latido(monitoreo.LatidoIn(ruta="/modulos/storage"), _usuario())
    assert _fila()["ruta_desde"] > primera


def test_pestana_antigua_sin_detalle_igual_late_y_queda_sin_dato_de_interaccion():
    monitoreo.latido(monitoreo.LatidoIn(ruta="/"), _usuario())
    f = _fila()
    assert f["ultima_interaccion"] is None and f["modulo"] == "Panel general"
    c = next(x for x in monitoreo.armar_conectados(monitoreo._presencias(), [], f["ahora"], EMAIL) if x["email"] == EMAIL)
    assert c["actividad"] == "activa" and c["en_inicio"] is True
