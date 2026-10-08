"""
Ingesta y Converter validan el Sold To / Ship To contra el listado del TIPO DE SERVICIO del
informe, y Report solo muestra los servicios encendidos en Administración General → Funciones.

- Línea de proceso y RYD: el listado de siempre (`cliente`/`planta`).
- Actimist y Ecofog: el suyo (`cliente_actimist`/`planta_actimist`, `cliente_ecofog`/`planta_ecofog`);
  el resultado se guarda con el nombre como texto, sin `planta_id`, y con su servicio en
  `solicitud.servicio` (migración 0055).

Las pruebas con base se saltan solas si no hay una (ver tests/utiles_bd.py).
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import auth, config, config_store, funciones, ingest, reportes  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

from tests.utiles_bd import hay_base  # noqa: E402

CON_BASE = pytest.mark.skipif(not hay_base("solicitud"), reason="no hay base de pruebas")

SOLD = "ERFRUT PRUEBA SERVICIO LTDA"
SHIP = "FRIGORIFICO PRUEBA SERVICIO"
INFORME_PREFIJO = "ZZ-SERV-"


# ---------------------------------------------------------------------------
# Funciones: qué servicios muestra Report

@pytest.fixture
def config_en_disco(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr("app.r2.disponible", lambda: False)
    config_store.escribir(funciones.ARCHIVO, {})
    funciones.invalidar()
    yield
    funciones.invalidar()


def _usuario(email="jorge.sandoval@agrofresh.com", tipo="admin_general"):
    return auth.Usuario(id="1", email=email, nombre="Jorge", tipoAcceso=tipo, area=None, modulos=None)


def test_de_fabrica_report_muestra_solo_linea_de_proceso(config_en_disco):
    assert funciones.servicios_en_report() == {"linea_proceso": True, "actimist": False, "ecofog": False, "ryd": False}
    assert funciones.valores_visibles_en_report() == [""]


def test_un_archivo_dañado_o_raro_no_muestra_de_mas(config_en_disco):
    config_store.escribir(funciones.ARCHIVO, {"report": {"servicios": {"ecofog": "si", "actimist": 1, "xx": True}}})
    funciones.invalidar()
    assert funciones.valores_visibles_en_report() == [""]
    config_store.escribir(funciones.ARCHIVO, ["no", "es", "un", "dict"])
    funciones.invalidar()
    assert funciones.valores_visibles_en_report() == [""]


def test_cambiar_un_servicio_pide_la_clave_y_responde_403_no_401(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: password == "buena")
    body = funciones.ServicioReportIn(servicio="ecofog", activo=True, password="mala")
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_servicio_report(body, usuario=_usuario())
    assert e.value.status_code == 403            # un 401 cerraría la sesión en el navegador
    assert funciones.valores_visibles_en_report() == [""]

    body = funciones.ServicioReportIn(servicio="ecofog", activo=True, password="buena")
    r = funciones.cambiar_servicio_report(body, usuario=_usuario())
    assert {s["clave"]: s["activo"] for s in r["report"]["servicios"]}["ecofog"] is True
    assert funciones.valores_visibles_en_report() == ["", "ecofog"]
    assert r["report"]["cambiado_por"] == "Jorge"


def test_apagar_tambien_pide_la_clave(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: password == "buena")
    funciones.cambiar_servicio_report(funciones.ServicioReportIn(servicio="actimist", activo=True, password="buena"), usuario=_usuario())
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_servicio_report(funciones.ServicioReportIn(servicio="actimist", activo=False, password=None), usuario=_usuario())
    assert e.value.status_code == 403
    assert "actimist" in funciones.valores_visibles_en_report()


def test_solo_el_administrador_principal_cambia(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: True)
    otro = _usuario(email="otra.persona@agrofresh.com")
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_servicio_report(funciones.ServicioReportIn(servicio="ecofog", activo=True, password="x"), usuario=otro)
    assert e.value.status_code == 403
    assert funciones.valores_visibles_en_report() == [""]


def test_servicio_desconocido_es_400(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: True)
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_servicio_report(funciones.ServicioReportIn(servicio="otro", activo=True, password="x"), usuario=_usuario())
    assert e.value.status_code == 400


def test_la_configuracion_se_recuerda_unos_segundos_y_el_guardado_la_refresca(config_en_disco, monkeypatch):
    lecturas = []
    original = config_store.leer
    monkeypatch.setattr(config_store, "leer", lambda *a, **k: (lecturas.append(1), original(*a, **k))[1])
    funciones.valores_visibles_en_report()
    funciones.valores_visibles_en_report()
    assert len(lecturas) == 1                       # Report no lee R2 en cada pantalla
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: True)
    funciones.cambiar_servicio_report(funciones.ServicioReportIn(servicio="ecofog", activo=True, password="x"), usuario=_usuario())
    assert funciones.valores_visibles_en_report() == ["", "ecofog"]   # el cambio se ve de inmediato en este proceso


def test_la_condicion_de_report_filtra_por_servicio_y_sin_migracion_no_filtra(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "columna_servicio_existe", lambda: True)
    sql, params = funciones.condicion_report("s")
    assert "COALESCE(s.servicio, '')" in sql and params == {"servicios_report": [""]}
    monkeypatch.setattr(funciones, "columna_servicio_existe", lambda: False)
    assert funciones.condicion_report("s") == ("", {})


def test_el_filtro_de_alcance_de_report_incluye_el_servicio(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "columna_servicio_existe", lambda: True)
    sql, params = reportes._filtro_alcance(_usuario(), None, None)
    assert "s.servicio" in sql and params["servicios_report"] == [""]
    # junto a los filtros de cliente y planta, no en su lugar
    sql, params = reportes._filtro_alcance(_usuario(), "DOLE", "PLANTA 1")
    assert "s.servicio" in sql and params["cliente"] == "DOLE" and params["planta"] == "PLANTA 1"


# ---------------------------------------------------------------------------
# Ingesta: el listado del servicio del informe

def _fila(informe: str, servicio: str | None, sold: str = SOLD, ship: str = SHIP) -> dict:
    fila = {
        "Informe": INFORME_PREFIJO + informe, "Laboratorio": "Quiteca", "Sold To": sold, "Ship To": ship,
        "Especie": "Manzana", "Fecha Muestreo": "02-10-2026", "Fecha Informe": "07-10-2026",
        "Fecha entrada": "06-10-2026", "DPA ppm": "1,88",
    }
    if servicio is not None:
        fila["TIPO APP"] = servicio
    return fila


@pytest.fixture
def listados():
    """Un Sold To / Ship To de prueba en Línea de proceso, otro (con otro nombre) solo en Ecofog."""
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("INSERT INTO valor_lista (tipo, valor, valor_normalizado, activo, es_estandar) "
                    "SELECT 'especie', 'Manzana', 'manzana', true, true "
                    "WHERE NOT EXISTS (SELECT 1 FROM valor_lista WHERE tipo='especie' AND valor_normalizado='manzana')")
        # Línea de proceso: el cliente existe, pero su planta tiene OTRO nombre (como pasó con Chimbarongo).
        cur.execute("INSERT INTO cliente (nombre) VALUES (%s) RETURNING id", (SOLD,))
        cid = cur.fetchone()["id"]
        cur.execute("INSERT INTO planta (cliente_id, nombre) VALUES (%s, %s)", (cid, "OTRA PLANTA PRUEBA SERVICIO"))
        cur.execute("INSERT INTO cliente_ecofog (nombre) VALUES (%s) RETURNING id", (SOLD,))
        eid = cur.fetchone()["id"]
        cur.execute("INSERT INTO planta_ecofog (cliente_id, nombre) VALUES (%s, %s)", (eid, SHIP))
    yield cid
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM resultado WHERE solicitud_id IN (SELECT id FROM solicitud WHERE nro_solicitud LIKE %s)", (INFORME_PREFIJO + "%",))
        cur.execute("DELETE FROM producto_aplicado WHERE solicitud_id IN (SELECT id FROM solicitud WHERE nro_solicitud LIKE %s)", (INFORME_PREFIJO + "%",))
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud LIKE %s", (INFORME_PREFIJO + "%",))
        cur.execute("DELETE FROM pendiente_revision WHERE fila::text LIKE %s", ("%" + INFORME_PREFIJO + "%",))
        cur.execute("DELETE FROM cliente_ecofog WHERE nombre = %s", (SOLD,))
        cur.execute("DELETE FROM cliente WHERE nombre = %s", (SOLD,))


def _cargar(fila: dict) -> dict:
    with conexion() as conn, cursor_dict(conn) as cur:
        return ingest._procesar_filas(cur, [fila], escribir=True)["resumen"]


def _guardada(informe: str) -> dict | None:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT planta_id, sold_to_raw, ship_to_raw, servicio FROM solicitud WHERE nro_solicitud = %s",
                    (INFORME_PREFIJO + informe,))
        return cur.fetchone()


@CON_BASE
def test_ecofog_se_valida_contra_el_listado_de_ecofog(listados):
    r = _cargar(_fila("1", "Ecofog"))
    assert r["pendientes_revision"] == 0
    g = _guardada("1")
    assert g["ship_to_raw"] == SHIP and g["sold_to_raw"] == SOLD
    assert g["planta_id"] is None                    # no se enlaza a la tabla de Línea de proceso
    assert g["servicio"] == "ecofog"
    assert r["plantas_nuevas"] == 0                  # y no se crea una planta nueva en Línea de proceso


@CON_BASE
def test_la_misma_planta_en_linea_de_proceso_no_calza_y_queda_pendiente(listados):
    """Es exactamente lo que pasaba: el Ship To de Ecofog no está en el listado de Línea de proceso."""
    r = _cargar(_fila("2", "Línea de proceso"))
    assert r["pendientes_revision"] == 1
    assert _guardada("2") is None


@CON_BASE
def test_sin_tipo_de_aplicacion_se_sigue_usando_linea_de_proceso(listados):
    r = _cargar(_fila("3", None))
    assert r["pendientes_revision"] == 1             # igual que antes de este cambio
    r = _cargar(_fila("4", None, ship="OTRA PLANTA PRUEBA SERVICIO"))
    assert r["pendientes_revision"] == 0
    g = _guardada("4")
    assert g["planta_id"] is not None and g["servicio"] is None   # Línea de proceso = NULL


@CON_BASE
def test_ryd_usa_el_listado_de_linea_de_proceso_y_queda_marcada(listados):
    r = _cargar(_fila("5", "RYD", ship="OTRA PLANTA PRUEBA SERVICIO"))
    assert r["pendientes_revision"] == 0
    g = _guardada("5")
    assert g["planta_id"] is not None and g["servicio"] == "ryd"


@CON_BASE
def test_ecofog_con_un_sold_to_que_no_esta_en_su_listado_va_a_pendientes(listados):
    r = _cargar(_fila("6", "Ecofog", sold="CLIENTE QUE NO EXISTE PRUEBA"))
    assert r["pendientes_revision"] == 1
    assert _guardada("6") is None


@CON_BASE
def test_report_no_muestra_lo_que_no_es_linea_de_proceso_hasta_encenderlo(listados, config_en_disco):
    _cargar(_fila("7", "Ecofog"))
    _cargar(_fila("8", None, ship="OTRA PLANTA PRUEBA SERVICIO"))

    def visibles():
        sql, params = funciones.condicion_report("s")
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute(f"SELECT nro_solicitud FROM solicitud s WHERE s.nro_solicitud LIKE %(pref)s {sql}",
                        {**params, "pref": INFORME_PREFIJO + "%"})
            return sorted(r["nro_solicitud"] for r in cur.fetchall())

    assert visibles() == [INFORME_PREFIJO + "8"]                 # de fábrica: solo Línea de proceso
    config_store.escribir(funciones.ARCHIVO, {"report": {"servicios": {"ecofog": True}}})
    funciones.invalidar()
    assert visibles() == [INFORME_PREFIJO + "7", INFORME_PREFIJO + "8"]


@CON_BASE
def test_una_solicitud_vieja_sin_servicio_sigue_apareciendo(listados, config_en_disco):
    """Lo cargado antes de la 0055 tiene servicio NULL: es Línea de proceso y no desaparece."""
    _cargar(_fila("9", None, ship="OTRA PLANTA PRUEBA SERVICIO"))
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("UPDATE solicitud SET servicio = NULL WHERE nro_solicitud = %s", (INFORME_PREFIJO + "9",))
    sql, params = funciones.condicion_report("s")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(f"SELECT 1 FROM solicitud s WHERE s.nro_solicitud = %(n)s {sql}", {**params, "n": INFORME_PREFIJO + "9"})
        assert cur.fetchone() is not None


@CON_BASE
def test_las_correcciones_se_validan_contra_el_listado_del_servicio(listados):
    from app import correcciones

    usuario = _usuario()
    body = correcciones.CorreccionIn(campo="ship_to", contexto=SOLD, valor_crudo="FRIGORIFICO CHIMBARONGO PRUEBA X",
                                     valor_oficial=SHIP, servicio="Ecofog")
    r = correcciones.guardar_correccion(body, usuario=usuario)
    assert r["valor_oficial"] == SHIP
    # El mismo valor, pero validado contra Línea de proceso, no existe ahí.
    body = correcciones.CorreccionIn(campo="ship_to", contexto=SOLD, valor_crudo="OTRO TEXTO PRUEBA Y",
                                     valor_oficial=SHIP, servicio="Línea de proceso")
    with pytest.raises(HTTPException) as e:
        correcciones.guardar_correccion(body, usuario=usuario)
    assert e.value.status_code == 400
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM correccion_converter WHERE valor_crudo IN (%s, %s)",
                    ("FRIGORIFICO CHIMBARONGO PRUEBA X", "OTRO TEXTO PRUEBA Y"))


# ---------------------------------------------------------------------------
# Sin DB: el cálculo de qué listado se usa

def test_el_tipo_de_aplicacion_decide_el_listado_y_el_valor_guardado():
    f = ingest._tipo_aplicacion_de_fila
    assert f({"TIPO APP": "Ecofog"}) == "Ecofog" and f({"Tipo Aplicación": "Actimist"}) == "Actimist"
    assert f({}) is None
    assert ingest.clave_servicio("Ecofog") == "ecofog" and ingest.clave_servicio("Línea de proceso") == ""
    assert ingest.clave_servicio("RYD") == ""         # RYD usa el listado de Línea de proceso…
    assert ingest.clave_lista("RYD") == "ryd"         # …pero se guarda marcada como RYD
