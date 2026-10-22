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
