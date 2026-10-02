"""
Storage sobre R2: qué se permite tocar y que las operaciones muevan lo correcto.

La política (`permitir`) protege lo que es de la aplicación: `_config`, los
archivos de las solicitudes y las carpetas base. Las operaciones se prueban
contra un bucket falso en memoria, sin red.
"""
import datetime as dt

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

from app import config, r2
from app import storage_permisos as sp
from app import storage_r2 as sr2
from app.auth import Usuario, usuario_actual
from app.main import app


class FakeS3:
    """Lo mínimo de boto3 que usa Storage, con Delimiter incluido."""

    def __init__(self):
        self.objs: dict[str, bytes] = {}

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objs[Key] = Body

    def copy_object(self, Bucket, Key, CopySource):
        self.objs[Key] = self.objs[CopySource["Key"]]

    def delete_object(self, Bucket, Key):
        self.objs.pop(Key, None)

    def delete_objects(self, Bucket, Delete):
        for o in Delete["Objects"]:
            self.objs.pop(o["Key"], None)

    def head_object(self, Bucket, Key):
        if Key not in self.objs:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {}

    def list_objects_v2(self, Bucket, Prefix="", MaxKeys=1000, **_):
        claves = sorted(k for k in self.objs if k.startswith(Prefix))[:MaxKeys]
        return {"Contents": [{"Key": k, "Size": len(self.objs[k])} for k in claves]}

    def get_paginator(self, _):
        outer = self

        class P:
            def paginate(self, Bucket, Prefix="", Delimiter=None):
                claves = sorted(k for k in outer.objs if k.startswith(Prefix))
                if not Delimiter:
                    yield {"Contents": [{"Key": k, "Size": len(outer.objs[k]), "LastModified": dt.datetime(2026, 1, 1)} for k in claves]}
                    return
                prefijos, contenidos = [], []
                for k in claves:
                    resto = k[len(Prefix):]
                    if Delimiter in resto:
                        p = Prefix + resto.split(Delimiter)[0] + Delimiter
                        if p not in prefijos:
                            prefijos.append(p)
                    else:
                        contenidos.append({"Key": k, "Size": len(outer.objs[k]), "LastModified": dt.datetime(2026, 1, 1)})
                yield {"CommonPrefixes": [{"Prefix": p} for p in prefijos], "Contents": contenidos}

        return P()


# ── Política ─────────────────────────────────────────────────────────────

def test_config_nunca_se_toca():
    for op in sr2.OPERACIONES:
        assert sr2.permitir(op, "solicitudes/_config", True)
        assert sr2.permitir(op, "solicitudes/_config/usuarios.json", False)


def test_accutab_se_administra_entero_menos_su_carpeta_base():
    for op in sr2.OPERACIONES:
        assert sr2.permitir(op, "accutab/mail/AGROFRESH_DEMO (1)/a.pdf", False) is None
    assert sr2.permitir("crear", "accutab/mail") is None
    assert sr2.permitir("eliminar", "accutab/mail") is not None
    assert sr2.permitir("renombrar", "accutab/mail") is not None


def test_solicitudes_deja_ordenar_carpetas_pero_no_archivos_ni_borrar():
    assert sr2.permitir("crear", "solicitudes/DOLE") is None
    assert sr2.permitir("renombrar", "solicitudes/DOLE", True) is None
    assert sr2.permitir("mover", "solicitudes/DOLE/2026", True) is None
    assert sr2.permitir("renombrar", "solicitudes/DOLE/OT-1/OT-1.xlsx", False)
    assert sr2.permitir("mover", "solicitudes/DOLE/OT-1/OT-1.xlsx", False)
    assert sr2.permitir("subir", "solicitudes/DOLE")
    assert sr2.permitir("eliminar", "solicitudes/DOLE", True)
    assert sr2.permitir("renombrar", "solicitudes", True)


def test_informes_se_ven_y_se_borran_pero_no_se_reordenan():
    """Los PDF los deja la aplicación en planta/fecha/análisis/laboratorio."""
    ruta = "informes/PLANTA X/2026-09-30/Actimist/Quiteca/i.pdf"
    assert sr2.permitir("eliminar", ruta, False) is None
    assert sr2.permitir("eliminar", "informes/PLANTA X", True) is None
    for op in ("crear", "subir", "renombrar", "mover"):
        assert sr2.permitir(op, ruta, False)
        assert sr2.permitir(op, "informes/PLANTA X", True)
    assert sr2.permitir("eliminar", "informes", True)  # la carpeta base no
    assert sr2.permitir("crear", "informes2/x")  # ni se confunden prefijos parecidos


def test_fuera_de_las_zonas_no_se_toca_nada():
    assert sr2.permitir("crear", "otra/cosa")
    assert sr2.permitir("crear", "")
    assert sr2.permitir("crear", "solicitudes2/x")  # no confundir prefijos parecidos


# ── Operaciones contra el bucket falso ───────────────────────────────────

@pytest.fixture
def bucket(monkeypatch):
    s3 = FakeS3()
    monkeypatch.setattr(r2, "_get_client", lambda: s3)
    monkeypatch.setattr(r2, "disponible", lambda: True)
    monkeypatch.setattr(config, "R2_BUCKET", "b")
    return s3


def test_mover_carpeta_lleva_todo_lo_de_adentro_y_no_deja_nada_atras(bucket):
    bucket.objs.update({"accutab/mail/A/x.pdf": b"1", "accutab/mail/A/sub/y.pdf": b"2", "accutab/mail/B/": b""})
    nuevo = sr2.mover("accutab/mail/A", "accutab/mail/B")
    assert nuevo == "accutab/mail/B/A"
    assert sorted(bucket.objs) == ["accutab/mail/B/", "accutab/mail/B/A/sub/y.pdf", "accutab/mail/B/A/x.pdf"]


def test_renombrar_carpeta_y_archivo(bucket):
    bucket.objs.update({"accutab/mail/A/x.pdf": b"1", "accutab/mail/A/": b""})
    assert sr2.renombrar("accutab/mail/A", "Nueva") == "accutab/mail/Nueva"
    assert sorted(bucket.objs) == ["accutab/mail/Nueva/", "accutab/mail/Nueva/x.pdf"]
    assert sr2.renombrar("accutab/mail/Nueva/x.pdf", "z.pdf") == "accutab/mail/Nueva/z.pdf"
    assert "accutab/mail/Nueva/x.pdf" not in bucket.objs


def test_renombrar_sobre_algo_existente_da_409(bucket):
    from fastapi import HTTPException
    bucket.objs.update({"accutab/mail/A/x": b"1", "accutab/mail/B/y": b"2"})
    with pytest.raises(HTTPException) as e:
        sr2.renombrar("accutab/mail/A", "B")
    assert e.value.status_code == 409


def test_mover_a_una_carpeta_con_el_mismo_nombre_agrega_numero(bucket):
    bucket.objs.update({"accutab/mail/A/x.pdf": b"1", "accutab/mail/B/x.pdf": b"2"})
    assert sr2.mover("accutab/mail/A/x.pdf", "accutab/mail/B") == "accutab/mail/B/x (2).pdf"
    assert bucket.objs["accutab/mail/B/x.pdf"] == b"2"


def test_no_se_mueve_una_carpeta_dentro_de_si_misma(bucket):
    from fastapi import HTTPException
    bucket.objs["accutab/mail/A/sub/x"] = b"1"
    with pytest.raises(HTTPException):
        sr2.mover("accutab/mail/A", "accutab/mail/A/sub")


def test_eliminar_carpeta_borra_todo_lo_suyo_y_solo_lo_suyo(bucket):
    bucket.objs.update({"accutab/mail/A/x": b"1", "accutab/mail/A/": b"", "accutab/mail/AB/y": b"2"})
    assert sr2.eliminar("accutab/mail/A") == 2
    assert list(bucket.objs) == ["accutab/mail/AB/y"]


def test_crear_carpeta_deja_su_marca(bucket):
    assert sr2.crear_carpeta("accutab/mail", "Nueva") == "accutab/mail/Nueva"
    assert "accutab/mail/Nueva/" in bucket.objs
    assert sr2.crear_carpeta("accutab/mail", "Nueva") == "accutab/mail/Nueva (2)"


def test_buscar_ignora_tildes_y_pide_todas_las_palabras():
    claves = [
        ("solicitudes/Agrícola San Clemente/2026/OT-1/OT-1.xlsx", 5, ""),
        ("solicitudes/DOLE/OT-2/informe final.pdf", 9, ""),
    ]
    r = sr2.buscar_en_claves(claves, ["agricola", "clemente"], 50)
    assert [e["nombre"] for e in r] == ["Agrícola San Clemente"]
    r = sr2.buscar_en_claves(claves, ["informe", "final"], 50)
    assert [e["nombre"] for e in r] == ["informe final.pdf"]
    assert sr2.buscar_en_claves(claves, ["dole", "clemente"], 50) == []


# ── Endpoints ────────────────────────────────────────────────────────────

@pytest.fixture
def api(bucket, monkeypatch):
    monkeypatch.setattr(sp, "cargar_reglas", lambda espacio: {"accutab/mail/Reservada": {1}})
    monkeypatch.setattr(sp, "reubicar", lambda *a: None)
    quien = {"u": Usuario(id="2", email="a@x.cl", nombre="A", tipoAcceso="analista", area="cromatografia")}
    app.dependency_overrides[usuario_actual] = lambda: quien["u"]
    yield TestClient(app), bucket, quien
    app.dependency_overrides.pop(usuario_actual, None)


def test_informes_por_la_api_solo_borrar(api):
    cli, bucket, _ = api
    bucket.objs["informes/PLANTA X/2026-09-30/Actimist/Quiteca/i.pdf"] = b"%PDF"
    r = cli.post("/api/storage/r2/subir", data={"ruta": "informes/PLANTA X"}, files={"archivos": ("a.pdf", b"x")})
    assert r.status_code == 403
    r = cli.post("/api/storage/r2/carpetas", json={"ruta_padre": "informes", "nombre": "Nueva"})
    assert r.status_code == 403
    r = cli.request("DELETE", "/api/storage/r2/eliminar", params={"ruta": "informes/PLANTA X/2026-09-30/Actimist/Quiteca/i.pdf"})
    assert r.status_code == 200
    assert "informes/PLANTA X/2026-09-30/Actimist/Quiteca/i.pdf" not in bucket.objs


def test_crear_y_subir_en_accutab(api):
    cli, bucket, _ = api
    assert cli.post("/api/storage/r2/carpetas", json={"ruta_padre": "accutab/mail", "nombre": "Nueva"}).status_code == 200
    r = cli.post("/api/storage/r2/subir", data={"ruta": "accutab/mail/Nueva"}, files={"archivos": ("a.txt", b"hola")})
    assert r.status_code == 200 and "accutab/mail/Nueva/a.txt" in bucket.objs


def test_solicitudes_rechaza_subir_y_borrar_pero_no_carpetas(api):
    cli, bucket, _ = api
    bucket.objs["solicitudes/DOLE/OT-1/OT-1.xlsx"] = b"x"
    r = cli.post("/api/storage/r2/subir", data={"ruta": "solicitudes/DOLE"}, files={"archivos": ("a.txt", b"x")})
    assert r.status_code == 403
    r = cli.request("DELETE", "/api/storage/r2/eliminar", params={"ruta": "solicitudes/DOLE"})
    assert r.status_code == 403
    r = cli.put("/api/storage/r2/renombrar", json={"ruta": "solicitudes/DOLE/OT-1/OT-1.xlsx", "nombre_nuevo": "z.xlsx"})
    assert r.status_code == 403
    assert "solicitudes/DOLE/OT-1/OT-1.xlsx" in bucket.objs
    r = cli.put("/api/storage/r2/renombrar", json={"ruta": "solicitudes/DOLE", "nombre_nuevo": "DOLE CHILE"})
    assert r.status_code == 200
    assert "solicitudes/DOLE CHILE/OT-1/OT-1.xlsx" in bucket.objs


def test_config_es_intocable_por_la_api(api):
    cli, bucket, _ = api
    bucket.objs["solicitudes/_config/usuarios.json"] = b"{}"
    assert cli.request("DELETE", "/api/storage/r2/eliminar", params={"ruta": "solicitudes/_config"}).status_code == 403
    bucket.objs["accutab/mail/B/"] = b""
    assert cli.put("/api/storage/r2/mover", json={"ruta": "accutab/mail/B", "ruta_destino": "solicitudes/_config"}).status_code == 403
    assert "accutab/mail/B/" in bucket.objs


def test_no_se_mueve_entre_solicitudes_y_accutab(api):
    cli, bucket, _ = api
    bucket.objs["solicitudes/DOLE/x/"] = b""
    bucket.objs["accutab/mail/B/"] = b""
    r = cli.put("/api/storage/r2/mover", json={"ruta": "solicitudes/DOLE", "ruta_destino": "accutab/mail/B"})
    assert r.status_code == 403


def test_carpeta_restringida_no_se_toca_sin_acceso(api):
    cli, bucket, _ = api
    bucket.objs["accutab/mail/Reservada/x"] = b"1"
    r = cli.request("DELETE", "/api/storage/r2/eliminar", params={"ruta": "accutab/mail/Reservada"})
    assert r.status_code == 403
    assert "accutab/mail/Reservada/x" in bucket.objs


def test_gerencia_no_escribe_en_r2(api):
    cli, _, quien = api
    quien["u"] = Usuario(id="9", email="g@x.cl", nombre="G", tipoAcceso="gerencia")
    assert cli.post("/api/storage/r2/carpetas", json={"ruta_padre": "accutab/mail", "nombre": "x"}).status_code == 403


def test_busqueda_local_y_r2_respeta_permisos(api, tmp_path, monkeypatch):
    cli, bucket, quien = api
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    (tmp_path / "Informes").mkdir()
    (tmp_path / "Informes" / "Resumen Dole.xlsx").write_text("x")
    bucket.objs.update({"accutab/mail/Reservada/dole secreto.pdf": b"1", "accutab/mail/Publica/dole ok.pdf": b"1"})
    r = cli.get("/api/storage/buscar", params={"q": "dole", "espacio": "local"}).json()
    assert [e["nombre"] for e in r] == ["Resumen Dole.xlsx"]
    r = cli.get("/api/storage/buscar", params={"q": "DOLE", "espacio": "r2"}).json()
    assert [e["nombre"] for e in r] == ["dole ok.pdf"]  # el de la carpeta restringida no aparece
    assert cli.get("/api/storage/buscar", params={"q": "  ", "espacio": "r2"}).json() == []
