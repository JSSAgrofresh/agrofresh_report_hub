"""
Envio de correos via Gmail API con OAuth 2.0.

Proveedor activo: Gmail API (agrofreshreporthub@gmail.com).
Fallback: Resend API si RESEND_API_KEY esta configurada y Gmail no lo esta.

Variables requeridas en .env:
    GMAIL_CLIENT_ID
    GMAIL_CLIENT_SECRET
    GMAIL_REFRESH_TOKEN
    GMAIL_ACCOUNT        (default: agrofreshreporthub@gmail.com)

Para regenerar el refresh token si expira o si el scope cambia, ejecutar:
    cd backend
    .venv\Scripts\python.exe ..\scripts\autorizar_gmail.py

El script vive en la RAIZ del repo (scripts/), no en backend/scripts/.
"""
import base64
import logging
from email.mime.application import MIMEApplication
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

# ----------------------------------------------------------------------------
# Servicio Gmail API OAuth 2.0
# ----------------------------------------------------------------------------

def _gmail_access_token() -> str:
    """Intercambia el refresh token por un access token fresco."""
    if not config.GMAIL_CLIENT_ID:
        raise HTTPException(503, "Falta GMAIL_CLIENT_ID en la configuracion del servidor.")
    if not config.GMAIL_CLIENT_SECRET:
        raise HTTPException(503, "Falta GMAIL_CLIENT_SECRET en la configuracion del servidor.")
    if not config.GMAIL_REFRESH_TOKEN:
        raise HTTPException(503, "Falta GMAIL_REFRESH_TOKEN. Generalo desde backend con: "
            "python ..\\scripts\\autorizar_gmail.py (el script esta en la raiz del repo).")

    try:
        resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": config.GMAIL_CLIENT_ID,
                "client_secret": config.GMAIL_CLIENT_SECRET,
                "refresh_token": config.GMAIL_REFRESH_TOKEN,
                "grant_type": "refresh_token",
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        raise HTTPException(502, f"No se pudo contactar Google OAuth: {exc}")

    if resp.status_code != 200:
        data = resp.json()
        error = data.get("error", "")
        desc = data.get("error_description", resp.text)
        if error == "invalid_grant":
            raise HTTPException(
                401,
                "El refresh token de Gmail es invalido o fue revocado. "
                "Regeneralo desde backend con: python ..\\scripts\\autorizar_gmail.py "
                "(el script esta en la raiz del repo, no en backend/scripts/).",
            )
        if "insufficient" in desc.lower() or "scope" in desc.lower():
            raise HTTPException(
                403,
                "El token de Gmail no tiene el scope gmail.send. "
                "Regeneralo desde backend con: python ..\\scripts\\autorizar_gmail.py",
            )
        raise HTTPException(502, f"Error al obtener access token de Google: {desc}")

    token = resp.json().get("access_token")
    if not token:
        raise HTTPException(502, "Google no devolvio un access token valido.")
    return token


class Adjunto:
    """Un archivo adjunto para incluir en el correo."""
    def __init__(self, nombre: str, contenido: bytes, media_type: str = "application/octet-stream"):
        self.nombre = nombre
        self.contenido = contenido
        self.media_type = media_type


def _construir_mime(
    destinatario: str,
    asunto: str,
    cuerpo_html: str,
    cuerpo_texto: str | None = None,
    adjuntos: list[Adjunto] | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
) -> str:
    """Construye un mensaje MIME y lo codifica en base64url para Gmail API.

    El encabezado Bcc se incluye tal cual: Gmail API lo usa para resolver a
    quién más entregar el correo y lo retira de la copia que de verdad ven
    los demás destinatarios -es el comportamiento estándar de cualquier MTA
    con un mensaje RFC822 que trae ese encabezado-.
    """
    if adjuntos:
        msg = MIMEMultipart("mixed")
        cuerpo = MIMEMultipart("alternative")
        if cuerpo_texto:
            cuerpo.attach(MIMEText(cuerpo_texto, "plain", "utf-8"))
        cuerpo.attach(MIMEText(cuerpo_html, "html", "utf-8"))
        msg.attach(cuerpo)
        for adj in adjuntos:
            parte = MIMEApplication(adj.contenido, Name=adj.nombre)
            parte["Content-Disposition"] = f'attachment; filename="{adj.nombre}"'
            msg.attach(parte)
    else:
        msg = MIMEMultipart("alternative")
        if cuerpo_texto:
            msg.attach(MIMEText(cuerpo_texto, "plain", "utf-8"))
        msg.attach(MIMEText(cuerpo_html, "html", "utf-8"))

    msg["From"] = f"{FROM_DISPLAY} <{config.GMAIL_ACCOUNT}>"
    msg["To"] = destinatario
    if cc:
        msg["Cc"] = ", ".join(cc)
    if bcc:
        msg["Bcc"] = ", ".join(bcc)
    msg["Subject"] = asunto

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return raw


def _enviar_gmail(
    destinatario: str,
    asunto: str,
    cuerpo_html: str,
    cuerpo_texto: str | None = None,
    adjuntos: list[Adjunto] | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
) -> None:
    """Envia un correo via Gmail API usando OAuth 2.0."""
    access_token = _gmail_access_token()
    raw = _construir_mime(destinatario, asunto, cuerpo_html, cuerpo_texto, adjuntos, cc, bcc)

    try:
        resp = requests.post(
            f"https://gmail.googleapis.com/gmail/v1/users/{config.GMAIL_ACCOUNT}/messages/send",
            json={"raw": raw},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        raise HTTPException(502, f"No se pudo contactar Gmail API: {exc}")

    if resp.status_code not in (200, 201):
        data = resp.json()
        error_msg = data.get("error", {}).get("message", resp.text)
        status = resp.status_code
        if status == 401:
            raise HTTPException(401, f"Gmail API: no autorizado. Regenera el refresh token. Detalle: {error_msg}")
        if status == 403:
            raise HTTPException(403, f"Gmail API: permiso denegado (verifica scope gmail.send). Detalle: {error_msg}")
        raise HTTPException(502, f"Gmail API error {status}: {error_msg}")

    logger.info("Correo enviado via Gmail API a %s (id=%s)", destinatario, resp.json().get("id"))


# ----------------------------------------------------------------------------
# Servicio Resend (fallback)
# ----------------------------------------------------------------------------

def _enviar_resend(
    destinatario: str,
    asunto: str,
    cuerpo_html: str,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
) -> None:
    if not config.RESEND_API_KEY:
        raise HTTPException(503, "El servidor de correo no esta configurado.")

    payload: dict = {"from": RESEND_FROM, "to": [destinatario], "subject": asunto, "html": cuerpo_html}
    if cc:
        payload["cc"] = cc
    if bcc:
        payload["bcc"] = bcc

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
) -> None:
    """
    Envia un correo. Usa Gmail API si esta configurado; Resend como fallback.
    Llamar desde cualquier modulo del backend que necesite enviar correos.

    `cc`/`bcc` son listas de correos adicionales -copia visible y copia
    oculta respectivamente-. No reemplazan a `destinatario`, se suman.
    """
    if config.GMAIL_CLIENT_ID and config.GMAIL_CLIENT_SECRET and config.GMAIL_REFRESH_TOKEN:
        _enviar_gmail(destinatario, asunto, cuerpo_html, cuerpo_texto, adjuntos, cc, bcc)
    elif config.RESEND_API_KEY:
        logger.warning("Gmail OAuth no configurado; usando Resend como fallback.")
        _enviar_resend(destinatario, asunto, cuerpo_html, cc, bcc)
    else:
        raise HTTPException(
            503,
            "El servidor de correo no esta configurado. "
            "Agrega GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN al .env.",
        )


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
    if config.GMAIL_CLIENT_ID and config.GMAIL_CLIENT_SECRET and config.GMAIL_REFRESH_TOKEN:
        return {"proveedor": "Gmail API (OAuth 2.0)", "cuenta": config.GMAIL_ACCOUNT}
    if config.RESEND_API_KEY:
        return {"proveedor": "Resend API", "cuenta": RESEND_FROM}
    return {"proveedor": "no configurado", "cuenta": ""}
