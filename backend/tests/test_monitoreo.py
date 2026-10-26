"""Monitoreo (vista de bolsillo del administrador principal): las piezas puras y el acceso."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app import monitoreo
from app.auth import Usuario

AHORA = datetime(2026, 10, 22, 15, 30, tzinfo=timezone.utc)  # 12:30 en Chile (UTC-3)


def _ev(minutos, email, categoria="solicitudes", accion="solicitud_creada", texto="creó", modulo=None, nombre="Paz"):
    return {"t": AHORA - timedelta(minutes=minutos), "email": email, "nombre": nombre, "categoria": categoria,
            "accion": accion, "texto": texto, "modulo": modulo}


def _pres(email, segundos, desde_min=60):
    return {"email": email, "nombre": email.split("@")[0], "tipo_acceso": "analista", "area": "cromatografia",
            "ruta": "/modulos/toma-muestras", "modulo": "Toma de muestras",
            "desde": AHORA - timedelta(minutes=desde_min), "ultimo_latido": AHORA - timedelta(seconds=segundos)}


class TestConectados:
    def test_en_linea_si_el_latido_es_reciente(self):
        r = monitoreo.armar_conectados([_pres("a@x.cl", 40)], [], AHORA)
        assert r[0]["estado"] == "en_linea" and r[0]["origen"] == "latido"

    def test_reciente_entre_3_y_30_minutos_y_despues_no_sale(self):
        r = monitoreo.armar_conectados([_pres("a@x.cl", 600), _pres("b@x.cl", 3600)], [], AHORA)
        assert [c["email"] for c in r] == ["a@x.cl"] and r[0]["estado"] == "reciente"

    def test_los_en_linea_van_primero(self):
        r = monitoreo.armar_conectados([_pres("viejo@x.cl", 900), _pres("nuevo@x.cl", 20)], [], AHORA)
        assert [c["email"] for c in r] == ["nuevo@x.cl", "viejo@x.cl"]

    def test_sin_latido_se_infiere_de_la_actividad(self):
        r = monitoreo.armar_conectados([], [_ev(5, "p@x.cl", modulo="Toma de muestras")], AHORA)
        assert r[0]["origen"] == "actividad" and r[0]["estado"] == "reciente"

    def test_actividad_vieja_no_cuenta_y_el_latido_manda_sobre_la_actividad(self):
        assert monitoreo.armar_conectados([], [_ev(120, "p@x.cl")], AHORA) == []
        r = monitoreo.armar_conectados([_pres("p@x.cl", 10)], [_ev(1, "p@x.cl")], AHORA)
        assert len(r) == 1 and r[0]["origen"] == "latido"

    def test_cuenta_las_acciones_de_hoy_y_marca_a_quien_mira(self):
        evs = [_ev(10, "p@x.cl"), _ev(20, "p@x.cl", categoria="visita", accion="visita"),
               _ev(60 * 20, "p@x.cl")]  # de ayer: no cuenta
        r = monitoreo.armar_conectados([_pres("p@x.cl", 5)], evs, AHORA, yo="P@x.cl")
        assert r[0]["acciones_hoy"] == 1 and r[0]["yo"] is True and r[0]["ultima_accion"] == "creó"


class TestPulso:
    def test_24_bloques_y_la_ultima_es_la_hora_en_curso(self):
        p = monitoreo.pulso_por_hora([_ev(5, "a@x.cl"), _ev(7, "a@x.cl"), _ev(5, "a@x.cl", categoria="visita")], AHORA)
        assert len(p) == 24
        assert p[-1]["trabajo"] == 2 and p[-1]["accesos"] == 1
        assert sum(b["trabajo"] for b in p[:-1]) == 0

    def test_un_evento_fuera_de_la_ventana_no_aparece(self):
        p = monitoreo.pulso_por_hora([_ev(60 * 30, "a@x.cl")], AHORA)
        assert sum(b["trabajo"] for b in p) == 0


class TestLineaDeTiempo:
    def test_solo_lo_de_esa_persona_desde_su_conexion_y_lo_nuevo_primero(self):
        evs = [_ev(50, "a@x.cl", texto="uno"), _ev(10, "a@x.cl", texto="dos"), _ev(5, "b@x.cl"), _ev(200, "a@x.cl", texto="viejo")]
        l = monitoreo.linea_de_tiempo(evs, "a@x.cl", AHORA - timedelta(minutes=60))
        assert [x["texto"] for x in l] == ["dos", "uno"]

    def test_una_visita_se_lee_como_abrio_el_modulo(self):
        e = _ev(1, "a@x.cl", categoria="visita", accion="visita", texto="visita", modulo="Report")
        assert monitoreo.texto_de_evento(e) == "abrió Report"

    def test_desde_de_conexion_prefiere_la_conexion_luego_el_ingreso_y_luego_el_dia(self):
        assert monitoreo.desde_de_conexion(_pres("a@x.cl", 30, desde_min=45), [], "a@x.cl", AHORA)[1] == "conexion"
        login = _ev(90, "a@x.cl", categoria="acceso", accion="login")
        d, o = monitoreo.desde_de_conexion(None, [login], "a@x.cl", AHORA)
        assert o == "ingreso" and d == login["t"]
        assert monitoreo.desde_de_conexion(None, [], "a@x.cl", AHORA)[1] == "hoy"


class TestAcceso:
    def _usuario(self, email, tipo):
        return Usuario(id="1", email=email, nombre="X", tipoAcceso=tipo, area="general", modulos=[])

    def test_solo_el_principal_entra(self):
        assert monitoreo.exigir_principal(self._usuario("jorge.sandoval@agrofresh.com", "admin_general"))
        for email, tipo in (("otro@agrofresh.com", "admin_general"), ("jorge.sandoval@agrofresh.com", "analista")):
            with pytest.raises(HTTPException) as e:
                monitoreo.exigir_principal(self._usuario(email, tipo))
            assert e.value.status_code == 403


class TestPresenciaDetallada:
    """Activo / en pausa / segundo plano, pantalla actual, dónde está la gente y el recorrido con tiempos."""

    def _p(self, email="a@x.cl", inactivo=None, visible=True, ruta="/modulos/toma-muestras/solicitudes", seg=20, **extra):
        p = _pres(email, seg)
        p.update({"ruta": ruta, "visible": visible, "ruta_desde": AHORA - timedelta(minutes=12),
                  "ultima_interaccion": None if inactivo is None else AHORA - timedelta(seconds=inactivo),
                  "dispositivo": "Móvil · Chrome · app", "version": "abc1234"})
        p.update(extra)
        return p

    def test_activa_si_toco_algo_hace_poco_y_en_pausa_pasados_3_min(self):
        activa = monitoreo.armar_conectados([self._p(inactivo=30)], [], AHORA)[0]
        pausa = monitoreo.armar_conectados([self._p(inactivo=monitoreo.SEGUNDOS_PAUSA + 5)], [], AHORA)[0]
        assert activa["actividad"] == "activa" and pausa["actividad"] == "pausa"
        assert pausa["inactivo_segundos"] == monitoreo.SEGUNDOS_PAUSA + 5

    def test_pestana_oculta_es_segundo_plano_aunque_haya_tocado_algo(self):
        c = monitoreo.armar_conectados([self._p(inactivo=5, visible=False)], [], AHORA)[0]
        assert c["actividad"] == "segundo_plano"

    def test_sin_dato_de_interaccion_se_da_por_activa_y_sin_latido_no_tiene_actividad(self):
        assert monitoreo.armar_conectados([self._p(inactivo=None)], [], AHORA)[0]["actividad"] == "activa"
        reciente = monitoreo.armar_conectados([self._p(seg=600, inactivo=1)], [], AHORA)[0]
        assert reciente["estado"] == "reciente" and reciente["actividad"] is None

    def test_pantalla_en_palabras_e_inicio(self):
        assert monitoreo.pantalla_de_ruta("/") == "Inicio (Panel general)"
        assert monitoreo.pantalla_de_ruta("/modulos/toma-muestras/solicitudes", "Toma de muestras") == "Toma de muestras › Solicitudes"
        assert monitoreo.pantalla_de_ruta("/modulos/reportes") == "Report"
        inicio = monitoreo.armar_conectados([self._p(ruta="/")], [], AHORA)[0]
        assert inicio["en_inicio"] is True and inicio["pantalla"] == "Inicio (Panel general)"

    def test_donde_esta_la_gente_cuenta_solo_a_los_en_linea(self):
        lista = monitoreo.armar_conectados(
            [self._p("a@x.cl", inactivo=10), self._p("b@x.cl", inactivo=999), self._p("c@x.cl", seg=900)], [], AHORA)
        r = monitoreo.por_modulo(lista)
        assert r == [{"modulo": "Toma de muestras", "personas": 2, "activas": 1, "nombres": ["a", "b"]}]

    def test_actividad_reciente_va_de_lo_nuevo_a_lo_viejo_y_sin_ingresos_fallidos(self):
        evs = [_ev(30, "a@x.cl", texto="viejo"), _ev(2, "b@x.cl", texto="nuevo"),
               _ev(1, "c@x.cl", categoria="acceso", accion="login_fallido", texto="falló")]
        r = monitoreo.actividad_reciente(evs)
        assert [x["texto"] for x in r] == ["nuevo", "viejo"]

    def test_recorrido_con_tiempos_une_visitas_seguidas_al_mismo_modulo(self):
        v = lambda m, mod: _ev(m, "a@x.cl", categoria="visita", accion="visita", modulo=mod)  # noqa: E731
        r = monitoreo.recorrido_con_tiempos([v(5, "Report"), v(20, "Report"), v(40, "Storage")], AHORA)
        assert [(x["modulo"], x["minutos"]) for x in r] == [("Storage", 20), ("Report", 20)]


class TestSesiones:
    def _s(self, email, ini_min, fin_min, activos=0, tipo="cliente", nombre="GREENEX"):
        return {"email": email, "nombre": nombre, "tipo_acceso": tipo, "cliente": "GARATE", "planta": "CODEGUA",
                "dispositivo": "Móvil · Chrome", "inicio": AHORA - timedelta(minutes=ini_min),
                "ultimo_latido": AHORA - timedelta(minutes=fin_min), "segundos_activos": activos * 60}

    def test_suma_visitas_y_tiempo_conectado_de_una_cuenta(self):
        r = monitoreo.agrupar_sesiones([self._s("a@x.cl", 120, 90, 20), self._s("a@x.cl", 40, 10, 25)], AHORA)
        assert len(r) == 1
        assert r[0]["sesiones"] == 2 and r[0]["segundos_conectado"] == 60 * 60 and r[0]["segundos_activo"] == 45 * 60
        assert r[0]["en_linea"] is False and r[0]["primera"] == monitoreo._iso(AHORA - timedelta(minutes=120))

    def test_el_tiempo_activo_nunca_supera_al_conectado(self):
        r = monitoreo.agrupar_sesiones([self._s("a@x.cl", 10, 5, activos=300)], AHORA)
        assert r[0]["segundos_activo"] == 5 * 60

    def test_en_linea_primero_y_luego_el_mas_reciente(self):
        r = monitoreo.agrupar_sesiones(
            [self._s("viejo@x.cl", 300, 200), self._s("vivo@x.cl", 20, 1), self._s("medio@x.cl", 100, 50)], AHORA)
        assert [c["email"] for c in r] == ["vivo@x.cl", "medio@x.cl", "viejo@x.cl"] and r[0]["en_linea"] is True

    def test_una_visita_de_un_solo_latido_dura_cero(self):
        assert monitoreo.agrupar_sesiones([self._s("a@x.cl", 5, 5)], AHORA)[0]["segundos_conectado"] == 0


class TestPertenencia:
    def test_cliente_con_lista_agrupa_por_sold_to_y_ship_to_y_junta_las_especies(self):
        fila = {"tipo_acceso": "cliente", "area": None, "cliente_nombre": "VIEJO", "planta_nombre": "VIEJA", "plantas_asignadas": [
            {"clienteNombre": "DOLE CHILE S.A.", "plantaNombre": "DOLE PLANTA CODEGUA", "especie": "Cerezas"},
            {"clienteNombre": "DOLE CHILE S.A.", "plantaNombre": "DOLE PLANTA CODEGUA", "especie": "Paltas"},
            {"clienteNombre": "DOLE CHILE S.A.", "plantaNombre": "DOLE PLANTA CODEGUA", "especie": "Cerezas"},
            {"clienteNombre": "DOLE CHILE S.A.", "plantaNombre": "DOLE PLANTA SAN FERNANDO"}]}
        r = monitoreo.pertenencia_de_cuenta(fila)
        assert r["accesos"] == [
            {"sold_to": "DOLE CHILE S.A.", "ship_to": "DOLE PLANTA CODEGUA", "especies": ["Cerezas", "Paltas"]},
            {"sold_to": "DOLE CHILE S.A.", "ship_to": "DOLE PLANTA SAN FERNANDO", "especies": []}]

    def test_cuenta_antigua_sin_lista_usa_su_cliente_y_sucursal(self):
        r = monitoreo.pertenencia_de_cuenta({"tipo_acceso": "cliente", "cliente_nombre": "GARATE", "planta_nombre": "CODEGUA", "plantas_asignadas": None})
        assert r["accesos"] == [{"sold_to": "GARATE", "ship_to": "CODEGUA", "especies": []}]

    def test_sold_to_sin_planta_es_todo_el_sold_to_y_el_personal_interno_no_tiene_accesos(self):
        r = monitoreo.pertenencia_de_cuenta({"tipo_acceso": "comercial", "plantas_asignadas": [{"clienteNombre": "DOLE CHILE S.A."}]})
        assert r["accesos"] == [{"sold_to": "DOLE CHILE S.A.", "ship_to": None, "especies": []}]
        assert monitoreo.pertenencia_de_cuenta({"tipo_acceso": "analista", "area": "cromatografia", "plantas_asignadas": None})["accesos"] == []
        assert monitoreo.pertenencia_de_cuenta(None) is None
