from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app import inventario_lab as inv
from app import permisos_funciones as pf


def test_estado_vencimiento():
    hoy = date(2026, 11, 5)
    assert inv.estado_vencimiento(None, hoy) == "sin_fecha"
    assert inv.estado_vencimiento(date(2026, 11, 4), hoy) == "vencido"
    assert inv.estado_vencimiento(date(2026, 11, 5), hoy) == "por_vencer"
    assert inv.estado_vencimiento(date(2027, 2, 3), hoy) == "por_vencer"  # 90 días justos
    assert inv.estado_vencimiento(date(2027, 2, 4), hoy) == "vigente"


def test_movimientos_de_stock():
    assert inv.calcular_stock("ingreso", Decimal(3), Decimal(2)) == 5
    assert inv.calcular_stock("salida", Decimal(3), Decimal(2)) == 1
    assert inv.calcular_stock("salida", Decimal(3), Decimal(3)) == 0
    assert inv.calcular_stock("ajuste", Decimal(3), Decimal(10)) == 10
    with pytest.raises(HTTPException) as e:
        inv.calcular_stock("salida", Decimal(1), Decimal(2))
    assert e.value.status_code == 409  # nunca 401


def test_resumen_cuenta_solo_lo_que_hay():
    def it(i, stock, estado, cat="Insumo", venc=None):
        return {"id": i, "codigo": f"INS-{i}", "descripcion": "x", "lote": None, "stock": stock, "estado_vencimiento": estado,
                "categoria": cat, "vencimiento": venc, "dias_para_vencer": None}
    r = inv.armar_resumen([
        it(1, 1, "vencido", "Estándar analítico", "2025-01-01"),
        it(2, 0, "vencido", "Estándar analítico", "2025-01-01"),  # sin stock: no es alerta de vencido
        it(3, 2, "por_vencer", "Estándar analítico", "2026-12-01"),
        it(4, 0, "sin_fecha"),
        it(5, 1, "sin_fecha", "Estándar certificado"),
    ])
    assert (r["total"], r["vencidos"], r["por_vencer"], r["sin_stock"], r["sin_fecha"]) == (5, 1, 1, 2, 1)
    assert [p["id"] for p in r["proximos"]] == [1, 3]


def test_es_funcion_suelta_solo_para_quien_se_le_asigna():
    from app.auth import Usuario  # noqa: F401
    assert pf.LAB_INVENTARIO in pf.FUNCIONES and pf.LAB_INVENTARIO in pf.MODULOS_VALIDOS


def test_todas_las_rutas_exigen_la_funcion():
    for ruta in inv.router.routes:
        assert inv.router.dependencies, ruta.path


def test_lector_del_excel(tmp_path):
    import openpyxl
    import importlib.util, pathlib
    spec = importlib.util.spec_from_file_location("cargar", pathlib.Path(__file__).parent.parent / "scripts" / "cargar_inventario_lab.py")
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["Código", "Ubicación", "Descripción", "Descripción2", "Almacenamiento", "Cantidad", "Lote", "Fecha", "Ref", "Stock"])
    ws.append(["ins-01", "Congelador", "Certified Reference material ISO", "Azoxystrobin", "(-18°C)", "1ml", 12, date(2027, 8, 27), "P1", 1])
    ws.append(["INS-18", "Laboratorio", "Insumos ", "Quechers Mix", "N/A", "N/A", "N/A", "N/A", "N/A", 2600])
    ws.append(["INS-49", "Laboratorio", "Estándar analítico", "Pirimetanil", "no indica", "250mg", "B1", date(2027, 1, 1), "31577", 1])
    ws.append(["INS-49", "Laboratorio", "Estándar analítico", "Pirimetanil", "no indica", "250mg", "B1", date(2027, 1, 1), "31577", 1])
    ws.append([None] * 10)
    ws.append(["INS-34", "Laboratorio", "Insumos ", "Liner", "N/A", "N/A", "N/A", "N/A", "N/A", None])
    ruta = tmp_path / "i.xlsx"; wb.save(ruta)
    filas = mod.leer_filas(str(ruta))
    assert [f["codigo"] for f in filas] == ["INS-01", "INS-18", "INS-49", "INS-49", "INS-34"]  # repetidos NO se fusionan
    assert filas[0]["categoria"] == "Estándar certificado" and filas[0]["lote"] == "12"
    assert filas[1]["categoria"] == "Insumo" and filas[1]["descripcion"] == "Quechers Mix" and filas[1]["lote"] is None
    assert filas[2]["categoria"] == "Estándar analítico" and filas[4]["stock"] == 0
