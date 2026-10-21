"""Editar una solicitud ya guardada: función suelta `toma_editar` y solo para tipos que no se envían solos.

No necesita Postgres: se prueba `_exigir_puede_editar` con la configuración de envío automático simulada.
"""
import pytest
from fastapi import HTTPException

from app import permisos_funciones as pf, toma_muestras as tm
from app.auth import Usuario


def _cuenta(tipo: str, modulos: list[str] | None = None) -> Usuario:
    return Usuario(id="9", email="x@agrofresh.com", nombre="X", tipoAcceso=tipo, modulos=modulos)


def _datos(tipo: str, **extra) -> dict:
    return {"campos_laboratorio": {"Tipo Aplicación": tipo}, **extra}


def _cuerpo(tipo: str) -> tm.SolicitudIn:
    return tm.SolicitudIn(
        laboratorio="AGROFRESH", solicitante="J", sold_to="ZZ", generado_por="J", especie="Cerezas",
        analitos_solicitados=["FDL"], campos_laboratorio={"Tipo Aplicación": tipo},
    )


@pytest.fixture
def envio_auto(monkeypatch):
    """Línea de proceso se envía sola; Actimist se guarda y se envía a mano."""
    def _poner(por_tipo: dict[str, bool], activo: bool = True):
        monkeypatch.setattr(tm, "_config_envio_automatico", lambda: tm.EnvioAutomaticoOut(activo=activo, por_tipo=por_tipo))
    _poner({"Actimist": False})
    return _poner


def test_el_administrador_general_siempre_puede(envio_auto):
    tm._exigir_puede_editar(_cuenta("admin_general"), _datos("Línea de proceso"), _cuerpo("Línea de proceso"))


@pytest.mark.parametrize("tipo", ["admin_area", "analista", "muestreador"])
def test_sin_la_funcion_nadie_edita(envio_auto, tipo):
    with pytest.raises(HTTPException) as e:
        tm._exigir_puede_editar(_cuenta(tipo, [pf.TOMA_REANALISIS]), _datos("Actimist"), _cuerpo("Actimist"))
    assert e.value.status_code == 403


def test_con_la_funcion_edita_un_tipo_que_se_guarda_y_se_envia_a_mano(envio_auto):
    tm._exigir_puede_editar(_cuenta("admin_area", [pf.TOMA_EDITAR]), _datos("Actimist"), _cuerpo("Actimist"))


def test_con_la_funcion_no_edita_un_tipo_que_se_envia_solo(envio_auto):
    with pytest.raises(HTTPException) as e:
        tm._exigir_puede_editar(_cuenta("admin_area", [pf.TOMA_EDITAR]), _datos("Línea de proceso"), _cuerpo("Línea de proceso"))
    assert e.value.status_code == 403
    assert "se envían solas" in e.value.detail


def test_tampoco_cambiando_el_tipo_a_uno_que_se_envia_solo(envio_auto):
    """La solicitud es Actimist pero el formulario la pasa a Línea de proceso: se reenviaría sola."""
    with pytest.raises(HTTPException):
        tm._exigir_puede_editar(_cuenta("admin_area", [pf.TOMA_EDITAR]), _datos("Actimist"), _cuerpo("Línea de proceso"))


def test_una_solicitud_de_prueba_siempre_se_puede_editar_con_la_funcion(envio_auto):
    tm._exigir_puede_editar(
        _cuenta("admin_area", [pf.TOMA_EDITAR]), _datos("Línea de proceso", es_prueba=True), _cuerpo("Línea de proceso"),
    )


def test_la_regla_general_manda_cuando_el_tipo_no_tiene_la_suya(envio_auto):
    envio_auto({}, activo=False)  # el envío automático está apagado para todos
    tm._exigir_puede_editar(_cuenta("admin_area", [pf.TOMA_EDITAR]), _datos("Línea de proceso"), _cuerpo("Línea de proceso"))


def test_gerencia_clientes_y_comerciales_nunca_la_tienen():
    for tipo in ("gerencia", "cliente", "comercial"):
        assert not pf.tiene(_cuenta(tipo, [pf.TOMA_EDITAR]), pf.TOMA_EDITAR)


def test_es_una_funcion_valida_para_guardar_en_una_cuenta():
    assert pf.TOMA_EDITAR in pf.MODULOS_VALIDOS
