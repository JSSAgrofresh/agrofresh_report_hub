"""
Un token de Gmail revocado no debe cerrar la sesión del usuario.

`_gmail_access_token` levantaba HTTPException(401) cuando Google respondía
`invalid_grant`. El frontend interpreta cualquier 401 como "sesión vencida"
y desloguea al usuario, aunque su sesión estuviera perfectamente vigente.

El arreglo es devolver 503 (servicio no disponible) en ese caso: es un
problema de configuración del backend, no de la sesión del usuario.

Si este test falla, un operador que crea una solicitud es expulsado del
sistema cuando el token de Gmail expira, aunque la solicitud se guardó bien.
No se arregla el test: se arregla `_gmail_access_token`.
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.correo import _gmail_access_token


def _mock_invalid_grant():
    resp = MagicMock()
    resp.status_code = 400
    resp.json.return_value = {"error": "invalid_grant", "error_description": "Token has been expired or revoked."}
    resp.text = "invalid_grant"
    return resp


class TestGmailAccessToken:
    def test_invalid_grant_devuelve_503_no_401(self):
        """Un refresh token revocado es un problema del servidor, no de la
        sesión del usuario. Debe dar 503, nunca 401."""
        with patch("app.correo.requests.post", return_value=_mock_invalid_grant()):
            with pytest.raises(HTTPException) as exc:
                _gmail_access_token()
        assert exc.value.status_code == 503, (
            f"invalid_grant devolvió {exc.value.status_code} en vez de 503. "
            "Un 401 expulsa al usuario aunque su sesión esté vigente. "
            "No se arregla el test: se arregla _gmail_access_token."
        )

    def test_invalid_grant_no_devuelve_401(self):
        """Verificación explícita: 401 está prohibido en este caso."""
        with patch("app.correo.requests.post", return_value=_mock_invalid_grant()):
            with pytest.raises(HTTPException) as exc:
                _gmail_access_token()
        assert exc.value.status_code != 401, (
            "invalid_grant devolvió 401 — eso cierra la sesión del usuario. "
            "No se arregla el test: se arregla _gmail_access_token."
        )
