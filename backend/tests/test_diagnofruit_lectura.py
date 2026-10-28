"""El informe de Diagnofruit con la cadena de la solicitud en el encabezado (formato nuevo, 28-10-2026).

`fixtures/correos/diagnofruit_253580.txt` es el texto real del informe 253580 (OT-DIAG0009), como lo saca `texto_de_pdf`."""
from pathlib import Path

import pytest

from app import correo_informes_homogeneo as homogeneo, correo_informes_lectura as lectura, diagnofruit_lectura as dl, quiteca_lectura

TEXTO = (Path(__file__).parent / "fixtures" / "correos" / "diagnofruit_253580.txt").read_text(encoding="utf-8")


def test_se_reconoce_el_laboratorio_y_es_cargable():
    assert lectura.detectar_laboratorio(TEXTO) == "Diagnofruit"
    assert "Diagnofruit" in lectura.LABORATORIOS_CON_LECTOR
    assert "Diagnofruit" in homogeneo.LABORATORIOS_CARGABLES


def test_todo_sale_del_encabezado_aunque_el_pdf_parta_la_cadena_en_dos_lineas():
    d = dl.leer_diagnofruit(TEXTO)["datos"]
    assert d["OT"] == "OT-DIAG0009"
    assert d["N° Solicitud"] == "253580"
    assert (d["Sold To"], d["Ship To"]) == ("THOMSEN CHILE SA", "THOMSEN CHILE SA LOS NICHES")
    assert d["Especie"] == "Manzana"            # «Especie: AGUA» del informe es el tipo de muestra, no la especie
    assert d["Tipo Aplicación"] == "Línea de proceso"
    assert d["Tipo de servicio"] == "Linea de Proceso"
    assert d["Línea Proceso"] == "1"
    assert d["Nombre Muestreador"] == "Barbara farias"
    assert d["Email Solicitante"] == "bfarias.agro@gmail.com"   # estaba en la segunda línea del PDF
    assert d["Tipo Muestra"] == "Agua"


def test_las_fechas_se_leen_y_la_de_la_solicitud_manda_sobre_el_muestreo_de_diagnofruit():
    inf = dl.leer_diagnofruit(TEXTO)
    d = inf["datos"]
    assert d["Fecha Muestreo"] == "22-10-2026"      # el informe dice 23/10; la solicitud, 22-10
    assert d["Fecha Solicitud"] == "23-10-2026"
    assert d["Fecha entrada"] == "26-10-2026"       # la hoja 1 la trae como «10/26/2026» (mes/día)
    assert d["Fecha Análisis"] == "27-10-2026"
    assert d["Fecha Informe"] == "28-10-2026"
    assert any("2026-10-22".split("-")[2] in a and "solicitud" in a for a in inf["avisos"])


def test_resultados_no_detectado_como_texto_y_detectado_como_numero():
    r = dl.leer_diagnofruit(TEXTO)["resultados"]
    assert r == {
        "Levaduras UFC/mL": "BLD", "Botrytis conidia/mL": "BLD", "Alternaria conidia/mL": "BLD",
        "Geotrichum esporas/mL": "2,94", "Penicillium conidia/mL": "BLD",
    }


def test_no_falta_nada_para_cargarlo_y_la_fila_queda_como_la_del_converter():
    inf = dl.leer_diagnofruit(TEXTO)
    assert not [a for a in inf["avisos"] if a.startswith(("Sin dato", "No se encontró"))]
    fila = quiteca_lectura.fila_cruda(inf)
    assert fila["Informe"] == "253580" and fila["N° Solicitud"] == "OT-DIAG0009"
    assert (fila["SOLD TO"], fila["SHIP TO"], fila["CROP"]) == ("THOMSEN CHILE SA", "THOMSEN CHILE SA LOS NICHES", "Manzana")
    assert fila["Fecha de muestreo"] == "2026-10-22" and fila["Fecha entrada"] == "2026-10-26"
    assert fila["TIPO APP"] == "Línea de proceso" and fila["Geotrichum esporas/mL"] == "2,94"


def test_lo_que_ingreso_de_informes_cruza_con_la_solicitud():
    leido = lectura.leer_informe("Diagnofruit", TEXTO)
    assert leido["nro_informe"] == "253580" and leido["ot"] == "OT-DIAG0009"
    assert leido["ship_to"] == "THOMSEN CHILE SA LOS NICHES"
    assert leido["fecha_muestreo"] == "2026-10-22" and leido["fecha_recepcion"] == "2026-10-26"


# ---- el formato anterior (sin cadena): todo sale de la solicitud, buscada por la OT ----

ANTERIOR = (
    TEXTO.replace("Predio/planta: THOMSEN CHILE SA // THOMSEN CHILE SA LOS NICHES", "Predio/planta: Thomsen Los Niches")
    .split("Nombre de muestra:")[0]
    + "Nombre de muestra: M1 - DIAG0009\nEspecie: AGUA Variedad: No Aplica\n"
    + "Análisis realizado: CUANTIFICACIÓN DE MICROORGANISMOS\n"
    + TEXTO[TEXTO.index("RESULTADOS"):]
)


def test_formato_anterior_trae_la_ot_pero_falta_lo_demas_hasta_completar_desde_la_solicitud():
    inf = dl.leer_diagnofruit(ANTERIOR)
    assert inf["datos"]["OT"] == "OT-DIAG0009" and "Sold To" not in inf["datos"]
    assert any(a.startswith("Sin dato para") for a in inf["avisos"])
    assert lectura.leer_informe("Diagnofruit", ANTERIOR)["ship_to"] == ""     # no se inventa un Ship To no oficial

    dl.completar_desde_solicitud(inf, {
        "sold_to": "THOMSEN CHILE SA", "ship_to": "THOMSEN CHILE SA LOS NICHES", "especie": "Manzana", "variedad": None,
        "campos_laboratorio": {"Tipo Aplicación": "Línea de proceso"},
    })
    assert inf["datos"]["Ship To"] == "THOMSEN CHILE SA LOS NICHES" and inf["datos"]["Especie"] == "Manzana"
    assert inf["datos"]["Tipo de servicio"] == "Linea de Proceso"
    assert not any(a.startswith("Sin dato para") for a in inf["avisos"])


def test_la_solicitud_manda_sobre_lo_que_escribe_el_laboratorio(monkeypatch):
    from app import indice_solicitudes

    monkeypatch.setattr(indice_solicitudes, "buscar_por_numero", lambda ot: ("x.xlsx", {
        "sold_to": "THOMSEN CHILE SA", "ship_to": "PLANTA OFICIAL", "especie": "Manzana", "campos_laboratorio": {"Tipo Aplicación": "Línea de proceso"}}))
    d = homogeneo._leer_diagnofruit(TEXTO)["datos"]
    assert d["Ship To"] == "PLANTA OFICIAL"


def test_un_pdf_con_varias_muestras_se_carga_con_el_converter():
    dos = TEXTO + "\n" + TEXTO.replace("DIAG0009", "DIAG0010")
    assert dl.muestras(TEXTO) == 1 and dl.muestras(dos) == 2
    with pytest.raises(ValueError, match="varias muestras"):
        homogeneo._leer_diagnofruit(dos)
