"""Plantillas configurables para el correo de solicitudes de muestreo."""
from html import escape
from string import Formatter

from fastapi import HTTPException

from . import config_store

ARCHIVO = "templates_mail_solicitudes.json"

VARIABLES = [
    "numero_solicitud", "laboratorio", "solicitante", "sold_to", "ship_to",
    "fecha_solicitud", "fecha_muestreo", "generado_por", "email_solicitante",
    "especie", "variedad", "lote",
]

ASUNTO_DEFECTO = "[AgroFresh] Solicitud {numero_solicitud} — {laboratorio}"
CUERPO_DEFECTO = """Hola {laboratorio},

Adjuntamos la solicitud {numero_solicitud}, correspondiente al cliente {sold_to}.

Solicitante: {solicitante}
Fecha de solicitud: {fecha_solicitud}

Se incluyen el PDF y el Excel con el detalle completo de la muestra.

Saludos,
AgroFresh"""


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


def renderizar(laboratorio: str, datos: dict) -> tuple[str, str, str]:
    template = obtener(laboratorio)
    valores = {variable: str(datos.get(variable) or "—") for variable in VARIABLES}
    asunto = template["asunto"].format_map(valores)
    texto = template["cuerpo"].format_map(valores)
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;'
        'font-size:14px;line-height:1.55;color:#1f2933;">'
        + escape(texto).replace("\n", "<br>")
        + '<hr style="border:none;border-top:1px solid #d7dce1;margin:24px 0;">'
        + '<p style="color:#7a838d;font-size:12px;">Enviado desde AgroFresh Report Hub.</p></div>'
    )
    return asunto, texto, html
