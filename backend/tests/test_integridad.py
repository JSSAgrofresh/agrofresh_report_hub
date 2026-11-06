"""Motor de integridad: solicitud contra informe, por laboratorio (puro, sin base)."""
from datetime import date

from app import integridad as it

HOY = date(2026, 11, 6)


def _toma(ot="OT-QUI0001", lab="Quiteca", **extra):
    datos = {"analitos_solicitados": ["FDL", "PYR"], "campos_laboratorio": {}, "lote": "L7", "numero_orden": "55", **extra.pop("datos", {})}
    return {"ot": ot, "laboratorio": lab, "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": "Manzana",
            "fecha_muestreo": date(2026, 10, 20), "enviado_en": date(2026, 10, 21), "datos": datos, **extra}


def _inf(id=1, ot="OT-QUI0001", lab="Quiteca", **extra):
    base = {"id": id, "nro_solicitud": "2026-1900-PC", "laboratorio": lab, "referencia": ot, "servicio": None, "planta_id": 1,
            "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": "Manzana", "fecha_muestreo": date(2026, 10, 20),
            "lote": "L7", "nro_orden": "55"}
    base.update(extra)
    return base


def _res(*codigos):
    return [{"codigo": c, "analito_raw": c, "analito_id": 1, "valor_num": 0.1, "valor_texto": None} for c in codigos]


def _correr(tomas, informes, resultados=None, productos=None, plazos=None):
    return it.analizar(tomas, informes, resultados or {}, productos or {}, [], plazos or {}, hoy=HOY)


def _codigos(r):
    return {h["codigo"] for h in r["hallazgos"]}


def test_informe_completo_no_da_hallazgos():
    r = _correr([_toma()], [_inf()], {1: _res("FDL", "PYR")})
    assert r["hallazgos"] == []
    assert r["resumen"]["con_informe"] == 1 and r["resumen"]["informes_limpios"] == 1


def test_analito_pedido_que_no_viene_es_alto():
    r = _correr([_toma()], [_inf()], {1: _res("FDL")})
    h = [h for h in r["hallazgos"] if h["codigo"] == "ANALITO_FALTA"]
    assert h and h[0]["gravedad"] == it.ALTO and "PYR" in h[0]["detalle"]


def test_analito_de_mas_y_alias_de_catalogo():
    toma = _toma(datos={"analitos_solicitados": ["ECOLI"]})
    r = _correr([toma], [_inf(lab="ALS")], {1: _res("ECOLI100", "COLIF100")})
    assert "ANALITO_DE_MAS" in _codigos(r) and "ANALITO_FALTA" not in _codigos(r)


def test_varios_informes_de_una_ot_se_suman():
    r = _correr([_toma()], [_inf(1), _inf(2, nro_solicitud="2026-1901-PC")], {1: _res("FDL"), 2: _res("PYR")})
    assert "ANALITO_FALTA" not in _codigos(r)


def test_rotulacion_distinta_y_faltante():
    r = _correr([_toma()], [_inf(lote="L9", nro_orden=None)], {1: _res("FDL", "PYR")})
    assert "ROTULACION_DISTINTA" in _codigos(r) and "ROTULACION_FALTA" in _codigos(r)


def test_diagnofruit_no_reclama_rotulacion():
    r = _correr([_toma(lab="Diagnofruit")], [_inf(lab="Diagnofruit", lote=None, nro_orden=None)], {1: _res("FDL", "PYR")})
    assert not {"ROTULACION_FALTA", "ROTULACION_DISTINTA"} & _codigos(r)


def test_posicion_con_varias_posiciones_acepta_una_de_ellas():
    toma = _toma(datos={"posicion_muestreo": "R1, R2", "lote": None, "numero_orden": None})
    r = _correr([toma], [_inf(posicion_muestreo="R2", lote=None, nro_orden=None)], {1: _res("FDL", "PYR")})
    assert "ROTULACION_DISTINTA" not in _codigos(r)


def test_dosis_distinta_y_falta():
    catalogo = [{"codigo": "FDL", "nombre": "Fludioxonil", "unidad": "ppm", "laboratorio": "QUITECA", "activo": True, "orden": 1},
                {"codigo": "PYR", "nombre": "Pirimetanil", "unidad": "ppm", "laboratorio": "QUITECA", "activo": True, "orden": 2}]
    toma = _toma(datos={"campos_laboratorio": {"Fludioxonil (ppm)": "300", "Pirimetanil (ppm)": "200"}})
    prods = {1: [{"codigo": "FDL", "analito_raw": "FDL", "dosis": 250}]}
    r = it.analizar([toma], [_inf()], {1: _res("FDL", "PYR")}, prods, catalogo, {}, hoy=HOY)
    assert {"DOSIS_DISTINTA", "DOSIS_FALTA"} <= _codigos(r)


def test_sin_informe_dentro_y_fuera_de_plazo():
    dentro = _correr([_toma()], [], plazos={"QUITECA": 20})
    fuera = _correr([_toma()], [], plazos={"QUITECA": 5})
    assert dentro["hallazgos"] == [] and dentro["resumen"]["sin_informe"] == 1
    assert [h["codigo"] for h in fuera["hallazgos"]] == ["INFORME_ATRASADO"] and fuera["resumen"]["atrasadas"] == 1


def test_sin_plazo_cargado_avisa_pasados_los_dias_base():
    r = _correr([_toma()], [])
    assert _codigos(r) == {"SIN_INFORME"}


def test_pruebas_y_no_enviadas_se_ignoran():
    r = _correr([_toma(datos={"es_prueba": True}), _toma(ot="OT-QUI0002", enviado_en=None)], [])
    assert r["hallazgos"] == [] and r["resumen"]["solicitudes_enviadas"] == 0


def test_informe_con_ot_inexistente():
    r = _correr([_toma()], [_inf(2, ot="OT-QUI9999")], {2: _res("FDL")})
    assert "OT_SIN_SOLICITUD" in _codigos(r)


def test_ot_por_pdf_amarrado_cuando_el_informe_no_la_guardo():
    inf = _inf(referencia=None)
    r = it.analizar([_toma()], [inf], {1: _res("FDL", "PYR")}, {}, [], {}, hoy=HOY, ot_de_informe={("quiteca", "2026-1900-PC"): "OT-QUI0001"})
    assert r["resumen"]["con_informe"] == 1


def test_resumen_por_laboratorio_y_filtro():
    tomas = [_toma(), _toma(ot="OT-ALS0001", lab="ALS", datos={"analitos_solicitados": ["ECOLI"]})]
    infs = [_inf(), _inf(2, ot="OT-ALS0001", lab="ALS", nro_solicitud="INF-9")]
    r = _correr(tomas, infs, {1: _res("FDL"), 2: _res("ECOLI100")})
    por = {l["laboratorio"]: l for l in r["laboratorios"]}
    assert por["Quiteca"]["altos"] >= 1 and por["ALS"]["con_informe"] == 1
    assert all(h["laboratorio"] == "Quiteca" for h in it.hallazgos_de(r, "quiteca"))


def test_dias_habiles_no_cuenta_fines_de_semana():
    assert it.dias_habiles(date(2026, 11, 6), date(2026, 11, 9)) == 1     # viernes → lunes
    assert it.dias_habiles(date(2026, 11, 9), date(2026, 11, 6)) == 0


# ── PDF, Excel y acceso ──────────────────────────────────────────────────────

def _resultado_con_errores():
    tomas = [_toma(), _toma(ot="OT-QUI0002", enviado_en=date(2026, 10, 1))]
    return _correr(tomas, [_inf(lote="L9")], {1: _res("FDL")}, plazos={"QUITECA": 5})


def test_pdf_por_laboratorio_sale_valido_y_sin_errores_tambien():
    from app import integridad_pdf as pdf

    r = _resultado_con_errores()
    solo_quiteca = [h for h in it.hallazgos_de(r, "Quiteca") if h["gravedad"] != it.INFO]
    contenido = pdf.generar_pdf("Quiteca", r, solo_quiteca, "Jorge", "2026-11-06T10:00:00")
    assert contenido.startswith(b"%PDF") and len(contenido) > 2000
    vacio = pdf.generar_pdf("Quiteca", {"laboratorios": []}, [], "Jorge")
    assert vacio.startswith(b"%PDF")


def test_excel_lleva_resumen_y_hallazgos():
    from io import BytesIO

    from openpyxl import load_workbook

    from app import integridad_pdf as pdf

    r = _resultado_con_errores()
    wb = load_workbook(BytesIO(pdf.generar_excel("Quiteca", r, it.hallazgos_de(r, "Quiteca"))))
    assert wb.sheetnames == ["Resumen", "Hallazgos"]
    assert wb["Hallazgos"].max_row == 1 + len(it.hallazgos_de(r, "Quiteca"))


def test_solo_el_principal_entra():
    import pytest
    from fastapi import HTTPException

    from app.auth import Usuario
    from app.integridad_api import exigir_principal

    def u(email, tipo):
        return Usuario(id="1", email=email, nombre="X", tipoAcceso=tipo, area="general", modulos=[])

    assert exigir_principal(u("jorge.sandoval@agrofresh.com", "admin_general"))
    with pytest.raises(HTTPException) as e:
        exigir_principal(u("otro@agrofresh.com", "admin_general"))
    assert e.value.status_code == 403


def test_todas_las_rutas_de_integridad_exigen_al_principal():
    from app.integridad_api import router

    for ruta in router.routes:
        dependencias = [d.call.__name__ for d in ruta.dependant.dependencies]
        assert "exigir_principal" in dependencias, ruta.path
