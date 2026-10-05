"""
El Excel de una solicitud: columnas dinámicas por analito+dosis, y que el
lector de "Reporte de Cromatografía" (emitir.py) lo siga entendiendo después
del cambio.

No necesita Postgres: son funciones puras sobre bytes de Excel.
"""
from __future__ import annotations

import datetime
import io

import openpyxl

from app.emitir import _mapear_solicitud_a_campos
from app.solicitud_excel import (
    _analitos_fungicidas,
    construir_workbook,
    construir_workbook_exportacion,
    leer_datos_workbook,
)
from app.toma_muestras import ANALITOS_DEFECTO

DATOS_BASE = {
    "laboratorio": "AGROFRESH",
    "solicitante": "J",
    "sold_to": "ZZ-TEST",
    "ship_to": None,
    "especie": "Cerezas",
    "variedad": None,
    "linea_proceso": None,
    "csg_productor": None,
    "csg_packing": None,
    "lote": None,
    "posicion_muestreo": None,
    "numero_camara": None,
    "numero_orden": None,
    "kilos_procesados": None,
    "producto_utilizado": None,
    "tipo_muestra": None,
    "fecha_muestreo": None,
    "hora_muestreo": None,
    "nombre_muestreador": None,
    "generado_por": "J",
    "email_solicitante": None,
    "email_laboratorio": None,
    "observacion": None,
    "numero_solicitud": "OT-0001",
    "fecha_solicitud": "2026-09-01",
    "creado_en": "2026-09-01T10:00:00+00:00",
    "codigo_muestra": None,
    "enviada": False,
    "enviado_en": None,
    "campos_laboratorio": {
        "Fludioxonil (ppm)": "25",
        "Pirimetanil (ppm)": "15",
        "Tebuconazol (ppm)": "Solicitado",  # se pidió pero sin dosis anotada
        "Tipo Aplicación": "Actimist",
    },
    "analitos_solicitados": ["FDL", "PYR", "TEBU"],
}


def _headers_y_fila(ws):
    headers = [ws.cell(row=2, column=c).value for c in range(1, ws.max_column + 1)]
    fila = [ws.cell(row=3, column=c).value for c in range(1, ws.max_column + 1)]
    return dict(zip(headers, fila))


# --- CASO 2: Excel con una columna por analito + su columna de dosis -------


def test_columnas_dinamicas_por_analito_y_dosis():
    wb = construir_workbook_exportacion([DATOS_BASE], ANALITOS_DEFECTO)
    ws = wb.active
    headers = [ws.cell(row=2, column=c).value for c in range(1, ws.max_column + 1)]

    # No hardcodeado: sale del catálogo (ANALITOS_DEFECTO trae 7 fungicidas
    # para QUITECA y otros 7 -mismos códigos- para AGROFRESH, deduplicados).
    codigos_esperados = [a["codigo"] for a in _analitos_fungicidas(ANALITOS_DEFECTO)]
    assert codigos_esperados  # el catálogo trae algo, si no la prueba no prueba nada

    for codigo in codigos_esperados:
        assert codigo in headers
        assert f"{codigo} Dosis" in headers
        # La columna de dosis va INMEDIATAMENTE después de la del código.
        assert headers.index(f"{codigo} Dosis") == headers.index(codigo) + 1


def test_la_dosis_de_cada_analito_es_la_suya_no_una_mezclada():
    wb = construir_workbook_exportacion([DATOS_BASE], ANALITOS_DEFECTO)
    fila = _headers_y_fila(wb.active)

    assert fila["FDL"] == "✓"
    assert fila["FDL Dosis"] == "25"
    assert fila["PYR"] == "✓"
    assert fila["PYR Dosis"] == "15"
    # Solicitado pero sin dosis real anotada: la columna de dosis queda vacía
    # (no aparece la palabra "Solicitado" en una celda de dosis).
    assert fila["TEBU"] == "✓"
    assert fila["TEBU Dosis"] is None
    # No solicitado: ambas columnas vacías -mismo criterio que hoy (vacío,
    # no un cero ni un guion).
    assert fila["AZOX"] is None
    assert fila["AZOX Dosis"] is None


def test_un_analito_no_solicitado_no_muestra_dosis_aunque_el_catalogo_la_tenga():
    """Un analito que el catálogo sabe pero esta solicitud no pidió nunca
    debe mostrar una dosis, aunque `campos_laboratorio` trajera basura para
    esa etiqueta (ej. una solicitud vieja con datos sueltos)."""
    datos = {
        **DATOS_BASE,
        "analitos_solicitados": ["FDL"],
        "campos_laboratorio": {
            **DATOS_BASE["campos_laboratorio"],
            # Pirimetanil tiene un valor guardado, pero ya no está en
            # analitos_solicitados.
        },
    }
    datos["analitos_solicitados"] = ["FDL"]
    wb = construir_workbook_exportacion([datos], ANALITOS_DEFECTO)
    fila = _headers_y_fila(wb.active)
    assert fila["PYR"] is None
    assert fila["PYR Dosis"] is None


def test_el_excel_individual_usa_la_misma_matriz_dinamica():
    wb = construir_workbook(DATOS_BASE, ANALITOS_DEFECTO)
    ws = wb["Solicitudes"]
    fila = _headers_y_fila(ws)
    assert fila["FDL Dosis"] == "25"
    assert fila["PYR Dosis"] == "15"


# --- CASO 8: el lector de Reporte de Cromatografía sigue funcionando -------


def test_leer_datos_workbook_sigue_reconstruyendo_la_solicitud_completa():
    """El lector de emitir.py (leer_solicitudes_de -> leer_datos_workbook)
    lee la hoja oculta "_data", no la hoja visible que acaba de cambiar de
    estructura. Esta prueba es justamente la que habría fallado si el cambio
    del Excel visible hubiera tocado esa hoja oculta."""
    wb = construir_workbook(DATOS_BASE, ANALITOS_DEFECTO)
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    datos_leidos = leer_datos_workbook(buffer)

    assert datos_leidos["numero_solicitud"] == "OT-0001"
    assert datos_leidos["analitos_solicitados"] == ["FDL", "PYR", "TEBU"]
    assert datos_leidos["campos_laboratorio"]["Fludioxonil (ppm)"] == "25"
    assert datos_leidos["campos_laboratorio"]["Pirimetanil (ppm)"] == "15"


def test_emitir_mapea_cada_analito_con_su_dosis_para_cromatografia():
    """`emitir.py` (Reporte de Cromatografía) arma sus "campos" mezclando los
    generales con `campos_laboratorio` tal cual -no parsea la hoja visible-,
    así que cada analito con su dosis individual le sigue llegando bien."""
    wb = construir_workbook(DATOS_BASE, ANALITOS_DEFECTO)
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    datos = leer_datos_workbook(buffer)

    campos = _mapear_solicitud_a_campos(datos)

    assert campos["Fludioxonil (ppm)"] == "25"
    assert campos["Pirimetanil (ppm)"] == "15"


def test_leer_datos_workbook_no_se_confunde_con_las_columnas_nuevas():
    """Round-trip completo: crear -> guardar -> abrir con openpyxl "de
    afuera" (como si alguien lo bajara) -> confirmar que la hoja visible
    nueva no rompe la hoja `_data`."""
    wb = construir_workbook(DATOS_BASE, ANALITOS_DEFECTO)
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    wb_reabierto = openpyxl.load_workbook(buffer, read_only=True, data_only=True)
    assert "_data" in wb_reabierto.sheetnames
    assert "Solicitudes" in wb_reabierto.sheetnames
    ws_visible = wb_reabierto["Solicitudes"]
    headers = [ws_visible.cell(row=2, column=c).value for c in range(1, ws_visible.max_column + 1)]
    assert "FDL Dosis" in headers
    wb_reabierto.close()


def _endpoint_con_muestra(filas):
    """Ejecuta el endpoint y devuelve la hoja resultante."""
    import asyncio

    from app.emitir import generar_excel_con_muestra

    async def _leer():
        r = generar_excel_con_muestra(filas)
        return b"".join([c async for c in r.body_iterator])

    return openpyxl.load_workbook(io.BytesIO(asyncio.run(_leer()))).active


def test_excel_con_muestra_usa_formato_de_la_base_solo_con_analitos_agrofresh():
    from app.emitir import FilaConMuestraIn

    fila = FilaConMuestraIn(
        campos={
            "N° Solicitud": "OT-AGF0050",
            "Especie": "Mandarina",
            "Tipo Aplicación": "RYD",
            "Posición Muestreo": "A1, B2",
            "Código de Ensayo": "E-77",
            "N° Ensayo": "3",
            "Fludioxonil (ppm)": "250",
        },
        analitos_solicitados=["FDL"],
        codigo_muestra="AGF0001",
        fecha_recepcion="2026-09-25",
        hora_recepcion="16:57",
    )
    ws = _endpoint_con_muestra([fila])
    headers = [ws.cell(row=2, column=c).value for c in range(1, ws.max_column + 1)]
    valores = dict(zip(headers, [ws.cell(row=3, column=c).value for c in range(1, ws.max_column + 1)]))

    # Mismas columnas generales que la BD de Report (ver columnas_base.py).
    assert headers[:3] == ["N° Informe", "N° Solicitud", "N° Muestra"]
    assert valores["N° Muestra"] == "AGF0001"
    assert valores["Fecha Recepción"] == datetime.datetime(2026, 9, 25)
    assert valores["Hora Recepción"] == "16:57"
    assert valores["FDL"] == "✓"
    assert valores["FDL Dosis"] == "250"
    # Campos de RYD.
    assert valores["Posición Muestreo"] == "A1"  # RYD: una fila por posición
    assert ws.cell(row=4, column=headers.index("Posición Muestreo") + 1).value == "B2"
    assert valores["Código de Ensayo"] == "E-77"
    assert valores["N° Ensayo"] == "3"
    # Solo AgroFresh: sin los grupos de otros laboratorios.
    assert "Levaduras UFC/mL" not in headers and "E. Coli UFC/100mL" not in headers
    assert "FDL" in headers


def test_ryd_con_varias_posiciones_sale_una_fila_por_posicion():
    datos = {
        **DATOS_BASE,
        "numero_solicitud": "OT-AGF0052",
        "posicion_muestreo": "R1, R2, R4",
        "analitos_solicitados": ["PYR"],
        "campos_laboratorio": {"Tipo Aplicación": "RYD", "Código de Ensayo": "E1", "N° Ensayo": "1"},
    }
    otra = {**datos, "numero_solicitud": "OT-2", "posicion_muestreo": "A, B",
            "campos_laboratorio": {"Tipo Aplicación": "Actimist"}}
    ws = construir_workbook_exportacion([datos, otra], ANALITOS_DEFECTO).active
    headers = [c.value for c in ws[2]]
    filas = [dict(zip(headers, [c.value for c in r])) for r in ws.iter_rows(min_row=3)]
    assert [(f["N° Solicitud"], f["Posición Muestreo"]) for f in filas] == [
        ("OT-AGF0052", "R1"), ("OT-AGF0052", "R2"), ("OT-AGF0052", "R4"), ("OT-2", "A, B"),
    ]
    assert all(f["Código de Ensayo"] == "E1" for f in filas[:3])


# --- Las dos bases (Report y «con muestra») comparten sus columnas generales ---

def _generales(ws) -> list[str]:
    """Los encabezados de la banda GENERAL (fila 2, hasta donde llega la fila 1)."""
    fin = next(r.max_col for r in ws.merged_cells.ranges if r.min_row == 1 and r.min_col == 1)
    return [ws.cell(row=2, column=c).value for c in range(1, fin + 1)]


def test_la_base_con_muestra_y_la_bd_de_report_tienen_las_mismas_columnas_generales():
    from app import bd_excel
    from app.columnas_base import GENERALES_BASE
    from app.emitir import FilaConMuestraIn

    ws_muestra = _endpoint_con_muestra([FilaConMuestraIn(
        campos={"N° Solicitud": "OT-AGF0001", "Fludioxonil (ppm)": "250"}, analitos_solicitados=["FDL"],
    )])
    bd = bd_excel.construir_workbook_bd(
        [{"nro_informe": "I-1", "laboratorio": "AGROFRESH", "resultados": {"FDL": {"valor": 1.0, "nombre": "F"}},
          "dosis": {"FDL": 250}, "tipo_aplicacion": "Actimist"}],
        ANALITOS_DEFECTO,
    )["BD"]
    esperadas = [etiqueta for _, etiqueta in GENERALES_BASE]
    assert _generales(ws_muestra) == esperadas
    assert _generales(bd) == esperadas


def test_las_dos_bases_traen_los_mismos_campos_del_grupo_de_fungicidas():
    from app import bd_excel
    from app.emitir import FilaConMuestraIn

    ws_muestra = _endpoint_con_muestra([FilaConMuestraIn(campos={"Fludioxonil (ppm)": "250"}, analitos_solicitados=["FDL"])])
    bd = bd_excel.construir_workbook_bd(
        [{"laboratorio": "AGROFRESH", "resultados": {"FDL": {"valor": 1.0, "nombre": "F"}}, "dosis": {"FDL": 250}}],
        ANALITOS_DEFECTO,
    )["BD"]
    for ws in (ws_muestra, bd):
        cabeceras = [c.value for c in ws[2]]
        for columna in ("FDL", "FDL Dosis", "Tipo Aplicación", "Gasto", "Código de Ensayo", "N° Ensayo"):
            assert columna in cabeceras, columna


def test_la_base_con_muestra_trae_la_lista_de_distribucion_de_resultados(monkeypatch):
    from app import toma_muestras as tm
    from app.emitir import FilaConMuestraIn

    contactos = [
        {"email": "cliente@dole.cl", "tipo": "resultado_cliente", "activo": True, "orden": 1,
         "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": ""},
        {"email": "otro@dole.cl", "tipo": "resultado_cliente", "activo": True, "orden": 2,
         "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": ""},
        {"email": "tecnico@agrofresh.com", "tipo": "resultado_interno", "tipo_copia": "bcc", "activo": True,
         "orden": 3, "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": ""},
        {"email": "comercial@agrofresh.com", "tipo": "resultado_interno", "tipo_copia": "cc", "activo": True,
         "orden": 4, "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": ""},
    ]
    leer_original = tm._leer_config
    monkeypatch.setattr(
        tm, "_leer_config",
        lambda archivo, defecto=None: contactos if archivo == "contactos_laboratorio.json" else leer_original(archivo, defecto),
    )
    ws = _endpoint_con_muestra([FilaConMuestraIn(
        campos={"N° Solicitud": "OT-AGF0001", "Sold To": "DOLE", "Ship To": "DOLE LONTUE", "Especie": "Cereza"},
        analitos_solicitados=[],
    )])
    headers = [c.value for c in ws[2]]
    fila = dict(zip(headers, [c.value for c in ws[3]]))
    assert fila["Lista de Distribución (Para)"] == "cliente@dole.cl; otro@dole.cl"
    assert fila["Lista de Distribución (CC)"] == "comercial@agrofresh.com"
    assert fila["Lista de Distribución (CCO)"] == "tecnico@agrofresh.com"


def test_excel_con_muestra_trae_el_peso_extraido_en_su_columna():
    from app.emitir import FilaConMuestraIn

    def valores(peso):
        ws = _endpoint_con_muestra([FilaConMuestraIn(
            campos={"N° Solicitud": "OT-AGF0050"}, analitos_solicitados=[],
            codigo_muestra="AGF0001", peso_muestra_extraido=peso,
        )])
        headers = [ws.cell(row=2, column=c).value for c in range(1, ws.max_column + 1)]
        return dict(zip(headers, [ws.cell(row=3, column=c).value for c in range(1, ws.max_column + 1)]))

    assert valores(5.025)["Peso Muestra Extraída (g)"] == 5.025
    assert valores(None)["Peso Muestra Extraída (g)"] is None


def test_excel_con_muestra_lleva_los_fortificados_en_su_propia_hoja(monkeypatch):
    import asyncio

    from app import fortificados
    from app.emitir import FilaConMuestraIn, generar_excel_con_muestra

    monkeypatch.setattr(fortificados, "listar_para_excel", lambda: [
        {"id": 1, "numero": "F-001", "peso_extraido": 10.0086, "fecha_ingreso": "2026-10-05", "hora_ingreso": "09:13"},
        {"id": 2, "numero": "F-002", "peso_extraido": 9.9, "fecha_ingreso": "2026-10-06", "hora_ingreso": "16:42"},
    ])

    async def _leer():
        r = generar_excel_con_muestra([FilaConMuestraIn(
            campos={"N° Solicitud": "OT-AGF0050"}, analitos_solicitados=[], codigo_muestra="AGF0001",
        )])
        return b"".join([c async for c in r.body_iterator])

    wb = openpyxl.load_workbook(io.BytesIO(asyncio.run(_leer())))
    assert wb.sheetnames == ["Estándar", "Fortificados"]
    ws = wb["Fortificados"]
    assert [c.value for c in ws[1]] == ["N° Fortificado", "Peso extraído (g)", "Fecha ingreso", "Hora ingreso"]
    assert [c.value for c in ws[2]] == ["F-001", 10.0086, "05-10-2026", "09:13"]
    assert [c.value for c in ws[3]] == ["F-002", 9.9, "06-10-2026", "16:42"]
    # La hoja estándar sigue siendo la de siempre.
    assert wb["Estándar"]["A2"].value is not None


def test_excel_con_muestra_sin_fortificados_deja_la_hoja_con_encabezados_y_una_fila_vacia(monkeypatch):
    import asyncio

    from app import fortificados
    from app.emitir import generar_excel_con_muestra

    monkeypatch.setattr(fortificados, "listar_para_excel", lambda: [])

    async def _leer():
        r = generar_excel_con_muestra([])
        return b"".join([c async for c in r.body_iterator])

    wb = openpyxl.load_workbook(io.BytesIO(asyncio.run(_leer())))
    assert [c.value for c in wb["Fortificados"][2]] == [None] * 4
