"""Más de 2 productos → MIXTO a la vista (lista completa guardada aparte), y
destinatarios de respaldo cuando el laboratorio no tiene lista de solicitud."""
from app import toma_muestras as tm


def _solicitud(**extra):
    base = dict(laboratorio="ALS", solicitante="X", sold_to="S", generado_por="g", analitos_solicitados=["A"])
    return tm.SolicitudIn(**base, **extra)


def test_hasta_dos_productos_se_ven_tal_cual():
    s = _solicitud(producto_utilizado="A, B")
    assert s.producto_utilizado == "A, B"
    assert s.productos_lista == ["A", "B"]


def test_mas_de_dos_productos_dicen_mixto_y_guardan_la_lista():
    s = _solicitud(producto_utilizado="A, B, C", productos_lista=["A", "B", "C"])
    assert s.producto_utilizado == "MIXTO"
    assert s.productos_lista == ["A", "B", "C"]
    # Releer lo guardado no lo cambia.
    otra = _solicitud(**{k: v for k, v in s.model_dump().items() if k in ("producto_utilizado", "productos_lista")})
    assert otra.producto_utilizado == "MIXTO" and otra.productos_lista == ["A", "B", "C"]


def test_sin_productos_queda_vacio():
    s = _solicitud()
    assert s.producto_utilizado is None and s.productos_lista == []


CONTACTOS = [
    {"laboratorio": "ALS", "tipo": "solicitud", "email": "lab@als.cl", "activo": True},
    {"tipo": "resultado_interno", "sold_to": "S", "ship_to": "P", "email": "tec@agrofresh.com", "tipo_copia": "cc", "activo": True, "orden": 1},
    {"tipo": "resultado_interno", "sold_to": "S", "ship_to": "P", "email": "com@agrofresh.com", "tipo_copia": "cc", "activo": True, "orden": 2},
    {"tipo": "resultado_cliente", "sold_to": "S", "ship_to": "P", "email": "cli@x.cl", "activo": True},
]


def test_con_lista_de_solicitud_no_hay_respaldo(monkeypatch):
    monkeypatch.setattr(tm, "_leer_config", lambda n, d: CONTACTOS)
    r = tm.contactos_de_solicitud_de("ALS", {"sold_to": "S", "ship_to": "P"})
    assert r["to"] == ["lab@als.cl"] and r["cc"] == []


def test_sin_lista_va_para_jorge_y_claudia_con_copia_a_tecnicos_y_comerciales(monkeypatch):
    monkeypatch.setattr(tm, "_leer_config", lambda n, d: CONTACTOS[1:])
    r = tm.contactos_de_solicitud_de("ALS", {"sold_to": "S", "ship_to": "P"})
    assert r["to"] == tm.DESTINATARIOS_SIN_LISTA
    assert r["cc"] == ["tec@agrofresh.com", "com@agrofresh.com"]  # sin el contacto del cliente


def test_sin_lista_y_sin_internos_solo_los_dos_para(monkeypatch):
    monkeypatch.setattr(tm, "_leer_config", lambda n, d: [])
    r = tm.contactos_de_solicitud_de("ALS", {"sold_to": "S", "ship_to": "P"})
    assert r == {"to": tm.DESTINATARIOS_SIN_LISTA, "cc": [], "bcc": []}


def test_pdf_y_json_sin_lista_de_resultados_usan_el_respaldo(monkeypatch):
    """Sin contactos de resultado para el Ship To, «Destinatarios de
    resultados» no queda en «—»: Para = Jorge y Claudia, internos en copia."""
    monkeypatch.setattr(tm, "_leer_config", lambda n, d: CONTACTOS[1:3])
    datos = {"sold_to": "S", "ship_to": "P", "especie": ""}
    det = tm._datos_pdf_con_destinatarios_resultados(datos)["destinatarios_resultados_detalle"]
    assert det["para"] == tm.DESTINATARIOS_SIN_LISTA
    assert det["cc"] == ["tec@agrofresh.com", "com@agrofresh.com"]
    assert tm.destinatarios_resultado_por_tipo("ALS", "P", "S", "")["to"] == tm.DESTINATARIOS_SIN_LISTA


def test_pdf_con_lista_de_resultados_no_cambia(monkeypatch):
    monkeypatch.setattr(tm, "_leer_config", lambda n, d: CONTACTOS[1:])
    det = tm._datos_pdf_con_destinatarios_resultados({"sold_to": "S", "ship_to": "P"})["destinatarios_resultados_detalle"]
    assert det["para"] == ["cli@x.cl"]


def _cli(email, **extra):
    return {"tipo": "resultado_cliente", "sold_to": "S", "ship_to": "P", "email": email, "activo": True, **extra}


def test_sin_lista_cuando_en_para_solo_estan_jorge_y_claudia(monkeypatch):
    """«Sin lista de distribución» = el Para de los resultados es solo Jorge y
    Claudia: porque no hay nadie (respaldo) o porque son los únicos cargados."""
    datos = {"sold_to": "S", "ship_to": "P", "especie": "Manzana"}
    # Hay un contacto del cliente: tiene lista.
    assert tm.solicitud_sin_lista(datos, [_cli("cli@x.cl")]) is False
    # No hay a nadie: rige el respaldo.
    assert tm.solicitud_sin_lista(datos, []) is True
    # Solo ellos dos cargados como destinatarios: también.
    solo_ellos = [_cli("jorge.sandoval@agrofresh.com"), _cli("CGUERRERO@agrofresh.com")]
    assert tm.solicitud_sin_lista(datos, solo_ellos) is True
    # Ellos dos más alguien del cliente: tiene lista.
    assert tm.solicitud_sin_lista(datos, [*solo_ellos, _cli("cli@x.cl")]) is False


def test_sin_lista_ignora_internos_inactivos_y_otras_plantas(monkeypatch):
    datos = {"sold_to": "S", "ship_to": "P", "especie": "Manzana"}
    interno = {"tipo": "resultado_interno", "sold_to": "S", "ship_to": "P", "email": "tec@agrofresh.com", "activo": True}
    assert tm.solicitud_sin_lista(datos, [interno]) is True  # los internos van en copia, no son la lista
    assert tm.solicitud_sin_lista(datos, [_cli("cli@x.cl", activo=False)]) is True
    otra_planta = {**_cli("cli@x.cl"), "ship_to": "OTRA"}
    assert tm.solicitud_sin_lista(datos, [otra_planta]) is True


def test_sin_lista_depende_de_la_especie():
    """El Excel maestro trae el correo del cliente POR especie: una planta puede
    tener lista para Manzana y no para Palta."""
    contactos = [_cli("cli@x.cl", especie="Manzana")]
    assert tm.solicitud_sin_lista({"sold_to": "S", "ship_to": "P", "especie": "Manzana"}, contactos) is False
    assert tm.solicitud_sin_lista({"sold_to": "S", "ship_to": "P", "especie": "Palta"}, contactos) is True


def test_listado_lee_la_configuracion_una_sola_vez(monkeypatch):
    """Antes se leía (de R2) una vez por solicitud y el listado tardaba segundos."""
    base = dict(
        numero_solicitud="OT-X1", fecha_solicitud="2026-09-30", creado_en="2026-09-30T10:00:00",
        laboratorio="ALS", solicitante="X", generado_por="g", analitos_solicitados=["A"],
    )
    datos = [
        ("a.xlsx", {**base, "sold_to": "S", "ship_to": "P", "especie": "Manzana"}),   # con lista
        ("b.xlsx", {**base, "sold_to": "S", "ship_to": "P", "especie": "Palta"}),     # sin lista (otra especie)
        ("c.xlsx", {**base, "sold_to": "S", "ship_to": "Q", "especie": "Manzana", "sin_lista_distribucion": False}),  # lo viejo guardado se ignora
    ] + [(f"m{i}.xlsx", {**base, "sold_to": "S", "ship_to": "P", "especie": "Manzana"}) for i in range(300)]
    lecturas = []

    def leer(nombre, defecto):
        lecturas.append(nombre)
        return [_cli("cli@x.cl", especie="Manzana")]

    monkeypatch.setattr(tm, "leer_todas_las_solicitudes", lambda: datos)
    monkeypatch.setattr(tm, "_leer_config", leer)
    usuario = type("U", (), {"tipoAcceso": "admin_general", "email": "a@b.c"})()
    r = {s.archivo: s.sin_lista_distribucion for s in tm.listar_solicitudes(usuario)}
    assert r["a.xlsx"] is False and r["m7.xlsx"] is False
    assert r["b.xlsx"] is True
    assert r["c.xlsx"] is True  # la planta Q no tiene contactos; ignora el False guardado
    assert lecturas.count("contactos_laboratorio.json") == 1
