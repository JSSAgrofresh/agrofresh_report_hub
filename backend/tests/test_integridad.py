"""Motor de integridad: solicitud contra informe, por laboratorio (puro, sin base)."""
from datetime import date

from app import integridad as it

HOY = date(2026, 11, 6)


def _toma(ot="OT-QUI0001", lab="Quiteca", **extra):
    datos = {"analitos_solicitados": ["FDL", "PYR"], "campos_laboratorio": {}, "lote": "L7", "numero_orden": "55", **extra.pop("datos", {})}
    return {"ot": ot, "laboratorio": lab, "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": "Manzana",
            "fecha_muestreo": date(2026, 10, 20), "datos": datos, **extra}


def _inf(id=1, ot="OT-QUI0001", lab="Quiteca", **extra):
    base = {"id": id, "nro_solicitud": "2026-1900-PC", "laboratorio": lab, "referencia": ot, "servicio": None, "planta_id": 1,
            "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": "Manzana", "fecha_muestreo": date(2026, 10, 20),
            "lote": "L7", "nro_orden": "55"}
    base.update(extra)
    return base


def _res(*codigos):
    return [{"codigo": c, "analito_raw": c, "analito_id": 1, "valor_num": 0.1, "valor_texto": None} for c in codigos]


def _correr(tomas, informes, resultados=None, productos=None):
    return it.analizar(tomas, informes, resultados or {}, productos or {}, [], hoy=HOY)


def _codigos(r):
    return {h["codigo"] for h in r["hallazgos"]}


def test_informe_completo_no_da_hallazgos():
    r = _correr([_toma()], [_inf()], {1: _res("FDL", "PYR")})
    assert r["hallazgos"] == []
    assert r["resumen"]["solicitudes_revisadas"] == 1 and r["resumen"]["informes_limpios"] == 1


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


def test_dosis_sin_lectura_del_pdf_no_se_reclama_pero_si_report_la_contradice():
    catalogo = [{"codigo": "FDL", "nombre": "Fludioxonil", "unidad": "ppm", "laboratorio": "QUITECA", "activo": True, "orden": 1},
                {"codigo": "PYR", "nombre": "Pirimetanil", "unidad": "ppm", "laboratorio": "QUITECA", "activo": True, "orden": 2}]
    toma = _toma(datos={"campos_laboratorio": {"Fludioxonil (ppm)": "300", "Pirimetanil (ppm)": "200"}})
    prods = {1: [{"codigo": "FDL", "analito_raw": "FDL", "dosis": 250}]}
    r = it.analizar([toma], [_inf()], {1: _res("FDL", "PYR")}, prods, catalogo, hoy=HOY)
    assert "DOSIS_DISTINTA" in _codigos(r)                       # Report guardó 250 y la solicitud dice 300: contradicción real
    sin = [h for h in r["hallazgos"] if h["codigo"] == "DOSIS_SIN_VERIFICAR"]
    assert sin and sin[0]["gravedad"] == it.INFO and "PYR" in sin[0]["detalle"]     # sin dosis en Report ni PDF leído: no es reclamo
    assert "DOSIS_FALTA" not in _codigos(r)


def test_solicitud_sin_informe_y_pruebas_no_son_de_este_apartado():
    r = _correr([_toma(), _toma(ot="OT-QUI0002", datos={"es_prueba": True})], [])
    assert r["hallazgos"] == [] and r["resumen"]["solicitudes_revisadas"] == 0 and r["laboratorios"] == []


def test_informe_con_ot_inexistente():
    r = _correr([_toma()], [_inf(2, ot="OT-QUI9999")], {2: _res("FDL")})
    assert "OT_SIN_SOLICITUD" in _codigos(r)


def test_ot_por_pdf_amarrado_cuando_el_informe_no_la_guardo():
    inf = _inf(referencia=None)
    r = it.analizar([_toma()], [inf], {1: _res("FDL", "PYR")}, {}, [], hoy=HOY, ot_de_informe={("quiteca", "2026-1900-PC"): "OT-QUI0001"})
    assert r["resumen"]["solicitudes_revisadas"] == 1


def test_resumen_por_laboratorio_y_filtro():
    tomas = [_toma(), _toma(ot="OT-ALS0001", lab="ALS", datos={"analitos_solicitados": ["ECOLI"]})]
    infs = [_inf(), _inf(2, ot="OT-ALS0001", lab="ALS", nro_solicitud="INF-9")]
    r = _correr(tomas, infs, {1: _res("FDL"), 2: _res("ECOLI100")})
    por = {l["laboratorio"]: l for l in r["laboratorios"]}
    assert por["Quiteca"]["altos"] >= 1 and por["ALS"]["solicitudes_revisadas"] == 1
    assert all(h["laboratorio"] == "Quiteca" for h in it.hallazgos_de(r, "quiteca"))


# ── PDF, Excel y acceso ──────────────────────────────────────────────────────

def _resultado_con_errores():
    return _correr([_toma()], [_inf(lote="L9")], {1: _res("FDL")})


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


# ── Lectura completa del PDF de AgroFresh y comparación contra la solicitud (informes REALES) ───────────

import email
import email.policy
from pathlib import Path

from app import informe_campos as ic
from app.informe_lectura import texto_quiteca

FIX = Path(__file__).parent / "fixtures" / "correos"
NOMBRES = ["Fludioxonil", "Imazalil", "Tiabendazol", "Pirimetanil"]
CATALOGO = [{"codigo": "FDL", "nombre": "Fludioxonil", "unidad": "ppm", "laboratorio": "AGROFRESH", "activo": True, "orden": 1},
            {"codigo": "IMZ", "nombre": "Imazalil", "unidad": "ppm", "laboratorio": "AGROFRESH", "activo": True, "orden": 2},
            {"codigo": "TBZ", "nombre": "Tiabendazol", "unidad": "ppm", "laboratorio": "AGROFRESH", "activo": True, "orden": 3}]


def _pdf_eml(nombre_eml, empieza):
    m = email.message_from_binary_file(open(FIX / nombre_eml, "rb"), policy=email.policy.default)
    for p in m.walk():
        if (p.get_filename() or "").startswith(empieza):
            return texto_quiteca(p.get_payload(decode=True))
    raise AssertionError(empieza)


def test_el_lector_completo_saca_cada_dato_del_pdf_de_agrofresh():
    r = ic.leer_completo((FIX / "agrofresh_57.txt").read_text(), NOMBRES)
    m = r["muestra"]
    assert r["identificacion"]["ot"] == "OT-AGF0113" and r["identificacion"]["sold_to"] == "FRUTICOLA DOSAL LTDA"
    assert (m["lote"], m["codigo_productor"], m["codigo_packing"], m["producto_utilizado"], m["posicion_muestreo"]) == ("2", "3142832", "95790", "SCHOLAR", "Pozo Fungicida")
    assert m["variedad"] is None and m["numero_orden"] is None and m["kilos_procesados"] is None      # «—» = sin dato
    assert r["dosis"] == {"Fludioxonil": "150"} and r["resultados"] == {"Fludioxonil": "3,65"}
    assert r["recepcion"]["fecha_analisis"] == "28-10-2026"


def test_las_dosis_de_texto_libre_y_los_analitos_sin_dosis_de_otros_informes_reales():
    assert ic.leer_completo(_pdf_eml("agrofresh_47.eml", "AGF2026-47"), NOMBRES)["dosis"] == {"Tiabendazol": "6cc/l"}
    assert ic.leer_completo(_pdf_eml("agrofresh_48.eml", "AGF2026-48"), NOMBRES)["dosis"] == {"Fludioxonil": "4cc/l agua"}
    varios = ic.leer_completo(_pdf_eml("agrofresh_varios.eml", "AGF2026-2 "), NOMBRES)
    assert varios["dosis"] == {} and varios["muestra"]["producto_utilizado"] == "FUNGAZIL 500 EC, SCHOLAR"      # «Fludioxonil — Imazalil —»


def _caso_agf(campos, report=None, datos_extra=None, productos=None):
    datos = {"analitos_solicitados": ["FDL"], "campos_laboratorio": {"Fludioxonil (ppm)": "150"}, "lote": "2", "csg_productor": "3142832", "csg_packing": "95790",
             "posicion_muestreo": "Pozo Fungicida", "producto_utilizado": "SCHOLAR", **(datos_extra or {})}
    toma = {**_toma(ot="OT-AGF0113", lab="Agrofresh", datos=datos), "sold_to": "FRUTICOLA DOSAL LTDA", "ship_to": "FRUTICOLA DOSAL LTDA", "especie": "Cerezas",
            "fecha_muestreo": date(2026, 10, 23)}
    toma["datos"] = datos
    inf = _inf(ot="OT-AGF0113", lab="Agrofresh", **{"lote": None, "nro_orden": None, "sold_to": "FRUTICOLA DOSAL LTDA", "ship_to": "FRUTICOLA DOSAL LTDA",
                                                    "especie": "Cerezas", "fecha_muestreo": date(2026, 10, 23), **(report or {})})
    return it.analizar([toma], [inf], {1: _res("FDL")}, productos or {}, CATALOGO, hoy=HOY, campos_pdf={1: campos} if campos else None)


def _campos_57():
    return ic.leer_completo((FIX / "agrofresh_57.txt").read_text(), NOMBRES)


def test_caso_agf2026_57_el_pdf_trae_todo_lo_pedido_asi_que_no_hay_reclamo():
    r = _caso_agf(_campos_57())
    graves = [h for h in r["hallazgos"] if h["gravedad"] != it.INFO]
    assert graves == [], graves
    cod = _codigos(r)
    assert "DOSIS_NO_CARGADA" in cod and "ROTULACION_NO_CARGADA" in cod        # Report no lo guardó: es de la carga, informativo


def test_si_el_pdf_trae_otra_dosis_o_no_la_trae_se_reclama():
    mal = _campos_57()
    mal["dosis"] = {"Fludioxonil": "100"}
    assert "DOSIS_DISTINTA" in _codigos(_caso_agf(mal))
    sin = _campos_57()
    sin["dosis"] = {}
    assert "DOSIS_FALTA" in _codigos(_caso_agf(sin))


def test_dosis_de_texto_libre_se_compara_como_texto():
    campos = _campos_57()
    campos["dosis"] = {"Fludioxonil": "4 cc/l agua"}
    r = _caso_agf(campos, datos_extra={"campos_laboratorio": {"Fludioxonil (ppm)": "4cc/l agua"}})
    assert "DOSIS_DISTINTA" not in _codigos(r) and "DOSIS_FALTA" not in _codigos(r)


def test_rotulacion_del_pdf_distinta_o_ausente_es_reclamo_del_laboratorio():
    mal = _campos_57()
    mal["muestra"] = {**mal["muestra"], "lote": "9", "codigo_packing": None}
    h = {(x["codigo"], x["detalle"][:12]) for x in _caso_agf(mal)["hallazgos"]}
    assert ("ROTULACION_DISTINTA", "Lote: la sol") in h and ("ROTULACION_FALTA", "Código packi") in h


def test_producto_mixto_se_compara_con_la_lista_real():
    campos = _campos_57()
    campos["muestra"] = {**campos["muestra"], "producto_utilizado": "FUNGAZIL 500 EC, SCHOLAR"}
    r = _caso_agf(campos, datos_extra={"producto_utilizado": "MIXTO", "productos_lista": ["SCHOLAR", "FUNGAZIL 500 EC"]})
    assert not [h for h in r["hallazgos"] if "Producto" in h["detalle"]]


def test_identificacion_del_pdf_contra_la_solicitud():
    campos = _campos_57()
    campos["identificacion"] = {**campos["identificacion"], "sold_to": "OTRO CLIENTE"}
    campos["muestra"] = {**campos["muestra"], "fecha_muestreo": "24-10-2026"}
    det = " ".join(h["detalle"] for h in _caso_agf(campos)["hallazgos"] if h["codigo"] == "PDF_DATO_DISTINTO")
    assert "Sold To" in det and "Fecha de muestreo" in det


def test_sin_pdf_se_compara_con_lo_que_guardo_report():
    r = _caso_agf(None, report={"lote": "7"})
    assert any(h["codigo"] == "ROTULACION_DISTINTA" and "Lote" in h["detalle"] for h in r["hallazgos"])


def test_con_el_pdf_leido_los_analitos_informados_salen_del_pdf_no_de_report():
    campos = _campos_57()                       # el PDF trae Fludioxonil
    r = it.analizar([_caso_toma_agf()], [_caso_inf_agf()], {1: []}, {}, CATALOGO, hoy=HOY, campos_pdf={1: campos})   # Report sin resultados guardados
    assert "ANALITO_FALTA" not in _codigos(r)
    sin_pdf = it.analizar([_caso_toma_agf()], [_caso_inf_agf()], {1: []}, {}, CATALOGO, hoy=HOY)
    assert "ANALITO_FALTA" in _codigos(sin_pdf)


def _caso_toma_agf():
    return {**_toma(ot="OT-AGF0113", lab="Agrofresh", datos={"analitos_solicitados": ["FDL"], "campos_laboratorio": {}}),
            "sold_to": "FRUTICOLA DOSAL LTDA", "ship_to": "FRUTICOLA DOSAL LTDA", "especie": "Cerezas", "fecha_muestreo": date(2026, 10, 23)}


def _caso_inf_agf():
    return _inf(ot="OT-AGF0113", lab="Agrofresh", lote=None, nro_orden=None, sold_to="FRUTICOLA DOSAL LTDA", ship_to="FRUTICOLA DOSAL LTDA", especie="Cerezas", fecha_muestreo=date(2026, 10, 23))


def test_formato_del_informe_agrofresh_se_detecta_por_su_contenido():
    assert ic.leer_completo(_pdf_eml("agrofresh_varios.eml", "AGF2026-2 "), NOMBRES)["formato"] == 1
    assert ic.leer_completo(_pdf_eml("agrofresh_47.eml", "AGF2026-47"), NOMBRES)["formato"] == 2
    assert _campos_57()["formato"] == 2


def test_el_primer_formato_no_recibe_reclamos_de_dosis_ni_rotulacion():
    viejo = _campos_57()
    viejo.update({"formato": 1, "dosis": {}, "muestra": {}})
    r = _caso_agf(viejo)
    assert r["hallazgos"] == [] or all(h["codigo"] not in {"DOSIS_FALTA", "DOSIS_DISTINTA", "DOSIS_NO_CARGADA", "DOSIS_SIN_VERIFICAR", "ROTULACION_FALTA", "ROTULACION_DISTINTA", "ROTULACION_NO_CARGADA"} for h in r["hallazgos"])
    assert r["resumen"]["informes_formato_anterior"] == 1
    # el mismo caso en formato 2 sí reclama
    nuevo = dict(viejo, formato=2)
    assert "DOSIS_FALTA" in _codigos(_caso_agf(nuevo))
