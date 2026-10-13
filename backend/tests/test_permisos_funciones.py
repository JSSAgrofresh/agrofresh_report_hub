"""Mini funciones asignables y coherencia de la cuenta (ver app/permisos_funciones.py).
Mismos casos que `tieneFuncion`/`normalizarCuenta` en src/features/usuarios/permisos.test.ts."""
import pytest
from fastapi import HTTPException

from app import permisos_funciones as pf
from app.auth import Usuario


def _u(tipo="analista", modulos=None, area="cromatografia"):
    return Usuario(id="1", email="x@agrofresh.com", nombre="X", tipoAcceso=tipo, area=area, modulos=modulos)


def test_admin_general_tiene_todas_y_gerencia_y_cliente_ninguna():
    for f in pf.FUNCIONES:
        assert pf.tiene(_u("admin_general"), f)
        assert not pf.tiene(_u("gerencia", modulos=list(pf.FUNCIONES)), f)
        assert not pf.tiene(_u("cliente", modulos=list(pf.FUNCIONES)), f)


def test_el_resto_solo_tiene_lo_que_se_le_marco():
    u = _u(modulos=["agrofresh_lab", pf.LAB_CRITERIOS])
    assert pf.tiene(u, pf.LAB_CRITERIOS)
    assert not pf.tiene(u, pf.VERIF_FIRMAR)
    assert not pf.tiene(_u(modulos=None), pf.LAB_CRITERIOS)


def test_la_dependencia_responde_403_y_no_401():
    revisar = pf.exigir(pf.LAB_CRITERIOS, "no")
    with pytest.raises(HTTPException) as e:
        revisar(_u(modulos=["agrofresh_lab"]))
    assert e.value.status_code == 403
    assert revisar(_u(modulos=[pf.LAB_CRITERIOS])).email == "x@agrofresh.com"


def test_los_criterios_de_verificaciones_exigen_la_funcion():
    """Sin la función, el servidor niega (403) aunque la llamada se haga directo a la API."""
    from fastapi.testclient import TestClient

    from app.auth import usuario_actual
    from app.main import app

    app.dependency_overrides[usuario_actual] = lambda: _u("analista", modulos=["agrofresh_lab"])
    try:
        c = TestClient(app)
        r = c.post("/api/verificaciones/config/gases", json={"nombre": "N2", "codigo": "N2", "orden": 1, "activo": True})
        assert r.status_code == 403
        r = c.put("/api/verificaciones/config/metodos/1", json={"nombre": "x", "orden": 1, "activo": True})
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(usuario_actual, None)


def test_el_reanalisis_se_puede_dar_a_una_cuenta_concreta():
    from app import toma_muestras as tm

    assert not tm._puede_crear_reanalisis(_u("analista", modulos=["agrofresh_lab"]))
    assert tm._puede_crear_reanalisis(_u("analista", modulos=[pf.TOMA_REANALISIS]))
    assert tm._puede_crear_reanalisis(_u("admin_area"))
    assert not tm._puede_crear_reanalisis(_u("gerencia", modulos=[pf.TOMA_REANALISIS]))


def test_cliente_no_tiene_area_propia_ni_modulos_internos():
    area, modulos, reportes = pf.normalizar_cuenta(
        "cliente", "postventa", ["converter", "storage", "reports"], ["postventa"]
    )
    assert modulos == ["reports", "storage"]  # solo lo que un cliente puede tener
    assert reportes == ["laboratorio", "postventa"]  # «reports» trae su Report de laboratorio
    assert area == "cromatografia"  # se deduce de lo que ve, no de lo que se mandó


def test_cliente_con_solo_accutab_guarda_area_postventa():
    assert pf.normalizar_cuenta("cliente", None, [], ["postventa"]) == ("postventa", [], ["postventa"])


def test_cliente_antiguo_sin_listas_toma_lo_de_su_area():
    assert pf.normalizar_cuenta("cliente", "postventa", None, None) == ("postventa", [], ["postventa"])
    assert pf.normalizar_cuenta("cliente", "cromatografia", None, None) == (
        "cromatografia", ["reports"], ["laboratorio"],
    )


def test_cliente_sin_nada_que_ver_no_puede_existir():
    with pytest.raises(HTTPException) as e:
        pf.normalizar_cuenta("cliente", None, [], [])
    assert e.value.status_code == 400


@pytest.mark.parametrize("tipo", ["admin_general", "gerencia"])
def test_admin_general_y_gerencia_no_guardan_modulos(tipo):
    assert pf.normalizar_cuenta(tipo, "ryd", ["converter"], ["laboratorio"]) == (None, None, None)


def test_el_resto_conserva_su_area_y_descarta_ids_que_no_existen():
    area, modulos, reportes = pf.normalizar_cuenta(
        "admin_area", "ryd", ["reports", "reports", "usuarios", pf.LAB_CRITERIOS], ["postventa", "x"]
    )
    assert area == "ryd"
    assert modulos == ["reports", pf.LAB_CRITERIOS]
    assert reportes == ["postventa"]
