"""Registro de todos los informes: una fila por solicitud y su informe, cómo se cargó y qué salió mal."""
from datetime import date, datetime, timezone

from app import registro_informes as ri

T = lambda d, h=12: datetime(2026, 10, d, h, 0, tzinfo=timezone.utc)  # noqa: E731


def informe(**kw):
    base = {"id": 1, "nro_solicitud": "2026-1908-PC", "laboratorio": "Quiteca", "referencia": "OT-QUI0049", "servicio": "ecofog", "origen": "converter",
            "tipo_servicio": "Linea de Proceso", "especie": "Manzana", "variedad": None, "planta_id": None, "fecha_muestreo": date(2026, 10, 8),
            "fecha_entrada": date(2026, 10, 8), "fecha_recepcion": date(2026, 10, 8), "fecha_informe": date(2026, 10, 9), "fecha_analisis": date(2026, 10, 8),
            "sold_to": "AGRICOLA X", "ship_to": "PLANTA X", "cargado_en": T(13), "cargado_por": "Jorge", "carga_origen": "converter", "carga_archivo": "x.pdf"}
    base.update(kw)
    return base


def toma(**kw):
    base = {"archivo": "OT-QUI0049.xlsx", "laboratorio": "Quiteca", "sold_to": "AGRICOLA X", "ship_to": "PLANTA X", "especie": "Manzana",
            "fecha_muestreo": date(2026, 10, 8), "emitida": T(1), "tipo_aplicacion": "Ecofog",
            "datos": {"campos_laboratorio": {"Tipo Aplicación": "Ecofog"}, "analitos_solicitados": ["FDL"]}}
    base.update(kw)
    return base


RES = {1: [{"analito_id": 1, "analito_raw": "FDL", "codigo": "FDL", "valor_num": 1.0, "valor_texto": None}]}


def correo(**kw):
    base = {"id": 7, "laboratorio": "Quiteca", "nro_informe": "2026-1908-PC", "ot": "OT-QUI0049", "llegada_en": T(10), "estado": "ok", "decision": "aceptado",
            "decidido_por": "jorge@x.cl", "resuelto_en": None, "hallazgos": [], "carga_id": 3, "homogeneo": True, "envios": 1, "tuvo_incidente": False,
            "sold_to": "AGRICOLA X", "ship_to": "PLANTA X", "especie": "Manzana", "fecha_muestreo": date(2026, 10, 8)}
    base.update(kw)
    return base


def armar(informes=None, tomas=None, correos=None, enviadas=None, clientes=None, auditoria=None, resultados=RES):
    return ri.armar_registro(informes if informes is not None else [informe()], resultados, {"OT-QUI0049": toma()} if tomas is None else tomas,
                             correos or [], enviadas if enviadas is not None else {"OT-QUI0049.xlsx": T(2)}, clientes or {}, auditoria or {})


def test_un_informe_cargado_a_mano_trae_su_solicitud_sus_fechas_y_quien_lo_cargo():
    (f,) = armar()
    assert f["situacion"] == "cargado" and f["origen"] == "manual" and f["cargado_por"] == "Jorge"
    assert (f["ot"], f["informe"], f["tipo_aplicacion"]) == ("OT-QUI0049", "2026-1908-PC", "Ecofog")
    assert f["emitida"].startswith("2026-10-01") and f["enviada_lab"].startswith("2026-10-02") and f["cargado"].startswith("2026-10-13")
    assert f["fecha_muestreo"] == "2026-10-08" and f["fecha_informe"] == "2026-10-09"
    assert f["problemas"] == []


class TestOrigen:
    def test_aceptado_desde_el_correo_es_automatico(self):
        (f,) = armar(correos=[correo()], informes=[informe(origen="correo", carga_origen="correo")])
        assert f["origen"] == "automatica" and f["llegada_por"] == "correo" and f["llegada"].startswith("2026-10-10")

    def test_los_demas_origenes(self):
        for origen, esperado in (("converter", "manual"), ("emitir_cromatografia", "ingreso_lab"), ("ingest", "excel"), (None, "sin_registro")):
            (f,) = armar(informes=[informe(origen=origen, carga_origen=None)])
            assert f["origen"] == esperado, origen

    def test_si_la_solicitud_no_dice_se_usa_el_origen_de_la_carga(self):
        (f,) = armar(informes=[informe(origen=None, carga_origen="converter")])
        assert f["origen"] == "manual"


class TestProblemas:
    def test_un_envio_en_rojo_sin_resolver_es_grave(self):
        c = correo(estado="rojo", hallazgos=[{"nivel": "rojo", "codigo": "destinatarios_ajenos", "texto": "Salió a gente que no está en la lista"}])
        (f,) = armar(correos=[c])
        p = next(p for p in f["problemas"] if p["origen"] == "envio")
        assert p["gravedad"] == "alto" and "no está en la lista" in p["texto"]

    def test_resuelto_baja_a_info(self):
        c = correo(estado="rojo", resuelto_en=T(12), hallazgos=[{"nivel": "rojo", "codigo": "x", "texto": "t"}])
        (f,) = armar(correos=[c])
        assert next(p for p in f["problemas"] if p["origen"] == "envio")["gravedad"] == "info"

    def test_un_amarillo_es_medio_y_un_info_no_aparece(self):
        c = correo(hallazgos=[{"nivel": "amarillo", "codigo": "falta", "texto": "Falta alguien"}, {"nivel": "info", "codigo": "i", "texto": "ya llegó antes"}])
        (f,) = armar(correos=[c])
        assert [(p["gravedad"], p["texto"]) for p in f["problemas"]] == [("medio", "Falta alguien")]

    def test_el_diagnostico_de_datos_se_suma(self):
        (f,) = armar(informes=[informe(fecha_entrada=date(2002, 10, 26))])
        assert any(p["origen"] == "datos" and p["codigo"] == "FECHAS_NO_CUADRAN" for p in f["problemas"])

    def test_informe_corregido_por_reenvio(self):
        (f,) = armar(correos=[correo(tuvo_incidente=True, estado="ok")])
        assert any(p["codigo"] == "correo_corregido" and p["gravedad"] == "info" for p in f["problemas"])


class TestFilasQueNoEstanEnReport:
    def test_un_correo_pendiente_es_una_fila_por_aceptar(self):
        c = correo(id=9, nro_informe="2026-1999-PC", ot="OT-QUI0049", decision="pendiente", carga_id=None)
        filas = armar(informes=[], correos=[c])
        f = next(f for f in filas if f["id"] == "correo-9")
        assert f["situacion"] == "por_aceptar" and f["origen"] == "sin_cargar" and f["cargado"] is None

    def test_un_rechazado_se_ve(self):
        f = next(f for f in armar(informes=[], correos=[correo(decision="rechazado", carga_id=None)]) if f["id"].startswith("correo-"))
        assert f["situacion"] == "rechazado"

    def test_aceptado_pero_ausente_de_report_se_marca(self):
        f = next(f for f in armar(informes=[], correos=[correo()]) if f["id"].startswith("correo-"))
        assert any(p["codigo"] == "aceptado_sin_report" and p["gravedad"] == "alto" for p in f["problemas"])

    def test_una_solicitud_enviada_sin_informe_espera(self):
        filas = armar(informes=[], correos=[])
        (f,) = filas
        assert f["situacion"] == "esperando" and f["informe"] is None and f["enviada_lab"].startswith("2026-10-02")

    def test_una_solicitud_que_nunca_salio_al_laboratorio_no_aparece(self):
        assert armar(informes=[], enviadas={}) == []

    def test_una_solicitud_con_informe_no_se_repite_como_esperando(self):
        assert [f["situacion"] for f in armar()] == ["cargado"]


def test_el_envio_al_cliente_sale_de_la_solicitud():
    (f,) = armar(clientes={"OT-QUI0049.xlsx": T(14)})
    assert f["enviado_cliente"].startswith("2026-10-14")


def test_un_informe_sin_ot_igual_aparece():
    (f,) = armar(informes=[informe(referencia=None)], tomas={}, enviadas={})
    assert f["ot"] is None and f["situacion"] == "cargado" and any(p["codigo"] == "SIN_OT" for p in f["problemas"])


def test_el_mismo_informe_de_correo_y_report_es_una_sola_fila():
    filas = armar(correos=[correo()])
    assert [f["situacion"] for f in filas] == ["cargado"] and filas[0]["correo_id"] == 7
