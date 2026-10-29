"""Limpieza de Storage → Informes: solo se conservan los PDF cuyo N° de informe está en Report."""
import importlib.util
import os

_RUTA = os.path.join(os.path.dirname(__file__), "..", "scripts", "limpiar_informes_storage.py")
_spec = importlib.util.spec_from_file_location("limpiar_informes_storage", _RUTA)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)

BASE = "informes/PLANTA CITRUMAX/2026-09-15/Línea de proceso/AgroFresh/"


def test_conserva_lo_que_esta_en_report_y_marca_el_resto_como_sobrante():
    claves = [BASE + "AGF2026-26.pdf", BASE + "AGF2026-30.pdf", "informes/COPEFRUT/2026-10-01/Línea de proceso/Quiteca/2026-1885-PC Copefrut Romeral.pdf"]
    conservar, sobran, otros = mod.clasificar(claves, {"AGF2026-26", "2026-1885-PC"})
    assert sorted(c for c, _ in conservar) == sorted([claves[0], claves[2]])
    assert sobran == [claves[1]] and otros == []


def test_un_numero_no_calza_con_otro_que_lo_contiene():
    conservar, sobran, _ = mod.clasificar([BASE + "AGF2026-26.pdf"], {"AGF2026-2"})
    assert conservar == [] and sobran == [BASE + "AGF2026-26.pdf"]
    assert mod.calza("agf2026-2", "agf2026-2") and not mod.calza("agf2026-26", "agf2026-2")
    assert not mod.calza("x1885-pc", "1885-pc") and mod.calza("2026-1885-pc copefrut", "2026-1885-pc")


def test_mayusculas_y_solo_se_juzgan_los_pdf():
    conservar, sobran, otros = mod.clasificar([BASE + "agf2026-26.PDF", BASE + "nota.txt", BASE], {"AGF2026-26"})
    assert [c for c, _ in conservar] == [BASE + "agf2026-26.PDF"]
    assert sobran == [] and otros == [BASE + "nota.txt"]


def test_el_alias_de_diagnofruit_conserva_por_el_numero_en_otras_carpetas():
    clave = "informes/GREENEX/2026-10-01/Linea de Proceso/Otro Lab/253522 - Agrofresh.pdf"
    otra = clave.replace("253522", "253599")
    conservar, sobran, _ = mod.clasificar([clave, otra], {"253522-DIAG0007"})
    assert [c for c, _ in conservar] == [clave] and sobran == [otra]


def test_diagnofruit_nunca_se_toca():
    clave = "informes/GREENEX PLANTA CODEGUA/2026-10-01/Linea de Proceso/Diagnofruit/loquesea.pdf"
    conservar, sobran, _ = mod.clasificar([clave], {"AGF2026-26"})
    assert [c for c, _ in conservar] == [clave] and sobran == []
