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


def _d(i, lab, esp, serv, fecha, codigo, valor, texto=None, nombre=None):
    return {"id": i, "nro_solicitud": f"INF-{i}", "referencia": f"OT-{i}", "laboratorio": lab, "especie": esp, "variedad": None, "servicio": serv,
            "fecha": fecha, "analito": codigo, "nombre": nombre or codigo, "unidad": "ppm", "valor_num": valor, "valor_texto": texto}


class TestDetalle:
    def test_residuales_dice_cuanto_se_pasa_sobre_y_bajo_el_limite(self):
        filas = [
            _d(1, "Quiteca", "Manzana", None, date(2026, 10, 27), "FDL", 3.4),     # sobre (máx 3): +0,4
            _d(1, "Quiteca", "Manzana", None, date(2026, 10, 27), "PYR", 0.6),     # bajo (mín 1): −0,4
            _d(1, "Quiteca", "Manzana", None, date(2026, 10, 27), "TBZ", 2.0),     # dentro
            _d(1, "Quiteca", "Manzana", None, date(2026, 10, 27), "DPA", 5.0),     # sin límite en Línea de proceso
        ]
        (inf,) = rc.armar_detalle(filas, None, None)["informes"]
        por = {a["codigo"]: a for a in inf["analitos"]}
        assert inf["cumple"] is False and inf["bloque"] == "residuales" and inf["servicio"] == "linea"
        assert (por["FDL"]["estado"], por["FDL"]["desvio"], por["FDL"]["max"]) == ("sobre", 0.4, 3)
        assert (por["PYR"]["estado"], por["PYR"]["desvio"], por["PYR"]["min"]) == ("bajo", -0.4, 1)
        assert por["TBZ"]["estado"] == "dentro" and por["TBZ"]["desvio"] == 0
        assert por["DPA"]["estado"] == "sin_limite"

    def test_el_limite_depende_del_servicio(self):
        filas = [_d(1, "Quiteca", "Manzana", "actimist", date(2026, 10, 27), "FDL", 3.4)]
        (inf,) = rc.armar_detalle(filas, None, None)["informes"]
        assert inf["servicio"] == "actimist" and inf["analitos"][0]["max"] == 3.5 and inf["cumple"] is True

    def test_fsma_y_fito(self):
        filas = [
            _d(2, "ALS (Corthon)", "Manzana", None, date(2026, 10, 27), "ECOLI", None, "<1", "Escherichia coli"),
            _d(3, "Diagnofruit", "Manzana", None, date(2026, 10, 27), "BOT", 250),
            _d(3, "Diagnofruit", "Manzana", None, date(2026, 10, 27), "LEV", 9999),
        ]
        inf = {i["bloque"]: i for i in rc.armar_detalle(filas, None, None)["informes"]}
        assert inf["fsma"]["cumple"] is True and inf["fsma"]["analitos"][0]["detecto"] is False
        assert inf["fito"]["cumple"] is False
        assert [a["codigo"] for a in inf["fito"]["analitos"]] == ["BOT"]            # las levaduras no se juzgan
        assert (inf["fito"]["analitos"][0]["nivel"], inf["fito"]["analitos"][0]["peligroso_desde"]) == ("peligroso", 200)

    def test_filtra_por_semana_y_pone_primero_lo_que_no_cumple(self):
        filas = [
            _d(1, "Quiteca", "Manzana", None, date(2026, 10, 12), "FDL", 2.0),     # semana del 12: cumple
            _d(2, "Quiteca", "Manzana", None, date(2026, 10, 27), "FDL", 2.0),     # semana del 26: cumple
            _d(3, "Quiteca", "Manzana", None, date(2026, 10, 28), "FDL", 9.0),     # semana del 26: no cumple
            _d(4, "Quiteca", "Manzana", None, date(2026, 10, 5), "FDL", 2.0),      # fuera del período
        ]
        r = rc.armar_detalle(filas, date(2026, 10, 20), date(2026, 11, 1))["informes"]
        assert [i["id"] for i in r] == [3, 2]                                      # no cumple primero; los de antes del período no entran

    def test_el_rango_incluye_la_semana_de_desde(self):
        filas = [_d(1, "Quiteca", "Manzana", None, date(2026, 10, 12), "FDL", 2.0)]
        assert len(rc.armar_detalle(filas, date(2026, 10, 14), None)["informes"]) == 1   # el 14 está en la semana del 12
        assert len(rc.armar_detalle(filas, date(2026, 10, 19), None)["informes"]) == 0
