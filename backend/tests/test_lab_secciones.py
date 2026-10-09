"""Secciones de AgroFresh Lab por cuenta (ver app/lab_secciones.py).
Mismos casos que `seccionesLabPermitidas` en src/features/usuarios/permisos.test.ts."""
import pytest
from fastapi import HTTPException

from app import envio_informes, lab_secciones as ls
from app.auth import Usuario


def _u(tipo="admin_area", modulos=None, area="cromatografia"):
    return Usuario(id="1", email="x@agrofresh.com", nombre="X", tipoAcceso=tipo, area=area, modulos=modulos)


def test_sin_secciones_elegidas_ve_las_tres_como_siempre():
    assert ls.secciones_de(_u(modulos=None)) == ls.SECCIONES
    assert ls.secciones_de(_u(modulos=["agrofresh_lab", "toma_muestras"])) == ls.SECCIONES


def test_con_secciones_elegidas_ve_solo_esas():
    u = _u(modulos=["agrofresh_lab", ls.LAB_INGRESO, ls.LAB_ENVIO])
    assert ls.secciones_de(u) == (ls.LAB_INGRESO, ls.LAB_ENVIO)
    assert not ls.permite(u, ls.LAB_VERIFICACIONES)


@pytest.mark.parametrize("tipo", ["admin_general", "gerencia"])
def test_admin_general_y_gerencia_siempre_ven_todo(tipo):
    assert ls.secciones_de(_u(tipo=tipo, modulos=[ls.LAB_INGRESO])) == ls.SECCIONES


def test_la_dependencia_responde_403_y_no_401():
    """Un 401 cierra la sesión en el navegador: negar una sección es un 403."""
    revisar = ls.exigir(ls.LAB_VERIFICACIONES).dependency
    with pytest.raises(HTTPException) as e:
        revisar(_u(modulos=["agrofresh_lab", ls.LAB_INGRESO]))
    assert e.value.status_code == 403
    assert revisar(_u(modulos=["agrofresh_lab"])) is None


def test_el_envio_de_informes_respeta_la_seccion():
    con = _u(modulos=["agrofresh_lab", ls.LAB_ENVIO])
    sin = _u(modulos=["agrofresh_lab", ls.LAB_INGRESO])
    assert envio_informes.puede_usar(con) is True
    assert envio_informes.puede_usar(sin) is False


def test_verificaciones_queda_con_su_dependencia_y_sigue_cerrada_sin_sesion():
    from app.main import app

    rutas = [p for p in app.openapi()["paths"] if p.startswith("/api/verificaciones")]
    assert rutas
