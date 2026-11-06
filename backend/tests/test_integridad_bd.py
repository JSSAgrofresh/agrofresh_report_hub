"""Integridad de datos contra Postgres real: las consultas, el análisis completo y el guardado (se salta sin base ni la migración 0075)."""
import json
from datetime import date, timedelta

import pytest

from app import integridad_api as api
from app.db import conexion, cursor_dict
from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(not hay_base("integridad_analisis"), reason="sin Postgres con la migración 0075")

OT = "OT-ZZTEST1"
OT_SIN = "OT-ZZTEST2"
NRO = "ZZ-2026-9001"


def _limpiar():
    with conexion() as c, cursor_dict(c) as cur:
        cur.execute("DELETE FROM envio_solicitud_log WHERE archivo LIKE 'zztest%'")
        cur.execute("DELETE FROM solicitud_archivo WHERE archivo LIKE 'zztest%'")
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud = %s", (NRO,))
        cur.execute("DELETE FROM integridad_analisis WHERE usuario = 'zztest'")


@pytest.fixture(autouse=True)
def datos():
    _limpiar()
    hoy = date.today()
    datos_sol = {"analitos_solicitados": ["FDL", "PYR"], "campos_laboratorio": {}, "lote": "L7"}
    with conexion() as c, cursor_dict(c) as cur:
        for archivo, ot in (("zztest1.xlsx", OT), ("zztest2.xlsx", OT_SIN)):
            cur.execute(
                "INSERT INTO solicitud_archivo (archivo, numero_solicitud, laboratorio, sold_to, ship_to, especie, fecha_muestreo, datos) VALUES (%s,%s,'Quiteca','DOLE','LONTUE','Manzana',%s,%s::jsonb)",
                (archivo, ot, hoy - timedelta(days=40), json.dumps(datos_sol)),
            )
            cur.execute("INSERT INTO envio_solicitud_log (archivo, numero_solicitud, laboratorio, exitoso, creado_en) VALUES (%s,%s,'Quiteca',true,%s)", (archivo, ot, hoy - timedelta(days=39)))
        cur.execute("INSERT INTO analito (codigo, nombre, laboratorio, unidad, activo) VALUES ('ZZFDL','Fludioxonil','QUITECA','ppm',true) ON CONFLICT DO NOTHING")
        cur.execute(
            "INSERT INTO solicitud (nro_solicitud, laboratorio, fecha_muestreo, especie, sold_to_raw, ship_to_raw, referencia, lote) VALUES (%s,'Quiteca',%s,'Manzana','DOLE','LONTUE',%s,'L9') RETURNING id",
            (NRO, hoy - timedelta(days=40), OT),
        )
        sid = cur.fetchone()["id"]
        cur.execute("INSERT INTO resultado (solicitud_id, analito_raw, valor_num) VALUES (%s,'FDL',0.2)", (sid,))
    yield
    _limpiar()
    with conexion() as c, cursor_dict(c) as cur:
        cur.execute("DELETE FROM analito WHERE codigo = 'ZZFDL'")


def test_el_analisis_completo_encuentra_lo_que_falta_y_lo_distinto():
    r = api.correr_analisis(con_pdf=False)
    mios = [h for h in r["hallazgos"] if h["ot"] in (OT, OT_SIN)]
    codigos = {(h["ot"], h["codigo"]) for h in mios}
    assert (OT, "ANALITO_FALTA") in codigos          # se pidió PYR y el informe trae solo FDL
    assert (OT, "ROTULACION_DISTINTA") in codigos    # lote L7 contra L9
    assert (OT_SIN, "SIN_INFORME") in codigos        # enviada hace 39 días sin informe
    quiteca = next(l for l in r["laboratorios"] if l["laboratorio"] == "Quiteca")
    assert quiteca["con_informe"] >= 1 and quiteca["sin_informe"] >= 1


def test_se_guarda_y_se_lee_con_filtros():
    aid, ya = api._iniciar(False, "manual", "zztest")
    assert not ya
    api.ejecutar(aid, False)
    with conexion(escribir=False) as c, cursor_dict(c) as cur:
        a = api._ultimo(cur, con_hallazgos=True, analisis_id=aid)
    assert a["estado"] == "listo" and a["resumen"]["solicitudes_enviadas"] >= 2
    assert any(h["codigo"] == "ANALITO_FALTA" for h in a["hallazgos"])
    # una segunda petición mientras hay uno en curso no abre otro
    aid2, _ = api._iniciar(False, "manual", "zztest")
    aid3, ya3 = api._iniciar(False, "manual", "zztest")
    assert aid2 == aid3 and ya3
