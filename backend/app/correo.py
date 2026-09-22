"""
Envio de correos via Gmail SMTP con App Password.

Proveedor activo: Gmail SMTP (agrofreshreporthub@gmail.com).
Fallback: Resend API si RESEND_API_KEY esta configurada y GMAIL_APP_PASSWORD no lo esta.

Variables requeridas en .env:
    GMAIL_APP_PASSWORD   (genera en myaccount.google.com/apppasswords)
    GMAIL_ACCOUNT        (default: agrofreshreporthub@gmail.com)
"""
import base64
import logging
import re
import smtplib
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/correo", tags=["correo"])

FROM_DISPLAY = "AgroFresh Report Hub"
RESEND_URL = "https://api.resend.com/emails"
RESEND_FROM = "solicitudes@sanai.work"
_GMAIL_SMTP_HOST = "smtp.gmail.com"
_GMAIL_SMTP_PORT = 587

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def es_email_valido(valor: str | None) -> bool:
    return bool(valor and _EMAIL_RE.match(valor.strip()))


class ResultadoEnvio(BaseModel):
    """Con qué se envió realmente (después de validar) y el id que Gmail
    asignó al mensaje, para que quien llama pueda dejar constancia."""

    to: list[str]
    cc: list[str] = []
    bcc: list[str] = []
    mensaje_id: str | None = None

# ----------------------------------------------------------------------------
# Servicio Gmail SMTP con App Password
# ----------------------------------------------------------------------------



class Adjunto:
    """Un archivo adjunto para incluir en el correo."""
    def __init__(self, nombre: str, contenido: bytes, media_type: str = "application/octet-stream"):
        self.nombre = nombre
        self.contenido = contenido
        self.media_type = media_type


class ImagenInline:
    """Una imagen incrustada en el HTML del correo (ej. el logo del header),
    referenciada desde `cuerpo_html` como `<img src="cid:{content_id}">`.

    Va aparte de `Adjunto`: no aparece como archivo adjunto descargable, y
    Outlook -a diferencia de Gmail- no muestra imágenes `data:` en base64
    incrustadas directo en el HTML, así que el logo necesita ir por Content-ID
    para que se vea en cualquier cliente de correo.
    """
    def __init__(self, content_id: str, contenido: bytes, subtype: str = "png"):
        self.content_id = content_id
        self.contenido = contenido
        self.subtype = subtype


def _construir_msg(
    destinatario: str,
    asunto: str,
    cuerpo_html: str,
    cuerpo_texto: str | None = None,
    adjuntos: list[Adjunto] | None = None,
    cc: list[str] | None = None,
    imagenes_inline: list[ImagenInline] | None = None,
) -> MIMEMultipart | MIMEText:
    """Construye el objeto MIME del mensaje (sin Bcc en headers).

    Estructura MIME cuando hay imágenes inline (multipart/related envuelve el
    cuerpo + las imágenes) y adjuntos reales (multipart/mixed por fuera):
        mixed
          related
            alternative (text/plain + text/html)
            image/* (Content-ID, cada una)
          application/* (adjuntos reales, si los hay)

    El Bcc no va en los headers: en SMTP se pasa directamente en el sobre
    (RCPT TO) para que no sea visible por los demás destinatarios.
    """
    cuerpo_alternative = MIMEMultipart("alternative")
    if cuerpo_texto:
        cuerpo_alternative.attach(MIMEText(cuerpo_texto, "plain", "utf-8"))
    cuerpo_alternative.attach(MIMEText(cuerpo_html, "html", "utf-8"))

    if imagenes_inline:
        cuerpo = MIMEMultipart("related")
        cuerpo.attach(cuerpo_alternative)
        for img in imagenes_inline:
            parte_img = MIMEImage(img.contenido, _subtype=img.subtype)
            parte_img.add_header("Content-ID", f"<{img.content_id}>")
            parte_img.add_header("Content-Disposition", "inline")
            cuerpo.attach(parte_img)
    else:
        cuerpo = cuerpo_alternative

    if adjuntos:
        msg = MIMEMultipart("mixed")
        msg.attach(cuerpo)
        for adj in adjuntos:
            parte = MIMEApplication(adj.contenido, Name=adj.nombre)
            parte["Content-Disposition"] = f'attachment; filename="{adj.nombre}"'
            msg.attach(parte)
    else:
        msg = cuerpo

    msg["From"] = f"{FROM_DISPLAY} <{config.GMAIL_ACCOUNT}>"
    msg["To"] = destinatario
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = asunto

    return msg


def _construir_mime(
    destinatario: str,
    asunto: str,
    cuerpo_html: str,
    cuerpo_texto: str | None = None,
    adjuntos: list[Adjunto] | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    imagenes_inline: list[ImagenInline] | None = None,
) -> str:
    """Construye el mensaje MIME y lo devuelve codificado en base64url.
    Usado internamente para tests. El parámetro bcc se acepta por compatibilidad
    pero no se incluye en los headers (el sobre SMTP lo maneja _enviar_smtp)."""
    msg = _construir_msg(destinatario, asunto, cuerpo_html, cuerpo_texto, adjuntos, cc, imagenes_inline)
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


def _enviar_smtp(
    destinatario: str,
    asunto: str,
    cuerpo_html: str,
    cuerpo_texto: str | None = None,
    adjuntos: list[Adjunto] | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    imagenes_inline: list[ImagenInline] | None = None,
) -> None:
    """Envia un correo via Gmail SMTP con App Password."""
    if not config.GMAIL_APP_PASSWORD:
        raise HTTPException(503, "Falta GMAIL_APP_PASSWORD en la configuracion del servidor. "
            "Generala en myaccount.google.com/apppasswords.")

    msg = _construir_msg(destinatario, asunto, cuerpo_html, cuerpo_texto, adjuntos, cc, imagenes_inline)

    sobre_destinatarios = [d.strip() for d in destinatario.split(",") if d.strip()]
    if cc:
        sobre_destinatarios += cc
    if bcc:
        sobre_destinatarios += bcc

    try:
        with smtplib.SMTP(_GMAIL_SMTP_HOST, _GMAIL_SMTP_PORT, timeout=20) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(config.GMAIL_ACCOUNT, config.GMAIL_APP_PASSWORD)
            smtp.sendmail(config.GMAIL_ACCOUNT, sobre_destinatarios, msg.as_bytes())
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(
            401,
            "Credenciales SMTP invalidas. Verifica GMAIL_APP_PASSWORD en el .env "
            "(generala en myaccount.google.com/apppasswords).",
        )
    except smtplib.SMTPException as exc:
        raise HTTPException(502, f"Error SMTP al enviar correo: {exc}")

    logger.info(
        "Correo enviado via Gmail SMTP — to=%s cc=%s bcc=%s",
        destinatario, cc or [], bcc or [],
    )


# ----------------------------------------------------------------------------
# Servicio Resend (fallback)
# ----------------------------------------------------------------------------

def _enviar_resend(
    destinatario: str,
    asunto: str,
    cuerpo_html: str,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    adjuntos: list["Adjunto"] | None = None,
) -> str | None:
    if not config.RESEND_API_KEY:
        raise HTTPException(503, "El servidor de correo no esta configurado.")

    payload: dict = {"from": RESEND_FROM, "to": [destinatario], "subject": asunto, "html": cuerpo_html}
    if cc:
        payload["cc"] = cc
    if bcc:
        payload["bcc"] = bcc
    if adjuntos:
        payload["attachments"] = [
            {"filename": a.nombre, "content": base64.b64encode(a.contenido).decode()}
            for a in adjuntos
        ]

    try:
        resp = requests.post(
            RESEND_URL,
            json=payload,
            headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
            timeout=15,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(502, f"Resend error {resp.status_code}: {resp.text}")
    except HTTPException:
        raise
    except requests.RequestException as exc:
        raise HTTPException(502, f"No se pudo contactar Resend: {exc}")

    try:
        return resp.json().get("id")
    except ValueError:
        return None


# ----------------------------------------------------------------------------
# Funcion publica de envio (Gmail primero, Resend como fallback)
# ----------------------------------------------------------------------------

def enviar(
    destinatario: str,
    asunto: str,
    cuerpo_html: str,
    cuerpo_texto: str | None = None,
    adjuntos: list[Adjunto] | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    imagenes_inline: list[ImagenInline] | None = None,
) -> ResultadoEnvio:
    """
    Envia un correo. Usa Gmail API si esta configurado; Resend como fallback.
    Llamar desde cualquier modulo del backend que necesite enviar correos.

    `cc`/`bcc` son listas de correos adicionales -copia visible y copia
    oculta respectivamente-. No reemplazan a `destinatario`, se suman.

    `adjuntos` se pasa a los dos proveedores (Gmail y Resend).
    `imagenes_inline` solo se usa en el envío por Gmail API -Resend, al ser
    solo el respaldo cuando Gmail no está configurado, sigue mandando el HTML
    tal cual sin incrustar imágenes; el logo simplemente no se ve ahí, que es
    mejor que fallar el envío completo-.

    Valida el formato de TODAS las direcciones (to/cc/bcc) antes de intentar
    el envío: Gmail API rechaza el mensaje COMPLETO si una sola dirección
    viene mal escrita, así que una dirección inválida en cc/bcc podía tumbar
    el envío entero sin que quedara claro por qué. Devuelve un
    `ResultadoEnvio` con lo que realmente se envió (para auditoría/logs);
    nunca devuelve éxito sin haberlo logrado.
    """
    to = [d.strip() for d in destinatario.split(",") if d and d.strip()]
    cc = [d.strip() for d in (cc or []) if d and d.strip()]
    bcc = [d.strip() for d in (bcc or []) if d and d.strip()]

    invalidos = [d for d in (to + cc + bcc) if not es_email_valido(d)]
    if invalidos:
        raise HTTPException(400, f"Dirección de correo inválida: {', '.join(invalidos)}")
    if not to:
        raise HTTPException(400, "No hay destinatarios para enviar el correo.")

    if config.GMAIL_APP_PASSWORD:
        _enviar_smtp(destinatario, asunto, cuerpo_html, cuerpo_texto, adjuntos, cc, bcc, imagenes_inline)
        mensaje_id = None
    elif config.RESEND_API_KEY:
        logger.warning("Gmail OAuth no configurado; usando Resend como fallback.")
        mensaje_id = _enviar_resend(destinatario, asunto, cuerpo_html, cc, bcc, adjuntos)
    else:
        raise HTTPException(
            503,
            "El servidor de correo no esta configurado. "
            "Agrega GMAIL_APP_PASSWORD al .env (generala en myaccount.google.com/apppasswords).",
        )
    return ResultadoEnvio(to=to, cc=cc, bcc=bcc, mensaje_id=mensaje_id)


# ----------------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------------

class CorreoPruebaIn(BaseModel):
    destinatario: str


@router.post("/prueba")
def enviar_prueba(payload: CorreoPruebaIn) -> dict[str, str]:
    """Envia un correo de prueba al destinatario indicado."""
    asunto = "[AgroFresh Report Hub] Prueba de envio"
    html = """
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#2d5a27;">AgroFresh Report Hub</h2>
      <p>Este es un correo de prueba enviado desde AgroFresh Report Hub
         mediante la integracion con Gmail API.</p>
      <p>Si recibes este mensaje, la configuracion de envio del sistema
         esta funcionando correctamente.</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
      <p style="color:#888;font-size:12px;">
        Cuenta emisora: agrofreshreporthub@gmail.com<br>
        Enviado automaticamente por AgroFresh Report Hub.
      </p>
    </div>
    """
    texto = (
        "Este es un correo de prueba enviado desde AgroFresh Report Hub "
        "mediante la integracion con Gmail API.\n\n"
        "Si recibes este mensaje, la configuracion de envio del sistema "
        "esta funcionando correctamente.\n\n"
        "Cuenta emisora: agrofreshreporthub@gmail.com"
    )
    enviar(payload.destinatario, asunto, html, texto)
    return {"ok": f"Correo de prueba enviado a {payload.destinatario}."}


@router.get("/estado")
def estado_correo() -> dict[str, str]:
    """Informa que proveedor de correo esta activo sin exponer credenciales."""
    if config.GMAIL_APP_PASSWORD:
        return {"proveedor": "Gmail SMTP (App Password)", "cuenta": config.GMAIL_ACCOUNT}
    if config.RESEND_API_KEY:
        return {"proveedor": "Resend API", "cuenta": RESEND_FROM}
    return {"proveedor": "no configurado", "cuenta": ""}
