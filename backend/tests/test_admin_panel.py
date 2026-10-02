"""
Panel de Administración General: las piezas puras (sin base) y el acceso.

La unión de fuentes se prueba con eventos armados a mano; que cada fuente se lea
bien de Postgres necesita base y se salta sola si no hay.
"""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.actividad import modulo_de_ruta
from app.admin_panel import (
    puntaje_salud,
    resolver_nombres,
    resumen_por_usuario,
    serie_diaria,
    variacion,
)
from app.auth import Usuario, usuario_actual
from app.main import app

T0 = datetime(2026, 10, 1, 15, 0, tzinfo=timezone.utc)


def _ev(email, cat, accion="x", t=T0, nombre=None, modulo=None):
    return {"t": t, "email": email, "nombre": nombre, "categoria": cat, "accion": accion, "texto": "", "modulo": modulo}


def test_variacion():
    assert variacion(12, 10) == 20.0
    assert variacion(5, 0) is None


def test_salud_descuenta_y_no_baja_de_cero():
    ok = puntaje_salud(pendientes_ingesta=0, plantas_con_problema=0, total_plantas=100, verif_sin_revisar=0, pdf_sin_report=0)
    assert ok["puntaje"] == 100
    mal = puntaje_salud(pendientes_ingesta=999, plantas_con_problema=999, total_plantas=10, verif_sin_revisar=99, pdf_sin_report=99)
    assert mal["puntaje"] == 0
    medio = puntaje_salud(pendientes_ingesta=16, plantas_con_problema=70, total_plantas=217, verif_sin_revisar=2, pdf_sin_report=9)
    assert medio["puntaje"] == 100 - 16 - round(30 * 70 / 217) - 10 - 9
    assert [c["clave"] for c in medio["componentes"]] == ["pendientes", "plantas", "verificaciones", "pdf"]


def test_resumen_por_usuario_separa_trabajo_accesos_y_visitas():
    r = resumen_por_usuario([
        _ev("a@x.cl", "solicitudes"), _ev("a@x.cl", "cargas"), _ev("a@x.cl", "acceso", "login"),
        _ev("a@x.cl", "acceso", "login_fallido"), _ev("a@x.cl", "visita", "visita", modulo="Report"),
        _ev("b@x.cl", "sensible", "permisos"), _ev(None, "solicitudes"),
    ])
    assert r["a@x.cl"]["acciones"] == 2
    assert r["a@x.cl"]["accesos"] == 1          # el fallido no cuenta como acceso
    assert r["a@x.cl"]["visitas"] == 1
    assert r["b@x.cl"]["acciones"] == 0         # un cambio sensible no es "trabajo"
    assert None not in r


def test_resolver_nombres_suma_las_cargas_a_la_cuenta():
    ev = [_ev(None, "cargas", nombre="Jorge Sandoval"), _ev("m@x.cl", "cargas", nombre="Otra")]
    resolver_nombres(ev, {"jorge sandoval": "jorge@x.cl"})
    assert ev[0]["email"] == "jorge@x.cl"
    assert ev[1]["email"] == "m@x.cl"


def test_serie_diaria_incluye_dias_en_cero_y_usa_hora_de_chile():
    desde = T0 - timedelta(days=3)
    s = serie_diaria([_ev("a", "solicitudes"), _ev("a", "laboratorio"), _ev("a", "informes")], desde, T0)
    assert len(s) == 4
    ultimo = s[-1]
    assert (ultimo["solicitudes"], ultimo["laboratorio"], ultimo["otros"]) == (1, 1, 1)
    assert sum(f["solicitudes"] for f in s[:-1]) == 0
    # 02:00 UTC del 2 de octubre sigue siendo el 1 de octubre en Chile
    tarde = serie_diaria([_ev("a", "solicitudes", t=datetime(2026, 10, 2, 2, 0, tzinfo=timezone.utc))], desde, T0 + timedelta(days=1))
    assert [f["solicitudes"] for f in tarde if f["fecha"] == "2026-10-01"] == [1]


def test_modulo_de_ruta_prefiere_el_prefijo_mas_largo():
    assert modulo_de_ruta("/modulos/agrofresh-lab/verificaciones/historico") == "Verificaciones"
    assert modulo_de_ruta("/modulos/agrofresh-lab/ingreso") == "AgroFresh Lab"
    assert modulo_de_ruta("/modulos/toma-muestras/nueva?x=1") == "Toma de muestras"
    assert modulo_de_ruta("/inicio") is None


def _como(tipo):
    app.dependency_overrides[usuario_actual] = lambda: Usuario(id="1", email="u@x.cl", nombre="U", tipoAcceso=tipo)


def test_el_panel_es_solo_del_admin_general():
    try:
        for tipo in ("admin_area", "gerencia", "analista", "cliente", "muestreador"):
            _como(tipo)
            c = TestClient(app)
            assert c.get("/api/admin-panel/resumen").status_code == 403, tipo
            assert c.get("/api/admin-panel/actividad").status_code == 403, tipo
    finally:
        app.dependency_overrides.clear()


def test_las_cuentas_cliente_no_registran_visitas():
    try:
        _como("cliente")
        assert TestClient(app).post("/api/actividad/visita", json={"ruta": "/modulos/reportes"}).status_code == 403
    finally:
        app.dependency_overrides.clear()
