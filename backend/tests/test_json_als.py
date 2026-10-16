"""
JSON de ALS con los campos de la cabecera de SU informe. Solo las solicitudes de
ALS creadas con la marca `json_als_v2` lo usan: las anteriores y las de otros
laboratorios siguen con el JSON de siempre.
"""
import json

import pytest

from app import json_als
from app import toma_muestras as tm
from tests.test_toma_muestras_indice import ADMIN, cuerpo, limpio  # noqa: F401
from tests.utiles_bd import hay_base

_necesita_base = pytest.mark.skipif(not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado")

OT7 = dict(
    laboratorio="ALS", numero_solicitud="OT-ALS0007", fecha_solicitud="2026-10-01",
    sold_to="COMERCIALIZADORA GARATE HERMANOS LI", ship_to="GREENEX PLANTA CODEGUA",
    nombre_muestreador="Barly Fuentes", email_solicitante="bfuentes@agrofresh.com",
    posicion_muestreo="Pozo vaciado", fecha_muestreo="2026-10-01", hora_muestreo="13:07",
    lote="2036", csg_productor="95848", csg_packing=None, numero_camara=None, numero_orden=None,
    kilos_procesados=None, producto_utilizado=None, linea_proceso="1", especie="Manzana", variedad="Fuji",
    campos_laboratorio={"Tipo Aplicación": "Línea de proceso"}, observacion="no va", json_als_v2=True,
)


def test_ot_als0007_completa():
    assert json_als.construir(OT7) == {
        "Solicitante": "COMERCIALIZADORA GARATE HERMANOS LI // GREENEX PLANTA CODEGUA",
        "Contacto": "Barly Fuentes // bfuentes@agrofresh.com",
        "Solicitud Muestreo/Análisis": "01-10-2026",
        "Tipo de Muestras": "Agua",
        "Nº de Muestras": 1,
        "Fecha y Entidad de Muestreo": "01-10-26 13:07",
        "Fecha y Hora de Ingreso": None,
        "Fecha y Hora de Inicio": None,
        "Identificación Muestra (NI)": "OT-ALS0007 // Pozo vaciado // 01-10-2026 // 2036 // 95848",
        "Muestreo": {"Fecha": "01-10-2026", "Horario": "13:07",
                     "Lugar de muestreo": "1 // Línea de proceso // Manzana // Fuji"},
    }


def test_vacio_del_medio_conserva_separadores_y_el_del_final_se_calla():
    d = {**OT7, "numero_solicitud": "OT-ALS0010", "posicion_muestreo": "Pozo Vaciado", "lote": None, "csg_productor": "118919"}
    assert json_als.identificacion_muestra(d) == "OT-ALS0010 // Pozo Vaciado // 01-10-2026 // // 118919"


def test_diez_datos_en_orden_y_kilos_sin_decimal_de_mas():
    d = {**OT7, "csg_packing": "P1", "numero_camara": "C2", "numero_orden": "O3", "kilos_procesados": 1500.0,
         "producto_utilizado": "MIXTO"}
    assert json_als.identificacion_muestra(d).split(" // ") == [
        "OT-ALS0007", "Pozo vaciado", "01-10-2026", "2036", "95848", "P1", "C2", "O3", "1500", "MIXTO"]


def test_sin_hora_la_fecha_va_sola_y_sin_raros():
    d = {**OT7, "hora_muestreo": None, "variedad": "—", "ship_to": "SAN CLEMENTE  RENAICO"}
    s = json_als.construir(d)
    assert s["Fecha y Entidad de Muestreo"] == "01-10-26"
    assert s["Muestreo"]["Horario"] == ""
    assert s["Muestreo"]["Lugar de muestreo"] == "1 // Línea de proceso // Manzana"
    assert s["Solicitante"].endswith("// SAN CLEMENTE RENAICO")


def _json(datos):
    return json.loads(tm._generar_json_solicitud(datos))


def test_con_la_marca_el_json_es_el_nuevo_y_los_correos_van_al_final():
    s = _json(OT7)
    assert list(s)[-1] == "correos"
    assert "Identificación Muestra (NI)" in s
    assert not {"sold_to", "sample_identification", "observacion", "json_als_v2"} & set(s)
    assert s["correos"]["solicitante_bcc"] == {"bcc": ["bfuentes@agrofresh.com"]}


def test_sin_la_marca_una_als_antigua_no_cambia():
    antigua = {k: v for k, v in OT7.items() if k != "json_als_v2"}
    s = _json(antigua)
    assert s["sample_identification"] == "OT-ALS0007 - Pozo vaciado - 01-10-2026"
    assert s["sold_to"] == OT7["sold_to"] and "Solicitante" not in s


def test_otro_laboratorio_no_cambia_aunque_traiga_la_marca():
    s = _json({**OT7, "laboratorio": "Quiteca"})
    assert "Solicitante" not in s and "sample_identification" not in s and s["sold_to"] == OT7["sold_to"]


def test_la_marca_solo_se_pone_a_als():
    a, q = {"laboratorio": "ALS"}, {"laboratorio": "Quiteca"}
    tm._marcar_json_als(a)
    tm._marcar_json_als(q)
    assert a.get("json_als_v2") is True and "json_als_v2" not in q


@_necesita_base
def test_crear_als_lleva_la_marca_y_editar_la_conserva(limpio):  # noqa: F811
    creada = tm.crear_solicitud(cuerpo(laboratorio="ALS"), usuario=ADMIN)
    assert tm._leer_datos_actuales(creada.archivo).get("json_als_v2") is True
    tm.editar_solicitud(creada.archivo, cuerpo(laboratorio="ALS"), usuario=ADMIN)
    assert tm._leer_datos_actuales(creada.archivo).get("json_als_v2") is True


@_necesita_base
def test_editar_una_als_antigua_no_le_pone_la_marca(limpio):  # noqa: F811
    creada = tm.crear_solicitud(cuerpo(laboratorio="ALS"), usuario=ADMIN)
    datos = tm._leer_datos_actuales(creada.archivo)
    datos.pop("json_als_v2", None)
    tm._regrabar_datos_solicitud(creada.archivo, datos)
    tm.editar_solicitud(creada.archivo, cuerpo(laboratorio="ALS"), usuario=ADMIN)
    assert "json_als_v2" not in tm._leer_datos_actuales(creada.archivo)
