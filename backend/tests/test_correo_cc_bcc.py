"""
Copia (CC) y copia oculta (BCC) al armar el mensaje.

Si `bcc` no quedara en el mensaje construido, el muestreador nunca recibiría
su copia de la solicitud que él mismo creó -es la garantía del punto 1 del
pedido-. No se arregla la prueba: se arregla `_construir_mime`.
"""
import base64
import email

from app.correo import _construir_mime


def _decodificar(raw: str) -> email.message.Message:
    return email.message_from_bytes(base64.urlsafe_b64decode(raw))


class TestConstruirMime:
    def test_sin_cc_ni_bcc_no_agrega_encabezados(self):
        msg = _decodificar(_construir_mime("a@x.cl", "Asunto", "<p>hola</p>"))
        assert msg["To"] == "a@x.cl"
        assert msg["Cc"] is None
        assert msg["Bcc"] is None

    def test_bcc_queda_en_el_encabezado_del_mensaje(self):
        msg = _decodificar(_construir_mime("a@x.cl", "Asunto", "<p>hola</p>", bcc=["muestreador@agrofresh.com"]))
        assert msg["Bcc"] == "muestreador@agrofresh.com"
        # No reemplaza al destinatario normal: se suma.
        assert msg["To"] == "a@x.cl"

    def test_cc_queda_en_el_encabezado_del_mensaje(self):
        msg = _decodificar(_construir_mime("a@x.cl", "Asunto", "<p>hola</p>", cc=["copia@agrofresh.com"]))
        assert msg["Cc"] == "copia@agrofresh.com"

    def test_varios_bcc_se_juntan_con_coma(self):
        msg = _decodificar(
            _construir_mime("a@x.cl", "Asunto", "<p>hola</p>", bcc=["uno@x.cl", "dos@x.cl"])
        )
        assert msg["Bcc"] == "uno@x.cl, dos@x.cl"
