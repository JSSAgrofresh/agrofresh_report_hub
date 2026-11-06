"""El diagnóstico del plan de entregables: cada pérdida entre el Excel y la tabla queda explicada (puro, sin base)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import diagnostico_plan_entregables as d  # noqa: E402


def _f(fila, sold, planta="P1", servicio="Residuales", linea=1, semana="W45", prop=2, sap="1"):
    return {"fila": fila, "sold_to": sold, "sold_to_sap": sap, "planta_plan": planta, "servicio": servicio, "linea": linea,
            "semana": semana, "original": None, "propuesta": prop, "comercial": "X"}


OFICIALES = {"CLIENTE A": "CLIENTE A"}


def test_separa_descartados_repetidas_y_lo_que_la_tabla_no_dibuja():
    filas = [
        _f(2, "Cliente A", prop=3),
        _f(3, "Cliente A", prop=2, semana="W46"),
        _f(4, "Cliente A", prop=2, semana="W46"),            # repetida de la 3: se cuenta una
        _f(5, "Cliente A", prop=5, semana="W99"),            # semana fuera de la temporada
        _f(6, "Cliente A", prop=4, servicio="Entrega de registros"),  # sin fila en el gráfico
        _f(7, "Cliente B", prop=7, sap="9"),                 # no existe en Listados
        {**_f(8, "Cliente A", prop=None), "sin_cantidad": True},
    ]
    r = d.diagnosticar(filas, OFICIALES, {}, None)
    assert r["excel_propuesta"] == 3 + 2 + 2 + 5 + 4 + 7
    assert r["perdido_descartado"] == 7 and [x["sold_to"] for x in r["descartadas"]] == ["Cliente B"]
    assert r["perdido_fusion"] == 2
    assert r["esperado_guardado"] == 3 + 2 + 5 + 4
    assert r["perdido_no_dibuja"] == 5 + 4
    assert r["esperado_tabla"] == 3 + 2
    # lo que el Excel suma menos lo que la tabla muestra se explica entero
    assert r["excel_propuesta"] - r["perdido_descartado"] - r["perdido_fusion"] - r["perdido_no_dibuja"] == r["esperado_tabla"]


def test_avisa_cuando_lo_guardado_no_sale_de_este_excel():
    filas = [_f(2, "Cliente A", prop=3), _f(3, "Cliente A", prop=2, semana="W46")]
    guardado = [{"sold_to": "Cliente A", "servicio": "residuales", "semana": "W45", "propuesta": 3}]
    r = d.diagnosticar(filas, OFICIALES, {}, guardado)
    assert r["esperado_tabla"] == 5 and r["guardado_tabla"] == 3
    assert "otro Excel" in r["por_cliente"][0]["causa"]


def test_los_descartados_traen_el_nombre_parecido_de_listados():
    r = d.diagnosticar([_f(2, "Greenex Spa", prop=4)], {"GREENVIC SPA": "GREENVIC SPA."}, {}, None)
    assert r["descartadas"][0]["parecidos"] == ["GREENVIC SPA."]
