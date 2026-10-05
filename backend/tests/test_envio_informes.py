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
        laboratorio="AGROFRESH", sold_to="DOLE", ship_to="SAN FERNANDO", especie="", asunto="", cuerpo="",
        para='["cliente1@dole.cl"]', cc="[]", bcc="[]", archivos=[_archivo()], usuario=usuario or _usuario(),
    )
    base.update(campos)
    return asyncio.run(ei.enviar_informe(**base))


# --- A quién va ------------------------------------------------------------

def test_para_es_solo_la_lista_de_esa_planta(entorno):
    plan = ei.plan_destinatarios("DOLE", "SAN FERNANDO")
    assert plan["to"] == ["cliente1@dole.cl", "cliente2@dole.cl"]
    assert plan["sin_lista"] is False


def test_no_entra_el_respaldo_global_ni_otro_cliente_ni_los_internos(entorno):
    para = ei.plan_destinatarios("DOLE", "SAN FERNANDO")["to"]
    for ajeno in ("global@respaldo.cl", "solo_ship@otro.cl", "otro_cliente@otro.cl",
                  "tecnico@agrofresh.com", "comercial@agrofresh.com", "inactivo@dole.cl"):
        assert ajeno not in para


def test_las_copias_son_las_internas_del_modulo_y_no_las_de_la_planta(entorno):
    plan = ei.plan_destinatarios("DOLE", "SAN FERNANDO")
    assert plan["cc"] == []
    assert plan["bcc"] == ["psalazar@agrofresh.com", "jorge.sandoval@agrofresh.com"]
    # ni Claudia ni la lista interna de la planta
    todos = plan["to"] + plan["cc"] + plan["bcc"]
    assert not any("cguerrero" in e.lower() for e in todos)
    assert "tecnico@agrofresh.com" not in todos


def test_con_especie_vale_su_lista_y_sin_especie_la_general(entorno):
    assert ei.lista_del_cliente("DOLE", "SAN FERNANDO", "Cereza") == ["cereza@dole.cl"]
    # una especie sin lista propia cae en la general, nunca en la de otra especie
    assert ei.lista_del_cliente("DOLE", "SAN FERNANDO", "cerezas") == ["cliente1@dole.cl", "cliente2@dole.cl"]
    assert ei.lista_del_cliente("DOLE", "SAN FERNANDO", "Uva") == ["cliente1@dole.cl", "cliente2@dole.cl"]
    assert ei.especies_con_lista("DOLE", "SAN FERNANDO") == ["Cereza", "Manzana"]


def test_planta_sin_lista_se_avisa(entorno):
    plan = ei.plan_destinatarios("DOLE", "LONTUE")
    assert plan["to"] == [] and plan["sin_lista"] is True


def test_nadie_va_dos_veces():
    r = ei.repartir(["a@x.cl", "B@x.cl"], ["b@x.cl", "c@x.cl"], ["C@x.cl", "A@x.cl", "d@x.cl"])
    assert r == {"to": ["a@x.cl", "B@x.cl"], "cc": ["c@x.cl"], "bcc": ["d@x.cl"]}


def test_nombres_con_tildes_y_mayusculas_calzan(entorno):
    config_store.escribir("contactos_laboratorio.json", [_contacto("a@x.cl", sold_to="Frutícola Ñuble S.A.", ship_to="Chillán")])
    assert ei.lista_del_cliente("FRUTICOLA NUBLE S.A.", "CHILLAN") == ["a@x.cl"]


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
    mail_templates.guardar_informe("AGROFRESH", "Hola {ship_to}", "Informe {cantidad_informes} de {sold_to} por {enviado_por}")
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
    assert out["asunto_base"] == "[AgroFresh] Informe de resultados — DOLE — SAN FERNANDO"
    assert "DOLE — SAN FERNANDO" in out["texto_base"] and "CORREO DE PRUEBA" not in out["texto_base"]


def test_template_por_laboratorio_con_variables_validas(entorno):
    t = ei.obtener_template("AGROFRESH", _usuario())
    assert "{sold_to}" in t["asunto"] and "fecha_envio" in t["variables"]
    guardado = ei.guardar_template("AGROFRESH", ei.TemplateIn(asunto="A {ship_to}", cuerpo="B {laboratorio}"), _usuario())
    assert guardado["asunto"] == "A {ship_to}"
    assert ei.obtener_template("QUITECA", _usuario())["asunto"] == mail_templates.ASUNTO_INFORME  # otro lab: el de siempre
    with pytest.raises(HTTPException) as exc:
        ei.guardar_template("AGROFRESH", ei.TemplateIn(asunto="{numero_solicitud}", cuerpo="x"), _usuario())
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException):
        ei.guardar_template("AGROFRESH", ei.TemplateIn(asunto=" ", cuerpo="x"), _usuario())


def test_el_template_de_informes_no_toca_el_de_solicitudes(entorno):
    antes = mail_templates.obtener("AGROFRESH")
    mail_templates.guardar_informe("AGROFRESH", "X", "Y")
    assert mail_templates.obtener("AGROFRESH") == antes


def test_copias_internas(entorno):
    out = ei.guardar_internos(ei.InternosIn(cc=[" a@x.cl ", "A@x.cl"], bcc=["psalazar@agrofresh.com"]), _usuario())
    assert out["internos"] == {"cc": ["a@x.cl"], "bcc": ["psalazar@agrofresh.com"]}
    assert ei.plan_destinatarios("DOLE", "SAN FERNANDO")["cc"] == ["a@x.cl"]
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


def test_la_lista_es_la_del_servicio_del_informe(entorno):
    config_store.escribir("contactos_laboratorio.json", [
        _contacto("lp@dole.cl"),
        {**_contacto("act@dole.cl"), "servicio": "actimist"},
        {**_contacto("eco@dole.cl"), "servicio": "ecofog"},
    ])
    assert ei.lista_del_cliente("DOLE", "SAN FERNANDO") == ["lp@dole.cl"]
    assert ei.lista_del_cliente("DOLE", "SAN FERNANDO", servicio="Actimist") == ["act@dole.cl"]
    assert ei.lista_del_cliente("DOLE", "SAN FERNANDO", servicio="ecofog") == ["eco@dole.cl"]
    assert ei.lista_del_cliente("DOLE", "SAN FERNANDO", servicio="RYD") == ["lp@dole.cl"]


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
    assert tres["leido"] and tres["plan"]["sin_lista"] is True and tres["plan"]["to"] == []
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
