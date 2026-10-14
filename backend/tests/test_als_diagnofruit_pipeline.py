"""De las columnas que manda el Converter a la descarga de BD, para ALS y Diagnofruit (sin base de datos)."""
from app import bd_excel
from app.mapeo import mapear_resultados
from app.toma_muestras import ANALITOS_DEFECTO

# Columnas de resultado que el Converter pone en la fila (public/modules/converter.html, COLUMNAS) -> código de la ingesta.
COLUMNAS_CONVERTER = {
    "Levaduras UFC/mL": "LEV", "Botrytis conidia/mL": "BOT", "Alternaria conidia/mL": "ALT",
    "Geotrichum esporas/mL": "GEO", "Penicillium conidia/mL": "PEN",
    "E. Coli UFC/100mL": "ECOLI", "Coliformes Totales UFC/100mL": "COLT",
    "Plomo mg/kg": "PB", "Mercurio mg/kg": "HG", "Arsénico mg/kg": "AS", "Cadmio mg/kg": "CD", "Aluminio mg/kg": "AL",
    "Hongos UFC/g": "HONG", "Levaduras UFC/g": "LEVG", "Coliformes Totales UFC/g": "COLA",
    "Escherichia coli UFC/g": "ECOLA", "Recuento Enterobacterias UFC/g": "ENTB", "Salmonella 25g (P/A)": "SALM",
    "Cenizas Insolubles en Ácido (%)": "CEN", "Aflatoxinas Totales B1+B2+G1+G2 (µg/kg)": "AFLA",
}


def test_cada_columna_del_converter_llega_a_la_ingesta_con_su_codigo():
    for columna, codigo in COLUMNAS_CONVERTER.items():
        r = mapear_resultados({columna: "5"})
        assert [x["analito_codigo"] for x in r] == [codigo], columna


def test_un_limite_menor_que_se_guarda_como_texto_no_como_numero():
    (r,) = mapear_resultados({"E. Coli UFC/100mL": "<1"})
    assert r["valor_num"] is None and r["valor_texto"] == "<1"
    (r,) = mapear_resultados({"Levaduras UFC/mL": "BLD"})
    assert r["valor_num"] is None and r["valor_texto"] == "BLD"


def test_todos_los_codigos_de_als_y_diagnofruit_tienen_columna_propia_en_la_bd():
    catalogo = {a["codigo"] for a in ANALITOS_DEFECTO if a["laboratorio"] in ("ALS", "DIAGNOFRUIT")}
    for codigo in COLUMNAS_CONVERTER.values():
        assert bd_excel.codigo_de_formato(codigo) in catalogo, codigo


def test_la_bd_trae_los_resultados_de_als_y_diagnofruit_con_su_texto():
    filas = [
        {"nro_informe": "A-1", "laboratorio": "ALS (Corthon)", "dosis": {}, "tipo_aplicacion": None,
         "resultados": {"ECOLI": {"valor": "<1", "nombre": "E. Coli"}, "PB": {"valor": 0.02, "nombre": "Plomo"}}},
        {"nro_informe": "D-1", "laboratorio": "Diagnofruit", "dosis": {}, "tipo_aplicacion": None,
         "resultados": {"BOT": {"valor": 120, "nombre": "Botrytis"}, "LEV": {"valor": "BLD", "nombre": "Levaduras"}}},
    ]
    wb = bd_excel.construir_workbook_bd(filas, ANALITOS_DEFECTO)
    ws = wb["BD"]
    cols = [c.value for c in ws[2]]
    for etiqueta in ("E. Coli UFC/100mL", "Plomo mg/kg", "Botrytis conidia/mL", "Levaduras UFC/mL"):
        assert etiqueta in cols, etiqueta
    celdas_als = dict(zip(cols, [c.value for c in ws[3]]))
    celdas_dx = dict(zip(cols, [c.value for c in ws[4]]))
    assert celdas_als["E. Coli UFC/100mL"] == "<1" and celdas_als["Plomo mg/kg"] == 0.02
    assert celdas_dx["Botrytis conidia/mL"] == 120 and celdas_dx["Levaduras UFC/mL"] == "BLD"
