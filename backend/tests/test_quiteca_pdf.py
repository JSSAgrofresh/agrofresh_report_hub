from datetime import date

from app.quiteca_pdf import leer_quiteca

INFORME = """Informe N° 2026-1883-PC
Identificación de la Muestra N° 85849 Fecha de Recepción : 24-09-2026 14:00
N° Solicitud : OT-QUI0022 Fecha de Muestreo : 22-09-2026 Hora : 14:30
Resultados de la Muestra N° 85849 Fecha de Análisis 24-09-2026
Fecha Informe : 25 de septiembre de 2026"""


def test_lee_muestra_hora_y_fechas():
    d = leer_quiteca(INFORME)
    assert d["codigo_muestra"] == "85849"
    assert d["hora_muestreo"] == "14:30"
    assert d["fecha_analisis"] == date(2026, 9, 24)
    assert d["fecha_informe"] == date(2026, 9, 25)


def test_lo_que_no_esta_queda_vacio_sin_romper():
    d = leer_quiteca("Informe N° 2026-1 sin nada más")
    assert d == {"codigo_muestra": None, "hora_muestreo": None, "fecha_analisis": None, "fecha_informe": None}


def test_muestra_pegada_y_hora_suelta():
    d = leer_quiteca("Identificación de la Muestra N°85930\nFecha de Muestreo : 01-10-2026\nHora : 9:05")
    assert d["codigo_muestra"] == "85930"
    assert d["hora_muestreo"] == "09:05"
