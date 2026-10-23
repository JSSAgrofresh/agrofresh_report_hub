"""El lector de Quiteca en Python tiene que dar EXACTAMENTE lo mismo que el del Converter (JavaScript).

Los `quiteca_*_converter.json` salen de correr `leerQuiteca` + `filaCruda` del Converter sobre los textos
`quiteca_*.txt` (informes reales de Quiteca). Si cambias uno de los dos lectores, regenera esos archivos."""
import json
from pathlib import Path

import pytest

from app import quiteca_lectura as Q

F = Path(__file__).parent / "fixtures" / "correos"
INFORMES = ["1912", "1913", "1914"]


def _sin_nulos(d: dict) -> dict:
    # JSON.stringify descarta los `undefined` del Converter y deja los `null`: se comparan sin ninguno de los dos.
    return {k: v for k, v in d.items() if v is not None}


@pytest.mark.parametrize("n", INFORMES)
def test_el_lector_en_python_da_lo_mismo_que_el_del_converter(n):
    texto = (F / f"quiteca_{n}.txt").read_text(encoding="utf-8")
    esperado = json.loads((F / f"quiteca_{n}_converter.json").read_text(encoding="utf-8"))
    inf = Q.leer_quiteca(texto)
    assert _sin_nulos(inf["datos"]) == _sin_nulos(esperado["datos"])
    assert inf["resultados"] == esperado["resultados"]
    assert inf["sueltos"] == esperado["sueltos"]
    assert inf["avisos"] == esperado["avisos"]
    assert _sin_nulos(Q.fila_cruda(inf)) == _sin_nulos(esperado["fila"])


def test_el_1914_trae_lo_que_se_ve_en_el_pdf():
    inf = Q.leer_quiteca((F / "quiteca_1914.txt").read_text(encoding="utf-8"))
    d, fila = inf["datos"], Q.fila_cruda(inf)
    assert (d["N° Solicitud"], d["OT"], d["Sold To"], d["Ship To"], d["Especie"]) == (
        "2026-1914-PC", "OT-QUI0053", "FRUTAS AGROVIC LIMITADA", "FRUTAS AGROVIC LIMITADA", "cereza")
    assert inf["resultados"] == {"FDL ppm": "1,01", "TEBU ppm": "0,57"}
    assert fila["Fecha de muestreo"] == "2026-10-14" and fila["Fecha Informe"] == "2026-10-16"
    assert fila["N° Muestra"] == "86044" and fila["Tipo de servicio"] == "Linea de Proceso"
    assert inf["sueltos"] == [] and not any(a.startswith("Sin dato") for a in inf["avisos"])


def test_un_analito_sin_columna_propia_queda_como_suelto_y_con_aviso():
    texto = (F / "quiteca_1914.txt").read_text(encoding="utf-8").replace("Tebuconazol", "Clorpirifos")
    inf = Q.leer_quiteca(texto)
    assert inf["sueltos"] == [["Clorpirifos", "0,57"]]
    assert any("Clorpirifos" in a for a in inf["avisos"])
    assert "TEBU ppm" not in inf["resultados"]


def test_conversion_de_numeros_y_fechas_como_en_el_converter():
    assert Q.a_numero("1,01") == "1,01" and Q.a_numero("100.0") == "100" and Q.a_numero("1.234,5") == "1234,5"
    assert Q.a_numero("ND") is None and Q.a_numero("N.D.") is None and Q.a_numero("<0,02") == "0,02"
    assert Q.a_fecha("5/10/26") == "05-10-2026" and Q.a_fecha("10/13/2026") == "13-10-2026" and Q.a_fecha("sin fecha") is None
    assert Q.a_fecha_larga("25 de septiembre de 2026") == "25-09-2026" and Q.a_fecha_larga("16 de octubre de 2026") == "16-10-2026"
    assert Q.a_hora("14:00") == "14:00" and Q.a_hora("25:00") is None


def test_a_fecha_lee_entera_una_fecha_ano_mes_dia():
    """Espejo de `converterFechaIso.test.ts`: «2026-10-02» no puede leerse como 26-10-2002."""
    from app.quiteca_lectura import a_fecha

    assert a_fecha("2026-10-02") == "02-10-2026"
    assert a_fecha("2026-09-30T14:00:00") == "30-09-2026"
    assert a_fecha("02-10-2026") == "02-10-2026" and a_fecha("2/10/26") == "02-10-2026"
    assert a_fecha("10-26-2026") == "26-10-2026"          # mes/día invertido
    assert a_fecha("2026-13-02") is None
