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
