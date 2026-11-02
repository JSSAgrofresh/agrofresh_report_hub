"""El recorrido completo del control remoto contra Postgres real (se salta sola sin la migración 0072)."""
import pytest
from fastapi import HTTPException

from app import presentacion
from app.auth import Usuario
from app.db import conexion, cursor_dict
from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(not hay_base("presentacion_remota"), reason="sin Postgres con la migración 0072")

EMAIL = "test-presentacion@prueba.cl"


def _admin(email=EMAIL):
    return Usuario(id="9", email=email, nombre="Prueba", tipoAcceso="admin_general", area=None, modulos=[])


@pytest.fixture(autouse=True)
def limpiar():
    def borrar():
        with conexion() as c, cursor_dict(c) as cur:
            cur.execute("DELETE FROM presentacion_remota WHERE email = %s", (EMAIL,))
    borrar()
    yield
    borrar()


def _sync(estado=None, desde=-1):
    return presentacion.sincronizar(presentacion.SincronizarIn(estado=estado, desde=desde), _admin())


def test_sin_computador_el_telefono_ve_la_presentacion_cerrada_y_no_puede_mandar_ordenes():
    assert presentacion.estado(False, _admin())["activa"] is False
    with pytest.raises(HTTPException) as e:
        presentacion.comando(presentacion.ComandoIn(tipo="siguiente"), _admin())
    assert e.value.status_code == 409


def test_el_computador_deja_su_estado_y_el_telefono_lo_lee():
    _sync({"slide": "viaje", "eco": False})
    est = presentacion.estado(False, _admin())
    assert est["activa"] is True and est["estado"]["slide"] == "viaje"


def test_una_orden_del_telefono_llega_una_sola_vez_al_computador():
    _sync({"slide": "portada"})  # abre: desde=-1
    r = presentacion.comando(presentacion.ComandoIn(tipo="ir", datos={"slide": "motor"}), _admin())
    assert r["seq"] == 1
    primera = _sync({"slide": "portada"}, desde=0)
    assert [c["tipo"] for c in primera["comandos"]] == ["ir"] and primera["comandos"][0]["datos"] == {"slide": "motor"}
    segunda = _sync({"slide": "motor"}, desde=primera["seq"])
    assert segunda["comandos"] == []


def test_al_abrir_de_nuevo_no_se_repiten_las_ordenes_de_la_vez_anterior():
    _sync({"slide": "portada"})
    presentacion.comando(presentacion.ComandoIn(tipo="siguiente"), _admin())
    assert _sync({"slide": "portada"}, desde=-1)["comandos"] == []


def test_el_computador_sabe_si_hay_un_telefono_conectado():
    assert _sync({})["control_conectado"] is False
    presentacion.estado(True, _admin())
    assert _sync({})["control_conectado"] is True


def test_cerrar_la_presentacion_se_nota_al_instante():
    _sync({"slide": "viaje"})
    presentacion.cerrar(_admin())
    assert presentacion.estado(False, _admin())["activa"] is False


def test_una_orden_invalida_responde_400():
    _sync({})
    with pytest.raises(HTTPException) as e:
        presentacion.comando(presentacion.ComandoIn(tipo="ir", datos={"slide": "nada"}), _admin())
    assert e.value.status_code == 400


def test_las_notas_se_guardan_por_diapositiva_sin_pisar_las_otras():
    presentacion.guardar_nota(presentacion.NotaIn(slide="viaje", texto="Decir lo del loop"), _admin())
    presentacion.guardar_nota(presentacion.NotaIn(slide="motor", texto="Los 8 engranajes"), _admin())
    presentacion.guardar_nota(presentacion.NotaIn(slide="viaje", texto="Decir lo del loop y la decisión"), _admin())
    notas = presentacion.estado(False, _admin())["notas"]
    assert notas == {"viaje": "Decir lo del loop y la decisión", "motor": "Los 8 engranajes"}


def test_cada_cuenta_tiene_su_propia_presentacion():
    otro = "otro-test-presentacion@prueba.cl"
    try:
        _sync({"slide": "viaje"})
        assert presentacion.estado(False, _admin(otro))["activa"] is False
    finally:
        with conexion() as c, cursor_dict(c) as cur:
            cur.execute("DELETE FROM presentacion_remota WHERE email = %s", (otro,))


def test_una_nota_de_una_diapositiva_que_no_existe_se_rechaza():
    with pytest.raises(HTTPException) as e:
        presentacion.guardar_nota(presentacion.NotaIn(slide="x", texto="a"), _admin())
    assert e.value.status_code == 400
