"""
Muestra interna (Toma de muestras): solicitud de pulpa propia de AgroFresh.

Ship To fijo MUESTRA INTERNA bajo AGROFRESH, tipo de muestra Pulpa, sin Tipo Aplicación, lista de resultados fija
(Romina, Paz y Jorge), nunca se envía sola y solo la crea quien tenga la función `toma_muestra_interna`.
Lo demás (cualquier otra solicitud) no cambia.

No necesita Postgres: el índice y los folios se simulan.
"""
import pytest
from fastapi import HTTPException

from app import config, permisos_funciones as pf, toma_muestras as tm
from app.auth import Usuario

CORREOS = ["rgarrido@agrofresh.com", "psalazar@agrofresh.com", "jorge.sandoval@agrofresh.com"]


def _u(tipo="admin_area", modulos=None) -> Usuario:
    return Usuario(id="1", email="paz@agrofresh.com", nombre="Paz", tipoAcceso=tipo, modulos=modulos)


def _cuerpo(**extra) -> tm.SolicitudIn:
    datos = dict(
        laboratorio="AGROFRESH", solicitante="AGROFRESH", sold_to="CUALQUIERA", ship_to="OTRA PLANTA", generado_por="Paz",
        tipo_muestra="Fruta", analitos_solicitados=["FDL"], campos_laboratorio={"Tipo Aplicación": ""},
    )
    datos.update(extra)
    return tm.SolicitudIn(**datos)


@pytest.fixture
def entorno(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr("app.r2.disponible", lambda: False)
    guardadas: list[tuple[str, dict]] = []
    monkeypatch.setattr(tm.indice_solicitudes, "anotar", lambda nombre, datos, r2_key=None: guardadas.append((nombre, datos)))
    monkeypatch.setattr(tm, "_siguiente_numero", lambda lab: "OT-AGF0900")
    monkeypatch.setattr(tm, "_exigir_lab_activo", lambda lab: None)
    avisos: list[dict] = []
    monkeypatch.setattr(tm, "notificar", lambda **kw: avisos.append(kw))
    return guardadas, avisos


def test_es_muestra_interna_solo_para_ese_sold_to_y_ship_to():
    assert tm.es_muestra_interna("AGROFRESH", "MUESTRA INTERNA")
    assert tm.es_muestra_interna(" Agrofresh ", "muestra  interna")
    assert not tm.es_muestra_interna("AGROFRESH", "ENSAYO")
    assert not tm.es_muestra_interna("DOLE", "MUESTRA INTERNA")
    assert not tm.es_muestra_interna(None, None)


def test_la_lista_de_resultados_es_fija_para_los_tres_correos():
    contactos = tm._contactos_resultado("AGROFRESH", "MUESTRA INTERNA", "", contactos=[])
    assert [c["email"] for c in contactos] == CORREOS
    assert all(c["tipo"] == "resultado_cliente" for c in contactos)
    detalle = tm._datos_pdf_con_destinatarios_resultados(
        {"sold_to": "AGROFRESH", "ship_to": "MUESTRA INTERNA"}
    )["destinatarios_resultados_detalle"]
    assert detalle == {"para": CORREOS, "cc": [], "bcc": []}
    assert tm.solicitud_sin_lista({"sold_to": "AGROFRESH", "ship_to": "MUESTRA INTERNA"}) is False


def test_otro_ship_to_de_agrofresh_no_toma_esa_lista():
    assert tm._contactos_resultado("AGROFRESH", "ENSAYO", "", contactos=[]) == []


def test_la_funcion_se_da_cuenta_por_cuenta():
    assert pf.tiene(_u("admin_general"), pf.TOMA_MUESTRA_INTERNA)
    assert not pf.tiene(_u("admin_area", ["toma_muestras"]), pf.TOMA_MUESTRA_INTERNA)
    assert pf.tiene(_u("admin_area", ["toma_muestras", "toma_muestra_interna"]), pf.TOMA_MUESTRA_INTERNA)
    assert not pf.tiene(_u("gerencia", ["toma_muestra_interna"]), pf.TOMA_MUESTRA_INTERNA)
    assert not pf.tiene(_u("cliente", ["toma_muestra_interna"]), pf.TOMA_MUESTRA_INTERNA)
    assert "toma_muestra_interna" in pf.MODULOS_VALIDOS


def test_sin_la_funcion_el_servidor_responde_403():
    with pytest.raises(HTTPException) as e:
        tm.crear_solicitud_interna(_cuerpo(), _u("admin_area", ["toma_muestras"]))
    assert e.value.status_code == 403
    assert tm.estado_solicitud_interna(_u("admin_area", ["toma_muestras"])) == {"permitido": False}
    assert tm.estado_solicitud_interna(_u("admin_area", ["toma_muestra_interna"])) == {"permitido": True}


def test_crea_con_ship_to_pulpa_marca_y_sin_enviarse(entorno):
    guardadas, avisos = entorno
    s = tm.crear_solicitud_interna(_cuerpo(), _u("admin_area", ["toma_muestra_interna"]))
    assert s.muestra_interna is True and s.enviada is False
    assert (s.sold_to, s.ship_to, s.tipo_muestra) == ("AGROFRESH", "MUESTRA INTERNA", "Pulpa")   # el servidor lo impone
    assert s.campos_laboratorio.get("Tipo Aplicación", "") == ""
    assert s.numero_solicitud == "OT-AGF0900"
    assert guardadas[0][1]["muestra_interna"] is True
    assert len(avisos) == 1


def test_una_solicitud_normal_no_lleva_la_marca(entorno):
    guardadas, _ = entorno
    s = tm.crear_solicitud(_cuerpo(sold_to="DOLE", ship_to="PLANTA 1", tipo_muestra="Fruta"), _u("admin_general"))
    assert s.muestra_interna is False
    assert (s.sold_to, s.ship_to, s.tipo_muestra) == ("DOLE", "PLANTA 1", "Fruta")
    assert "muestra_interna" not in guardadas[0][1]


def test_sin_analitos_no_se_crea(entorno):
    with pytest.raises(HTTPException) as e:
        tm.crear_solicitud_interna(_cuerpo(analitos_solicitados=[]), _u("admin_general"))
    assert e.value.status_code == 422


def test_el_pdf_y_el_excel_salen_sin_tipo_de_aplicacion():
    from app.solicitud_excel import construir_workbook
    from app.toma_muestras_pdf import generar_pdf_solicitud
    datos = _cuerpo().model_dump()
    datos.update(numero_solicitud="OT-AGF0900", fecha_solicitud="2026-10-29", muestra_interna=True,
                 sold_to="AGROFRESH", ship_to="MUESTRA INTERNA", tipo_muestra="Pulpa", creado_en="2026-10-29T10:00:00+00:00")
    assert generar_pdf_solicitud(tm._datos_pdf_con_destinatarios_resultados(datos)).startswith(b"%PDF")
    assert construir_workbook(datos, tm._leer_config("analitos.json", tm.ANALITOS_DEFECTO)) is not None

