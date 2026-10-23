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


class TestFichaParaCliente:
    """La ficha del informe la abre también un cliente o un comercial, acotada a lo suyo y sin datos internos."""

    def _cursor(self, hay_fila: bool):
        class Cur:
            consultas: list = []

            def execute(self, sql, params=None):
                self.consultas.append((sql, params))

            def fetchone(self):
                return {"?column?": 1} if hay_fila else None

        Cur.consultas = []
        return Cur()

    def _cliente(self):
        from app.auth import Usuario
        return Usuario(id="5", email="c@x.cl", nombre="C", tipoAcceso="cliente", clienteNombre="DOLE", plantaNombre="DOLE LONTUE")

    def test_quita_lo_interno(self):
        from app.ficha_informe import para_cliente
        sol = {"id": 1, "nro_solicitud": "AGF0001", "email_solicitante": "a@b.cl", "generado_por": "x", "referencia": "OT-1", "solicitante": "S", "nombre_muestreador": "M", "especie": "Manzana"}
        f = construir_ficha(sol, [], [], {"archivo": "a.xlsx"}, {"lote": "L1"}, None)
        c = para_cliente(f)
        assert c["solicitud"]["nro_solicitud"] == "AGF0001" and c["solicitud"]["especie"] == "Manzana"
        for campo in ("email_solicitante", "generado_por", "referencia", "solicitante", "nombre_muestreador"):
            assert campo not in c["solicitud"]
        assert c["carga"] is None and c["toma"] is None

    def test_un_cliente_solo_ve_su_planta(self):
        import pytest
        from fastapi import HTTPException
        from app.ficha_informe import _exigir_alcance
        cur = self._cursor(hay_fila=True)
        _exigir_alcance(cur, self._cliente(), 7)
        sql, params = cur.consultas[0]
        assert params["sid"] == 7 and params["cliente"] == "DOLE" and params["planta"] == "DOLE LONTUE"
        with pytest.raises(HTTPException) as e:
            _exigir_alcance(self._cursor(hay_fila=False), self._cliente(), 8)
        assert e.value.status_code == 404

    def test_un_comercial_sin_plantas_no_ve_nada_y_el_interno_pasa_sin_consulta(self):
        import pytest
        from fastapi import HTTPException
        from app.auth import Usuario
        from app.ficha_informe import _exigir_alcance
        com = Usuario(id="9", email="c@a.com", nombre="C", tipoAcceso="comercial", plantasAsignadas=[])
        cur = self._cursor(hay_fila=False)
        with pytest.raises(HTTPException):
            _exigir_alcance(cur, com, 1)
        assert "FALSE" in cur.consultas[0][0]
        interno = Usuario(id="1", email="j@a.com", nombre="J", tipoAcceso="admin_general")
        cur = self._cursor(hay_fila=False)
        _exigir_alcance(cur, interno, 1)
        assert cur.consultas == []

    def test_el_router_ya_no_exige_ser_interno_pero_si_sesion(self):
        from app.auth import usuario_actual, solo_interno
        from app.ficha_informe import router
        deps = [d.dependency for d in router.dependencies]
        assert usuario_actual in deps and solo_interno not in deps


class TestTipoAplicacion:
    """El servicio real del informe, y no el «tipo_servicio» viejo (que dejaba los Ecofog como Línea de proceso)."""

    def _ficha(self, sol, toma=None, prod=None):
        return construir_ficha({"id": 1, "nro_solicitud": "2026-1908-PC", **sol}, [], prod or [], None, toma, None)["solicitud"]

    def test_manda_el_servicio_guardado_al_cargar(self):
        assert self._ficha({"servicio": "ecofog", "tipo_servicio": "Linea de Proceso"})["tipo_aplicacion"] == "Ecofog"
        assert self._ficha({"servicio": "actimist"})["tipo_aplicacion"] == "Actimist"
        assert self._ficha({"servicio": "ryd"})["tipo_aplicacion"] == "RYD"

    def test_un_informe_antiguo_se_deduce_de_su_solicitud(self):
        toma = {"campos_laboratorio": {"Tipo Aplicación": "Ecofog"}}
        assert self._ficha({"servicio": None, "tipo_servicio": "Linea de Proceso"}, toma)["tipo_aplicacion"] == "Ecofog"

    def test_si_no_hay_dato_es_linea_de_proceso(self):
        assert self._ficha({"servicio": None})["tipo_aplicacion"] == "Línea de proceso"

    def test_ya_no_se_muestra_el_tipo_de_servicio_viejo(self):
        assert "tipo_servicio" not in self._ficha({"servicio": "ecofog", "tipo_servicio": "Cromatografía"})
