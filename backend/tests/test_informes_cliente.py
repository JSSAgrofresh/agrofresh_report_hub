"""Storage del portal de cliente: solo ve las carpetas de SU Ship To y nada más."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app import informes_cliente as ic
from app.auth import Usuario


def _cliente(planta: str | None = "DOLE CODEGUA", sold_to: str = "DOLE CHILE S.A.") -> Usuario:
    return Usuario(id="1", email="c@x.cl", nombre="C", tipoAcceso="cliente", area="cromatografia",
                   clienteNombre=sold_to, plantaNombre=planta)


@pytest.fixture(autouse=True)
def _sin_base(monkeypatch):
    # carpeta_planta consulta la base para saber si el Ship To se repite: aquí no se repite.
    monkeypatch.setattr("app.informes_storage._clientes_con_planta", lambda _s: 1)
    monkeypatch.setattr(ic, "_plantas_del_cliente", lambda _c: ["DOLE CODEGUA", "DOLE LONTUE"])


def test_cuenta_de_sucursal_solo_ve_su_planta():
    assert ic.carpetas_permitidas(_cliente()) == {"dole codegua"}


def test_cuenta_de_sold_to_ve_las_plantas_de_su_cliente():
    assert ic.carpetas_permitidas(_cliente(planta=None)) == {"dole codegua", "dole lontue"}


def test_quien_no_es_cliente_no_tiene_carpetas():
    interno = Usuario(id="2", email="a@x.cl", nombre="A", tipoAcceso="admin_general")
    assert ic.carpetas_permitidas(interno) == set()


def test_no_puede_entrar_a_la_carpeta_de_otra_planta():
    with pytest.raises(HTTPException) as e:
        ic._exigir_alcance(["VERFRUT RAPEL", "2026-10-01"], _cliente())
    assert e.value.status_code == 404


def test_su_carpeta_pasa_sin_importar_mayusculas():
    ic._exigir_alcance(["dole codegua", "2026-10-01"], _cliente())


def test_un_interno_no_usa_este_router():
    interno = Usuario(id="2", email="a@x.cl", nombre="A", tipoAcceso="admin_general")
    with pytest.raises(HTTPException) as e:
        ic._exigir_alcance([], interno)
    assert e.value.status_code == 403


def test_no_se_sale_con_puntos():
    with pytest.raises(HTTPException) as e:
        ic._partes("DOLE CODEGUA/../VERFRUT RAPEL")
    assert e.value.status_code == 400


def test_descargar_exige_un_pdf_dentro_de_su_carpeta():
    with pytest.raises(HTTPException):
        ic.descargar("DOLE CODEGUA", _cliente())  # es una carpeta, no un archivo
    with pytest.raises(HTTPException) as e:
        ic.descargar("OTRA PLANTA/2026-10-01/x.pdf", _cliente())
    assert e.value.status_code == 404
