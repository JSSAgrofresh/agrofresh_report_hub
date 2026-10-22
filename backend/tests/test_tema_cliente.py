"""
Administración General → Funciones: estilo del dashboard de clientes (basico / sobrio).
De fábrica «basico»; lo cambia solo el administrador principal, con su contraseña. Sin base.
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


def _usuario(email="jorge.sandoval@agrofresh.com"):
    return auth.Usuario(id="1", email=email, nombre="Jorge", tipoAcceso="admin_general", area=None, modulos=None)


def test_de_fabrica_es_basico(config_en_disco):
    assert funciones.tema_cliente_activo() == "basico"
    assert reportes.vista(_usuario())["tema_cliente"] == "basico"


@pytest.mark.parametrize("basura", ["sobrio", 1, {"valor": "negro"}, {"valor": 3}, ["sobrio"], None])
def test_un_valor_raro_deja_basico(config_en_disco, basura):
    config_store.escribir(funciones.ARCHIVO, {"report": {"tema_cliente": basura}})
    funciones.invalidar()
    assert funciones.tema_cliente_activo() == "basico"


def test_cambiarlo_pide_la_clave_y_responde_403(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda u, p: p == "buena")
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_tema_cliente(funciones.TemaClienteIn(tema="sobrio", password="mala"), usuario=_usuario())
    assert e.value.status_code == 403
    assert funciones.tema_cliente_activo() == "basico"
    r = funciones.cambiar_tema_cliente(funciones.TemaClienteIn(tema="sobrio", password="buena"), usuario=_usuario())
    assert r["tema_cliente"]["valor"] == "sobrio"
    assert reportes.vista(_usuario())["tema_cliente"] == "sobrio"


def test_un_estilo_desconocido_se_rechaza(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda u, p: True)
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_tema_cliente(funciones.TemaClienteIn(tema="negro", password="x"), usuario=_usuario())
    assert e.value.status_code == 400


def test_solo_el_principal_lo_cambia_y_conserva_lo_demas(config_en_disco, monkeypatch):
    monkeypatch.setattr(funciones, "_clave_correcta", lambda u, p: True)
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_tema_cliente(funciones.TemaClienteIn(tema="sobrio", password="x"), usuario=_usuario("otro@agrofresh.com"))
    assert e.value.status_code == 403
    funciones.cambiar_graficos_informes(funciones.GraficosInformesIn(activo=True, password="x"), usuario=_usuario())
    funciones.cambiar_tema_cliente(funciones.TemaClienteIn(tema="sobrio", password="x"), usuario=_usuario())
    assert funciones.graficos_informes_activos() is True
