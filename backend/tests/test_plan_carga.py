"""Carga del plan de entregables: lector del Excel, validación contra Listados y suma por Sold To."""
import io

import openpyxl
import pytest
from fastapi import HTTPException

from app.plan_carga import clasificar, leer_excel, resumen_por_cliente, servicio_clave


def _excel(filas, cabecera=("SOLD TO", "COMERCIAL", "SERVICIO", "TOTAL", "NOMBRE EN EL PLAN")) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(cabecera))
    for f in filas:
        ws.append(list(f))
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


OFICIALES = {"GRIN GROUP SPA": "GRIN GROUP SPA", "DOLE CHILE SA": "DOLE CHILE S.A."}


def test_servicios_del_plan_a_filas_del_grafico():
    assert servicio_clave("Residuales L2") == "residuales"
    assert servicio_clave("Fitopatológico") == "fito"
    assert servicio_clave("Microbiológicos") == "fsma"
    assert servicio_clave("FSMA") == "fsma"
    assert servicio_clave("Entrega de registros") == "otro"


def test_lee_filas_y_salta_total_y_vacias():
    filas = leer_excel(_excel([
        ("GRIN GROUP SPA", "Juan Labarca", "Residuales L1", 21, "GRIN GROUP"),
        (None, None, None, None, None),
        ("TOTAL", None, None, 99, None),
        ("GRIN GROUP SPA", "Juan Labarca", "Residuales L2", "x", "GRIN GROUP"),
    ]))
    assert [f["sold_to"] for f in filas] == ["GRIN GROUP SPA", "GRIN GROUP SPA"]
    assert filas[0]["cantidad"] == 21 and "error" in filas[1]


def test_sin_columnas_obligatorias_avisa():
    with pytest.raises(HTTPException) as e:
        leer_excel(_excel([("a", "b")], cabecera=("A", "B")))
    assert e.value.status_code == 400


def test_sold_to_que_no_existe_en_listados_no_se_carga():
    filas = leer_excel(_excel([
        ("Grin Group SPA", "JL", "Residuales L1", 21, "GRIN GROUP"),
        ("MACE", "RT", "Residuales", 28, "MACE"),
        ("DOLE CHILE S.A.", "JL", "Residuales", 14, "DOLE SAN FELIPE"),
    ]))
    validas, descartadas = clasificar(filas, OFICIALES)
    assert [v["sold_to"] for v in validas] == ["GRIN GROUP SPA", "DOLE CHILE S.A."]
    assert [d["sold_to"] for d in descartadas] == ["MACE"]


def test_suma_por_sold_to_y_conserva_las_plantas():
    filas = [
        {"sold_to": "GRIN GROUP SPA", "planta_plan": "GRIN GROUP", "servicio": "residuales", "cantidad": 21},
        {"sold_to": "GRIN GROUP SPA", "planta_plan": "GRIN GROUP", "servicio": "residuales", "cantidad": 21},
        {"sold_to": "GRIN GROUP SPA", "planta_plan": "GRIN GROUP", "servicio": "residuales", "cantidad": 20},
        {"sold_to": "GRIN GROUP SPA", "planta_plan": None, "servicio": "otro", "cantidad": 5},
    ]
    r = resumen_por_cliente(filas)
    assert len(r) == 1 and r[0]["residuales"] == 62 and r[0]["fito"] == 0
    assert len(r[0]["plantas"]) == 4  # lo «otro» no suma a ninguna fila del gráfico
