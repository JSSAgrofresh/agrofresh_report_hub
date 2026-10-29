"""Costo por kilo (C&M-500): lectura del CSV, valor diario, informe, correo a la espera de la matriz y alcance."""
import base64
import os

import pytest
from fastapi.testclient import TestClient

from app import config, costo_kilo, costo_kilo_api, costo_kilo_informe
from app.auth import Usuario, solo_escribiente, usuario_actual
from app.main import app

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "costo_kilo")


def _leer(nombre):
    with open(os.path.join(FIX, nombre), "rb") as f:
        return f.read()


def test_el_original_y_el_tabulado_dan_lo_mismo():
    a = costo_kilo.resumen_diario(costo_kilo.leer_csv(_leer("cm500_original.csv")))
    b = costo_kilo.resumen_diario(costo_kilo.leer_csv(_leer("cm500_tabulado.csv")))
    assert a["dias"] and [d["activos"] for d in a["dias"]] == [d["activos"] for d in b["dias"]]
    assert a["totales"]["activos"] == b["totales"]["activos"]


def test_el_csv_de_costo_kilo_se_reconoce_y_el_de_acctab_no():
    assert costo_kilo.es_costo_kilo(_leer("cm500_original.csv"))
    assert not costo_kilo.es_costo_kilo(b"Fecha,Hora,pH,mV\n2026-10-01,10:00:00,6.5,700\n")
    assert costo_kilo.hay_costo_kilo([("x.csv", _leer("cm500_original.csv"))])
    assert not costo_kilo.hay_costo_kilo([("x.pdf", b"%PDF")])


def test_el_valor_diario_suma_incrementos_y_un_reinicio_no_resta():
    inc = costo_kilo._incrementos([10.0, 12.0, 15.0, 2.0, 5.0, None, 6.0])
    assert sum(inc) == pytest.approx(2 + 3 + 2 + 3 + 1)


def test_primer_y_ultimo_dia_son_parciales():
    r = costo_kilo.resumen_diario(costo_kilo.leer_csv(_leer("cm500_original.csv")))
    assert r["dias"][0]["parcial"] or r["dias"][-1]["parcial"]


def test_un_csv_sin_columnas_conocidas_da_un_mensaje_legible():
    with pytest.raises(ValueError):
        costo_kilo.leer_csv(b"a,b\n1,2\n")


def test_la_matriz_vacia_no_interpreta_ningun_asunto():
    assert costo_kilo.interpretar_asunto("lo que sea") is None


def test_el_correo_espera_la_matriz_y_no_genera_informe(monkeypatch):
    llamadas = []
    monkeypatch.setattr(costo_kilo_api, "guardar_informe", lambda **k: llamadas.append(k))
    r = costo_kilo_api.recibir_por_correo("asunto", [("a.csv", _leer("cm500_original.csv"))], "m1")
    assert r["estado"] == "a_la_espera_de_la_matriz" and not llamadas


def test_con_matriz_el_correo_genera_su_informe(monkeypatch):
    monkeypatch.setattr(costo_kilo, "interpretar_asunto", lambda a: {"cliente": "DOLE", "planta": "DOLE LONTUE"})
    monkeypatch.setattr(config, "STORAGE_DIR", None, raising=False)
    visto = []
    monkeypatch.setattr(costo_kilo_api, "guardar_informe", lambda **k: (visto.append(k), ("2026-10-01_10-00-00", {}))[1])
    r = costo_kilo_api.recibir_por_correo("a", [("a.csv", _leer("cm500_original.csv"))], "m1")
    assert r["estado"] == "informe_generado" and visto[0]["origen"] == "email" and visto[0]["cliente"] == "DOLE"


@pytest.fixture
def cliente_http(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(costo_kilo_api, "nombres_del_catalogo", lambda: {})
    monkeypatch.setattr(costo_kilo_api, "_archivar_en_r2", lambda *a, **k: [])
    yield TestClient(app)
    app.dependency_overrides.clear()


def _interno():
    return Usuario(id="1", email="a@agrofresh.com", nombre="A", tipoAcceso="admin", modulos=["postventa"], reportes=[])


def _cli(cliente, planta=None):
    return Usuario(id="2", email="c@x.cl", nombre="C", tipoAcceso="cliente", modulos=["reports"], reportes=["postventa"],
                   clienteNombre=cliente, plantaNombre=planta)


def _subir(c, cliente, planta):
    app.dependency_overrides[usuario_actual] = _interno
    app.dependency_overrides[solo_escribiente] = _interno
    b64 = base64.b64encode(_leer("cm500_original.csv")).decode()
    r = c.post("/api/costo-kilo/registros", json={"nombre": "x.csv", "contenido_b64": b64, "cliente": cliente, "planta": planta})
    assert r.status_code == 200, r.text
    return r.json()


def test_subir_genera_pdf_y_excel_y_el_cliente_solo_ve_lo_suyo(cliente_http):
    c = cliente_http
    ya = _subir(c, "DOLE", "DOLE LONTUE")
    _subir(c, "VERFRUT", "RAPEL")
    carpeta = ya["carpeta"] if "carpeta" in ya else ya["resumen"]["carpeta"]
    app.dependency_overrides[usuario_actual] = lambda: _cli("DOLE", "DOLE LONTUE")
    lista = c.get("/api/costo-kilo/cliente/informes").json()
    assert [r["cliente"] for r in lista] == ["DOLE"]
    assert "responsable" not in c.get(f"/api/costo-kilo/cliente/informes/{carpeta}").json()
    assert c.get(f"/api/costo-kilo/cliente/informes/{carpeta}/pdf").content[:4] == b"%PDF"
    assert c.get(f"/api/costo-kilo/cliente/informes/{carpeta}/excel").content[:2] == b"PK"
    otra = [r for r in costo_kilo_api.listar() if r["cliente"] == "VERFRUT"][0]["carpeta"]
    assert c.get(f"/api/costo-kilo/cliente/informes/{otra}").status_code == 404
    app.dependency_overrides[usuario_actual] = lambda: _cli(None)
    assert c.get("/api/costo-kilo/cliente/informes").json() == []


def test_el_informe_pdf_y_excel_se_generan(cliente_http):
    _subir(cliente_http, "DOLE", None)
    reg = costo_kilo_api._leer(costo_kilo_api.listar()[0]["carpeta"])
    assert costo_kilo_informe.generar_pdf(reg)[:4] == b"%PDF"
    assert costo_kilo_informe.generar_excel(reg)[:2] == b"PK"
