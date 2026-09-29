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


class TestErroresDeR2:
    """Un 403 de Cloudflare (token sin permiso sobre el bucket) llegó como un
    500 sin explicación y nadie supo qué arreglar. Ahora es un 502 que lo dice."""

    def _falla(self, monkeypatch, codigo):
        from botocore.exceptions import ClientError

        def boom(*a, **k):
            raise ClientError({"Error": {"Code": codigo, "Message": "x"}}, "HeadObject")

        monkeypatch.setattr(r2a, "disponible", lambda: True)
        monkeypatch.setattr(r2a, "listar_nivel", boom)

    def test_403_explica_el_permiso_del_token(self, monkeypatch, como):
        self._falla(monkeypatch, "403")
        como(cuenta("admin_general"))
        r = cliente.get("/api/auditoria-interna/carpetas")
        assert r.status_code == 502
        assert "token de R2" in r.json()["detail"] and "auditoria" in r.json()["detail"]

    def test_bucket_inexistente_lo_dice(self, monkeypatch, como):
        self._falla(monkeypatch, "NoSuchBucket")
        como(cuenta("admin_general"))
        r = cliente.get("/api/auditoria-interna/carpetas")
        assert r.status_code == 502 and "no existe" in r.json()["detail"]

    def test_la_subida_tambien_traduce_el_403(self, monkeypatch, como):
        from botocore.exceptions import ClientError

        monkeypatch.setattr(r2a, "disponible", lambda: True)

        def boom(k):
            raise ClientError({"Error": {"Code": "403", "Message": "x"}}, "HeadObject")

        monkeypatch.setattr(r2a, "existe", boom)
        # sin base no se llega a R2: se simula la consulta previa
        import app.auditoria_interna as ai
        from contextlib import contextmanager

        class _Cur:
            def execute(self, *a, **k): pass
            def fetchone(self): return None

        @contextmanager
        def falsa_conexion(escribir=True):
            yield object()

        monkeypatch.setattr(ai, "conexion", falsa_conexion)
        monkeypatch.setattr(ai, "cursor_dict", lambda c: __import__("contextlib").nullcontext(_Cur()))
        como(cuenta("analista"))
        r = cliente.post(
            "/api/auditoria-interna/informes",
            data={"laboratorio": "Quiteca"},
            files={"archivo": ("x.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert r.status_code == 502 and "token de R2" in r.json()["detail"]


class _R2Falso:
    """Un bucket en memoria con la parte de boto3 que usa r2_auditoria."""

    def __init__(self):
        self.objs: dict[str, bytes] = {}

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objs[Key] = Body

    def get_object(self, Bucket, Key):
        import io
        from botocore.exceptions import ClientError
        if Key not in self.objs:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": io.BytesIO(self.objs[Key])}

    def head_object(self, Bucket, Key):
        from botocore.exceptions import ClientError
        if Key not in self.objs:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")

    def delete_object(self, Bucket, Key):
        self.objs.pop(Key, None)

    def copy_object(self, Bucket, Key, CopySource):
        self.objs[Key] = self.objs[CopySource["Key"]]

    def get_paginator(self, _):
        from datetime import datetime
        objs = self.objs

        class P:
            def paginate(self, Bucket, Prefix="", Delimiter=None):
                claves = sorted(k for k in objs if k.startswith(Prefix))
                if not Delimiter:
                    return [{"Contents": [{"Key": k, "Size": 1, "LastModified": datetime(2026, 1, 1)} for k in claves]}]
                carpetas, archivos = set(), []
                for k in claves:
                    resto = k[len(Prefix):]
                    if "/" in resto:
                        carpetas.add(Prefix + resto.split("/")[0] + "/")
                    else:
                        archivos.append({"Key": k, "Size": len(objs[k]), "LastModified": datetime(2026, 1, 1)})
                return [{"CommonPrefixes": [{"Prefix": c} for c in sorted(carpetas)], "Contents": archivos}]

        return P()


class TestPrefijoDeLaCarpeta:
    """La carpeta de auditoría vive DENTRO de agrofresh-storage ("auditoria/"):
    nada de lo de auditoría puede escribirse ni verse fuera de ese prefijo, y
    nada del resto del bucket (solicitudes/, accutab/, respaldos/) puede
    aparecer como carpeta de auditoría."""

    @pytest.fixture
    def bucket(self, monkeypatch):
        falso = _R2Falso()
        monkeypatch.setattr(r2a, "_cliente", lambda: falso)
        monkeypatch.setattr(r2a.config, "R2_AUDITORIA_PREFIJO", "auditoria")
        falso.objs["solicitudes/DOLE/OT-1/OT-1.xlsx"] = b"x"
        falso.objs["accutab/mail/a.pdf"] = b"x"
        return falso

    def test_subir_escribe_bajo_el_prefijo(self, bucket):
        r2a.subir("Quiteca/Dole/a.pdf", b"%PDF")
        assert "auditoria/Quiteca/Dole/a.pdf" in bucket.objs
        assert "Quiteca/Dole/a.pdf" not in bucket.objs
        assert r2a.descargar("Quiteca/Dole/a.pdf") == b"%PDF"
        assert r2a.existe("Quiteca/Dole/a.pdf") and not r2a.existe("a.pdf")

    def test_la_raiz_solo_muestra_lo_de_auditoria(self, bucket):
        assert r2a.listar_nivel("") == ([], [])  # solicitudes/ y accutab/ no aparecen
        r2a.subir("Quiteca/Dole/a.pdf", b"%PDF")
        carpetas, archivos = r2a.listar_nivel("")
        assert carpetas == ["Quiteca"] and archivos == []
        carpetas, archivos = r2a.listar_nivel("Quiteca/Dole")
        assert carpetas == [] and [a["key"] for a in archivos] == ["Quiteca/Dole/a.pdf"]  # ruta relativa

    def test_borrar_carpeta_no_toca_el_resto_del_bucket(self, bucket):
        r2a.subir("Quiteca/Dole/a.pdf", b"1")
        r2a.subir("Quiteca/Dole/b.pdf", b"2")
        for k in r2a.listar_recursivo("Quiteca/"):
            r2a.eliminar(k)
        assert list(bucket.objs) == ["solicitudes/DOLE/OT-1/OT-1.xlsx", "accutab/mail/a.pdf"]

    def test_copiar_y_renombrar_quedan_dentro(self, bucket):
        r2a.subir("Q/D/a.pdf", b"1")
        r2a.copiar("Q/D/a.pdf", "Q/D/b.pdf")
        assert "auditoria/Q/D/b.pdf" in bucket.objs

    def test_por_defecto_usa_el_bucket_de_siempre_con_prefijo(self, monkeypatch):
        import importlib
        from app import config
        monkeypatch.delenv("R2_AUDITORIA_BUCKET", raising=False)
        monkeypatch.delenv("R2_AUDITORIA_PREFIJO", raising=False)
        monkeypatch.setenv("R2_BUCKET", "agrofresh-storage")
        try:
            importlib.reload(config)
            assert config.R2_AUDITORIA_BUCKET == "agrofresh-storage"
            assert config.R2_AUDITORIA_PREFIJO == "auditoria"
            monkeypatch.setenv("R2_AUDITORIA_BUCKET", "otro")
            importlib.reload(config)
            assert config.R2_AUDITORIA_BUCKET == "otro" and config.R2_AUDITORIA_PREFIJO == ""
        finally:
            monkeypatch.undo()
            importlib.reload(config)
