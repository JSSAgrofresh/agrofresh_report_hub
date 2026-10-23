"""
Estilo del portal por tipo de cuenta y por cuenta (cliente, comercial). El predeterminado sigue mandando
cuando no hay regla; «clasico» (marco interno) solo vale para comerciales. Sin base.
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
    monkeypatch.setattr(funciones, "_clave_correcta", lambda u, p: p == "buena")
    config_store.escribir(funciones.ARCHIVO, {})
    funciones.invalidar()
    yield
    funciones.invalidar()


def _principal():
    return auth.Usuario(id="1", email="jorge.sandoval@agrofresh.com", nombre="Jorge", tipoAcceso="admin_general")


def _cuenta(id_, tipo):
    return auth.Usuario(id=str(id_), email=f"{id_}@x.cl", nombre="C", tipoAcceso=tipo)


def test_sin_reglas_todos_ven_el_predeterminado(config_en_disco):
    assert funciones.tema_de_cuenta("7", "comercial") == "basico"
    funciones.cambiar_tema_cliente(funciones.TemaClienteIn(tema="sobrio", password="buena"), usuario=_principal())
    assert funciones.tema_de_cuenta("7", "cliente") == "sobrio"
    assert reportes.vista(_cuenta(7, "comercial"))["tema_cliente"] == "sobrio"


def test_un_tipo_de_cuenta_tiene_su_propio_estilo(config_en_disco):
    funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(tipo="comercial", tema="sobrio", password="buena"), usuario=_principal())
    assert funciones.tema_de_cuenta("7", "comercial") == "sobrio"
    assert funciones.tema_de_cuenta("8", "cliente") == "basico"


def test_una_cuenta_gana_al_tipo_y_quitar_la_regla_vuelve_al_tipo(config_en_disco, monkeypatch):
    class _Cur:
        def execute(self, *a, **k): pass
        def fetchone(self): return {"nombre": "Ana", "tipo_acceso": "comercial"}
        def __enter__(self): return self
        def __exit__(self, *a): return False

    class _Conn:
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr("app.db.conexion", lambda escribir=True: _Conn())
    monkeypatch.setattr("app.db.cursor_dict", lambda conn: _Cur())
    funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(tipo="comercial", tema="sobrio", password="buena"), usuario=_principal())
    funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(usuario_id="7", tema="clasico", password="buena"), usuario=_principal())
    assert funciones.tema_de_cuenta("7", "comercial") == "clasico"
    assert funciones.tema_de_cuenta("9", "comercial") == "sobrio"
    funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(usuario_id="7", tema=None, password="buena"), usuario=_principal())
    assert funciones.tema_de_cuenta("7", "comercial") == "sobrio"


def test_el_marco_interno_solo_vale_para_comerciales(config_en_disco):
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(tipo="cliente", tema="clasico", password="buena"), usuario=_principal())
    assert e.value.status_code == 400
    # Aunque quedara guardado, un cliente nunca recibe «clasico».
    config_store.escribir(funciones.ARCHIVO, {"report": {"temas_cuenta": {"usuarios": {"5": "clasico"}}}})
    funciones.invalidar()
    assert funciones.tema_de_cuenta("5", "cliente") == "basico"


def test_pide_la_clave_y_solo_el_principal(config_en_disco):
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(tipo="comercial", tema="sobrio", password="mala"), usuario=_principal())
    assert e.value.status_code == 403
    otro = auth.Usuario(id="2", email="otro@agrofresh.com", nombre="O", tipoAcceso="admin_general")
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(tipo="comercial", tema="sobrio", password="buena"), usuario=otro)
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(tema="sobrio", password="buena"), usuario=_principal())
    assert e.value.status_code == 400  # ni tipo ni cuenta


def test_cambiar_el_predeterminado_conserva_las_reglas_por_cuenta(config_en_disco):
    funciones.cambiar_tema_cuenta(funciones.TemaCuentaIn(tipo="comercial", tema="sobrio", password="buena"), usuario=_principal())
    funciones.cambiar_tema_cliente(funciones.TemaClienteIn(tema="sobrio", password="buena"), usuario=_principal())
    assert funciones.tema_de_cuenta("7", "comercial") == "sobrio"
    funciones.cambiar_tema_cliente(funciones.TemaClienteIn(tema="basico", password="buena"), usuario=_principal())
    assert funciones.tema_de_cuenta("7", "comercial") == "sobrio"  # su regla de tipo sigue
