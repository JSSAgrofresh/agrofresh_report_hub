"""Plantillas configurables para el correo de solicitudes de análisis."""
import logging
import os
from html import escape
from string import Formatter

from fastapi import HTTPException

from . import config_store
from .correo import ImagenInline

logger = logging.getLogger(__name__)

ARCHIVO = "templates_mail_solicitudes.json"
ARCHIVO_REANALISIS = "templates_mail_reanalisis.json"

VARIABLES = [
    "numero_solicitud", "laboratorio", "solicitante", "sold_to", "ship_to",
    "fecha_solicitud", "fecha_muestreo", "generado_por", "email_solicitante",
    "especie", "variedad", "lote",
]

VARIABLES_REANALISIS = VARIABLES + ["motivo_reanalisis", "solicitud_original_numero"]

ASUNTO_DEFECTO = "[AgroFresh] Solicitud {numero_solicitud} — {laboratorio}"
ASUNTO_REANALISIS = "[AgroFresh] Reanálisis {numero_solicitud} — {laboratorio}"
CUERPO_REANALISIS = """Hola {laboratorio},

Adjuntamos una solicitud de REANÁLISIS con código {numero_solicitud}, correspondiente al cliente {sold_to}.

Motivo del reanálisis: {motivo_reanalisis}
Solicitud original: {solicitud_original_numero}

Solicitante: {solicitante}
Fecha de solicitud: {fecha_solicitud}

Se incluyen el PDF y el Excel con el detalle completo de la muestra.

Saludos,
AgroFresh"""
CUERPO_DEFECTO = """Hola {laboratorio},

Adjuntamos la solicitud {numero_solicitud}, correspondiente al cliente {sold_to}.

Solicitante: {solicitante}
Fecha de solicitud: {fecha_solicitud}

Se incluyen el PDF y el Excel con el detalle completo de la muestra.

Saludos,
AgroFresh"""

# Mismos colores de marca que usa el sidebar de la app (ver
# src/components/layout/Sidebar.module.css y src/styles/globals.css) para que
# el correo se sienta parte del mismo sistema.
_VERDE_OSCURO = "#24391a"
_VERDE = "#6dad3c"
_TEXTO = "#1f2933"
_TEXTO_TENUE = "#77837b"
_BORDE = "#e1e5dc"
_FONDO_TENUE = "#f6f7f3"

LOGO_CONTENT_ID = "agrofresh-logo-header"
_RUTA_LOGO = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "src", "assets", "agrofresh-logo.png",
)

def _logo_bytes() -> bytes | None:
    """Bytes del logo para incrustar como imagen inline (Content-ID) en el
    correo. Si no se puede leer, el correo sale igual sin el logo -vale más
    entregar la solicitud que fallar el envío por un adorno-."""
    try:
        with open(_RUTA_LOGO, "rb") as f:
            return f.read()
    except OSError:
        logger.warning("No se pudo leer el logo para el correo de solicitud (%s)", _RUTA_LOGO)
        return None


def obtener(laboratorio: str) -> dict:
    items = config_store.leer(ARCHIVO, [])
    actual = next((i for i in items if i.get("laboratorio") == laboratorio), None)
    return {
        "laboratorio": laboratorio,
        "asunto": (actual or {}).get("asunto") or ASUNTO_DEFECTO,
        "cuerpo": (actual or {}).get("cuerpo") or CUERPO_DEFECTO,
        "variables": VARIABLES,
    }


def validar(texto: str) -> None:
    try:
        usadas = {
            nombre for _, nombre, _, _ in Formatter().parse(texto)
            if nombre is not None
        }
    except ValueError as exc:
        raise HTTPException(400, f"Template inválido: {exc}") from exc
    desconocidas = sorted(usadas - set(VARIABLES))
    if desconocidas:
        raise HTTPException(400, f"Variables desconocidas: {', '.join(desconocidas)}")


def guardar(laboratorio: str, asunto: str, cuerpo: str) -> dict:
    validar(asunto)
    validar(cuerpo)
    items = config_store.leer(ARCHIVO, [])
    nuevo = {"laboratorio": laboratorio, "asunto": asunto.strip(), "cuerpo": cuerpo.strip()}
    items = [nuevo if i.get("laboratorio") == laboratorio else i for i in items]
    if not any(i.get("laboratorio") == laboratorio for i in items):
        items.append(nuevo)
    config_store.escribir(ARCHIVO, items)
    return {**nuevo, "variables": VARIABLES}


def obtener_reanalisis(laboratorio: str) -> dict:
    items = config_store.leer(ARCHIVO_REANALISIS, [])
    actual = next((i for i in items if i.get("laboratorio") == laboratorio), None)
    return {
        "laboratorio": laboratorio,
        "asunto": (actual or {}).get("asunto") or ASUNTO_REANALISIS,
        "cuerpo": (actual or {}).get("cuerpo") or CUERPO_REANALISIS,
        "variables": VARIABLES_REANALISIS,
    }


def validar_reanalisis(texto: str) -> None:
    try:
        usadas = {
            nombre for _, nombre, _, _ in Formatter().parse(texto)
            if nombre is not None
        }
    except ValueError as exc:
        raise HTTPException(400, f"Template inválido: {exc}") from exc
    desconocidas = sorted(usadas - set(VARIABLES_REANALISIS))
    if desconocidas:
        raise HTTPException(400, f"Variables desconocidas: {', '.join(desconocidas)}")


def guardar_reanalisis(laboratorio: str, asunto: str, cuerpo: str) -> dict:
    validar_reanalisis(asunto)
    validar_reanalisis(cuerpo)
    items = config_store.leer(ARCHIVO_REANALISIS, [])
    nuevo = {"laboratorio": laboratorio, "asunto": asunto.strip(), "cuerpo": cuerpo.strip()}
    items = [nuevo if i.get("laboratorio") == laboratorio else i for i in items]
    if not any(i.get("laboratorio") == laboratorio for i in items):
        items.append(nuevo)
    config_store.escribir(ARCHIVO_REANALISIS, items)
    return {**nuevo, "variables": VARIABLES_REANALISIS}


def renderizar(laboratorio: str, datos: dict) -> tuple[str, str, str, list[ImagenInline]]:
    """Arma el correo de una solicitud: el texto sigue viniendo del template
    editable por laboratorio (Administración → Laboratorios), envuelto en un
    layout con los colores y el logo del sistema."""
    template = obtener(laboratorio)
    valores = {variable: str(datos.get(variable) or "—") for variable in VARIABLES}
    asunto = template["asunto"].format_map(valores)
    texto = template["cuerpo"].format_map(valores)

    numero = str(datos.get("numero_solicitud") or valores.get("numero_solicitud") or "")
    cuerpo_html = escape(texto).replace("\n", "<br>")

    logo = _logo_bytes()
    logo_html = (
        f'<img src="cid:{LOGO_CONTENT_ID}" alt="AgroFresh" width="132" height="53" '
        f'style="display:block;border:0;">'
        if logo else
        f'<span style="color:#ffffff;font-size:17px;font-weight:700;">AgroFresh</span>'
    )

    html = f"""
<div style="background:{_FONDO_TENUE};padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background:{_VERDE_OSCURO};padding:24px 28px;">{logo_html}</td>
    </tr>
    <tr>
      <td style="padding:30px 28px 26px;">
        <h1 style="margin:0 0 3px;color:{_VERDE_OSCURO};font-size:19px;font-weight:700;">Solicitud de Análisis</h1>
        {f'<p style="margin:0 0 20px;color:{_VERDE};font-weight:700;font-size:14.5px;">Solicitud {escape(numero)}</p>' if numero else '<div style="margin-bottom:20px;"></div>'}
        <div style="color:{_TEXTO};font-size:14px;line-height:1.65;">{cuerpo_html}</div>
      </td>
    </tr>
    <tr>
      <td style="background:{_FONDO_TENUE};padding:14px 28px;border-top:1px solid {_BORDE};">
        <p style="margin:0;color:{_TEXTO_TENUE};font-size:11px;">Enviado automáticamente por AgroFresh Report Hub.</p>
      </td>
    </tr>
  </table>
</div>
""".strip()

    imagenes = [ImagenInline(LOGO_CONTENT_ID, logo)] if logo else []
    return asunto, texto, html, imagenes


def renderizar_reanalisis(laboratorio: str, datos: dict) -> tuple[str, str, str, list[ImagenInline]]:
    """Arma el correo de una solicitud de reanálisis.

    Usa el asunto y cuerpo predefinidos para reanálisis (no editables desde
    el mantenedor de templates) para que el laboratorio identifique
    claramente que se trata de un reenvío solicitado, no de una muestra nueva.
    """
    numero = str(datos.get("numero_solicitud") or "")
    original_archivo = str(datos.get("solicitud_original_archivo") or "")
    numero_original = original_archivo.replace(".xlsx", "").replace(".json", "") or "—"
    motivo = str(datos.get("motivo_reanalisis") or "—")

    template = obtener_reanalisis(laboratorio)
    valores = {variable: str(datos.get(variable) or "—") for variable in VARIABLES}
    valores["motivo_reanalisis"] = motivo
    valores["solicitud_original_numero"] = numero_original

    asunto = template["asunto"].format_map(valores)
    texto = template["cuerpo"].format_map(valores)

    cuerpo_html = escape(texto).replace("\n", "<br>")

    logo = _logo_bytes()
    logo_html = (
        f'<img src="cid:{LOGO_CONTENT_ID}" alt="AgroFresh" width="132" height="53" '
        f'style="display:block;border:0;">'
        if logo else
        f'<span style="color:#ffffff;font-size:17px;font-weight:700;">AgroFresh</span>'
    )

    html = f"""
<div style="background:{_FONDO_TENUE};padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background:{_VERDE_OSCURO};padding:24px 28px;">{logo_html}</td>
    </tr>
    <tr>
      <td style="padding:30px 28px 26px;">
        <h1 style="margin:0 0 3px;color:{_VERDE_OSCURO};font-size:19px;font-weight:700;">Solicitud de Reanálisis</h1>
        {f'<p style="margin:0 0 6px;color:{_VERDE};font-weight:700;font-size:14.5px;">Reanálisis {escape(numero)}</p>' if numero else '<div style="margin-bottom:20px;"></div>'}
        <p style="margin:0 0 20px;color:#c0392b;font-size:13px;font-weight:600;">Esta solicitud es un REANÁLISIS de la muestra original.</p>
        <div style="background:#fff8f0;border:1px solid #f5c6a0;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
          <p style="margin:0 0 4px;color:{_TEXTO};font-size:13px;"><strong>Motivo del reanálisis:</strong> {escape(motivo)}</p>
          <p style="margin:0;color:{_TEXTO_TENUE};font-size:12px;">Solicitud original: {escape(numero_original)}</p>
        </div>
        <div style="color:{_TEXTO};font-size:14px;line-height:1.65;">{cuerpo_html}</div>
      </td>
    </tr>
    <tr>
      <td style="background:{_FONDO_TENUE};padding:14px 28px;border-top:1px solid {_BORDE};">
        <p style="margin:0;color:{_TEXTO_TENUE};font-size:11px;">Enviado automáticamente por AgroFresh Report Hub.</p>
      </td>
    </tr>
  </table>
</div>
""".strip()

    imagenes = [ImagenInline(LOGO_CONTENT_ID, logo)] if logo else []
    return asunto, texto, html, imagenes
