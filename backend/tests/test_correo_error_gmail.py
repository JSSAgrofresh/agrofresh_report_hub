"""
Una clave de Gmail inválida no debe cerrar la sesión del usuario.

El frontend interpreta cualquier 401 como «sesión vencida» y desloguea. Si el
envío SMTP responde 401 cuando Gmail rechaza la clave de aplicación, quien
estaba enviando una solicitud queda fuera del sistema aunque su sesión esté
vigente (y la solicitud se haya guardado bien). Tiene que ser 503: es un
problema de configuración del servidor.

(Antes esto se probaba sobre `_gmail_access_token`, del envío por OAuth, que ya
no existe: hoy el correo sale por SMTP con clave de aplicación o por Resend.)
"""
import smtplib
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app import config, correo


def test_clave_de_gmail_rechazada_responde_503_no_401(monkeypatch):
    monkeypatch.setattr(config, "GMAIL_APP_PASSWORD", "clave-revocada")
    servidor = MagicMock()
    servidor.__enter__.return_value = servidor
    servidor.login.side_effect = smtplib.SMTPAuthenticationError(535, b"Username and Password not accepted")

    with patch.object(correo.smtplib, "SMTP", return_value=servidor):
        with pytest.raises(HTTPException) as exc:
            correo._enviar_smtp("destino@example.com", "Asunto", "<p>hola</p>")

    assert exc.value.status_code == 503
    assert exc.value.status_code != 401
