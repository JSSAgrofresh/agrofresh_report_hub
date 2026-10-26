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


def _sesiones():
    with conexion() as c, cursor_dict(c) as cur:
        cur.execute("SELECT * FROM presencia_sesion WHERE email = %s ORDER BY inicio", (EMAIL,))
        return cur.fetchall()


def _cliente():
    return Usuario(id="9", email=EMAIL, nombre="Cliente Prueba", tipoAcceso="cliente", clienteNombre="GARATE",
                   plantaNombre="CODEGUA", modulos=[])


@pytest.fixture
def limpiar_sesiones():
    def borrar():
        with conexion() as c, cursor_dict(c) as cur:
            cur.execute("DELETE FROM presencia_sesion WHERE email = %s", (EMAIL,))
    borrar()
    yield
    borrar()


@pytest.mark.skipif(not hay_base("presencia_sesion"), reason="sin la migración 0070")
def test_las_senales_seguidas_son_una_sola_visita_y_acumulan_tiempo_activo(limpiar_sesiones):
    monitoreo.latido(monitoreo.LatidoIn(ruta="/modulos/reportes", inactivo_segundos=0, dispositivo="Móvil · Chrome"), _cliente())
    with conexion() as c, cursor_dict(c) as cur:  # el latido anterior fue hace 60 s
        cur.execute("UPDATE presencia_sesion SET inicio = now() - interval '60 seconds', "
                    "ultimo_latido = now() - interval '60 seconds' WHERE email = %s", (EMAIL,))
    monitoreo.latido(monitoreo.LatidoIn(ruta="/modulos/reportes", inactivo_segundos=5), _cliente())
    s = _sesiones()
    assert len(s) == 1 and s[0]["cliente"] == "GARATE" and s[0]["planta"] == "CODEGUA"
    assert 55 <= s[0]["segundos_activos"] <= 65
    assert 55 <= (s[0]["ultimo_latido"] - s[0]["inicio"]).total_seconds() <= 65


@pytest.mark.skipif(not hay_base("presencia_sesion"), reason="sin la migración 0070")
def test_pasados_10_minutos_sin_senal_abre_una_visita_nueva_y_la_pausa_no_suma(limpiar_sesiones):
    monitoreo.latido(monitoreo.LatidoIn(ruta="/"), _cliente())
    with conexion() as c, cursor_dict(c) as cur:
        cur.execute("UPDATE presencia_sesion SET ultimo_latido = now() - interval '11 minutes', "
                    "inicio = now() - interval '12 minutes' WHERE email = %s", (EMAIL,))
    monitoreo.latido(monitoreo.LatidoIn(ruta="/"), _cliente())
    assert len(_sesiones()) == 2
    # en pausa (sin tocar nada hace 5 min): el tiempo pasa pero no cuenta como activo
    with conexion() as c, cursor_dict(c) as cur:
        cur.execute("UPDATE presencia_sesion SET ultimo_latido = now() - interval '60 seconds' WHERE email = %s "
                    "AND id = (SELECT max(id) FROM presencia_sesion WHERE email = %s)", (EMAIL, EMAIL))
    monitoreo.latido(monitoreo.LatidoIn(ruta="/", inactivo_segundos=300), _cliente())
    assert _sesiones()[-1]["segundos_activos"] == 0


@pytest.mark.skipif(not hay_base("presencia_sesion"), reason="sin la migración 0070")
def test_el_endpoint_de_clientes_lista_solo_clientes_y_comerciales(limpiar_sesiones):
    monitoreo.latido(monitoreo.LatidoIn(ruta="/"), _cliente())
    interno = Usuario(id="8", email="test-interno@prueba.cl", tipoAcceso="analista", nombre="Interno", modulos=[])
    monitoreo.latido(monitoreo.LatidoIn(ruta="/"), interno)
    try:
        r = monitoreo.clientes_conectados(dias=1, _=_cliente())
        correos = [c["email"] for c in r["cuentas"]]
        assert EMAIL in correos and "test-interno@prueba.cl" not in correos and r["disponible"] is True
    finally:
        with conexion() as c, cursor_dict(c) as cur:
            cur.execute("DELETE FROM presencia_sesion WHERE email = 'test-interno@prueba.cl'")
            cur.execute("DELETE FROM presencia WHERE email = 'test-interno@prueba.cl'")


@pytest.mark.skipif(not hay_base("usuario"), reason="sin la tabla de usuarios")
def test_el_detalle_de_una_cuenta_dice_a_que_sold_to_y_ship_to_pertenece():
    import json
    correo = "test-pertenencia@prueba.cl"
    with conexion() as c, cursor_dict(c) as cur:
        cur.execute("DELETE FROM usuario WHERE email = %s", (correo,))
        cur.execute(
            "INSERT INTO usuario (email, nombre, tipo_acceso, area, password_hash, plantas_asignadas) "
            "VALUES (%s, 'Prueba', 'cliente', NULL, 'x', %s::jsonb)",
            (correo, json.dumps([{"clienteNombre": "DOLE CHILE S.A.", "plantaNombre": "DOLE PLANTA CODEGUA", "especie": "Cerezas"}])))
    try:
        d = monitoreo.detalle_usuario(email=correo, _=_usuario())
        assert d["cuenta"]["tipo"] == "cliente"
        assert d["cuenta"]["accesos"] == [{"sold_to": "DOLE CHILE S.A.", "ship_to": "DOLE PLANTA CODEGUA", "especies": ["Cerezas"]}]
    finally:
        with conexion() as c, cursor_dict(c) as cur:
            cur.execute("DELETE FROM usuario WHERE email = %s", (correo,))
