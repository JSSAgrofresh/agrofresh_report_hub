"""Carga del plan de entregables: lector del Excel, validación contra Listados y suma por Sold To."""
import io

import openpyxl
import pytest
from fastapi import HTTPException

from app.plan_carga import _resumen, clasificar, fusionar_repetidas, leer_excel, resumen_por_cliente, servicio_clave


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
    assert filas[0]["propuesta"] == 21 and filas[0]["original"] is None and "error" in filas[1]


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
        {"sold_to": "GRIN GROUP SPA", "planta_plan": "GRIN GROUP", "servicio": "residuales", "original": 10, "propuesta": 21},
        {"sold_to": "GRIN GROUP SPA", "planta_plan": "GRIN GROUP", "servicio": "residuales", "original": None, "propuesta": 21},
        {"sold_to": "GRIN GROUP SPA", "planta_plan": "GRIN GROUP", "servicio": "residuales", "original": 4, "propuesta": 20},
        {"sold_to": "GRIN GROUP SPA", "planta_plan": None, "servicio": "otro", "original": 5, "propuesta": 5},
    ]
    r = resumen_por_cliente(filas)
    assert len(r) == 1
    assert r[0]["propuesta"] == {"residuales": 62, "fsma": 0, "fito": 0}
    assert r[0]["original"] == {"residuales": 14, "fsma": 0, "fito": 0}
    assert len(r[0]["plantas"]) == 4  # lo «otro» no suma a ninguna fila del gráfico


# ── el Excel final (hoja Base): Sold To con código SAP, planta, línea, semana, Original y Propuesta ──
CAB_BASE = ("Sold to", "Sold to Name", "Fuente", "Cliente", "Tipo Cliente ", "Tipo Servicio", "Servicio", "Servicio  Real",
            "Línea ", "Semana", "Peak", "Tamaño Línea", "Original", "Propuesta ", "Observaciones", "Competencia")


def _base(filas) -> bytes:
    wb = openpyxl.Workbook()
    wb.active.title = "Resumen"
    wb.active.append(["una hoja cualquiera"])
    ws = wb.create_sheet("Base")
    ws.append(list(CAB_BASE))
    for f in filas:
        ws.append(list(f))
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def _fila(sap=10018610, nombre="SERVICIOS AGROINDUSTRIALES ROSARIO", planta="AGROINDUSTRIAL ROSARIO", servicio_real="Residuales",
          linea=1, semana="W45", original=1, propuesta=2, servicio="Residuales L1"):
    return (sap, nombre, "LUCIANO ALLENDE", planta, "Estrategico", "Costo por Kilo", servicio, servicio_real, linea, semana, "Pre peack",
            None, original, propuesta, None, None)


def test_lee_la_hoja_base_con_las_dos_cantidades_aunque_no_sea_la_primera_hoja():
    filas = leer_excel(_base([_fila(), _fila(semana="W46", original=None, propuesta=3)]))
    assert len(filas) == 2
    a = filas[0]
    assert a["sold_to_sap"] == "10018610" and a["planta_plan"] == "AGROINDUSTRIAL ROSARIO" and a["comercial"] == "LUCIANO ALLENDE"
    assert (a["linea"], a["semana"], a["original"], a["propuesta"]) == (1, "W45", 1, 2)
    assert a["tipo_cliente"] == "Estrategico" and a["tipo_servicio"] == "Costo por Kilo" and a["peak"] == "Pre peack"
    assert (filas[1]["original"], filas[1]["propuesta"]) == (None, 3)


def test_una_fila_sin_ninguna_cantidad_se_marca_para_saltarla():
    filas = leer_excel(_base([_fila(original=None, propuesta=None), _fila(original=0, propuesta=0)]))
    assert filas[0].get("sin_cantidad") is True
    assert not filas[1].get("sin_cantidad")  # un cero escrito a propósito es un dato


def test_el_codigo_sap_manda_sobre_el_nombre():
    filas = leer_excel(_base([_fila(nombre="NOMBRE DISTINTO AL DE LISTADOS")]))
    validas, descartadas = clasificar(filas, {}, {"10018610": "SERVICIOS AGROINDUSTRIALES ROSARIO SPA"})
    assert [v["sold_to"] for v in validas] == ["SERVICIOS AGROINDUSTRIALES ROSARIO SPA"] and descartadas == []
    # sin código en Listados, se busca por nombre
    validas, _ = clasificar(filas, {"NOMBRE DISTINTO AL DE LISTADOS": "NOMBRE OFICIAL"}, {})
    assert validas[0]["sold_to"] == "NOMBRE OFICIAL"


def test_las_filas_repetidas_se_fusionan_y_no_cuentan_doble():
    filas = leer_excel(_base([
        _fila(servicio_real="Fitopatología", servicio="Patologias L2", linea=2, semana="W51", original=None, propuesta=2),
        _fila(servicio_real="Fitopatología", servicio="Patologias L2", linea=2, semana="W51", original=None, propuesta=2),
        _fila(servicio_real="Microbiología", servicio="Microbiología L2", linea=2, semana="W51", original=4, propuesta=None),
        _fila(servicio_real="Microbiología", servicio="Microbiología L2", linea=2, semana="W51", original=None, propuesta=None),
        _fila(servicio_real="Residuales", semana="W46"),
    ]))
    validas, _ = clasificar([f for f in filas if not f.get("sin_cantidad")], {}, {"10018610": "ROSARIO"})
    unicas, fusionadas = fusionar_repetidas(validas)
    assert fusionadas == 1 and len(unicas) == 3
    fito = next(u for u in unicas if u["clave"] == "fito")
    assert fito["propuesta"] == 2  # 2 y 2 es 2, no 4


def test_el_resumen_trae_las_dos_cantidades_por_servicio():
    validas = [
        {"sold_to": "A", "planta_plan": "P", "clave": "residuales", "original": 3, "propuesta": 5},
        {"sold_to": "A", "planta_plan": "P", "clave": "fito", "original": None, "propuesta": 2},
    ]
    r = _resumen(validas, [], 9, fusionadas=1, sin_cantidad=2)
    assert r["por_servicio"] == {"residuales": {"original": 3, "propuesta": 5}, "fito": {"original": 0, "propuesta": 2}}
    assert (r["filas_fusionadas"], r["filas_sin_cantidad"], r["clientes"], r["plantas"]) == (1, 2, 1, 1)


def test_el_detalle_del_plan_exige_sesion_de_administrador():
    from fastapi.testclient import TestClient

    from app.main import app

    assert TestClient(app).get("/api/plan-entregables/detalle").status_code in (401, 403)
