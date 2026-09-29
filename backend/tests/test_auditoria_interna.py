"""
Auditoría interna: quién entra, quién edita, y que la carpeta raíz del bucket
no se pueda borrar. Nada de esto toca la base ni R2: los usuarios se inyectan con
dependency_overrides y la disponibilidad de R2 se simula.
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import r2_auditoria as r2a
from app.auditoria_interna import parsear_fecha_envio, puede_auditoria
from app.auth import Usuario, usuario_actual
from app.main import app

cliente = TestClient(app)


def cuenta(tipo, modulos=None, email="ana@agrofresh.com"):
    return Usuario(id="1", email=email, nombre="Ana", tipoAcceso=tipo, modulos=modulos)


class TestAcceso:
    def test_admin_general_entra(self):
        assert puede_auditoria(cuenta("admin_general")).tipoAcceso == "admin_general"

    def test_con_el_modulo_asignado_entra(self):
        assert puede_auditoria(cuenta("admin_area", ["reports", "auditoria_interna"]))

    @pytest.mark.parametrize("tipo", ["admin_area", "analista", "gerencia", "muestreador"])
    def test_sin_el_modulo_no_entra(self, tipo):
        with pytest.raises(HTTPException) as e:
            puede_auditoria(cuenta(tipo, ["reports"]))
        assert e.value.status_code == 403

    def test_gerencia_no_lo_ve_por_defecto(self):
        with pytest.raises(HTTPException):
            puede_auditoria(cuenta("gerencia", None))

    def test_un_cliente_no_entra_ni_con_el_modulo(self):
        with pytest.raises(HTTPException):
            puede_auditoria(cuenta("cliente", ["auditoria_interna"]))


class TestFechaEnvio:
    def test_vacio_es_sin_fecha(self):
        assert parsear_fecha_envio("") is None
        assert parsear_fecha_envio(None) is None
        assert parsear_fecha_envio("   ") is None

    def test_sin_zona_se_toma_como_hora_de_chile(self):
        f = parsear_fecha_envio("2026-09-29T10:30")
        assert f.utcoffset() is not None
        assert f.hour == 10 and f.minute == 30

    def test_con_zona_se_respeta(self):
        f = parsear_fecha_envio("2026-09-29T13:30:00Z")
        assert f.utcoffset().total_seconds() == 0

    def test_basura_da_400(self):
        with pytest.raises(HTTPException) as e:
            parsear_fecha_envio("mañana")
        assert e.value.status_code == 400


class TestNombresDeCarpeta:
    def test_quita_separadores(self):
        assert r2a.segmento_seguro("A/B\\C:D", "x") == "A_B_C_D"

    def test_no_deja_pasar_puntos(self):
        assert r2a.segmento_seguro("..", "Sin ship to") == "Sin ship to"

    def test_vacio_usa_el_defecto(self):
        assert r2a.segmento_seguro("   ", "Sin ship to") == "Sin ship to"

    def test_ruta_rechaza_punto_punto(self):
        with pytest.raises(ValueError):
            r2a.ruta_segura("Quiteca/../otro")

    def test_ruta_normaliza(self):
        assert r2a.ruta_segura("/Quiteca//Dole Codegua/") == "Quiteca/Dole Codegua"
        assert r2a.ruta_segura("") == ""


@pytest.fixture
def r2_simulado(monkeypatch):
    monkeypatch.setattr(r2a, "disponible", lambda: True)
    eliminados = []
    monkeypatch.setattr(r2a, "eliminar", lambda k: eliminados.append(k))
    monkeypatch.setattr(r2a, "listar_recursivo", lambda p: [p + "a.pdf"])
    return eliminados


@pytest.fixture
def como():
    def _como(usuario):
        app.dependency_overrides[usuario_actual] = lambda: usuario
    yield _como
    app.dependency_overrides.clear()


class TestBorrado:
    def test_la_raiz_no_se_borra(self, r2_simulado, como):
        como(cuenta("admin_general"))
        for ruta in ("", "/", "."):
            r = cliente.delete("/api/auditoria-interna/carpetas/carpeta", params={"ruta": ruta})
            assert r.status_code == 400
        assert r2_simulado == []

    def test_solo_el_admin_general_borra(self, r2_simulado, como):
        como(cuenta("admin_area", ["auditoria_interna"]))
        r = cliente.delete("/api/auditoria-interna/carpetas/archivo", params={"ruta": "Quiteca/Dole/a.pdf"})
        assert r.status_code == 403
        r = cliente.delete("/api/auditoria-interna/carpetas/carpeta", params={"ruta": "Quiteca"})
        assert r.status_code == 403
        assert r2_simulado == []

    def test_no_se_borra_un_archivo_suelto_en_la_raiz(self, r2_simulado, como):
        como(cuenta("admin_general"))
        r = cliente.delete("/api/auditoria-interna/carpetas/archivo", params={"ruta": "a.pdf"})
        assert r.status_code == 400

    def test_ruta_con_punto_punto_se_rechaza(self, r2_simulado, como):
        como(cuenta("admin_general"))
        r = cliente.delete("/api/auditoria-interna/carpetas/carpeta", params={"ruta": "../x"})
        assert r.status_code == 400


class TestEditar:
    def test_solo_el_admin_general_edita_la_fecha(self, como):
        como(cuenta("admin_area", ["auditoria_interna"]))
        r = cliente.patch("/api/auditoria-interna/informes/1/fecha-envio", json={"fecha_envio": None})
        assert r.status_code == 403

    def test_solo_el_admin_general_renombra(self, r2_simulado, como):
        como(cuenta("admin_area", ["auditoria_interna"]))
        r = cliente.post("/api/auditoria-interna/carpetas/renombrar", json={"ruta": "a/b.pdf", "nuevo_nombre": "c"})
        assert r.status_code == 403


class TestSubida:
    def test_rechaza_lo_que_no_es_pdf(self, r2_simulado, como):
        como(cuenta("analista"))
        r = cliente.post(
            "/api/auditoria-interna/informes",
            data={"laboratorio": "Quiteca"},
            files={"archivo": ("x.pdf", b"no soy un pdf", "application/pdf")},
        )
        assert r.status_code == 400

    def test_sin_bucket_configurado_avisa(self, monkeypatch, como):
        monkeypatch.setattr(r2a, "disponible", lambda: False)
        como(cuenta("analista"))
        r = cliente.post(
            "/api/auditoria-interna/informes",
            data={"laboratorio": "Quiteca"},
            files={"archivo": ("x.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert r.status_code == 503

    def test_un_cliente_no_puede_subir(self, r2_simulado, como):
        como(cuenta("cliente"))
        r = cliente.post(
            "/api/auditoria-interna/informes",
            data={"laboratorio": "Quiteca"},
            files={"archivo": ("x.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert r.status_code == 403
