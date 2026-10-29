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


def test_repetidos_encuentra_los_numeros_con_mas_de_un_pdf():
    a = "informes/PLANTA A/2026-09-15/Linea/AgroFresh/AGF2026-10.pdf"
    b = "informes/PLANTA B/2026-08-27/Actimist/AgroFresh/AGF2026-10.pdf"
    c = "informes/PLANTA A/2026-09-15/Linea/AgroFresh/AGF2026-11.pdf"
    conservar, _, _ = mod.clasificar([a, b, c], {"AGF2026-10", "AGF2026-11"})
    assert mod.repetidos(conservar) == {"agf2026-10": sorted([a, b])}


NUEVA = "informes/LABORATORIO DE POSTCOSECHA/2026-09-30/Cromatografía/AgroFresh/AGF2026-10 AGROFRESH LABORATORIO DE POSTCOSECHA.pdf"
ANTIGUA = "informes/A.G. SERVICIOS SPA/2026-08-27/AGF2026-10.pdf"


def test_la_copia_del_formato_antiguo_sobra_si_hay_otra_en_el_orden_nuevo():
    assert mod.formato_antiguo(ANTIGUA) and not mod.formato_antiguo(NUEVA)
    assert mod.copias_sobrantes({"agf2026-10": [ANTIGUA, NUEVA]}) == {ANTIGUA: "copia del formato antiguo (hay otra en el orden nuevo)"}


def test_una_copia_antigua_sola_no_se_toca():
    assert mod.copias_sobrantes({"agf2026-10": [ANTIGUA, ANTIGUA.replace("2026-08-27", "2026-08-28")]}) == {}


def test_entre_dos_copias_nuevas_se_queda_la_de_la_planta_de_report():
    a = "informes/EXPORTADORA ERFRUT LTDA/2026-10-02/Linea de Proceso/Quiteca/2026-1907-PC.pdf"
    b = "informes/FRIGORIFICO CHIMBARONGO/2026-10-02/Linea de Proceso/Quiteca/2026-1907-PC.pdf"
    r = mod.copias_sobrantes({"2026-1907-pc": [a, b]}, {"2026-1907-pc": {"FRIGORIFICO CHIMBARONGO"}})
    assert list(r) == [a]
    assert mod.copias_sobrantes({"2026-1907-pc": [a, b]}, {"2026-1907-pc": {"OTRA PLANTA"}}) == {}
    assert mod.copias_sobrantes({"2026-1907-pc": [a, b]}) == {}
