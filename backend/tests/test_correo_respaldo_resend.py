"""Si Gmail falla, el correo sale por Resend; sin Resend, el error de Gmail se conserva."""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app import config, correo


def _gmail_caido(*a, **k):
    raise HTTPException(502, "Error SMTP al enviar correo: Connection unexpectedly closed")


def test_con_resend_el_correo_sale_por_resend_cuando_gmail_falla(monkeypatch):
    monkeypatch.setattr(config, "GMAIL_APP_PASSWORD", "x" * 16)
    monkeypatch.setattr(config, "RESEND_API_KEY", "re_test")
    with patch.object(correo, "_enviar_smtp", _gmail_caido), patch.object(correo, "_enviar_resend", return_value="id-1") as resend:
        r = correo.enviar("a@x.cl, b@x.cl", "Asunto", "<p>hola</p>")
    assert resend.called
    assert r.mensaje_id == "id-1"
    assert r.to == ["a@x.cl", "b@x.cl"]


def test_sin_resend_se_conserva_el_error_de_gmail(monkeypatch):
    monkeypatch.setattr(config, "GMAIL_APP_PASSWORD", "x" * 16)
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    with patch.object(correo, "_enviar_smtp", _gmail_caido):
        with pytest.raises(HTTPException) as exc:
            correo.enviar("a@x.cl", "Asunto", "<p>hola</p>")
    assert exc.value.status_code == 502


def test_resend_recibe_cada_destinatario_por_separado(monkeypatch):
    monkeypatch.setattr(config, "RESEND_API_KEY", "re_test")
    enviado = {}

    class R:
        status_code = 200
        def json(self):
            return {"id": "z"}

    def falso_post(url, json=None, headers=None, timeout=None):
        enviado.update(json)
        return R()

    with patch.object(correo.requests, "post", falso_post):
        correo._enviar_resend("a@x.cl, b@x.cl", "Asunto", "<p>hola</p>")
    assert enviado["to"] == ["a@x.cl", "b@x.cl"]
