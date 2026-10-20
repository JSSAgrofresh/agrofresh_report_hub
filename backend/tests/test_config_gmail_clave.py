"""La contraseña de aplicación de Gmail se lee sin espacios: Google la muestra en grupos de 4 y con espacios Gmail corta la conexión."""
import importlib

from app import config


def test_la_clave_se_lee_sin_espacios(monkeypatch):
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop ")
    try:
        recargada = importlib.reload(config)
        assert recargada.GMAIL_APP_PASSWORD == "abcdefghijklmnop"
    finally:
        monkeypatch.undo()
        importlib.reload(config)
