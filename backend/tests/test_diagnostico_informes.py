"""Diagnóstico de informes de Report: cada regla con su caso (y su caso limpio)."""
from datetime import date

from app import diagnostico_informes as di


def inf(**kw):
    base = {"id": 1, "nro_solicitud": "2026-1908-PC", "laboratorio": "Quiteca", "referencia": "OT-QUI0049", "servicio": None, "tipo_servicio": "Linea de Proceso",
            "sold_to": "AGRICOLA X", "ship_to": "PLANTA X", "planta_id": 5, "especie": "Manzana", "fecha_muestreo": date(2026, 10, 8),
            "fecha_recepcion": date(2026, 10, 8), "fecha_entrada": date(2026, 10, 8), "fecha_analisis": date(2026, 10, 8), "fecha_informe": date(2026, 10, 9)}
    base.update(kw)
    return base


def res(codigo="FDL", valor=1.0, **kw):
    return {"analito_id": 1, "analito_raw": codigo, "codigo": codigo, "valor_num": valor, "valor_texto": None, **kw}


def toma(tipo="Línea de proceso", **kw):
    base = {"laboratorio": "Quiteca", "sold_to": "AGRICOLA X", "ship_to": "PLANTA X", "especie": "Manzana", "fecha_muestreo": date(2026, 10, 8),
            "datos": {"campos_laboratorio": {"Tipo Aplicación": tipo}, "analitos_solicitados": ["FDL"]}}
    base.update(kw)
    return base


def codigos(hs):
    return [h["codigo"] for h in hs]


def test_un_informe_limpio_no_tiene_hallazgos_graves():
    hs = di.revisar(inf(), [res()], toma())
    assert [h for h in hs if h["gravedad"] != di.INFO] == []


class TestServicio:
    def test_ecofog_guardado_como_linea_se_marca(self):
        hs = di.revisar(inf(servicio=None), [res()], toma("Ecofog"))
        h = next(h for h in hs if h["codigo"] == "SERVICIO_SIN_CLASIFICAR")
        assert h["gravedad"] == di.ALTO and "Ecofog" in h["detalle"]

    def test_servicio_distinto(self):
        hs = di.revisar(inf(servicio="actimist"), [res()], toma("Ecofog"))
        assert "SERVICIO_DISTINTO" in codigos(hs)

    def test_ecofog_bien_clasificado_no_alerta(self):
        hs = di.revisar(inf(servicio="ecofog", planta_id=None), [res()], toma("Ecofog"))
        assert "SERVICIO_DISTINTO" not in codigos(hs) and "SERVICIO_SIN_CLASIFICAR" not in codigos(hs) and "SIN_PLANTA" not in codigos(hs)

    def test_fogger_es_actimist(self):
        assert "SERVICIO_DISTINTO" not in codigos(di.revisar(inf(servicio="actimist"), [res()], toma("FOGGER")))

    def test_el_campo_viejo_se_avisa_como_info(self):
        h = next(h for h in di.revisar(inf(servicio="ecofog", planta_id=None), [res()], toma("Ecofog")) if h["codigo"] == "TIPO_SERVICIO_VIEJO")
        assert h["gravedad"] == di.INFO


class TestContraLaSolicitud:
    def test_sin_ot(self):
        assert "SIN_OT" in codigos(di.revisar(inf(referencia=None), [res()], None))

    def test_ot_que_no_existe(self):
        assert "OT_SIN_SOLICITUD" in codigos(di.revisar(inf(), [res()], None))

    def test_laboratorio_sold_to_ship_to_especie_y_fecha(self):
        hs = di.revisar(inf(), [res()], toma(laboratorio="ALS", sold_to="OTRO", ship_to="OTRA", especie="Pera", fecha_muestreo=date(2026, 10, 9)))
        assert {"LABORATORIO_DISTINTO", "SOLD_TO_DISTINTO", "SHIP_TO_DISTINTO", "ESPECIE_DISTINTA", "FECHA_MUESTREO_DISTINTA"} <= set(codigos(hs))

    def test_nombres_con_distinto_formato_son_iguales(self):
        assert "SHIP_TO_DISTINTO" not in codigos(di.revisar(inf(ship_to="Planta-X"), [res()], toma(ship_to="PLANTA  X")))


class TestConsistencia:
    def test_falta_dato(self):
        assert "FALTA_DATO" in codigos(di.revisar(inf(especie=None), [res()], toma()))

    def test_sin_planta_en_linea_de_proceso(self):
        assert "SIN_PLANTA" in codigos(di.revisar(inf(planta_id=None), [res()], toma()))

    def test_fechas(self):
        assert "FECHAS_NO_CUADRAN" in codigos(di.revisar(inf(fecha_informe=date(2026, 10, 1)), [res()], toma()))
        assert "FECHA_RARA" in codigos(di.revisar(inf(fecha_muestreo=date(2020, 1, 1)), [res()], None))

    def test_sin_resultados(self):
        assert "SIN_RESULTADOS" in codigos(di.revisar(inf(), [], toma()))

    def test_valores_raros(self):
        assert "VALOR_RARO" in codigos(di.revisar(inf(), [res(valor=-1)], toma()))
        assert "VALOR_RARO" in codigos(di.revisar(inf(), [res(valor=2500)], toma()))
        assert "VALOR_VACIO" in codigos(di.revisar(inf(), [res(valor=None)], toma()))

    def test_resultado_sin_catalogo_y_repetido(self):
        hs = di.revisar(inf(), [res(analito_id=None), res()], toma())
        assert "RESULTADO_SIN_CATALOGO" in codigos(hs) and "ANALITO_REPETIDO" in codigos(hs)

    def test_pedido_vs_informado(self):
        hs = di.revisar(inf(), [res("IMZ")], toma())
        assert "PEDIDO_SIN_RESULTADO" in codigos(hs) and "RESULTADO_NO_PEDIDO" in codigos(hs)


class TestPdf:
    def leido(self, **datos):
        return {"datos": {"OT": "OT-QUI0049", "Fecha Muestreo": "08-10-2026", "Especie": "Manzana", **datos}, "resultados": {"FDL ppm": "1,0"}}

    def test_pdf_que_coincide(self):
        assert [h for h in di.revisar(inf(), [res()], toma(), self.leido()) if h["codigo"].startswith("PDF_")] == []

    def test_resultado_distinto_o_faltante_o_sobrante(self):
        hs = di.revisar(inf(), [res(valor=1.7), res("IMZ", 2.0)], toma(), {**self.leido(), "resultados": {"FDL ppm": "1,0", "TBZ ppm": "3,0"}})
        assert {"PDF_RESULTADO_DISTINTO", "PDF_RESULTADO_FALTA", "PDF_RESULTADO_SOBRA"} <= set(codigos(hs))

    def test_fecha_y_ot_distintas(self):
        hs = di.revisar(inf(), [res()], toma(), self.leido(OT="OT-QUI0050", **{"Fecha Muestreo": "10-08-2026"}))
        assert {"PDF_OT_DISTINTA", "PDF_FECHA_DISTINTA"} <= set(codigos(hs))

    def test_pdf_que_no_se_pudo_leer(self):
        assert "PDF_NO_LEIDO" in codigos(di.revisar(inf(), [res()], toma(), None))

    def test_sin_pedirlo_no_se_mira_el_pdf(self):
        assert not any(c.startswith("PDF_") for c in codigos(di.revisar(inf(), [res()], toma())))

    def test_menor_que_se_compara_como_texto(self):
        r = {"analito_id": 1, "analito_raw": "ECOLI", "codigo": "ECOLI", "valor_num": None, "valor_texto": "<1"}
        assert not any(c.startswith("PDF_") for c in codigos(di.revisar(inf(laboratorio="ALS"), [r], None, {"datos": {}, "resultados": {"ECOLI": "<1"}})))


def test_los_graves_van_primero():
    hs = di.revisar(inf(planta_id=None, referencia=None), [], None)
    assert hs[0]["gravedad"] == di.ALTO and hs[-1]["gravedad"] in (di.MEDIO, di.INFO)


def test_con_un_pdf_real_de_agrofresh_lo_guardado_coincide_y_un_valor_cambiado_se_detecta():
    """Se relee el PDF real (el mismo lector del Converter) y se compara contra lo que quedó en la base."""
    import email
    from email import policy
    from pathlib import Path

    from app import correo_informes_homogeneo as hom

    eml = Path(__file__).parent / "fixtures" / "correos" / "agrofresh_47.eml"
    msg = email.message_from_bytes(eml.read_bytes(), policy=policy.default)
    pdf = next(p.get_payload(decode=True) for p in msg.walk() if (p.get_filename() or "").lower().endswith(".pdf"))
    leido = hom.leer(pdf, "AgroFresh")

    informe = inf(laboratorio="Agrofresh", referencia="OT-AGF0102", especie="Limón", fecha_muestreo=date(2026, 10, 6), nro_solicitud="AGF2026-47")
    bien = di.comparar_con_pdf(informe, [res("TBZ", 0.85)], leido)
    assert bien == []
    mal = di.comparar_con_pdf(informe, [res("TBZ", 0.58)], leido)
    assert [h["codigo"] for h in mal] == ["PDF_RESULTADO_DISTINTO"] and "0,85" in mal[0]["detalle"]
    cambiado = di.comparar_con_pdf(inf(laboratorio="Agrofresh", referencia="OT-AGF0102", fecha_muestreo=date(2026, 6, 10)), [res("TBZ", 0.85)], leido)
    assert "PDF_FECHA_DISTINTA" in [h["codigo"] for h in cambiado]
