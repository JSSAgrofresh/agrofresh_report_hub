"""
Envío de correos desde el sistema usando la cuenta SMTP de AgroFresh
(Microsoft 365 / smtp.office365.com:587).

Las credenciales se leen de variables de entorno: MAIL_USER y MAIL_PASSWORD.
Si no están configuradas, los endpoints devuelven 503 con un mensaje claro.
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config

router = APIRouter(prefix="/api/correo", tags=["correo"])

SMTP_HOST = "smtp.office365.com"
SMTP_PORT = 587


def _enviar(destinatario: str, asunto: str, cuerpo_html: str) -> None:
    if not config.MAIL_USER or not config.MAIL_PASSWORD:
        raise HTTPException(503, "El servidor de correo no está configurado (faltan MAIL_USER / MAIL_PASSWORD).")

    msg = MIMEMultipart("alternative")
    msg["From"] = config.MAIL_USER
    msg["To"] = destinatario
    msg["Subject"] = asunto
    msg.attach(MIMEText(cuerpo_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(config.MAIL_USER, config.MAIL_PASSWORD)
            smtp.sendmail(config.MAIL_USER, destinatario, msg.as_string())
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(502, "Error de autenticación SMTP — revisa MAIL_USER y MAIL_PASSWORD.")
    except Exception as exc:
        raise HTTPException(502, f"No se pudo enviar el correo: {exc}")


class CorreoPruebaIn(BaseModel):
    destinatario: str


@router.post("/prueba")
def enviar_prueba(payload: CorreoPruebaIn) -> dict[str, str]:
    """Envía un correo de saludo de prueba al destinatario indicado."""
    _enviar(
        destinatario=payload.destinatario,
        asunto="✅ Prueba de correo — AgroFresh Report Hub",
        cuerpo_html="""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#2d5a27;">AgroFresh Report Hub</h2>
          <p>Este es un correo de prueba enviado desde el sistema.</p>
          <p>Si lo estás leyendo, el envío de correos está funcionando correctamente.</p>
          <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
          <p style="color:#888;font-size:12px;">
            Enviado automáticamente por AgroFresh Report Hub —
            solicitudes.analisis@agrofresh.com
          </p>
        </div>
        """,
    )
    return {"ok": "Correo enviado correctamente."}
