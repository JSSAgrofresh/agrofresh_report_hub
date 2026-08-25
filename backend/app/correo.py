"""
Envío de correos vía Resend API (https://resend.com) — funciona sobre HTTPS
(puerto 443), sin restricciones de hosting. La clave se lee de RESEND_API_KEY.
"""
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import config

router = APIRouter(prefix="/api/correo", tags=["correo"])

RESEND_URL = "https://api.resend.com/emails"
FROM_ADDRESS = "solicitudes@sanai.work"


def _enviar(destinatario: str, asunto: str, cuerpo_html: str) -> None:
    if not config.RESEND_API_KEY:
        raise HTTPException(503, "El servidor de correo no está configurado (falta RESEND_API_KEY).")

    try:
        resp = requests.post(
            RESEND_URL,
            json={
                "from": FROM_ADDRESS,
                "to": [destinatario],
                "subject": asunto,
                "html": cuerpo_html,
            },
            headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
            timeout=15,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(502, f"Resend error {resp.status_code}: {resp.text}")
    except HTTPException:
        raise
    except requests.RequestException as exc:
        raise HTTPException(502, f"No se pudo contactar Resend: {exc}")


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
            Enviado automáticamente por AgroFresh Report Hub · solicitudes@sanai.work
          </p>
        </div>
        """,
    )
    return {"ok": "Correo enviado correctamente."}
