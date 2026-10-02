from datetime import date
from decimal import Decimal

from app.ficha_informe import construir_ficha, datos_de_toma, elegir_clave


class TestElegirClave:
    def test_exacto_gana_sobre_contiene(self):
        claves = ["informes/P/f/a/Q/2026-1885-PC Copefrut.pdf", "informes/P/f/a/Q/2026-1885-PC.pdf"]
        assert elegir_clave(claves, "2026-1885-PC") == "informes/P/f/a/Q/2026-1885-PC.pdf"

    def test_contiene_el_mas_corto(self):
        claves = ["x/AGF0001 largo nombre.pdf", "x/AGF0001 b.pdf"]
        assert elegir_clave(claves, "agf0001") == "x/AGF0001 b.pdf"

    def test_ignora_no_pdf_y_vacios(self):
        assert elegir_clave(["x/AGF0001.xlsx", "x/AGF0001/"], "AGF0001") is None
        assert elegir_clave(["x/AGF0001.pdf"], "") is None
        assert elegir_clave(["x/AGF0001.pdf"], None) is None


class TestToma:
    def test_sin_vacios(self):
        d = datos_de_toma({"tipo_muestra": " Fruta ", "lote": "", "numero_camara": None, "otro": "x"})
        assert d == {"tipo_muestra": "Fruta"}

    def test_none(self):
        assert datos_de_toma(None) == {}


class TestConstruirFicha:
    def test_une_producto_y_dosis_por_analito(self):
        sol = {"id": 1, "nro_solicitud": "AGF0001", "fecha_muestreo": date(2026, 9, 24), "cliente": "Dole", "planta": "Lontué"}
        res = [
            {"analito_id": 5, "analito_raw": "FLUD", "codigo": "FLUD", "nombre": "Fludioxonil", "valor_num": Decimal("1.5"), "unidad": None},
            {"analito_id": None, "analito_raw": "tebu", "codigo": "tebu", "nombre": "tebu", "valor_texto": "ND"},
        ]
        prod = [
            {"analito_id": 5, "producto_raw": "Actimist", "dosis": Decimal("2")},
            {"analito_id": None, "analito_raw": "TEBU", "producto_raw": "Otro"},
        ]
        f = construir_ficha(sol, res, prod, None, {}, None)
        assert f["solicitud"]["fecha_muestreo"] == "2026-09-24"
        por = {r["codigo"]: r for r in f["resultados"]}
        assert por["FLUD"]["producto"] == "Actimist" and por["FLUD"]["dosis"] == 2.0
        assert por["FLUD"]["valor_num"] == 1.5 and por["FLUD"]["unidad"] == "ppm"
        assert por["tebu"]["producto"] == "Otro" and por["tebu"]["valor_texto"] == "ND"
        assert f["toma"] is None and f["carga"] is None
        assert f["pdf"] == {"disponible": False}

    def test_pdf_disponible(self):
        f = construir_ficha({"id": 1}, [], [], {"archivo": "a.xlsx"}, {"lote": "L1"}, {"nombre": "x.pdf", "origen": "informes", "clave": "k"})
        assert f["pdf"] == {"disponible": True, "nombre": "x.pdf", "origen": "informes"}
        assert "clave" not in f["pdf"]
        assert f["toma"] == {"lote": "L1"} and f["carga"] == {"archivo": "a.xlsx"}
