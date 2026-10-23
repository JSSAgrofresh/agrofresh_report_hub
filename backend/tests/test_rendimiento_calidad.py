"""Rendimiento de calidad: los tres juicios (residuales, FSMA, FITO) y la suma por semana."""
import json
import shutil
import subprocess
from datetime import date
from pathlib import Path

import pytest

from app import rendimiento_calidad as rc

RAIZ = Path(__file__).resolve().parents[2]


def test_limites_linea_son_los_del_frontend():
    """`LIMITES_LINEA` espeja `LIMITES_RESIDUALES` de la Vista de límites: si uno cambia, el otro también."""
    if not shutil.which("node"):
        pytest.skip("sin node")
    salida = subprocess.run(
        ["node", "-e", "import('./src/features/reportes/lib/limitesResiduales.ts').then(m=>console.log(JSON.stringify(m.LIMITES_RESIDUALES)))"],
        cwd=RAIZ, capture_output=True, text=True)
    if salida.returncode != 0:
        pytest.skip("node no lee TypeScript acá")
    ts = {e: {a: (r["min"], r["max"]) for a, r in l.items()} for e, l in json.loads(salida.stdout).items()}
    assert ts == rc.LIMITES_LINEA


def R(*items):
    return [(c, v, None) for c, v in items]


class TestResiduales:
    def test_dentro_cumple(self):
        assert rc.juzgar_residuales("Cerezas", "linea", R(("FDL", 2.0), ("PYR", 1.5))) is True

    def test_sobre_el_maximo_no_cumple(self):
        assert rc.juzgar_residuales("Manzana", "linea", R(("FDL", 3.4))) is False

    def test_bajo_el_minimo_no_cumple(self):
        assert rc.juzgar_residuales("Manzana", "linea", R(("FDL", 2), ("PYR", 0.6))) is False

    def test_actimist_usa_su_tabla(self):
        # 3,4 ppm de FDL en manzana: pasa en Actimist (máx 3,5) y falla en Línea de proceso (máx 3)
        assert rc.juzgar_residuales("Manzana", "actimist", R(("FDL", 3.4))) is True
        assert rc.juzgar_residuales("Manzana", "linea", R(("FDL", 3.4))) is False

    def test_ecofog_usa_la_tabla_de_actimist(self):
        assert rc.juzgar_residuales("Manzana", "ecofog", R(("FDL", 3.4))) is True
        assert rc.juzgar_residuales("Manzana", "ecofog", R(("FDL", 3.6))) is False

    def test_dpa_solo_existe_en_actimist(self):
        assert rc.juzgar_residuales("Pera", "actimist", R(("DPA", 2.0))) is False
        assert rc.juzgar_residuales("Pera", "linea", R(("DPA", 2.0))) is None   # sin límite: no se juzga

    def test_especie_sin_tabla_no_se_juzga(self):
        assert rc.juzgar_residuales("Uva", "linea", R(("FDL", 9))) is None
        assert rc.juzgar_residuales(None, "linea", R(("FDL", 9))) is None

    def test_especie_sin_tildes_ni_plural(self):
        assert rc.juzgar_residuales("cereza", "linea", R(("FDL", 9))) is False
        assert rc.juzgar_residuales("LIMON", "linea", R(("IMZ", 2))) is True

    def test_nd_y_menor_que_no_cuentan_como_medida(self):
        assert rc.juzgar_residuales("Manzana", "linea", [("FDL", None, "ND"), ("PYR", None, "<0,05")]) is None
        assert rc.juzgar_residuales("Manzana", "linea", [("FDL", None, "<0,05"), ("PYR", 2, None)]) is True

    def test_codigo_con_ppm(self):
        assert rc.juzgar_residuales("Manzana", "linea", R(("FDL ppm", 9))) is False


class TestFsma:
    def test_nada_detectado_cumple(self):
        assert rc.juzgar_fsma([("ECOLI", None, "<1"), ("COLT", None, "<1")]) is True

    def test_una_deteccion_no_cumple(self):
        assert rc.juzgar_fsma([("ECOLI", None, "<1"), ("COLT", 12, None)]) is False

    def test_sin_resultados_no_se_juzga(self):
        assert rc.juzgar_fsma([]) is None

    def test_cero_es_no_detectado(self):
        assert rc.juzgar_fsma([("ECOLI", 0, None)]) is True


class TestFito:
    @pytest.mark.parametrize("cod,valor,nivel", [
        ("BOT", 19, "optimo"), ("BOT", 20, "moderado"), ("BOT", 200, "moderado"), ("BOT", 201, "peligroso"),
        ("ALT", 49, "optimo"), ("ALT", 300, "moderado"), ("ALT", 301, "peligroso"),
        ("GEO", 9, "optimo"), ("GEO", 50, "moderado"), ("GEO", 51, "peligroso"),
        ("PEN", 49, "optimo"), ("PEN", 300, "moderado"), ("PEN", 301, "peligroso"),
    ])
    def test_niveles(self, cod, valor, nivel):
        assert rc.nivel_fito(cod, valor) == nivel

    def test_solo_optimo_cumple(self):
        assert rc.juzgar_fito(R(("BOT", 5), ("ALT", 10))) is True
        assert rc.juzgar_fito(R(("BOT", 25))) is False          # moderado

    def test_moderado_cumple_si_se_decide_asi(self, monkeypatch):
        monkeypatch.setattr(rc, "MODERADO_CUMPLE", True)
        assert rc.juzgar_fito(R(("BOT", 25))) is True
        assert rc.juzgar_fito(R(("BOT", 250))) is False

    def test_mayor_que_cien_de_diagnofruit(self):
        assert rc.juzgar_fito([("BOT", None, ">100")]) is False   # >100 ya no es óptimo
        assert rc.juzgar_fito([("BOT", None, "<10")]) is True

    def test_levaduras_no_se_juzgan(self):
        assert rc.juzgar_fito(R(("LEV", 9999))) is None


def test_bloque_y_servicio():
    assert rc.bloque_de("ALS (Corthon)") == "fsma" and rc.bloque_de("Quiteca") == "residuales"
    assert rc.bloque_de("Agrofresh") == "residuales" and rc.bloque_de("Diagnofruit") == "fito"
    assert rc.bloque_de("Otro") is None
    assert rc.servicio_de(None) == "linea" and rc.servicio_de("ryd") == "linea"
    assert rc.servicio_de("actimist") == "actimist" and rc.servicio_de("ecofog") == "ecofog"


def test_la_semana_empieza_el_lunes():
    assert rc.lunes(date(2026, 10, 28)) == date(2026, 10, 26) and rc.lunes(date(2026, 11, 1)) == date(2026, 10, 26)


def _fila(i, lab, esp, serv, fecha, analito, valor, sold="DOLE CHILE S.A.", ship="DOLE PLANTA CODEGUA"):
    return {"id": i, "laboratorio": lab, "especie": esp, "servicio": serv, "fecha": fecha, "sold_to": sold, "ship_to": ship,
            "analito": analito, "valor_num": valor, "valor_texto": None}


def test_calcular_suma_por_semana_y_separa_servicios():
    filas = [
        _fila(1, "Quiteca", "Manzana", None, date(2026, 10, 27), "FDL", 2.0),          # cumple
        _fila(2, "Quiteca", "Manzana", None, date(2026, 10, 28), "FDL", 3.4),          # no cumple (Línea)
        _fila(3, "Agrofresh", "Manzana", "actimist", date(2026, 10, 28), "FDL", 3.4),  # cumple (Actimist)
        _fila(4, "ALS (Corthon)", "Manzana", None, date(2026, 10, 29), "ECOLI", 0),    # cumple
        _fila(5, "Quiteca", "Uva", None, date(2026, 10, 29), "FDL", 9),                # sin criterio
        _fila(6, "Quiteca", "Manzana", "ecofog", date(2026, 10, 29), "FDL", 9),        # ecofog: no cumple
        _fila(7, "Quiteca", "Manzana", None, None, "FDL", 9),                          # sin fecha
    ]
    r = rc.calcular(filas)
    por = {(f["bloque"], f["servicio"]): (f["cumple"], f["no_cumple"]) for f in r["filas"]}
    assert por == {("residuales", "linea"): (1, 1), ("residuales", "actimist"): (1, 0), ("residuales", "ecofog"): (0, 1), ("fsma", "linea"): (1, 0)}
    assert {f["semana"] for f in r["filas"]} == {"2026-10-26"}
    assert r["sin_criterio"]["residuales"] == 1 and r["fuera"]["sin_fecha"] == 1


def test_un_informe_con_varios_analitos_cuenta_una_vez():
    filas = [_fila(1, "Quiteca", "Manzana", None, date(2026, 10, 27), a, v) for a, v in (("FDL", 9), ("PYR", 9), ("TBZ", 2))]
    r = rc.calcular(filas)
    assert [(f["cumple"], f["no_cumple"]) for f in r["filas"]] == [(0, 1)]
