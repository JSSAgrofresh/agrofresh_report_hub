"""
AgroFresh Lab → Envío de informes.

Lo que no puede fallar: que en PRUEBA nada llegue a un cliente, que el Para sea
SOLO la lista de esa planta (sin el respaldo global ni la lista interna) y que
pasar a producción exija la contraseña. Ninguna prueba toca Gmail ni Postgres:
`correo.enviar` es un doble y el registro en base es best-effort.
"""
import asyncio
import io

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from app import config, config_store, correo, envio_informes as ei, mail_templates
from app.auth import Usuario

# La función real, antes de que la fixture la reemplace por un doble.
_REGISTRAR_REAL = ei._registrar_envio
registros: list[dict] = []

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def _usuario(tipo="admin_area", area="cromatografia", modulos=None, nombre="Paz Salazar") -> Usuario:
    return Usuario(
        id="7", email="psalazar@agrofresh.com", nombre=nombre, tipoAcceso=tipo, area=area, modulos=modulos,
    )


def _contacto(email, *, sold_to="DOLE", ship_to="SAN FERNANDO", tipo="resultado_cliente", especie="",
              activo=True, orden=1, tipo_copia="cc"):
    return {
        "email": email, "sold_to": sold_to, "ship_to": ship_to, "tipo": tipo, "especie": especie,
        "activo": activo, "orden": orden, "tipo_copia": tipo_copia, "laboratorio": "AGROFRESH",
    }


@pytest.fixture
def entorno(tmp_path, monkeypatch):
    """Almacén de configuración en disco, sin R2, sin base y sin correo real."""
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr("app.r2.disponible", lambda: False)
    monkeypatch.setattr(ei, "_registrar_envio", lambda **kw: registros.append(kw))
    registros.clear()
    llamadas: list[dict] = []

    def _falso_enviar(destinatario, asunto, cuerpo_html, cuerpo_texto=None, adjuntos=None, cc=None, bcc=None, imagenes_inline=None):
        to = [d.strip() for d in destinatario.split(",") if d.strip()]
        llamadas.append({
            "to": to, "cc": cc or [], "bcc": bcc or [], "asunto": asunto, "html": cuerpo_html,
            "texto": cuerpo_texto, "adjuntos": [a.nombre for a in (adjuntos or [])],
        })
        return correo.ResultadoEnvio(to=to, cc=cc or [], bcc=bcc or [], mensaje_id="m-1")

    monkeypatch.setattr(ei.correo, "enviar", _falso_enviar)
    config_store.escribir("contactos_laboratorio.json", [
        _contacto("cliente1@dole.cl", orden=1),
        _contacto("cliente2@dole.cl", orden=2),
        _contacto("Cliente1@Dole.cl", orden=3),                         # repetido sin mayúsculas
        _contacto("inactivo@dole.cl", activo=False),
        _contacto("tecnico@agrofresh.com", tipo="resultado_interno", tipo_copia="bcc"),
        _contacto("comercial@agrofresh.com", tipo="resultado_interno"),
        _contacto("global@respaldo.cl", sold_to="", ship_to=""),         # el respaldo histórico
        _contacto("solo_ship@otro.cl", sold_to="", ship_to="SAN FERNANDO"),
        _contacto("otro_cliente@otro.cl", sold_to="OTRO", ship_to="SAN FERNANDO"),
        _contacto("cereza@dole.cl", especie="Cereza"),
        _contacto("manzana@dole.cl", especie="Manzana"),
    ])
    return llamadas


def _archivo(nombre="informe.pdf", contenido=PDF) -> UploadFile:
    return UploadFile(file=io.BytesIO(contenido), filename=nombre)


def _enviar(usuario=None, **campos):
    base = dict(
        laboratorio="AGROFRESH", sold_to="DOLE", ship_to="SAN FERNANDO", especie="", servicio="", asunto="", cuerpo="",
        para='["cliente1@dole.cl"]', cc="[]", bcc="[]", archivos=[_archivo()], usuario=usuario or _usuario(),
    )
    base.update(campos)
    return asyncio.run(ei.enviar_informe(**base))


# --- A quién va ------------------------------------------------------------

def _solicitud_dole(**extra):
    return {
        "numero_solicitud": "OT-AGF0001", "laboratorio": "AGROFRESH", "sold_to": "DOLE", "ship_to": "SAN FERNANDO",
        "especie": "", "campos_laboratorio": {"Tipo Aplicación": "Línea de proceso"}, **extra,
    }


def test_la_lista_es_tal_cual_la_de_la_solicitud_mas_las_copias_ocultas_del_modulo(entorno):
    from app import toma_muestras as tm

    sol = _solicitud_dole()
    detalle = tm._datos_pdf_con_destinatarios_resultados(sol)["destinatarios_resultados_detalle"]
    assert detalle["para"] == ["cliente1@dole.cl", "cliente2@dole.cl"]   # lo que dice la solicitud
    plan = ei.plan_desde_solicitud(sol)
    # Para, CC y CCO de la solicitud, sin tocar...
    assert plan["to"] == detalle["para"]
    assert plan["cc"] == detalle["cc"] == ["comercial@agrofresh.com"]
    assert plan["bcc"][: len(detalle["bcc"])] == detalle["bcc"] == ["tecnico@agrofresh.com"]
    # ...y las copias ocultas del módulo agregadas al final
    assert plan["bcc"] == ["tecnico@agrofresh.com", "psalazar@agrofresh.com", "jorge.sandoval@agrofresh.com"]
    assert plan["sin_lista"] is False and plan["origen"] == "solicitud"


def test_lo_que_no_es_de_la_lista_de_esa_solicitud_no_entra(entorno):
    plan = ei.plan_desde_solicitud(_solicitud_dole())
    todos = plan["to"] + plan["cc"] + plan["bcc"]
    for ajeno in ("global@respaldo.cl", "solo_ship@otro.cl", "otro_cliente@otro.cl", "inactivo@dole.cl"):
        assert ajeno not in todos


def test_con_especie_vale_la_lista_de_esa_especie(entorno):
    assert ei.plan_desde_solicitud(_solicitud_dole(especie="Cereza"))["to"] == ["cereza@dole.cl"]
    assert ei.plan_desde_solicitud(_solicitud_dole(especie="Uva"))["to"] == ["cliente1@dole.cl", "cliente2@dole.cl"]


def test_sin_lista_del_cliente_el_para_queda_vacio_y_no_se_usa_el_respaldo(entorno):
    from app import toma_muestras as tm

    # sin el contacto «global» de respaldo histórico que trae la fixture
    config_store.escribir("contactos_laboratorio.json", [_contacto("cliente1@dole.cl")])
    plan = ei.plan_desde_solicitud(_solicitud_dole(ship_to="LONTUE"))
    assert plan["sin_lista"] is True and plan["to"] == []
    # el respaldo de la solicitud (Jorge, Claudia, Report Hub) no entra: el informe va al cliente.
    # (Jorge sí queda en copia oculta, pero por las copias del módulo, no como respaldo.)
    todos = [e.casefold() for e in plan["to"] + plan["cc"] + plan["bcc"]]
    assert tm.DESTINATARIOS_SIN_LISTA[1].casefold() not in todos          # Claudia
    assert "agrofreshreporthub@gmail.com" not in todos


def test_el_servicio_decide_la_lista_igual_que_en_la_solicitud(entorno):
    config_store.escribir("contactos_laboratorio.json", [
        _contacto("lp@dole.cl"),
        {**_contacto("act@dole.cl"), "servicio": "actimist"},
        {**_contacto("eco@dole.cl"), "servicio": "ecofog"},
    ])
    assert ei.plan_destinatarios("DOLE", "SAN FERNANDO")["to"] == ["lp@dole.cl"]
    assert "act@dole.cl" in ei.plan_destinatarios("DOLE", "SAN FERNANDO", servicio="Actimist")["to"]
    assert "lp@dole.cl" not in ei.plan_destinatarios("DOLE", "SAN FERNANDO", servicio="Actimist")["to"]
    eco = ei.plan_destinatarios("DOLE", "SAN FERNANDO", servicio="ecofog")["to"]
    assert eco == ["CJIMENEZ@AGROFRESH.COM", "CVALENZUELA@AGROFRESH.COM", "eco@dole.cl"]   # referentes + su lista
    assert ei.plan_destinatarios("DOLE", "SAN FERNANDO", servicio="RYD")["to"] == ["lp@dole.cl"]


def test_sin_n_de_solicitud_la_lista_sale_igual_por_sold_to_y_ship_to(entorno):
    por_planta = ei.plan_destinatarios("DOLE", "SAN FERNANDO")
    por_solicitud = ei.plan_desde_solicitud(_solicitud_dole())
    assert {k: por_planta[k] for k in ("to", "cc", "bcc")} == {k: por_solicitud[k] for k in ("to", "cc", "bcc")}
    assert por_planta["origen"] == "planta"


def test_las_copias_internas_se_suman_a_las_de_la_solicitud_sin_repetir(entorno):
    ei.guardar_internos(
        ei.InternosIn(cc=["comercial@agrofresh.com", "nuevo@agrofresh.com"], bcc=["tecnico@agrofresh.com", "paz@agrofresh.com"]),
        _usuario(),
    )
    plan = ei.plan_desde_solicitud(_solicitud_dole())
    assert plan["cc"] == ["comercial@agrofresh.com", "nuevo@agrofresh.com"]      # el comercial no se repite
    assert plan["bcc"] == ["tecnico@agrofresh.com", "paz@agrofresh.com"]         # el técnico tampoco


def test_nadie_va_dos_veces():
    r = ei.repartir(["a@x.cl", "B@x.cl"], ["b@x.cl", "c@x.cl"], ["C@x.cl", "A@x.cl", "d@x.cl"])
    assert r == {"to": ["a@x.cl", "B@x.cl"], "cc": ["c@x.cl"], "bcc": ["d@x.cl"]}


# --- Modo --------------------------------------------------------------------

def test_parte_en_prueba(entorno):
    assert ei.leer_config()["modo"] == "prueba"


def test_producion_pide_la_contrasena(entorno, monkeypatch):
    monkeypatch.setattr(ei, "_clave_correcta", lambda usuario, password: password == "buena")
    with pytest.raises(HTTPException) as exc:
        ei.cambiar_modo(ei.ModoIn(modo="produccion", password="mala"), _usuario())
    # 403 y no 401: un 401 cierra la sesión en el navegador
    assert exc.value.status_code == 403
    assert ei.leer_config()["modo"] == "prueba"
    with pytest.raises(HTTPException):
        ei.cambiar_modo(ei.ModoIn(modo="produccion"), _usuario())
    out = ei.cambiar_modo(ei.ModoIn(modo="produccion", password="buena"), _usuario())
    assert out["modo"] == "produccion" and ei.leer_config()["modo"] == "produccion"
    assert ei.leer_config()["modo_cambiado_por"] == "Paz Salazar"


def test_volver_a_prueba_no_pide_contrasena(entorno, monkeypatch):
    monkeypatch.setattr(ei, "_clave_correcta", lambda usuario, password: True)
    ei.cambiar_modo(ei.ModoIn(modo="produccion", password="x"), _usuario())
    monkeypatch.setattr(ei, "_clave_correcta", lambda usuario, password: pytest.fail("no debía pedirla"))
    assert ei.cambiar_modo(ei.ModoIn(modo="prueba"), _usuario())["modo"] == "prueba"


def test_modo_invalido(entorno):
    with pytest.raises(HTTPException) as exc:
        ei.cambiar_modo(ei.ModoIn(modo="cualquiera"), _usuario())
    assert exc.value.status_code == 400


def test_un_modo_ilegible_es_prueba(entorno):
    config_store.escribir("envio_informes.json", {"modo": "PRODUCCION!!"})
    assert ei.leer_config()["modo"] == "prueba"


# --- Envío -------------------------------------------------------------------

def test_en_prueba_solo_llega_a_paz_y_jorge(entorno):
    out = _enviar(para='["cliente1@dole.cl", "cliente2@dole.cl"]', cc='["comercial@agrofresh.com"]', bcc='["x@y.cl"]')
    envio = entorno[0]
    assert envio["to"] == ["psalazar@agrofresh.com", "jorge.sandoval@agrofresh.com"]
    assert envio["cc"] == [] and envio["bcc"] == []
    assert envio["asunto"].startswith("(PRUEBA) ")
    assert "CORREO DE PRUEBA" in envio["texto"] and "cliente1@dole.cl" in envio["texto"]
    assert "CORREO DE PRUEBA" in envio["html"]
    assert envio["adjuntos"] == ["informe.pdf"]
    assert out["modo"] == "prueba" and "No salió nada al cliente" in out["ok"]
    # queda registrado lo que se pidió y a quién salió
    assert registros[0]["armado"]["reales"]["to"] == ["cliente1@dole.cl", "cliente2@dole.cl"]
    assert registros[0]["enviado"]["to"] == ["psalazar@agrofresh.com", "jorge.sandoval@agrofresh.com"]


def test_en_produccion_sale_a_lo_que_se_eligio(entorno):
    config_store.escribir("envio_informes.json", {"modo": "produccion"})
    _enviar(para='["cliente1@dole.cl"]', cc='["comercial@agrofresh.com"]', bcc='["psalazar@agrofresh.com", "cliente1@dole.cl"]')
    envio = entorno[0]
    assert envio["to"] == ["cliente1@dole.cl"]
    assert envio["cc"] == ["comercial@agrofresh.com"]
    assert envio["bcc"] == ["psalazar@agrofresh.com"]          # el repetido se quita
    assert not envio["asunto"].startswith("(PRUEBA)")
    assert "CORREO DE PRUEBA" not in envio["html"]


def test_el_texto_y_el_asunto_escritos_a_mano_mandan(entorno):
    _enviar(asunto="Asunto de Paz", cuerpo="Hola {esto no es variable}\nChao")
    envio = entorno[0]
    assert envio["asunto"] == "(PRUEBA) Asunto de Paz"
    assert "Hola {esto no es variable}" in envio["texto"]


def test_sin_texto_usa_la_plantilla_del_laboratorio(entorno):
    mail_templates.guardar_informe("predeterminado", "Hola {ship_to}", "Informe {cantidad_informes} de {sold_to} por {enviado_por}")
    _enviar()
    envio = entorno[0]
    assert envio["asunto"] == "(PRUEBA) Hola SAN FERNANDO"
    assert "Informe 1 de DOLE por Paz Salazar" in envio["texto"]


def test_sin_para_no_se_envia(entorno):
    with pytest.raises(HTTPException) as exc:
        _enviar(para="[]")
    assert exc.value.status_code == 400 and "lista de distribución" in exc.value.detail
    assert entorno == []


def test_correo_invalido_no_se_envia(entorno):
    with pytest.raises(HTTPException) as exc:
        _enviar(para='["no-es-correo"]')
    assert exc.value.status_code == 400 and entorno == []


def test_laboratorio_inexistente(entorno):
    with pytest.raises(HTTPException) as exc:
        _enviar(laboratorio="NOEXISTE")
    assert exc.value.status_code == 400


def test_sold_to_y_ship_to_son_obligatorios(entorno):
    for campos in ({"sold_to": " "}, {"ship_to": ""}):
        with pytest.raises(HTTPException) as exc:
            _enviar(**campos)
        assert exc.value.status_code == 400
    assert entorno == []


@pytest.mark.parametrize("archivos,fragmento", [
    ([], "al menos un archivo"),
    ([_archivo("virus.exe", b"MZ....")], "no se puede enviar"),
    ([_archivo("falso.pdf", b"esto no es un pdf")], "no es un PDF válido"),
    ([_archivo("vacio.pdf", b"")], "está vacío"),
    ([_archivo("a.pdf"), _archivo("A.PDF")], "repetido"),
])
def test_archivos_que_no_se_aceptan(entorno, archivos, fragmento):
    with pytest.raises(HTTPException) as exc:
        _enviar(archivos=archivos)
    assert exc.value.status_code == 400 and fragmento in exc.value.detail
    assert entorno == []


def test_demasiado_pesado(entorno, monkeypatch):
    monkeypatch.setattr(ei, "MAX_BYTES_ADJUNTO", 10)
    with pytest.raises(HTTPException) as exc:
        _enviar()
    assert exc.value.status_code == 400 and "pesa más" in exc.value.detail


def test_el_nombre_del_archivo_no_lleva_ruta(entorno):
    _enviar(archivos=[_archivo("..\\..\\etc\\informe final.pdf")])
    assert entorno[0]["adjuntos"] == ["informe final.pdf"]


def test_un_fallo_del_correo_se_registra_y_se_propaga(entorno, monkeypatch):
    def falla(*a, **k):
        raise HTTPException(502, "Gmail caído")

    monkeypatch.setattr(ei.correo, "enviar", falla)
    with pytest.raises(HTTPException) as exc:
        _enviar()
    assert exc.value.status_code == 502
    assert registros[-1]["exitoso"] is False and registros[-1]["error"] == "Gmail caído"


def test_si_la_base_falla_el_envio_igual_sale(entorno, monkeypatch):
    """`_registrar_envio` real (no el doble): sin Postgres no debe lanzar."""
    import contextlib

    @contextlib.contextmanager
    def sin_base(*a, **k):
        raise RuntimeError("sin base")
        yield

    monkeypatch.setattr(ei, "conexion", sin_base)
    _REGISTRAR_REAL(
        usuario=_usuario(), modo="prueba",
        armado={"laboratorio": "AGROFRESH", "asunto": "x", "reales": {"to": [], "cc": [], "bcc": []}},
        datos=ei.DatosEnvio(laboratorio="AGROFRESH", sold_to="a", ship_to="b"),
        adjuntos=[], enviado={"to": [], "cc": [], "bcc": []}, exitoso=True, mensaje_id=None, error=None,
    )


# --- Vista previa, template y copias internas --------------------------------

def test_vista_previa_trae_el_logo_incrustado_y_no_envia(entorno):
    out = ei.vista_previa(
        ei.VistaPreviaIn(laboratorio="AGROFRESH", sold_to="DOLE", ship_to="SAN FERNANDO", para=["cliente1@dole.cl"],
                         nombres_adjuntos=["a.pdf"]),
        _usuario(),
    )
    assert out["modo"] == "prueba" and out["asunto"].startswith("(PRUEBA)")
    assert "cid:" not in out["html"] and "data:image/png;base64," in out["html"]
    assert out["efectivos"]["to"] == ei.DESTINATARIOS_PRUEBA
    assert out["reales"]["to"] == ["cliente1@dole.cl"]
    assert entorno == []


def test_la_vista_previa_trae_el_punto_de_partida_sin_prueba_ni_aviso(entorno):
    out = ei.vista_previa(
        ei.VistaPreviaIn(laboratorio="AGROFRESH", sold_to="DOLE", ship_to="SAN FERNANDO", para=["a@x.cl"],
                         asunto="Lo que escribió Paz", cuerpo="Texto de Paz", nombres_adjuntos=["a.pdf", "b.pdf"]),
        _usuario(),
    )
    assert out["asunto"] == "(PRUEBA) Lo que escribió Paz" and out["texto"].endswith("Texto de Paz")
    # la base sigue siendo la de la plantilla, con las variables ya puestas
    assert out["asunto_base"] == "[AgroFresh] Informe de ensayo — DOLE — SAN FERNANDO"
    assert "DOLE — SAN FERNANDO" in out["texto_base"] and "CORREO DE PRUEBA" not in out["texto_base"]


def test_la_plantilla_es_una_sola_predeterminada(entorno):
    t = ei.obtener_template("predeterminado", _usuario())
    assert "{sold_to}" in t["asunto"] and "fecha_envio" in t["variables"]
    guardado = ei.guardar_template("predeterminado", ei.TemplateIn(asunto="A {ship_to}", cuerpo="B {laboratorio}"), _usuario())
    assert guardado["asunto"] == "A {ship_to}"
    # los servicios sin plantilla propia usan la predeterminada
    for clave in ("actimist", "ecofog", "linea_proceso"):
        assert ei.obtener_template(clave, _usuario())["asunto"] == "A {ship_to}"
        assert ei.obtener_template(clave, _usuario())["propia"] is False
    with pytest.raises(HTTPException) as exc:
        ei.guardar_template("predeterminado", ei.TemplateIn(asunto="{numero_solicitud}", cuerpo="x"), _usuario())
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException):
        ei.guardar_template("predeterminado", ei.TemplateIn(asunto=" ", cuerpo="x"), _usuario())
    with pytest.raises(HTTPException) as exc:
        ei.obtener_template("QUITECA", _usuario())
    assert exc.value.status_code == 400


def test_un_servicio_puede_tener_su_plantilla_y_los_demas_siguen_con_la_predeterminada(entorno):
    mail_templates.guardar_informe("predeterminado", "General {ship_to}", "G")
    ei.guardar_template("actimist", ei.TemplateIn(asunto="Actimist {ship_to}", cuerpo="Texto Actimist"), _usuario())
    _enviar(servicio="actimist")
    assert entorno[0]["asunto"] == "(PRUEBA) Actimist SAN FERNANDO"
    asunto, texto, _, _ = mail_templates.renderizar_informe({"ship_to": "X"}, servicio="Actimist")
    assert asunto == "Actimist X" and texto == "Texto Actimist"
    asunto, texto, _, _ = mail_templates.renderizar_informe({"ship_to": "X"}, servicio="")
    assert asunto == "General X" and texto == "G"
    asunto, _, _, _ = mail_templates.renderizar_informe({"ship_to": "X"}, servicio="ecofog")
    assert asunto == "General X"


def test_lo_guardado_por_laboratorio_en_la_primera_version_sigue_valiendo(entorno):
    config_store.escribir("templates_mail_informes.json", [{"laboratorio": "AGROFRESH", "asunto": "Viejo {ship_to}", "cuerpo": "V"}])
    assert mail_templates.obtener_informe()["asunto"] == "Viejo {ship_to}"
    assert mail_templates.renderizar_informe({"ship_to": "X"})[0] == "Viejo X"


def test_el_template_de_informes_no_toca_el_de_solicitudes(entorno):
    antes = mail_templates.obtener("AGROFRESH")
    mail_templates.guardar_informe("predeterminado", "X", "Y")
    assert mail_templates.obtener("AGROFRESH") == antes


def test_copias_internas(entorno):
    out = ei.guardar_internos(ei.InternosIn(cc=[" a@x.cl ", "A@x.cl"], bcc=["psalazar@agrofresh.com"]), _usuario())
    assert out["internos"] == {"cc": ["a@x.cl"], "bcc": ["psalazar@agrofresh.com"]}
    assert "a@x.cl" in ei.plan_destinatarios("DOLE", "SAN FERNANDO")["cc"]
    with pytest.raises(HTTPException):
        ei.guardar_internos(ei.InternosIn(bcc=["roto"]), _usuario())


def test_cambiar_internos_no_toca_los_contactos(entorno):
    antes = config_store.leer("contactos_laboratorio.json", [])
    ei.guardar_internos(ei.InternosIn(bcc=["a@x.cl"]), _usuario())
    assert config_store.leer("contactos_laboratorio.json", []) == antes


# --- Quién puede usarlo --------------------------------------------------------

@pytest.mark.parametrize("usuario,esperado", [
    (_usuario("admin_general", None), True),
    (_usuario("admin_area", "cromatografia"), True),
    (_usuario("admin_area", "ryd"), True),
    (_usuario("analista", None), True),
    (_usuario("admin_area", "postventa"), False),
    (_usuario("admin_area", "toma_muestras"), False),
    (_usuario("muestreador", None), False),
    (_usuario("gerencia", None), False),
    (_usuario("cliente", None), False),
    (_usuario("analista", None, modulos=["reports"]), False),
    (_usuario("admin_area", "postventa", modulos=["agrofresh_lab"]), True),
    (_usuario("cliente", None, modulos=["agrofresh_lab"]), False),
])
def test_quien_puede_usarlo(usuario, esperado):
    assert ei.puede_usar(usuario) is esperado


def test_acceso_rechaza_con_403():
    with pytest.raises(HTTPException) as exc:
        ei.acceso(_usuario("gerencia", None))
    assert exc.value.status_code == 403


# --- Lectura del PDF, servicio y bloqueo ---------------------------------------

def _pdf_informe(sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA", especie="Naranja",
                 tipo="Línea de proceso") -> bytes:
    from app.informe_pdf import generar_informe_pdf

    campos = {
        "Solicitante": "AGROFRESH", "Sold To (Nombre)": sold_to, "Ship To (Nombre)": ship_to,
        "N° Solicitud": "OT-AGF0075", "Generado Por": "X", "Fecha Solicitud": "01-10-2026",
        "Tipo Muestra": "Fruta", "Tipo Aplicación": tipo, "Especie": especie, "Variedad": "Navel",
    }
    return generar_informe_pdf(campos, [], {}, None, None, "F1", "A", "B", "C", "D")


def test_el_texto_del_informe_da_sold_to_ship_to_especie_y_tipo():
    from app import informe_lectura as il

    texto = (
        "Identificación de la Solicitud\nSOLICITANTE\nAGROFRESH\nN° SOLICITUD\nOT-AGF0075\nSOLD TO\nMULTIFRUTA SA\n"
        "GENERADO POR\nX\nSHIP TO\nGESEX PLANTA FATIMA\nFECHA SOLICITUD\n01-10-2026\n"
        "TIPO APLICACIÓN\nLínea de proceso\nMUESTREADOR\n—\nESPECIE\nNaranja\nFECHA MUESTREO\n—\n"
    )
    d = il.datos_de_informe(texto)
    assert d["sold_to"] == "MULTIFRUTA SA" and d["ship_to"] == "GESEX PLANTA FATIMA"
    assert d["especie"] == "Naranja" and d["tipo_aplicacion"] == "Línea de proceso"
    assert d["numero_solicitud"] == "OT-AGF0075" and d["servicio"] == ""


def test_valores_vacios_y_en_la_misma_linea():
    from app import informe_lectura as il

    d = il.parsear_texto("SOLD TO ACME SA\nSHIP TO\n—\nESPECIE\nFECHA MUESTREO\n—")
    assert d["sold_to"] == "ACME SA"          # «SOLD TO ACME SA» en una sola línea
    assert d["ship_to"] == ""                 # «—» es sin dato
    assert d["especie"] == ""                 # lo que sigue es otra etiqueta, no su valor


def test_un_valor_largo_partido_en_dos_lineas():
    from app import informe_lectura as il

    d = il.parsear_texto("SHIP TO\nCOMERCIALIZADORA GARATE HERMANOS\nPLANTA CODEGUA\nFECHA SOLICITUD\n01-10-2026")
    assert d["ship_to"] == "COMERCIALIZADORA GARATE HERMANOS PLANTA CODEGUA"


def test_el_servicio_sale_del_tipo_de_aplicacion():
    from app import informe_lectura as il

    assert il.datos_de_informe("TIPO APLICACIÓN\nActimist\nESPECIE\nUva")["servicio"] == "actimist"
    assert il.datos_de_informe("TIPO APLICACIÓN\nRYD\nESPECIE\nUva")["servicio"] == ""


def _subir(*pdfs, usuario=None):
    archivos = [UploadFile(file=io.BytesIO(c), filename=n) for n, c in pdfs]
    return asyncio.run(ei.analizar_informes(archivos=archivos, usuario=usuario or _usuario()))


def test_analizar_varios_informes_cada_uno_con_su_lista(entorno):
    pytest.importorskip("pypdf")
    config_store.escribir("contactos_laboratorio.json", [
        _contacto("a@multifruta.cl", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA"),
        _contacto("b@dole.cl"),
    ])
    out = _subir(
        ("uno.pdf", _pdf_informe()),
        ("dos.pdf", _pdf_informe(sold_to="DOLE", ship_to="SAN FERNANDO", especie="Cereza")),
        ("tres.pdf", _pdf_informe(sold_to="OTRO", ship_to="SIN LISTA")),
        ("malo.pdf", b"%PDF-1.4 vacio"),
        ("texto.txt", b"hola"),
    )
    uno, dos, tres, malo, txt = out["items"]
    assert uno["leido"] and uno["sold_to"] == "MULTIFRUTA SA" and uno["plan"]["to"] == ["a@multifruta.cl"]
    assert dos["plan"]["to"] == ["b@dole.cl"] and dos["especie"] == "Cereza"
    from app import toma_muestras as tm

    assert tres["leido"] and tres["plan"]["sin_lista"] is True
    assert tres["plan"]["to"] == []   # no hay cliente a quien enviar: hay que escribirlo
    assert not malo["leido"] and malo["error"]
    assert not txt["leido"] and "PDF" in txt["error"]
    assert entorno == []  # analizar no envía nada


def test_analizar_sin_archivos_o_de_mas(entorno, monkeypatch):
    with pytest.raises(HTTPException):
        _subir()
    monkeypatch.setattr(ei, "MAX_INFORMES_LOTE", 1)
    with pytest.raises(HTTPException):
        _subir(("a.pdf", PDF), ("b.pdf", PDF))


def test_sin_pypdf_se_avisa_y_no_se_cae(entorno, monkeypatch):
    from app import informe_lectura as il

    def falta(_):
        raise il.LecturaNoDisponible("Falta instalar pypdf en el servidor.")

    monkeypatch.setattr(il, "texto_de_pdf", falta)
    out = _subir(("a.pdf", PDF))
    assert out["disponible"] is False and "pypdf" in out["items"][0]["error"]


PRINCIPAL = dict(email="jorge.sandoval@agrofresh.com", nombre="Jorge", tipo="admin_general", area=None)


def _principal() -> Usuario:
    return Usuario(id="1", email=PRINCIPAL["email"], nombre="Jorge", tipoAcceso="admin_general")


def test_solo_el_principal_con_su_clave_desbloquea(entorno, monkeypatch):
    monkeypatch.setattr(ei, "_clave_correcta", lambda usuario, password: password == "buena")
    for quien in (_usuario(), _usuario("admin_general", None)):  # Paz, y otro admin general
        with pytest.raises(HTTPException) as exc:
            ei.desbloquear_edicion(ei.DesbloqueoIn(password="buena"), quien)
        assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        ei.desbloquear_edicion(ei.DesbloqueoIn(password="mala"), _principal())
    assert exc.value.status_code == 403 and "Contraseña" in exc.value.detail
    assert ei.desbloquear_edicion(ei.DesbloqueoIn(password="buena"), _principal()) == {"ok": True}


def test_otro_laboratorio_solo_lo_envia_el_principal(entorno):
    with pytest.raises(HTTPException) as exc:
        _enviar(laboratorio="QUITECA")
    assert exc.value.status_code == 403 and entorno == []
    _enviar(laboratorio="QUITECA", usuario=_principal())
    assert len(entorno) == 1


# --- Eliminar un registro del historial -------------------------------------------

class _CursorFalso:
    def __init__(self, fila):
        self.fila, self.sql = fila, []

    def execute(self, sql, params=()):
        self.sql.append((sql, params))

    def fetchone(self):
        return self.fila


def _con_cursor(monkeypatch, fila):
    import contextlib

    cur = _CursorFalso(fila)

    @contextlib.contextmanager
    def conexion(*a, **k):
        yield object()

    @contextlib.contextmanager
    def cursor_dict(conn):
        yield cur

    monkeypatch.setattr(ei, "conexion", conexion)
    monkeypatch.setattr(ei, "cursor_dict", cursor_dict)
    monkeypatch.setattr(ei.actividad, "registrar", lambda *a, **k: cur.sql.append(("actividad", a)))
    return cur


def test_solo_el_principal_elimina_un_registro(entorno, monkeypatch):
    cur = _con_cursor(monkeypatch, {"asunto": "x", "creado_en": None})
    for quien in (_usuario(), _usuario("admin_general", None)):
        with pytest.raises(HTTPException) as exc:
            ei.eliminar_registro(5, quien)
        assert exc.value.status_code == 403
    assert cur.sql == []  # ni siquiera se tocó la base
    assert ei.eliminar_registro(5, _principal()) == {"estado": "eliminado"}
    sentencia, params = cur.sql[0]
    assert sentencia.startswith("DELETE FROM envio_informe_log WHERE id = %s") and params == (5,)
    assert cur.sql[1][0] == "actividad"   # queda anotado como cambio sensible


def test_eliminar_algo_que_no_existe_es_404(entorno, monkeypatch):
    _con_cursor(monkeypatch, None)
    with pytest.raises(HTTPException) as exc:
        ei.eliminar_registro(99, _principal())
    assert exc.value.status_code == 404


def test_sin_la_tabla_eliminar_avisa_en_vez_de_caerse(entorno, monkeypatch):
    import contextlib

    @contextlib.contextmanager
    def sin_base(*a, **k):
        raise RuntimeError("no existe la tabla")
        yield

    monkeypatch.setattr(ei, "conexion", sin_base)
    with pytest.raises(HTTPException) as exc:
        ei.eliminar_registro(1, _principal())
    assert exc.value.status_code == 503


def test_si_las_etiquetas_no_se_reconocen_se_busca_un_par_conocido_en_el_texto():
    from app import informe_lectura as il

    texto = "Informe 2026\nCliente: Multifruta S.A. — Planta GESEX Fátima\n"
    pares = [("MULTIFRUTA SA", "GESEX PLANTA FATIMA"), ("MULTIFRUTA SA", "OTRA"), ("DOLE", "SAN FERNANDO")]
    assert il.buscar_por_nombres("MULTIFRUTA SA\nGESEX PLANTA FATIMA\nlo que sea", pares) == ("MULTIFRUTA SA", "GESEX PLANTA FATIMA")
    assert il.buscar_por_nombres(texto, pares) is None  # no calza exacto: no se adivina
    assert il.buscar_por_nombres("DOLE y SAN FERNANDO", pares) == ("DOLE", "SAN FERNANDO")
    assert il.buscar_por_nombres("nada conocido", pares) is None


def test_analizar_usa_el_respaldo_y_explica_cuando_no_hay_texto(entorno, monkeypatch):
    from app import informe_lectura as il

    config_store.escribir("contactos_laboratorio.json", [
        _contacto("a@m.cl", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA"),
    ])
    monkeypatch.setattr(il, "texto_de_pdf", lambda c: "Reporte raro\nMULTIFRUTA SA - GESEX PLANTA FATIMA\n")
    uno = _subir(("a.pdf", PDF))["items"][0]
    assert uno["leido"] and uno["sold_to"] == "MULTIFRUTA SA" and uno["plan"]["to"] == ["a@m.cl"]

    monkeypatch.setattr(il, "texto_de_pdf", lambda c: "")
    vacio = _subir(("b.pdf", PDF))["items"][0]
    assert not vacio["leido"] and "escaneada" in vacio["error"]


# --- Por el N° de solicitud del informe ------------------------------------------

def _solicitud(numero="OT-AGF0075", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA", especie="Naranja",
               tipo="Línea de proceso"):
    return {
        "numero_solicitud": numero, "laboratorio": "AGROFRESH", "sold_to": sold_to, "ship_to": ship_to,
        "especie": especie, "campos_laboratorio": {"Tipo Aplicación": tipo},
    }


def test_el_informe_va_a_la_lista_de_su_solicitud(entorno, monkeypatch):
    pytest.importorskip("pypdf")
    from app import toma_muestras as tm

    config_store.escribir("contactos_laboratorio.json", [
        _contacto("cliente@multifruta.cl", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA", orden=1),
        _contacto("otro@multifruta.cl", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA", orden=2),
        _contacto("tecnico@agrofresh.com", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA",
                  tipo="resultado_interno"),
    ])
    monkeypatch.setattr(tm, "leer_todas_las_solicitudes", lambda: [("OT-AGF0075.xlsx", _solicitud())])
    # El PDF trae OTRO Sold To / Ship To en sus etiquetas: manda la solicitud.
    item = _subir(("i.pdf", _pdf_informe(sold_to="LO QUE DIGA", ship_to="EL PDF")))["items"][0]
    assert item["leido"] and item["numero_solicitud"] == "OT-AGF0075" and item["solicitud"] == "OT-AGF0075.xlsx"
    assert (item["sold_to"], item["ship_to"], item["especie"]) == ("MULTIFRUTA SA", "GESEX PLANTA FATIMA", "Naranja")
    plan = item["plan"]
    assert plan["to"] == ["cliente@multifruta.cl", "otro@multifruta.cl"] and plan["origen"] == "solicitud"
    assert plan["sin_lista"] is False
    # tal cual la solicitud (con su técnico en copia oculta) y, al final, las copias del módulo
    assert plan["cc"] == ["tecnico@agrofresh.com"]   # el técnico de la planta, como lo dice la solicitud
    assert plan["bcc"] == ["psalazar@agrofresh.com", "jorge.sandoval@agrofresh.com"]


def test_una_solicitud_sin_lista_no_manda_el_informe_al_respaldo(entorno, monkeypatch):
    pytest.importorskip("pypdf")
    from app import toma_muestras as tm

    config_store.escribir("contactos_laboratorio.json", [])
    monkeypatch.setattr(tm, "leer_todas_las_solicitudes", lambda: [("OT-AGF0075.xlsx", _solicitud())])
    plan = _subir(("i.pdf", _pdf_informe()))["items"][0]["plan"]
    assert plan["sin_lista"] is True and plan["to"] == []


def test_sin_cliente_en_para_el_servidor_tampoco_envia(entorno):
    with pytest.raises(HTTPException) as exc:
        _enviar(para="[]")
    assert exc.value.status_code == 400 and entorno == []


def test_el_servicio_de_la_solicitud_elige_su_lista(entorno, monkeypatch):
    pytest.importorskip("pypdf")
    from app import toma_muestras as tm

    config_store.escribir("contactos_laboratorio.json", [
        {**_contacto("act@m.cl", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA"), "servicio": "actimist"},
        _contacto("lp@m.cl", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA"),
    ])
    monkeypatch.setattr(tm, "leer_todas_las_solicitudes", lambda: [("a.xlsx", _solicitud(tipo="Actimist"))])
    item = _subir(("i.pdf", _pdf_informe()))["items"][0]
    assert item["servicio"] == "actimist" and "act@m.cl" in item["plan"]["to"] and "lp@m.cl" not in item["plan"]["to"]


def test_si_la_solicitud_no_existe_se_cae_a_lo_leido_del_pdf(entorno, monkeypatch):
    pytest.importorskip("pypdf")
    from app import toma_muestras as tm

    config_store.escribir("contactos_laboratorio.json", [_contacto("a@m.cl", sold_to="MULTIFRUTA SA", ship_to="GESEX PLANTA FATIMA")])
    monkeypatch.setattr(tm, "leer_todas_las_solicitudes", lambda: [])
    item = _subir(("i.pdf", _pdf_informe()))["items"][0]
    assert item["leido"] and item["solicitud"] is None and item["plan"]["to"] == ["a@m.cl"]


def test_el_numero_de_solicitud_se_encuentra_aunque_no_tenga_etiqueta():
    from app import informe_lectura as il

    assert il.datos_de_informe("Informe\nreferencia OT-QUI0025 de la planta")["numero_solicitud"] == "OT-QUI0025"


def test_informe_ryd_sin_lista_va_a_carla_y_fran(entorno):
    config_store.escribir("contactos_laboratorio.json", [])
    sol = _solicitud_dole(campos_laboratorio={"Tipo Aplicación": "RYD"}, respaldo_ryd=True)
    plan = ei.plan_desde_solicitud(sol)
    assert [e.upper() for e in plan["to"]] == ["CCACERES@AGROFRESH.COM", "FGONZALEZ@AGROFRESH.COM"]
    assert plan["sin_lista"] is False
    assert [e.casefold() for e in plan["cc"]] == ["jorge.sandoval@agrofresh.com", "agrofreshreporthub@gmail.com"]  # Jorge y el sistema en copia
    assert "cguerrero@agrofresh.com" not in [e.casefold() for e in plan["to"] + plan["cc"] + plan["bcc"]]
    # una RYD anterior (sin marca) sigue como Línea de proceso: Para vacío
    vieja = ei.plan_desde_solicitud(_solicitud_dole(campos_laboratorio={"Tipo Aplicación": "RYD"}))
    assert vieja["to"] == [] and vieja["sin_lista"] is True


def test_informe_ryd_sin_solicitud_lleva_el_respaldo_de_ryd(entorno):
    config_store.escribir("contactos_laboratorio.json", [])
    plan = ei.plan_destinatarios("DOLE", "SAN FERNANDO", tipo_aplicacion="RYD")
    assert plan["to"] == ["CCACERES@AGROFRESH.COM", "FGONZALEZ@AGROFRESH.COM"]



def test_el_encabezado_del_correo_se_puede_cambiar_y_por_defecto_es_el_de_siempre():
    from app import mail_templates

    def encabezado(**kw):
        _, _, html, _ = mail_templates.renderizar_informe({"sold_to": "A", "ship_to": "B"}, **kw)
        ini = html.index("letter-spacing")
        return html[ini:html.index("</table>", ini)]

    por_defecto = encabezado()
    assert "INFORME DE ENSAYO" in por_defecto and "Laboratorio de Cromatografía" in por_defecto
    nuevo = encabezado(titulo="Informe de Resultados", subtitulo="Otro texto")
    assert "INFORME DE RESULTADOS" in nuevo and "Otro texto" in nuevo
    assert "INFORME DE ENSAYO" not in nuevo and "Laboratorio de Cromatografía" not in nuevo
    sin_sub = encabezado(subtitulo="")
    assert "INFORME DE ENSAYO" in sin_sub and "Laboratorio de Cromatografía" not in sin_sub


def test_informe_actimist_sin_lista_va_a_carlos_y_cristian_con_jorge_y_el_sistema_en_copia(entorno):
    config_store.escribir("contactos_laboratorio.json", [])
    sol = _solicitud_dole(campos_laboratorio={"Tipo Aplicación": "Actimist"}, respaldo_ryd=True)
    plan = ei.plan_desde_solicitud(sol)
    assert [e.casefold() for e in plan["to"]] == ["cjimenez@agrofresh.com", "cvalenzuela@agrofresh.com"]
    assert plan["sin_lista"] is False
    assert [e.casefold() for e in plan["cc"]] == ["jorge.sandoval@agrofresh.com", "agrofreshreporthub@gmail.com"]
