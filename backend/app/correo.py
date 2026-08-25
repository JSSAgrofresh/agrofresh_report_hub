"""
Envío de correos vía Resend API (https://resend.com) — funciona sobre HTTPS
(puerto 443), sin restricciones de hosting. La clave se lee de RESEND_API_KEY.
"""
import json
import urllib.request
from urllib.error import URLError

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config

router = APIRouter(prefix="/api/correo", tags=["correo"])

RESEND_URL = "https://api.resend.com/emails"
FROM_ADDRESS = "solicitudes@sanai.work"


def _enviar(destinatario: str, asunto: str, cuerpo_html: str) -> None:
    if not config.RESEND_API_KEY:
        raise HTTPException(503, "El servidor de correo no está configurado (falta RESEND_API_KEY).")

    payload = json.dumps({
        "from": FROM_ADDRESS,
        "to": [destinatario],
        "subject": asunto,
        "html": cuerpo_html,
    }).encode("utf-8")

    req = urllib.request.Request(
        RESEND_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {config.RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status not in (200, 201):
                raise HTTPException(502, f"Resend respondió con status {resp.status}.")
    except HTTPException:
        raise
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(502, f"Resend error {exc.code}: {body}")
    except URLError as exc:
        raise HTTPException(502, f"No se pudo contactar Resend: {exc.reason}")
    except Exception as exc:
        raise HTTPException(502, f"Error al enviar correo: {exc}")


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
            Enviado automáticamente por AgroFresh Report Hub
          </p>
        </div>
        """,
    )
    return {"ok": "Correo enviado correctamente."}
