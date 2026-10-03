"""El informe de cada solicitud en el listado de Toma de muestras → Solicitudes:
cuáles ya tienen informe, su N° y el PDF."""
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from app import informes_solicitud as mod
from app.auth import Usuario, usuario_actual
from app.main import app

cliente = TestClient(app)


def aud(archivo=None, numero=None, nro="2026-1885-PC", id_=1, nombre="informe.pdf"):
    return {"id": id_, "archivo_solicitud": archivo, "numero_solicitud": numero, "nro_informe": nro,
            "nombre_archivo": nombre, "r2_key": f"Quiteca/x/{nombre}", "subido_en": None}


def rep(ref, nro, id_=10):
    return {"id": id_, "nro_solicitud": nro, "referencia": ref}


class TestAsociar:
    def test_pdf_de_converter_por_archivo(self):
        r = mod.asociar([("OT-QUI0047.xlsx", "OT-QUI0047")], [aud(archivo="OT-QUI0047.xlsx")], [])
        assert r == {"OT-QUI0047.xlsx": {"nro_informe": "2026-1885-PC", "numeros": ["2026-1885-PC"],
                                          "pdf_guardado": True, "en_report": False}}

    def test_sin_informe_no_aparece(self):
        assert mod.asociar([("OT-QUI0046.xlsx", "OT-QUI0046")], [aud(archivo="OT-QUI0047.xlsx")], []) == {}

    def test_informe_viejo_solo_con_numero_de_ot(self):
        r = mod.asociar([("a.xlsx", "OT-QUI0040")], [aud(numero="ot-qui0040 ")], [])
        assert r["a.xlsx"]["nro_informe"] == "2026-1885-PC"

    def test_el_numero_no_gana_sobre_el_archivo(self):
        """Una fila con archivo de OTRA solicitud no se toma por el número."""
        r = mod.asociar([("a.xlsx", "OT-QUI0040")], [aud(archivo="b.xlsx", numero="OT-QUI0040")], [])
        assert r == {}

    def test_resultados_en_report_por_ot(self):
        """AgroFresh: un registro por vial, todos con el OT en `referencia`."""
        r = mod.asociar([("a.xlsx", "OT-AGF0050")], [], [rep("OT-AGF0050", "AGF-0101"), rep("OT-AGF0050", "AGF-0102", 11)])
        assert r["a.xlsx"] == {"nro_informe": "AGF-0101", "numeros": ["AGF-0101", "AGF-0102"],
                               "pdf_guardado": False, "en_report": True}

    def test_converter_y_report_juntos_sin_repetir(self):
        r = mod.asociar([("a.xlsx", "OT-QUI0047")], [aud(archivo="a.xlsx")], [rep("OT-QUI0047", "2026-1885-PC")])
        assert r["a.xlsx"]["numeros"] == ["2026-1885-PC"]
        assert r["a.xlsx"]["pdf_guardado"] and r["a.xlsx"]["en_report"]

    def test_el_mas_reciente_gana(self):
        r = mod.asociar([("a.xlsx", "OT-1")], [aud(archivo="a.xlsx", nro="VIEJO"), aud(archivo="a.xlsx", nro="NUEVO", id_=2)], [])
        assert r["a.xlsx"]["nro_informe"] == "NUEVO"

    def test_quiteca_en_report_por_su_numero_de_informe(self):
        """Quiteca llega a Report con SU N° de informe, a veces sin el OT:
        igual cuenta como en Report (la misma regla de Auditoría interna)."""
        r = mod.asociar([("a.xlsx", "OT-QUI0039")], [aud(archivo="a.xlsx", nro="2026-1878-pc")], [], {"2026-1878-PC"})
        assert r["a.xlsx"]["en_report"] is True
        r = mod.asociar([("a.xlsx", "OT-QUI0039")], [aud(archivo="a.xlsx", nro="2026-1878-PC")], [], {"OTRO"})
        assert r["a.xlsx"]["en_report"] is False

    def test_solicitud_sin_numero_no_se_cruza_con_report(self):
        assert mod.asociar([("a.xlsx", "")], [], [rep("", "X")]) == {}


# ---------------------------------------------------------------------------
# Endpoints (base y R2 simulados)
# ---------------------------------------------------------------------------

def cuenta(tipo="admin_general"):
    return Usuario(id="1", email="ana@agrofresh.com", nombre="Ana", tipoAcceso=tipo)


@pytest.fixture
def entorno(monkeypatch):
    estado = {"auditoria": [], "report": [], "visibles": [("a.xlsx", "OT-QUI0047")], "descargas": []}

    @contextmanager
    def _conexion(escribir=True):
        yield None

    @contextmanager
    def _cursor(conn):
        yield None

    monkeypatch.setattr(mod, "conexion", _conexion)
    monkeypatch.setattr(mod, "cursor_dict", _cursor)
    estado["en_report"] = []
    monkeypatch.setattr(mod, "_filas", lambda cur, sql: {
        mod._SQL_AUDITORIA: estado["auditoria"], mod._SQL_REPORT: estado["report"],
        mod._SQL_INFORMES_EN_REPORT: estado["en_report"],
    }[sql])
    monkeypatch.setattr(mod, "_solicitudes_visibles", lambda u: estado["visibles"])
    monkeypatch.setattr(mod.r2a, "disponible", lambda: True)
    monkeypatch.setattr(mod.r2a, "descargar", lambda k: estado["descargas"].append(("aud", k)) or b"%PDF-aud")
    monkeypatch.setattr(mod.r2, "descargar", lambda k: estado["descargas"].append(("r2", k)) or b"%PDF-r2")
    app.dependency_overrides[usuario_actual] = lambda: cuenta()
    yield estado
    app.dependency_overrides.clear()


class TestEndpoints:
    def test_listado(self, entorno):
        entorno["auditoria"] = [aud(archivo="a.xlsx")]
        entorno["en_report"] = [{"nro": "2026-1885-PC"}]
        r = cliente.get("/api/toma-muestras/solicitudes-informes")
        assert r.status_code == 200
        assert r.json()["a.xlsx"]["nro_informe"] == "2026-1885-PC"
        assert r.json()["a.xlsx"]["en_report"] is True

    def test_pdf_de_converter(self, entorno):
        entorno["auditoria"] = [aud(archivo="a.xlsx")]
        r = cliente.get("/api/toma-muestras/solicitudes/a.xlsx/informe/pdf")
        assert r.status_code == 200 and r.content == b"%PDF-aud"
        assert r.headers["content-type"] == "application/pdf"
        assert r.headers["content-disposition"].startswith("inline")

    def test_pdf_desde_report(self, entorno, monkeypatch):
        entorno["report"] = [rep("OT-QUI0047", "AGF-0101", 7)]
        monkeypatch.setattr(mod, "_solicitud", lambda cur, i: {"id": i})
        monkeypatch.setattr(mod, "_buscar_pdf", lambda cur, sol: {"origen": "informes", "nombre": "AGF-0101.pdf", "clave": "informes/P/AGF-0101.pdf"})
        r = cliente.get("/api/toma-muestras/solicitudes/a.xlsx/informe/pdf")
        assert r.status_code == 200 and r.content == b"%PDF-r2"
        assert entorno["descargas"] == [("r2", "informes/P/AGF-0101.pdf")]

    def test_en_report_sin_pdf_avisa(self, entorno, monkeypatch):
        entorno["report"] = [rep("OT-QUI0047", "AGF-0101")]
        monkeypatch.setattr(mod, "_solicitud", lambda cur, i: {"id": i})
        monkeypatch.setattr(mod, "_buscar_pdf", lambda cur, sol: None)
        r = cliente.get("/api/toma-muestras/solicitudes/a.xlsx/informe/pdf")
        assert r.status_code == 404 and "no tiene un PDF" in r.json()["detail"]

    def test_sin_informe_da_404(self, entorno):
        r = cliente.get("/api/toma-muestras/solicitudes/a.xlsx/informe/pdf")
        assert r.status_code == 404

    def test_solicitud_ajena_o_inexistente_da_404(self, entorno):
        """Un muestreador no ve el informe de una solicitud que no es suya."""
        entorno["auditoria"] = [aud(archivo="b.xlsx")]
        r = cliente.get("/api/toma-muestras/solicitudes/b.xlsx/informe/pdf")
        assert r.status_code == 404
        assert entorno["descargas"] == []

    def test_un_cliente_no_entra(self, entorno):
        app.dependency_overrides[usuario_actual] = lambda: cuenta("cliente")
        assert cliente.get("/api/toma-muestras/solicitudes-informes").status_code == 403
        assert cliente.get("/api/toma-muestras/solicitudes/a.xlsx/informe/pdf").status_code == 403


def test_muestreador_solo_ve_sus_solicitudes(monkeypatch):
    """`_solicitudes_visibles` aplica la misma regla del listado."""
    from app import toma_muestras
    monkeypatch.setattr(toma_muestras, "leer_todas_las_solicitudes", lambda: [
        ("mia.xlsx", {"numero_solicitud": "OT-1", "email_solicitante": "ana@agrofresh.com"}),
        ("otra.xlsx", {"numero_solicitud": "OT-2", "email_solicitante": "otro@agrofresh.com"}),
    ])
    assert mod._solicitudes_visibles(cuenta("muestreador")) == [("mia.xlsx", "OT-1")]
    assert len(mod._solicitudes_visibles(cuenta("admin_general"))) == 2


# ---------------------------------------------------------------------------
# Zip de PDF: con al menos un informe, carpetas Solicitudes/ e Informes/
# ---------------------------------------------------------------------------

import io
import zipfile

from app import toma_muestras


@pytest.fixture
def zip_simulado(monkeypatch):
    monkeypatch.setattr(toma_muestras.r2, "disponible", lambda: False)
    monkeypatch.setattr(toma_muestras, "_ruta_archivo", lambda a: f"/x/{a}")
    monkeypatch.setattr(toma_muestras, "_leer_solicitud_archivo", lambda ruta: {"numero_solicitud": ruta.rsplit("/", 1)[-1].split(".")[0]})
    monkeypatch.setattr(toma_muestras, "_datos_pdf_con_destinatarios_resultados", lambda d: d)
    monkeypatch.setattr(toma_muestras, "generar_pdf_solicitud", lambda d, a, b: b"%PDF-sol-" + d["numero_solicitud"].encode())
    monkeypatch.setattr(toma_muestras, "_leer_config", lambda n, d: d)
    app.dependency_overrides[usuario_actual] = lambda: cuenta()
    yield monkeypatch
    app.dependency_overrides.clear()


def _nombres_zip(r):
    assert r.status_code == 200, r.text
    return sorted(zipfile.ZipFile(io.BytesIO(r.content)).namelist())


class TestZip:
    def test_con_un_informe_van_dos_carpetas(self, zip_simulado):
        pedidos = []

        def informes(pares):
            pedidos.append(pares)
            return [("OT-QUI0047 - Informe 2026-1885-PC.pdf", b"%PDF-inf")]

        zip_simulado.setattr(mod, "informes_para_zip", informes)
        r = cliente.post("/api/toma-muestras/solicitudes/pdf-zip", json={"archivos": ["OT-QUI0047.xlsx", "OT-QUI0046.xlsx"]})
        assert _nombres_zip(r) == [
            "Informes/OT-QUI0047 - Informe 2026-1885-PC.pdf",
            "Solicitudes/OT-QUI0046.pdf",
            "Solicitudes/OT-QUI0047.pdf",
        ]
        assert pedidos == [[("OT-QUI0047.xlsx", "OT-QUI0047"), ("OT-QUI0046.xlsx", "OT-QUI0046")]]
        assert "Solicitudes_e_informes" in r.headers["content-disposition"]

    def test_sin_informes_sale_como_siempre(self, zip_simulado):
        zip_simulado.setattr(mod, "informes_para_zip", lambda pares: [])
        r = cliente.post("/api/toma-muestras/solicitudes/pdf-zip", json={"archivos": ["OT-QUI0046.xlsx"]})
        assert _nombres_zip(r) == ["OT-QUI0046.pdf"]
        assert "Solicitudes_PDF" in r.headers["content-disposition"]


class TestInformesParaZip:
    def test_baja_los_que_tienen_pdf_y_salta_el_resto(self, entorno, monkeypatch):
        entorno["auditoria"] = [aud(archivo="a.xlsx", nro="2026-1885-PC"), aud(archivo="b.xlsx", nro="2026-1886-PC", id_=2, nombre="b.pdf")]
        monkeypatch.setattr(mod.r2a, "descargar", lambda k: None if k.endswith("b.pdf") else b"%PDF")
        r = mod.informes_para_zip([("a.xlsx", "OT-1"), ("b.xlsx", "OT-2"), ("c.xlsx", "OT-3")])
        assert r == [("OT-1 - Informe 2026-1885-PC.pdf", b"%PDF")]

    def test_si_la_base_falla_no_rompe_el_zip(self, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("sin base")

        monkeypatch.setattr(mod, "conexion", boom)
        assert mod.informes_para_zip([("a.xlsx", "OT-1")]) == []

    def test_nombre_sin_caracteres_raros(self):
        assert mod.nombre_en_zip("OT-1", "2026/18:85", "x.pdf") == "OT-1 - Informe 2026_18_85.pdf"
        assert mod.nombre_en_zip("OT-1", None, "ORIGINAL.pdf") == "OT-1 - ORIGINAL.pdf"


def test_script_cruce_informes_explica_la_diferencia(monkeypatch, capsys):
    """24 OT con informe vs 22 informes en Report: el script dice por qué."""
    from scripts import cruce_informes as sc

    class Cur:
        def __init__(self):
            self.ultimo = None

        def execute(self, sql, *a):
            self.ultimo = sql

        def fetchall(self):
            if "FROM solicitud_archivo" in self.ultimo:
                return [
                    {"archivo": "a.xlsx", "numero_solicitud": "OT-QUI1", "laboratorio": "QUITECA"},
                    {"archivo": "b.xlsx", "numero_solicitud": "OT-QUI2", "laboratorio": "QUITECA"},
                    {"archivo": "c.xlsx", "numero_solicitud": "OT-QUI3", "laboratorio": "QUITECA"},
                    {"archivo": "d.xlsx", "numero_solicitud": "OT-ALS1", "laboratorio": "ALS"},
                ]
            return [
                {"id": 1, "nro_solicitud": "2026-1", "referencia": "", "laboratorio": "Quiteca"},
                {"id": 2, "nro_solicitud": "2026-9", "referencia": "", "laboratorio": "Quiteca"},
                {"id": 3, "nro_solicitud": "2026-4", "referencia": "", "laboratorio": "Quiteca"},
            ]

    @contextmanager
    def con(escribir=True):
        yield None

    @contextmanager
    def cur_dict(conn):
        yield Cur()

    monkeypatch.setattr(sc, "conexion", con)
    monkeypatch.setattr(sc, "cursor_dict", cur_dict)
    filas = {
        sc._SQL_AUDITORIA: [aud(archivo="a.xlsx", nro="2026-1"), aud(archivo="b.xlsx", nro="2026-1", id_=2),
                            aud(archivo="c.xlsx", nro="2026-3", id_=3), aud(archivo="d.xlsx", nro="2026-4", id_=4)],
        sc._SQL_REPORT: [],
        sc._SQL_INFORMES_EN_REPORT: [{"nro": "2026-1"}, {"nro": "2026-4"}],
    }
    monkeypatch.setattr(sc, "_filas", lambda cur, sql: filas[sql])
    assert sc.main(["--lab", "Quiteca"]) == 0
    out = capsys.readouterr().out
    assert "OT con informe : 3" in out and "informes        : 3" in out
    assert "OT-QUI3  →  informe 2026-3" in out          # A: sin Report
    assert "informe 2026-1  →  OT-QUI1, OT-QUI2" in out  # B: un informe, dos OT
    assert "2026-9  (Quiteca, sin OT)" in out          # C: en Report sin OT
    sc.main([])
    assert "OT-ALS1 (ALS)  →  informe 2026-4 (Quiteca)" in capsys.readouterr().out  # D
