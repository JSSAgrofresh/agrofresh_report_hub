"""
Administración General → Funciones: el interruptor de los gráficos de ALS y Diagnofruit en Report.
De fábrica apagado (solo se ve la tabla); lo mueve solo el administrador principal, con su contraseña.
Sin base: solo usa el archivo de configuración.
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import auth, config, config_store, funciones, reportes  # noqa: E402


@pytest.fixture
def config_en_disco(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr("app.r2.disponible", lambda: False)
    config_store.escribir(funciones.ARCHIVO, {})
    funciones.invalidar()
    yield
    funciones.invalidar()


def _usuario(email="jorge.sandoval@agrofresh.com", tipo="admin_general"):
    return auth.Usuario(id="1", email=email, nombre="Jorge", tipoAcceso=tipo, area=None, modulos=None)


def test_de_fabrica_estan_apagados(config_en_disco):
    assert funciones.graficos_informes_activos() is False
    assert funciones._estado()["graficos_informes"]["activo"] is False


@pytest.mark.parametrize("basura", ["si", 1, {"activo": "true"}, {"activo": 1}, ["activo"], None])
def test_un_valor_raro_deja_apagado(config_en_disco, basura):
    config_store.escribir(funciones.ARCHIVO, {"report": {"graficos_informes": basura}})
    funciones.invalidar()
    assert funciones.graficos_informes_activos() is False


def test_cambiarlos_pide_la_clave_y_responde_403_no_401(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: password == "buena")
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_graficos_informes(funciones.GraficosInformesIn(activo=True, password="mala"), usuario=_usuario())
    assert e.value.status_code == 403            # un 401 cerraría la sesión en el navegador
    assert funciones.graficos_informes_activos() is False

    r = funciones.cambiar_graficos_informes(funciones.GraficosInformesIn(activo=True, password="buena"), usuario=_usuario())
    assert r["graficos_informes"]["activo"] is True
    assert r["graficos_informes"]["cambiado_por"] == "Jorge"
    assert funciones.graficos_informes_activos() is True


def test_apagarlos_tambien_pide_la_clave(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: password == "buena")
    funciones.cambiar_graficos_informes(funciones.GraficosInformesIn(activo=True, password="buena"), usuario=_usuario())
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_graficos_informes(funciones.GraficosInformesIn(activo=False, password=None), usuario=_usuario())
    assert e.value.status_code == 403
    assert funciones.graficos_informes_activos() is True


def test_solo_el_administrador_principal_los_cambia(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: True)
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_graficos_informes(
            funciones.GraficosInformesIn(activo=True, password="x"), usuario=_usuario(email="otra.persona@agrofresh.com")
        )
    assert e.value.status_code == 403
    assert funciones.graficos_informes_activos() is False


def test_cambiar_un_servicio_no_apaga_ni_enciende_los_graficos(config_en_disco, monkeypatch):
    """Los dos interruptores viven en `report`: mover uno no puede borrar el otro."""
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: True)
    funciones.cambiar_graficos_informes(funciones.GraficosInformesIn(activo=True, password="x"), usuario=_usuario())
    funciones.cambiar_servicio_report(funciones.ServicioReportIn(servicio="ecofog", activo=True, password="x"), usuario=_usuario())
    assert funciones.graficos_informes_activos() is True
    assert "ecofog" in funciones.valores_visibles_en_report()
    # y al revés
    funciones.cambiar_graficos_informes(funciones.GraficosInformesIn(activo=False, password="x"), usuario=_usuario())
    assert "ecofog" in funciones.valores_visibles_en_report()


def test_cualquier_cuenta_lee_como_se_muestra_report(config_en_disco, monkeypatch):
    """Los clientes también ven ALS y Diagnofruit: la lectura no es solo del administrador."""
    assert reportes.vista(_usuario(email="cliente@empresa.cl", tipo="cliente")) == {"graficos_informes": False}
    monkeypatch.setattr(funciones, "_clave_correcta", lambda usuario, password: True)
    funciones.cambiar_graficos_informes(funciones.GraficosInformesIn(activo=True, password="x"), usuario=_usuario())
    assert reportes.vista(_usuario(email="cliente@empresa.cl", tipo="cliente")) == {"graficos_informes": True}
