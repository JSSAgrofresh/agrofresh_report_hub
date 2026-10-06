"""
Plantillas visuales del aviso a clientes (Envío de informes).

Cada plantilla es un encabezado de marca (una imagen: `app/correo_assets/banner_<clave>.png`,
hecha por `scripts/generar_assets_correo.py` a partir de las portadas de AgroFresh), el título y el
texto que se escriben en pantalla, y un pie. «Estándar» es el correo sobrio de siempre, que no
cambia (`mail_templates._layout_sobrio`): los informes que salen por Envío de informes siguen con él.

El texto admite un formato mínimo, igual en todas las plantillas:
  **negrita**       → negrita
  - elemento        → lista (una línea por elemento; también «• »)
  # Título          → subtítulo dentro del texto
  línea en blanco   → nuevo párrafo
Todo lo demás se muestra tal cual escrito (nada de HTML: se escapa).

Los correos no soportan CSS avanzado, así que el diseño usa tablas y estilos en línea, y el
encabezado va por Content-ID (como el logo) para que se vea también en Outlook.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from datetime import datetime
from functools import lru_cache
from html import escape
from typing import Any

from . import mail_templates as mt
from .correo import ImagenInline

logger = logging.getLogger(__name__)

RUTA_ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "correo_assets")
BANNER_CONTENT_ID = "agrofresh-banner-aviso"
DIRECCION = "Manuel Montt, 4060 | Parque Industrial km 90 Rancagua"
PLANTILLA_DEFECTO = "estandar"

# clave → datos de la plantilla. El orden es el del selector.
PLANTILLAS: dict[str, dict[str, Any]] = {
    "estandar": {
        "nombre": "Estándar", "descripcion": "Sobria: logo, título y una línea fina. Es la de siempre.",
        "banner": False,
    },
    "corporativa": {
        "nombre": "Corporativa", "descripcion": "Banda con las curvas de marca y pie con la dirección del laboratorio.",
        "banner": True, "titulo": "#24391a", "acento": "#40ae49", "pie_fondo": "#f4f6f1", "pie_texto": "#5d6b59",
        "direccion": True,
    },
    "clara_amarillo": {
        "nombre": "Clara · amarillo", "descripcion": "Fondo claro de la portada de marca con el triángulo amarillo.",
        "banner": True, "titulo": "#1d5724", "acento": "#f1c319", "pie_fondo": "#f4f2f1", "pie_texto": "#5f5b58",
    },
    "clara_verde": {
        "nombre": "Clara · verde", "descripcion": "Fondo claro de la portada de marca con el triángulo verde.",
        "banner": True, "titulo": "#1d5724", "acento": "#40ae49", "pie_fondo": "#f4f2f1", "pie_texto": "#5f5b58",
    },
    "azul": {
        "nombre": "Azul", "descripcion": "Portada azul de marca, con el logo en blanco.",
        "banner": True, "titulo": "#1e6fb4", "acento": "#62c0ed", "pie_fondo": "#1e6fb4", "pie_texto": "#ffffff",
    },
    "marino": {
        "nombre": "Marino", "descripcion": "Portada azul marino de marca, la más sobria de las oscuras.",
        "banner": True, "titulo": "#19315b", "acento": "#40ae49", "pie_fondo": "#02183c", "pie_texto": "#ffffff",
    },
    "verde_foto": {
        "nombre": "Verde con foto", "descripcion": "Portada verde con la foto del equipo en terreno.",
        "banner": True, "titulo": "#305f39", "acento": "#f1c418", "pie_fondo": "#40ae49", "pie_texto": "#ffffff",
        "formato": "jpg",   # con foto: JPEG (el PNG pesaría casi medio MB por correo)
    },
}


def clave_plantilla(valor: object) -> str:
    """Una clave válida; lo desconocido (o un aviso guardado antes de las plantillas) es «estándar»."""
    clave = str(valor or "").strip()
    return clave if clave in PLANTILLAS else PLANTILLA_DEFECTO


def _leer(nombre: str) -> bytes | None:
    try:
        with open(os.path.join(RUTA_ASSETS, nombre), "rb") as f:
            return f.read()
    except OSError:
        logger.warning("No se pudo leer la imagen %s del correo", nombre)
        return None


@lru_cache(maxsize=None)
def _miniatura(clave: str) -> str:
    datos = _leer(f"mini_{clave}.png")
    return f"data:image/png;base64,{base64.b64encode(datos).decode()}" if datos else ""


def catalogo() -> list[dict[str, str]]:
    """Lo que ve el selector de plantillas: clave, nombre, descripción y miniatura."""
    return [
        {"clave": c, "nombre": p["nombre"], "descripcion": p["descripcion"], "miniatura": _miniatura(c)}
        for c, p in PLANTILLAS.items()
    ]


# --------------------------------------------------------------------------- texto con formato

_NEGRITA = re.compile(r"\*\*(.+?)\*\*")


def _en_linea(texto: str) -> str:
    return _NEGRITA.sub(r"<strong>\1</strong>", escape(texto))


def cuerpo_html(texto: str, color: str, color_titulo: str) -> str:
    """El texto escrito → HTML de correo (párrafos, listas, títulos y negrita)."""
    estilo_p = f"margin:0 0 14px;color:{color};font-size:14px;line-height:1.65;"
    salida: list[str] = []
    parrafo: list[str] = []
    lista: list[str] = []

    def cerrar_parrafo() -> None:
        if parrafo:
            salida.append(f'<p style="{estilo_p}">' + "<br>".join(_en_linea(l) for l in parrafo) + "</p>")
            parrafo.clear()

    def cerrar_lista() -> None:
        if lista:
            items = "".join(f'<li style="margin:0 0 5px;">{_en_linea(i)}</li>' for i in lista)
            salida.append(
                f'<ul style="margin:0 0 14px;padding-left:22px;color:{color};font-size:14px;line-height:1.6;">{items}</ul>'
            )
            lista.clear()

    for bruta in (texto or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        linea = bruta.rstrip()
        if not linea.strip():
            cerrar_parrafo()
            cerrar_lista()
        elif linea.lstrip().startswith(("- ", "• ")):
            cerrar_parrafo()
            lista.append(linea.lstrip()[2:].strip())
        elif linea.lstrip().startswith("# "):
            cerrar_parrafo()
            cerrar_lista()
            salida.append(
                f'<h2 style="margin:6px 0 8px;font-size:16px;line-height:1.35;color:{color_titulo};">'
                f"{_en_linea(linea.lstrip()[2:].strip())}</h2>"
            )
        else:
            cerrar_lista()
            parrafo.append(linea)
    cerrar_parrafo()
    cerrar_lista()
    return "".join(salida)


def texto_plano(texto: str) -> str:
    """La versión de solo texto del correo: sin las marcas de formato."""
    lineas = []
    for l in (texto or "").replace("\r\n", "\n").split("\n"):
        l = l.replace("**", "")
        if l.lstrip().startswith("# "):
            l = l.lstrip()[2:]
        lineas.append(l)
    return "\n".join(lineas)


# --------------------------------------------------------------------------- armado

def _nota(aviso: str) -> str:
    if not aviso:
        return ""
    return (
        '<div style="background:#fff8e1;border:1px solid #e8c32e;padding:10px 14px;margin-bottom:16px;'
        f'color:{mt._TEXTO};font-size:12.5px;line-height:1.55;">{escape(aviso).replace(chr(10), "<br>")}</div>'
    )


def _layout_marca(clave: str, titulo: str, subtitulo: str, aviso_html: str, cuerpo: str) -> str:
    p = PLANTILLAS[clave]
    anio = datetime.now().year
    sub = (
        f'<div style="margin-top:12px;font-size:14px;font-style:italic;color:#5d6b59;">{escape(subtitulo)}</div>'
        if subtitulo else ""
    )
    direccion = (
        f'<p style="margin:4px 0 0;font-size:11px;color:{p["pie_texto"]};">{escape(DIRECCION)}</p>' if p.get("direccion") else ""
    )
    return f"""
<div style="background:#eceff0;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;">
    <tr>
      <td style="padding:0;line-height:0;font-size:0;">
        <img src="cid:{BANNER_CONTENT_ID}" alt="AgroFresh. Science. Solutions. Sustainability." width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
      </td>
    </tr>
    <tr>
      <td align="left" style="padding:30px 36px 0;">
        <h1 style="margin:0;font-size:24px;line-height:1.25;color:{p["titulo"]};font-weight:700;">{escape(titulo)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;"><tr><td width="56" height="4" style="width:56px;height:4px;background:{p["acento"]};font-size:0;line-height:0;">&nbsp;</td></tr></table>{sub}
      </td>
    </tr>
    <tr>
      <td style="padding:20px 36px 26px;">{aviso_html}{cuerpo}</td>
    </tr>
    <tr>
      <td align="center" style="background:{p["pie_fondo"]};padding:16px 36px;">
        <p style="margin:0;font-size:12px;color:{p["pie_texto"]};">&copy; {anio} AgroFresh. All Rights Reserved.</p>{direccion}
        <p style="margin:4px 0 0;font-size:11px;color:{p["pie_texto"]};">Enviado automáticamente por AgroFresh Report Hub.</p>
      </td>
    </tr>
  </table>
</div>
""".strip()


def html_de_aviso(
    texto: str, titulo: str, subtitulo: str = "", aviso: str = "", plantilla: str = PLANTILLA_DEFECTO,
) -> tuple[str, list[ImagenInline]]:
    """El aviso ya armado con la plantilla elegida: (html, imágenes por Content-ID)."""
    clave = clave_plantilla(plantilla)
    p = PLANTILLAS[clave]
    if not p["banner"]:
        logo = mt._logo_bytes()
        cuerpo = cuerpo_html(texto, "#111111", "#111111")
        html = mt._layout_sobrio(escape(titulo).upper(), escape(subtitulo), _nota(aviso), cuerpo, logo)
        return html, ([ImagenInline(mt.LOGO_CONTENT_ID, logo)] if logo else [])
    formato = p.get("formato", "png")
    banner = _leer(f"banner_{clave}.{formato}")
    cuerpo = cuerpo_html(texto, mt._TEXTO, p["titulo"])
    html = _layout_marca(clave, titulo, subtitulo, _nota(aviso), cuerpo)
    if banner is None:
        # Sin la imagen el correo sale igual: se quita la etiqueta rota, no el aviso.
        html = re.sub(r"<tr>\s*<td style=\"padding:0;line-height:0;font-size:0;\">.*?</td>\s*</tr>", "", html, count=1, flags=re.S)
        return html, []
    return html, [ImagenInline(BANNER_CONTENT_ID, banner, "jpeg" if formato == "jpg" else formato)]
