"""
Copia (CC) y copia oculta (BCC) al armar el mensaje.

Con SMTP, el BCC no va en los headers del mensaje (para que no sea visible por
los demás destinatarios): se pasa directamente en el sobre SMTP (RCPT TO) dentro
de _enviar_smtp. Los tests verifican que CC sí quede en los headers y que BCC
no aparezca en ellos.
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

    def test_bcc_no_queda_en_encabezado_del_mensaje(self):
        # El BCC va en el sobre SMTP (RCPT TO), no en los headers,
        # para que los demás destinatarios no puedan verlo.
        msg = _decodificar(_construir_mime("a@x.cl", "Asunto", "<p>hola</p>", bcc=["muestreador@agrofresh.com"]))
        assert msg["Bcc"] is None
        assert msg["To"] == "a@x.cl"

    def test_cc_queda_en_el_encabezado_del_mensaje(self):
        msg = _decodificar(_construir_mime("a@x.cl", "Asunto", "<p>hola</p>", cc=["copia@agrofresh.com"]))
        assert msg["Cc"] == "copia@agrofresh.com"
