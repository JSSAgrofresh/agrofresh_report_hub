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
def test_el_endpoint_de_clientes_lista_solo_clientes(limpiar_sesiones):
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


# ── Historial de 30 días, ranking de clientes y top de acciones (02-11-2026) ─────────

CORREOS_NUEVOS = ("test-cli-a@prueba.cl", "test-cli-b@prueba.cl", "test-top@prueba.cl")


@pytest.fixture
def limpiar_nuevos():
    def borrar():
        with conexion() as c, cursor_dict(c) as cur:
            cur.execute("DELETE FROM presencia_sesion WHERE email = ANY(%s)", (list(CORREOS_NUEVOS),))
            cur.execute("DELETE FROM actividad_usuario WHERE email = ANY(%s)", (list(CORREOS_NUEVOS),))
    borrar()
    yield
    borrar()


def _poner_sesion(email, tipo, hace_dias, minutos, activo_seg):
    with conexion() as c, cursor_dict(c) as cur:
        cur.execute(
            """INSERT INTO presencia_sesion (email, nombre, tipo_acceso, cliente, planta, inicio, ultimo_latido, segundos_activos)
               VALUES (%s, %s, %s, 'GARATE', 'CODEGUA', now() - make_interval(days => %s) - make_interval(mins => %s),
                       now() - make_interval(days => %s), %s)""", (email, email, tipo, hace_dias, minutos, hace_dias, activo_seg))


@pytest.mark.skipif(not hay_base("presencia_sesion"), reason="sin la migración 0070")
def test_el_historial_cuenta_visitas_por_dia_y_suma_el_tiempo_de_los_clientes(limpiar_nuevos):
    _poner_sesion("test-cli-a@prueba.cl", "cliente", 0, 30, 600)
    _poner_sesion("test-cli-a@prueba.cl", "cliente", 3, 10, 120)
    _poner_sesion("test-cli-b@prueba.cl", "comercial", 3, 20, 300)  # no cuenta como cliente
    h = monitoreo.historial(dias=30, _=_usuario())
    assert h["disponible"] is True and len(h["por_dia"]) == 30
    por = {f["dia"]: f for f in h["por_dia"]}
    hace3 = por[sorted(por)[-4]]
    assert hace3["clientes_conexiones"] == 1 and hace3["clientes_personas"] == 1
    assert hace3["clientes_segundos"] >= 9 * 60 and hace3["clientes_uso"] == 120
    assert h["acumulado_clientes"]["30"]["visitas"] >= 3
    assert h["acumulado_clientes"]["todo"]["segundos_conectado"] >= h["acumulado_clientes"]["hoy"]["segundos_conectado"]


@pytest.mark.skipif(not hay_base("presencia_sesion"), reason="sin la migración 0070")
def test_el_ranking_de_clientes_pone_primero_al_que_mas_tiempo_estuvo_y_acepta_todo_el_historial(limpiar_nuevos):
    _poner_sesion("test-cli-a@prueba.cl", "cliente", 40, 10, 60)    # hace 40 días: solo entra en «todo»
    _poner_sesion("test-cli-b@prueba.cl", "cliente", 5, 120, 3000)  # el que más estuvo, pero hace 5 días
    _poner_sesion("test-cli-a@prueba.cl", "cliente", 1, 15, 300)    # el más reciente, pero poco tiempo
    sem = monitoreo.clientes_conectados(dias=7, orden="tiempo", _=_usuario())
    mios = [c["email"] for c in sem["cuentas"] if c["email"] in CORREOS_NUEVOS]
    assert mios == ["test-cli-b@prueba.cl", "test-cli-a@prueba.cl"]
    assert sem["visitas_total"] >= 2 and sem["segundos_activo_total"] >= 3300
    todo = monitoreo.clientes_conectados(dias=0, orden="tiempo", _=_usuario())
    a = next(c for c in todo["cuentas"] if c["email"] == "test-cli-a@prueba.cl")
    assert a["sesiones"] == 2


@pytest.mark.skipif(not hay_base("actividad_usuario"), reason="sin la migración 0047")
def test_el_top_cuenta_acciones_personas_y_pantallas_y_filtra_por_quien(limpiar_nuevos):
    with conexion() as c, cursor_dict(c) as cur:
        for _ in range(3):
            cur.execute("INSERT INTO actividad_usuario (email, nombre, categoria, accion, modulo, detalle) "
                        "VALUES ('test-top@prueba.cl', 'Top', 'report', 'descarga', 'Report', 'descargó un archivo')")
        cur.execute("INSERT INTO actividad_usuario (email, nombre, categoria, accion, modulo) "
                    "VALUES ('test-top@prueba.cl', 'Top', 'visita', 'visita', 'Storage')")
        cur.execute("INSERT INTO actividad_usuario (email, nombre, categoria, accion) VALUES ('test-top@prueba.cl', 'Top', 'acceso', 'login')")
    r = monitoreo.top(dias=7, quien="todos", _=_usuario())
    mia = next(f for f in r["acciones"] if f["etiqueta"] == "Descargó o abrió un archivo")
    assert mia["total"] >= 3 and not any(f["accion"] in ("login", "visita") for f in r["acciones"])
    assert any(p["email"] == "test-top@prueba.cl" and p["total"] >= 3 for p in r["personas"])
    assert any(p["modulo"] == "Storage" for p in r["pantallas"])
    # la cuenta de prueba no existe en `usuario`: cuenta como personal, no como cliente
    assert any(f["etiqueta"] == "Descargó o abrió un archivo" for f in monitoreo.top(dias=7, quien="internos", _=_usuario())["acciones"])
    assert all(f["etiqueta"] != "Descargó o abrió un archivo" or f["total"] < 3
               for f in monitoreo.top(dias=7, quien="clientes", _=_usuario())["acciones"])
