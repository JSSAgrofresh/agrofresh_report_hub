"""
Storage → Informes: dónde queda cada PDF (planta / fecha / análisis / laboratorio),
que volver a pasar un informe lo reemplace y que dos clientes con un Ship To del
mismo nombre no se mezclen.
"""
from fastapi.testclient import TestClient

from app import auditoria_interna as ai
from app import informes_storage as inf
from app import r2
from app.auth import Usuario, usuario_actual
from app.main import app

PDF = b"%PDF-1.4 informe"


def test_la_ruta_sigue_planta_fecha_analisis_laboratorio():
    ruta = inf.ruta_informe("PLANTA GARCES MALLOA", "2026-09-30", "Actimist", "Quiteca", "2026-1885-PC.pdf")
    assert ruta == "informes/PLANTA GARCES MALLOA/2026-09-30/Actimist/Quiteca/2026-1885-PC.pdf"


def test_fecha_en_formato_chileno_o_con_hora_va_en_iso():
    assert inf.fecha_iso("30-09-2026") == "2026-09-30"
    assert inf.fecha_iso("1/9/2026") == "2026-09-01"
    assert inf.fecha_iso("2026-09-30T14:00:00") == "2026-09-30"
    assert inf.fecha_iso("") is None and inf.fecha_iso("ayer") is None


def test_lo_que_falta_cae_en_una_carpeta_con_nombre_no_en_la_raiz():
    ruta = inf.ruta_informe("Sin planta", None, "", "", "x.pdf")
    assert ruta == "informes/Sin planta/Sin fecha/Sin tipo de análisis/Sin laboratorio/x.pdf"


def test_el_laboratorio_propio_es_una_sola_carpeta():
    assert inf.laboratorio_visible("Agrofresh") == inf.laboratorio_visible("AGROFRESH") == "AgroFresh"
    assert inf.laboratorio_visible("ALS (Corthon)") == "ALS (Corthon)"


def test_nada_se_escapa_de_su_carpeta():
    ruta = inf.ruta_informe("../x", "2026-09-30", "a/b", "q:u", "../../c.pdf")
    assert ".." not in ruta.split("/") and ruta.count("/") == 5


def test_planta_repetida_entre_clientes_lleva_el_cliente(monkeypatch):
    monkeypatch.setattr(inf, "_clientes_con_planta", lambda ship_to: 2 if ship_to == "CHILLAN" else 1)
    assert inf.carpeta_planta("CHILLAN", "EXPORTADORA PRIZE S.A") == "CHILLAN (EXPORTADORA PRIZE S.A)"
    assert inf.carpeta_planta("PLANTA GARCES MALLOA", "A.G. SERVICIOS SPA") == "PLANTA GARCES MALLOA"
    assert inf.carpeta_planta("", "X") == "Sin planta"


def test_sin_base_la_planta_se_llama_como_el_ship_to(monkeypatch):
    def falla(_):
        raise RuntimeError("sin base")
    monkeypatch.setattr(inf, "_clientes_con_planta", falla)
    assert inf.carpeta_planta("CHILLAN", "X") == "CHILLAN"


class Bucket:
    def __init__(self):
        self.objs = {}

    def subir(self, key, data, content_type="application/pdf"):
        self.objs[key] = data


def test_guardar_sube_el_pdf_y_volver_a_pasarlo_lo_reemplaza(monkeypatch):
    b = Bucket()
    monkeypatch.setattr(r2, "disponible", lambda: True)
    monkeypatch.setattr(r2, "subir", b.subir)
    monkeypatch.setattr(inf, "_clientes_con_planta", lambda _: 1)
    kw = dict(ship_to="P", sold_to="S", fecha="30-09-2026", analisis="Línea de proceso", laboratorio="Quiteca")
    k1 = inf.guardar(PDF, "a.pdf", **kw)
    k2 = inf.guardar(PDF + b"v2", "a.pdf", **kw)
    assert k1 == k2 == "informes/P/2026-09-30/Línea de proceso/Quiteca/a.pdf"
    assert list(b.objs) == [k1] and b.objs[k1].endswith(b"v2")


def test_sin_r2_no_guarda_ni_falla(monkeypatch):
    monkeypatch.setattr(r2, "disponible", lambda: False)
    assert inf.guardar(PDF, "a.pdf", ship_to="P", sold_to="S", fecha=None, analisis=None, laboratorio="Q") is None


def test_converter_sube_el_pdf_tambien_a_informes_antes_de_lo_de_auditoria(monkeypatch):
    """La copia de Informes se guarda ANTES de lo de Auditoría: si Auditoría falla
    (aquí, la base), la copia para el cliente ya quedó."""
    b = Bucket()
    monkeypatch.setattr(r2, "disponible", lambda: True)
    monkeypatch.setattr(r2, "subir", b.subir)
    monkeypatch.setattr(inf, "_clientes_con_planta", lambda _: 1)
    monkeypatch.setattr(ai, "_exigir_r2", lambda: None)

    def sin_base(*a, **k):
        raise RuntimeError("sin base")
    monkeypatch.setattr(ai, "conexion", sin_base)
    app.dependency_overrides[usuario_actual] = lambda: Usuario(id="1", email="a@x.cl", nombre="A", tipoAcceso="analista")
    try:
        r = TestClient(app, raise_server_exceptions=False).post(
            "/api/auditoria-interna/informes",
            data={"laboratorio": "Quiteca", "ship_to": "P", "sold_to": "S", "fecha": "30-09-2026", "analisis": "Actimist"},
            files={"archivo": ("a.pdf", PDF, "application/pdf")},
        )
        assert r.status_code == 500
        assert list(b.objs) == ["informes/P/2026-09-30/Actimist/Quiteca/a.pdf"]
    finally:
        app.dependency_overrides.pop(usuario_actual, None)


def test_un_pdf_invalido_no_se_guarda_en_informes(monkeypatch):
    b = Bucket()
    monkeypatch.setattr(r2, "disponible", lambda: True)
    monkeypatch.setattr(r2, "subir", b.subir)
    app.dependency_overrides[usuario_actual] = lambda: Usuario(id="1", email="a@x.cl", nombre="A", tipoAcceso="analista")
    try:
        r = TestClient(app).post(
            "/api/auditoria-interna/informes",
            data={"laboratorio": "Quiteca"},
            files={"archivo": ("a.pdf", b"no soy pdf", "application/pdf")},
        )
        assert r.status_code == 400 and b.objs == {}
    finally:
        app.dependency_overrides.pop(usuario_actual, None)
