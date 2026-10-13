"""Un informe propio de AgroFresh (sin PDF de Converter, con sus resultados en Report y el OT en
`referencia`) cuenta como informe recibido: antes salía como «pendiente de informe»."""
from contextlib import contextmanager

from app import auditoria_interna
from app.auth import Usuario


def _fila(**extra):
    base = {
        "archivo": "OT-AGF0050.xlsx", "numero_solicitud": "OT-AGF0050", "laboratorio": "AGROFRESH",
        "sold_to": "SOCIEDAD AGRICOLA EL PORVENIR SA", "ship_to": "EL PORVENIR (VERFRUT) PLANTA RAPEL",
        "especie": "Mandarina", "fecha_solicitud": None, "fecha_muestreo": None, "creado_en": None,
        "tipo_servicio": None, "variedad": None, "analitos": [],
        "informe_id": None, "nro_informe": None, "nombre_archivo": None, "r2_key": None,
        "fecha_envio": None, "subido_en": None, "report_nro": None, "report_cargado_en": None, "en_report": False,
    }
    return {**base, **extra}


def _listar(monkeypatch, filas):
    consultas: list[str] = []

    class Cur:
        def execute(self, sql, *a):
            consultas.append(sql)

        def fetchall(self):
            return filas

    @contextmanager
    def conexion(escribir=False):
        yield object()

    @contextmanager
    def cursor_dict(conn):
        yield Cur()

    monkeypatch.setattr(auditoria_interna, "conexion", conexion)
    monkeypatch.setattr(auditoria_interna, "cursor_dict", cursor_dict)
    usuario = Usuario(id="1", email="x@agrofresh.com", nombre="X", tipoAcceso="admin_general")
    return auditoria_interna.listar_solicitudes(usuario), consultas


def test_informe_propio_en_report_cuenta_como_recibido(monkeypatch):
    salida, consultas = _listar(monkeypatch, [_fila(report_nro="AGF0001", en_report=True)])
    s = salida[0]
    assert s["informe"] is not None and s["informe"]["nro_informe"] == "AGF0001" and s["informe"]["id"] is None
    assert s["en_report"] is True and s["concretada"] is True
    assert "upper(btrim(s.referencia)) = upper(btrim(sa.numero_solicitud))" in consultas[0]


def test_sin_pdf_ni_resultados_sigue_pendiente(monkeypatch):
    s = _listar(monkeypatch, [_fila()])[0][0]
    assert s["informe"] is None and s["concretada"] is False


def test_con_pdf_de_converter_nada_cambia(monkeypatch):
    s = _listar(monkeypatch, [_fila(informe_id=7, nro_informe="2026-1-PC", nombre_archivo="x.pdf", r2_key="Q/x.pdf", en_report=True)])[0][0]
    assert s["informe"]["id"] == 7 and s["concretada"] is True


def test_analisis_de_la_solicitud_por_el_catalogo_del_laboratorio():
    analitos = [
        {"id": 1, "laboratorio": "ALS", "codigo": "COLIF100"}, {"id": 2, "laboratorio": "ALS", "codigo": "ECOLI100"},
        {"id": 3, "laboratorio": "QUITECA", "codigo": "FDL"}, {"id": 4, "laboratorio": "QUITECA", "codigo": "IMZ"},
    ]
    analisis = [
        {"laboratorio": "ALS", "nombre": "FSMA", "activo": True, "orden": 1, "analitos": [{"analito_id": 1}, {"analito_id": 2}]},
        {"laboratorio": "QUITECA", "nombre": "ANÁLISIS DE RESIDUOS EN FRUTA", "activo": True, "orden": 1,
         "analitos": [{"analito_id": 3}, {"analito_id": 4}]},
    ]
    f = auditoria_interna.analisis_de_solicitud
    assert f("als", ["COLIF100", "ECOLI100"], analitos, analisis) == ["FSMA"]
    assert f("QUITECA", ["FDL", "IMZ"], analitos, analisis) == ["ANÁLISIS DE RESIDUOS EN FRUTA"]
    assert f("QUITECA", ["NO_EXISTE"], analitos, analisis) == []
    assert f(None, ["FDL"], analitos, analisis) == []
