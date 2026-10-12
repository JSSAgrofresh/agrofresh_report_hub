"""Los destinatarios fijos de Actimist, Ecofog y RYD («Siempre reciben») se pueden editar desde
Administración General → Listas de distribución, y rigen en todo lo que los usa."""
import io

import pytest
from fastapi import HTTPException, UploadFile

from app import auth, config, config_store, envio_informes as ei, listas_distribucion as ld, servicios
from app import toma_muestras as tm


@pytest.fixture(autouse=True)
def entorno(tmp_path, monkeypatch):
    """Configuración en disco (tmp), sin R2; la memoria de los fijos se vacía antes y después."""
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr("app.r2.disponible", lambda: False)
    monkeypatch.setattr(ei, "_registrar_envio", lambda **kw: None)
    config_store.escribir("contactos_laboratorio.json", [])      # sin correos por planta
    monkeypatch.setattr(tm, "leer_todas_las_solicitudes", lambda: [])
    servicios.invalidar_fijos()
    yield
    servicios.invalidar_fijos()


def _admin():
    return auth.Usuario(id="1", email="jorge.sandoval@agrofresh.com", nombre="Jorge", tipoAcceso="admin_general",
                        area=None, modulos=None)


def test_sin_cambios_rigen_los_de_fabrica():
    assert servicios.fijos_de_lista("ryd") == {
        "para": ["CCACERES@AGROFRESH.COM", "FGONZALEZ@AGROFRESH.COM"],
        "cc": ["JORGE.SANDOVAL@AGROFRESH.COM", "AGROFRESHREPORTHUB@GMAIL.COM"],
    }
    assert servicios.fijos_de_lista("actimist")["para"] == ["CJIMENEZ@AGROFRESH.COM", "CVALENZUELA@AGROFRESH.COM"]
    assert servicios.fijos_de_lista("") == {"para": [], "cc": []}      # Línea de proceso no tiene
    assert servicios.fijos_personalizados("ryd") is False


def test_guardar_cambia_solo_esa_lista_y_restaurar_vuelve_a_los_de_fabrica():
    r = ld.guardar_destinatarios_fijos(ld.FijosIn(para=["nuevo@agrofresh.com", "Otro@agrofresh.com"], cc=["copia@agrofresh.com"]),
                                      servicio="ecofog", usuario=_admin())
    assert r["para"] == ["nuevo@agrofresh.com", "Otro@agrofresh.com"] and r["cc"] == ["copia@agrofresh.com"]
    assert r["personalizado"] is True and r["editable"] is True and r["original"]["para"][0] == "CJIMENEZ@AGROFRESH.COM"
    assert servicios.fijos_de_lista("ecofog")["para"] == ["nuevo@agrofresh.com", "Otro@agrofresh.com"]
    # las demás listas no se mueven
    assert servicios.fijos_de_lista("actimist")["para"] == ["CJIMENEZ@AGROFRESH.COM", "CVALENZUELA@AGROFRESH.COM"]
    assert servicios.fijos_de_lista("ryd")["para"][0] == "CCACERES@AGROFRESH.COM"
    r = ld.restaurar_destinatarios_fijos(servicio="ecofog", usuario=_admin())
    assert r["personalizado"] is False and r["para"] == ["CJIMENEZ@AGROFRESH.COM", "CVALENZUELA@AGROFRESH.COM"]


def test_la_pantalla_trae_los_fijos_con_su_original_y_si_se_pueden_editar():
    e = ld.estado_actual(servicio="ryd", _=_admin())["fijos"]
    assert e["editable"] is True and e["personalizado"] is False and e["original"] == {"para": e["para"], "cc": e["cc"]}
    assert ld.estado_actual(servicio="", _=_admin())["fijos"]["editable"] is False


def test_validaciones():
    for datos, texto in (
        (ld.FijosIn(para=[], cc=["a@x.cl"]), "al menos un correo"),
        (ld.FijosIn(para=["no-es-correo"], cc=[]), "no es un correo válido"),
        (ld.FijosIn(para=["a@x.cl"], cc=["roto@"]), "no es un correo válido"),
    ):
        with pytest.raises(HTTPException) as exc:
            ld.guardar_destinatarios_fijos(datos, servicio="ryd", usuario=_admin())
        assert exc.value.status_code == 400 and texto in exc.value.detail
    with pytest.raises(HTTPException) as exc:                                   # Línea de proceso no tiene fijos
        ld.guardar_destinatarios_fijos(ld.FijosIn(para=["a@x.cl"], cc=[]), servicio="", usuario=_admin())
    assert exc.value.status_code == 400
    assert servicios.fijos_personalizados("ryd") is False                       # nada se guardó


def test_pegar_varios_correos_juntos_y_sin_repetidos():
    r = ld.guardar_destinatarios_fijos(ld.FijosIn(para=["a@x.cl; b@x.cl, A@X.cl"], cc=[]), servicio="actimist", usuario=_admin())
    assert r["para"] == ["a@x.cl", "b@x.cl"] and r["cc"] == []                   # Copia puede quedar vacía


def test_un_archivo_danado_o_sin_para_cae_a_los_de_fabrica():
    config_store.escribir(servicios.ARCHIVO_FIJOS, {"ryd": {"para": [], "cc": ["x@x.cl"]}, "ecofog": "roto"})
    servicios.invalidar_fijos()
    assert servicios.fijos_de_lista("ryd")["para"][0] == "CCACERES@AGROFRESH.COM"
    assert servicios.fijos_de_lista("ecofog")["para"][0] == "CJIMENEZ@AGROFRESH.COM"


def test_la_configuracion_no_se_lee_de_nuevo_en_cada_consulta(monkeypatch):
    """Se consulta por cada solicitud: con la configuración en R2 no se puede leer cada vez."""
    ld.guardar_destinatarios_fijos(ld.FijosIn(para=["a@x.cl"], cc=[]), servicio="ryd", usuario=_admin())
    lecturas = []
    real = config_store.leer
    monkeypatch.setattr(config_store, "leer", lambda *a, **k: (lecturas.append(1), real(*a, **k))[1])
    servicios.invalidar_fijos()
    for _ in range(200):
        servicios.fijos_de_lista("ryd")
    assert len(lecturas) == 1


def test_un_fallo_al_leer_no_tumba_el_correo(monkeypatch):
    def falla(*a, **k):
        raise OSError("R2 caído")

    monkeypatch.setattr(config_store, "leer", falla)
    servicios.invalidar_fijos()
    assert servicios.fijos_de_lista("ryd")["para"][0] == "CCACERES@AGROFRESH.COM"


# --- lo que se edita se usa de verdad -------------------------------------------------------

def _plan(sold, ship, tipo):
    from app.informe_pdf import generar_informe_pdf

    campos = {"Solicitante": "AGROFRESH", "Sold To (Nombre)": sold, "Ship To (Nombre)": ship, "N° Solicitud": "OT-AGF0999",
              "Generado Por": "X", "Fecha Solicitud": "01-10-2026", "Tipo Muestra": "Fruta", "Tipo Aplicación": tipo,
              "Especie": "Manzana", "Variedad": "Fuji"}
    pdf = generar_informe_pdf(campos, [], {}, None, None, "F1", "A", "B", "C", "D")
    import asyncio

    f = UploadFile(file=io.BytesIO(pdf), filename="x.pdf")
    return asyncio.run(ei.analizar_informes(archivos=[f], usuario=_admin()))["items"][0]["plan"]


@pytest.mark.parametrize("sold,ship", [("", ""), ("DOLE", "SAN FERNANDO")])
def test_el_envio_de_informes_usa_los_fijos_editados_con_o_sin_planta(sold, ship):
    """RYD sin Sold To/Ship To, o cualquier servicio con planta pero sin correos cargados."""
    ld.guardar_destinatarios_fijos(ld.FijosIn(para=["ryd1@agrofresh.com"], cc=["ryd.copia@agrofresh.com"]), servicio="ryd", usuario=_admin())
    ld.guardar_destinatarios_fijos(ld.FijosIn(para=["eco1@agrofresh.com", "eco2@agrofresh.com"], cc=[]), servicio="ecofog", usuario=_admin())
    p = _plan(sold, ship, "RYD")
    assert p["to"] == ["ryd1@agrofresh.com"] and "ryd.copia@agrofresh.com" in p["cc"] and p["sin_lista"] is False
    p = _plan(sold, ship, "Ecofog")
    assert p["to"] == ["eco1@agrofresh.com", "eco2@agrofresh.com"] and p["cc"] == []
    p = _plan(sold, ship, "Actimist")                                            # Actimist sin tocar: los de fábrica
    assert p["to"] == ["CJIMENEZ@AGROFRESH.COM", "CVALENZUELA@AGROFRESH.COM"]


def test_la_lista_de_un_cliente_se_suma_a_los_fijos_editados():
    config_store.escribir("contactos_laboratorio.json", [{
        "email": "cliente@dole.cl", "sold_to": "DOLE", "ship_to": "SAN FERNANDO", "tipo": "resultado_cliente",
        "especie": "", "activo": True, "orden": 1, "tipo_copia": "cc", "laboratorio": "AGROFRESH", "servicio": "ecofog",
    }])
    ld.guardar_destinatarios_fijos(ld.FijosIn(para=["eco1@agrofresh.com"], cc=[]), servicio="ecofog", usuario=_admin())
    assert _plan("DOLE", "SAN FERNANDO", "Ecofog")["to"] == ["eco1@agrofresh.com", "cliente@dole.cl"]


def test_una_solicitud_nueva_usa_los_fijos_editados_y_no_cuenta_como_lista_del_cliente():
    ld.guardar_destinatarios_fijos(ld.FijosIn(para=["eco1@agrofresh.com"], cc=["jorge.sandoval@agrofresh.com"]), servicio="ecofog", usuario=_admin())
    datos = {"sold_to": "DOLE", "ship_to": "SAN FERNANDO", "especie": "Manzana", "respaldo_ryd": True,
             "campos_laboratorio": {"Tipo Aplicación": "Ecofog"}}
    assert tm.solicitud_sin_lista(datos, []) is True         # los fijos no son la lista del cliente
    detalle = tm._datos_pdf_con_destinatarios_resultados(datos)["destinatarios_resultados_detalle"]
    assert "eco1@agrofresh.com" in detalle["para"] and "CJIMENEZ@AGROFRESH.COM" not in detalle["para"]
