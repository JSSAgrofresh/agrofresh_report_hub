"""Cuentas de tipo «comercial»: solo lectura y solo sus plantas (ver app/auth.py, reportes._filtro_alcance,
informes_cliente.carpetas_permitidas y permisos_funciones.normalizar_cuenta)."""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import informes_cliente, permisos_funciones as pf, reportes, usuarios
from app.auth import Usuario, solo_escribiente, solo_interno, usuario_actual
from app.informes_storage import carpeta_planta
from app.main import app


def _com(plantas=None, modulos=("reports", "storage")):
    return Usuario(
        id="9", email="com@agrofresh.com", nombre="Com", tipoAcceso="comercial", modulos=list(modulos),
        reportes=["laboratorio"], plantasAsignadas=plantas,
    )


PLANTAS = [
    {"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE"},
    {"clienteNombre": "VERFRUT", "plantaNombre": None},
]


def test_el_comercial_solo_puede_llevar_report_y_storage():
    area, mods, reps = pf.normalizar_cuenta("comercial", "cromatografia", ["reports", "converter", "auditoria_interna", "storage"], ["postventa"])
    assert area is None and mods == ["reports", "storage"] and reps == ["laboratorio"]
    _, mods, reps = pf.normalizar_cuenta("comercial", None, ["storage"], None)
    assert mods == ["storage"] and reps == []


def test_un_comercial_sin_nada_que_ver_se_rechaza():
    with pytest.raises(HTTPException) as e:
        pf.normalizar_cuenta("comercial", None, ["converter"], None)
    assert e.value.status_code == 400


def test_un_comercial_no_recibe_funciones_sueltas():
    assert not pf.tiene(_com(modulos=["reports", *pf.FUNCIONES]), pf.TOMA_REANALISIS)


def test_el_filtro_de_report_deja_solo_sus_plantas():
    filtro, params = reportes._filtro_alcance(_com(PLANTAS), None, None)
    assert "OR" in filtro
    assert params["com_c0"] == "DOLE" and params["com_p0"] == "DOLE LONTUE"
    assert params["com_c1"] == "VERFRUT" and "com_p1" not in params  # sin planta = todo ese Sold To


def test_el_filtro_de_report_sin_plantas_no_deja_pasar_nada():
    filtro, _ = reportes._filtro_alcance(_com([]), None, None)
    assert "FALSE" in filtro
    filtro, _ = reportes._filtro_alcance(_com(None), None, None)
    assert "FALSE" in filtro


def test_lo_que_pida_el_navegador_solo_acota_mas_nunca_amplia():
    filtro, params = reportes._filtro_alcance(_com(PLANTAS), "AGRICOM", None)
    assert params["cliente"] == "AGRICOM" and "com_c0" in params  # sigue dentro de sus plantas


def test_cierra_las_puertas_internas_y_la_escritura():
    c = _com(PLANTAS)
    for guardia in (solo_interno, solo_escribiente):
        with pytest.raises(HTTPException) as e:
            guardia(c)
        assert e.value.status_code == 403


def test_la_api_interna_le_responde_403():
    app.dependency_overrides[usuario_actual] = lambda: _com(PLANTAS)
    try:
        cli = TestClient(app)
        assert cli.get("/api/usuarios").status_code == 403
        assert cli.get("/api/reportes/clientes").status_code == 403
        assert cli.post("/api/toma-muestras/solicitudes", json={}).status_code == 403
        assert cli.get("/api/auditoria-interna/solicitudes").status_code == 403
    finally:
        app.dependency_overrides.pop(usuario_actual, None)


def test_storage_solo_las_carpetas_de_sus_plantas(monkeypatch):
    monkeypatch.setattr(informes_cliente, "_plantas_del_cliente", lambda sold_to: ["VERFRUT RAPEL", "VERFRUT SAN FERNANDO"] if sold_to == "VERFRUT" else [])
    carpetas = informes_cliente.carpetas_permitidas(_com(PLANTAS))
    assert carpetas == {
        carpeta_planta("DOLE LONTUE", "DOLE").casefold(),
        carpeta_planta("VERFRUT RAPEL", "VERFRUT").casefold(),
        carpeta_planta("VERFRUT SAN FERNANDO", "VERFRUT").casefold(),
    }
    assert informes_cliente.carpetas_permitidas(_com([])) == set()
    with pytest.raises(HTTPException):
        informes_cliente._exigir_alcance([carpeta_planta("OTRA PLANTA", "OTRO")], _com(PLANTAS))


def _cuenta(tipo, plantas):
    return usuarios.UsuarioIn(email="a@b.cl", nombre="A", tipoAcceso=tipo, modulos=["reports"], plantasAsignadas=plantas)


def test_crear_un_comercial_exige_plantas_y_las_deja_limpias():
    with pytest.raises(HTTPException) as e:
        usuarios._validar(_cuenta("comercial", []))
    assert e.value.status_code == 400
    c = _cuenta("comercial", [*PLANTAS, {"clienteNombre": " dole ", "plantaNombre": "dole lontue"}, {"clienteNombre": "", "plantaNombre": "X"}])
    usuarios._validar(c)
    assert c.plantasAsignadas == PLANTAS  # sin repetidas ni vacías
    otra = _cuenta("analista", PLANTAS)
    usuarios._validar(otra)
    assert otra.plantasAsignadas is None  # solo el comercial lleva plantas
