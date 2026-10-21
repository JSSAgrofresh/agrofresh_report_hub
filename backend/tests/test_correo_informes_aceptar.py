"""«Aceptar» de Ingreso de Informes contra Postgres real: carga como el Converter, sin pisar lo que ya existía."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import correo_informes as ci
from app import correo_informes_aceptar as acc
from app import r2
from app.auth import Usuario, usuario_actual
from app.db import conexion, cursor_dict
from app.main import app
from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not (hay_base("correo_informe") and hay_base("carga_datos") and hay_base("planta")),
    reason="sin Postgres con las migraciones de Ingreso de Informes",
)

BUZON = "test-aceptar@prueba.cl"
TEXTO = (Path(__file__).parent / "fixtures" / "correos" / "quiteca_1914.txt").read_text(encoding="utf-8")
CLIENTE = "FRUTAS AGROVIC LIMITADA"
USUARIO = Usuario(id="1", email="jorge.sandoval@agrofresh.com", nombre="Jorge", tipoAcceso="admin_general")
LLEGADA = datetime.now(timezone.utc) - timedelta(days=2)


def _insertar(estado: str = "ok", nro: str = "2026-1914-PC", ot: str = "OT-QUI0053", sha: str = "sha-acc-1") -> int:
    fila = {
        "pdf_nombre": f"{nro}.pdf", "pdf_sha256": sha, "laboratorio": "Quiteca", "soportado": True, "nro_informe": nro,
        "ot": ot, "sold_to": CLIENTE, "ship_to": CLIENTE, "especie": "cereza", "fecha_muestreo": None,
        "archivo_solicitud": None, "estado": estado, "ya_cargado": False, "esperado": {"to": ["lista@cliente.cl"]},
        "hallazgos": [], "para": ["lista@cliente.cl"], "cc": [], "bcc": [],
    }
    correo = {"asunto": f"Informe {nro}", "remitente": "informes@quiteca.cl", "llegada_en": LLEGADA, "enviado_en": LLEGADA}
    with conexion() as conn, cursor_dict(conn) as cur:
        ci.guardar_fila(cur, BUZON, f"<acc-{sha}@x>", correo, fila, "correos/test.pdf")
        cur.execute("SELECT id FROM correo_informe WHERE buzon = %s AND pdf_sha256 = %s", (BUZON, sha))
        return cur.fetchone()["id"]


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    monkeypatch.setattr(r2, "descargar", lambda llave: b"%PDF-falso")
    monkeypatch.setattr("app.informe_lectura.texto_quiteca", lambda datos: TEXTO)
    guardados = []
    monkeypatch.setattr(acc, "_guardar_pdf", lambda *a, **k: guardados.append(a) or {})
    creados = {}
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM correo_informe WHERE buzon = %s", (BUZON,))
        cur.execute("DELETE FROM correccion_converter WHERE valor_crudo = 'AGROVIK'")
        cur.execute("SELECT id FROM cliente WHERE nombre = %s", (CLIENTE,))
        if not cur.fetchone():
            cur.execute("INSERT INTO cliente (nombre) VALUES (%s) RETURNING id", (CLIENTE,))
            cid = cur.fetchone()["id"]
            cur.execute("INSERT INTO planta (cliente_id, nombre) VALUES (%s, %s)", (cid, CLIENTE))
            creados["cliente"] = cid
        cur.execute("SELECT id FROM valor_lista WHERE tipo = 'especie' AND valor_normalizado = 'cereza'")
        if not cur.fetchone():
            cur.execute("INSERT INTO valor_lista (tipo, valor, valor_normalizado) VALUES ('especie','cereza','cereza') RETURNING id")
            creados["especie"] = cur.fetchone()["id"]
    yield guardados
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM correo_informe WHERE buzon = %s", (BUZON,))
        cur.execute("DELETE FROM correccion_converter WHERE valor_crudo = 'AGROVIK'")
        cur.execute("SELECT id FROM carga_datos WHERE archivo LIKE '2026-1914-PC%%' AND origen = 'correo'")
        for c in cur.fetchall():
            try:
                acc.ingest.deshacer_carga(c["id"], USUARIO)
            except Exception:
                pass
        if "cliente" in creados:
            cur.execute("DELETE FROM cliente WHERE id = %s", (creados["cliente"],))
        if "especie" in creados:
            cur.execute("DELETE FROM valor_lista WHERE id = %s", (creados["especie"],))


def _estado(i: int) -> dict:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT decision, carga_id, ya_cargado FROM correo_informe WHERE id = %s", (i,))
        return cur.fetchone()


def test_aceptar_carga_y_deshacer(entorno):
    i = _insertar()
    r = acc.aceptar(i, USUARIO)
    assert r["resultado"] == "cargado" and r["carga_id"]
    assert _estado(i)["decision"] == "aceptado"
    assert ci._ya_cargado({"nro_informe": "2026-1914-PC", "ot": "OT-QUI0053"})
    assert len(entorno) == 1                       # el PDF se guardó una vez
    with pytest.raises(HTTPException) as e:        # no se acepta dos veces
        acc.aceptar(i, USUARIO)
    assert e.value.status_code == 409
    acc.deshacer(i, USUARIO)
    assert _estado(i)["decision"] == "pendiente"
    assert not ci._ya_cargado({"nro_informe": "2026-1914-PC", "ot": "OT-QUI0053"})


def test_ya_cargado_solo_se_marca_revisado(entorno):
    i = _insertar()
    acc.aceptar(i, USUARIO)
    j = _insertar(sha="sha-acc-2")                 # el mismo informe otra vez (reenvío)
    r = acc.aceptar(j, USUARIO)
    assert r["resultado"] == "revisado" and r["carga_id"] is None
    assert len(entorno) == 1                       # no se guarda de nuevo
    acc.deshacer(j, USUARIO)                       # deshacer lo revisado no toca la base
    assert ci._ya_cargado({"nro_informe": "2026-1914-PC", "ot": "OT-QUI0053"})


def test_rechazado_y_otro_laboratorio_se_frenan(entorno):
    i = _insertar()
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("UPDATE correo_informe SET decision = 'rechazado' WHERE id = %s", (i,))
    with pytest.raises(HTTPException) as e:
        acc.aceptar(i, USUARIO)
    assert e.value.status_code == 409
    k = _insertar(sha="sha-acc-3")
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("UPDATE correo_informe SET laboratorio = 'ALS' WHERE id = %s", (k,))
    with pytest.raises(HTTPException) as e:
        acc.aceptar(k, USUARIO)
    assert "Converter" in e.value.detail


def test_listados_distintos_no_cargan_nada(entorno, monkeypatch):
    monkeypatch.setattr("app.informe_lectura.texto_quiteca", lambda d: TEXTO.replace("AGROVIC", "INEXISTENTE"))
    i = _insertar()
    with pytest.raises(HTTPException) as e:
        acc.aceptar(i, USUARIO)
    assert e.value.status_code == 409
    assert _estado(i)["decision"] == "pendiente"


def test_lote_devuelve_errores_por_informe(entorno):
    i = _insertar()
    r = acc.aceptar_varios([i, 999999999], USUARIO)
    assert [a["id"] for a in r["aceptados"]] == [i]
    assert r["errores"][0]["id"] == 999999999


def test_endpoints_solo_para_el_principal(entorno):
    app.dependency_overrides[usuario_actual] = lambda: Usuario(
        id="2", email="otro@agrofresh.com", nombre="Otro", tipoAcceso="admin_general")
    try:
        c = TestClient(app)
        assert c.post("/api/correo-informes/1/aceptar").status_code == 403
        assert c.post("/api/correo-informes/aceptar-lote", json={"ids": [1]}).status_code == 403
        assert c.post("/api/correo-informes/1/deshacer-aceptacion").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_corregir_a_mano_carga_y_recuerda(entorno, monkeypatch):
    """Un Sold To mal escrito se corrige en la pantalla: el informe se carga con lo corregido y queda aprendido."""
    monkeypatch.setattr("app.informe_lectura.texto_quiteca", lambda d: TEXTO.replace("FRUTAS AGROVIC LIMITADA", "AGROVIK"))
    i = _insertar()
    with pytest.raises(HTTPException) as e:
        acc.aceptar(i, USUARIO)
    assert "homogeneizar" in e.value.detail
    r = acc.aceptar(i, USUARIO, {"sold_to": CLIENTE, "ship_to": CLIENTE})
    assert r["resultado"] == "cargado"
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT valor_oficial FROM correccion_converter WHERE campo = 'sold_to' AND valor_crudo = 'AGROVIK'")
        assert cur.fetchone()["valor_oficial"] == CLIENTE
    # la próxima vez que llegue «AGROVIK» ya se corrige solo
    from app import correo_informes_homogeneo as h
    assert h.preparar(b"x")["ok"] is True


def test_completar_fila_marca_lo_que_hay_que_homogeneizar(entorno, monkeypatch):
    from app import correo_informes_homogeneo as h
    monkeypatch.setattr("app.informe_lectura.texto_quiteca", lambda d: TEXTO.replace("FRUTAS AGROVIC LIMITADA", "NO EXISTE SA"))
    fila = {"laboratorio": "Quiteca", "ya_cargado": False, "nro_informe": "x", "hallazgos": [], "estado": "ok"}
    h.completar_fila(fila, b"x")
    assert fila["homogeneo"] is False and fila["estado"] == "amarillo"
    assert fila["hallazgos"][0]["codigo"] == "no_homogeneo"


def test_endpoint_de_homogeneizacion_trae_lo_leido_y_las_opciones(entorno):
    i = _insertar()
    app.dependency_overrides[usuario_actual] = lambda: USUARIO
    try:
        r = TestClient(app).get(f"/api/correo-informes/{i}/homogeneizacion")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    j = r.json()
    assert j["ok"] is True and j["campos"]["sold_to"] == CLIENTE
    assert CLIENTE in j["opciones"]["sold_to"] and CLIENTE in j["opciones"]["ship_to"][CLIENTE]
    assert "cereza" in j["opciones"]["especie"]
