"""Plantillas configurables para los correos del sistema: solicitudes de análisis,
reanálisis y envío de informes a clientes."""
import logging
import os
import re
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
    # Piezas de la rotulación de la muestra (ALS): se arman en el template como
    # `{numero_solicitud} - {posicion_muestreo} - {fecha_muestreo_dmy}`.
    "posicion_muestreo", "fecha_muestreo_dmy",
]

VARIABLES_REANALISIS = VARIABLES + ["motivo_reanalisis", "solicitud_original_numero"]

def iso_a_ddmmyyyy(valor: object) -> object:
    """Convierte 'YYYY-MM-DD' → 'DD-MM-YYYY'. Si no coincide el patrón, devuelve el valor intacto."""
    if isinstance(valor, str):
        m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", valor.strip())
        if m:
            return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return valor


def rotulacion_partes(datos: dict) -> dict[str, str]:
    """Las tres partes de la rotulación de la muestra, ya listas para unir.

    Es la ÚNICA fuente: la usan el JSON adjunto (`sample_identification`) y las
    variables del template del correo, para que ambos digan exactamente lo mismo.
    Una parte vacía queda como «—», nunca se omite."""
    crudas = {
        "numero_solicitud": datos.get("numero_solicitud"),
        "posicion_muestreo": datos.get("posicion_muestreo"),
        "fecha_muestreo_dmy": iso_a_ddmmyyyy(datos.get("fecha_muestreo")),
    }
    return {k: str(v).strip() if v and str(v).strip() else "—" for k, v in crudas.items()}


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


def _logo_html(logo: bytes | None) -> str:
    return (
        f'<img src="cid:{LOGO_CONTENT_ID}" alt="AgroFresh" width="132" height="53" '
        f'style="display:block;border:0;">'
        if logo else
        '<span style="color:#ffffff;font-size:17px;font-weight:700;">AgroFresh</span>'
    )


def _layout(titulo: str, intermedio: list[str], cuerpo_html: str, logo: bytes | None) -> str:
    """El marco común de todos los correos del sistema: franja verde con el
    logo, título, el bloque propio de cada tipo (`intermedio`), el texto y el
    pie. Las solicitudes, los reanálisis y los informes comparten SOLO esto: si
    se cambia la marca se cambia acá y no en tres copias."""
    bloque = "".join(f"\n        {item}" for item in intermedio)
    return f"""
<div style="background:{_FONDO_TENUE};padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background:{_VERDE_OSCURO};padding:24px 28px;">{_logo_html(logo)}</td>
    </tr>
    <tr>
      <td style="padding:30px 28px 26px;">
        <h1 style="margin:0 0 3px;color:{_VERDE_OSCURO};font-size:19px;font-weight:700;">{titulo}</h1>{bloque}
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


def _validar_texto(texto: str, permitidas: list[str]) -> None:
    try:
        usadas = {
            nombre for _, nombre, _, _ in Formatter().parse(texto)
            if nombre is not None
        }
    except ValueError as exc:
        raise HTTPException(400, f"Template inválido: {exc}") from exc
    desconocidas = sorted(usadas - set(permitidas))
    if desconocidas:
        raise HTTPException(400, f"Variables desconocidas: {', '.join(desconocidas)}")


def _obtener_template(
    archivo: str, laboratorio: str, asunto_defecto: str, cuerpo_defecto: str, variables: list[str],
) -> dict:
    items = config_store.leer(archivo, [])
    actual = next((i for i in items if i.get("laboratorio") == laboratorio), None)
    return {
        "laboratorio": laboratorio,
        "asunto": (actual or {}).get("asunto") or asunto_defecto,
        "cuerpo": (actual or {}).get("cuerpo") or cuerpo_defecto,
        "variables": variables,
    }


def _guardar_template(archivo: str, laboratorio: str, asunto: str, cuerpo: str, variables: list[str]) -> dict:
    _validar_texto(asunto, variables)
    _validar_texto(cuerpo, variables)
    items = config_store.leer(archivo, [])
    nuevo = {"laboratorio": laboratorio, "asunto": asunto.strip(), "cuerpo": cuerpo.strip()}
    items = [nuevo if i.get("laboratorio") == laboratorio else i for i in items]
    if not any(i.get("laboratorio") == laboratorio for i in items):
        items.append(nuevo)
    config_store.escribir(archivo, items)
    return {**nuevo, "variables": variables}


def obtener(laboratorio: str) -> dict:
    return _obtener_template(ARCHIVO, laboratorio, ASUNTO_DEFECTO, CUERPO_DEFECTO, VARIABLES)


def validar(texto: str) -> None:
    _validar_texto(texto, VARIABLES)


def guardar(laboratorio: str, asunto: str, cuerpo: str) -> dict:
    return _guardar_template(ARCHIVO, laboratorio, asunto, cuerpo, VARIABLES)


def obtener_reanalisis(laboratorio: str) -> dict:
    return _obtener_template(
        ARCHIVO_REANALISIS, laboratorio, ASUNTO_REANALISIS, CUERPO_REANALISIS, VARIABLES_REANALISIS,
    )


def validar_reanalisis(texto: str) -> None:
    _validar_texto(texto, VARIABLES_REANALISIS)


def guardar_reanalisis(laboratorio: str, asunto: str, cuerpo: str) -> dict:
    return _guardar_template(ARCHIVO_REANALISIS, laboratorio, asunto, cuerpo, VARIABLES_REANALISIS)


def renderizar(laboratorio: str, datos: dict) -> tuple[str, str, str, list[ImagenInline]]:
    """Arma el correo de una solicitud: el texto sigue viniendo del template
    editable por laboratorio (Administración → Laboratorios), envuelto en un
    layout con los colores y el logo del sistema."""
    template = obtener(laboratorio)
    valores = {variable: str(datos.get(variable) or "—") for variable in VARIABLES}
    valores.update(rotulacion_partes(datos))
    asunto = template["asunto"].format_map(valores)
    texto = template["cuerpo"].format_map(valores)

    numero = str(datos.get("numero_solicitud") or valores.get("numero_solicitud") or "")
    cuerpo_html = escape(texto).replace("\n", "<br>")

    logo = _logo_bytes()
    sub = (
        f'<p style="margin:0 0 20px;color:{_VERDE};font-weight:700;font-size:14.5px;">Solicitud {escape(numero)}</p>'
        if numero else '<div style="margin-bottom:20px;"></div>'
    )
    html = _layout("Solicitud de Análisis", [sub], cuerpo_html, logo)

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
    valores.update(rotulacion_partes(datos))
    valores["motivo_reanalisis"] = motivo
    valores["solicitud_original_numero"] = numero_original

    asunto = template["asunto"].format_map(valores)
    texto = template["cuerpo"].format_map(valores)

    cuerpo_html = escape(texto).replace("\n", "<br>")

    logo = _logo_bytes()
    intermedio = [
        f'<p style="margin:0 0 6px;color:{_VERDE};font-weight:700;font-size:14.5px;">Reanálisis {escape(numero)}</p>'
        if numero else '<div style="margin-bottom:20px;"></div>',
        '<p style="margin:0 0 20px;color:#c0392b;font-size:13px;font-weight:600;">Esta solicitud es un REANÁLISIS de la muestra original.</p>',
        '<div style="background:#fff8f0;border:1px solid #f5c6a0;border-radius:6px;padding:12px 16px;margin-bottom:20px;">\n'
        f'          <p style="margin:0 0 4px;color:{_TEXTO};font-size:13px;"><strong>Motivo del reanálisis:</strong> {escape(motivo)}</p>\n'
        f'          <p style="margin:0;color:{_TEXTO_TENUE};font-size:12px;">Solicitud original: {escape(numero_original)}</p>\n'
        '        </div>',
    ]
    html = _layout("Solicitud de Reanálisis", intermedio, cuerpo_html, logo)

    imagenes = [ImagenInline(LOGO_CONTENT_ID, logo)] if logo else []
    return asunto, texto, html, imagenes


# ---------------------------------------------------------------------------
# Envío de informes a clientes (AgroFresh Lab → Envío de informes)
# ---------------------------------------------------------------------------

ARCHIVO_INFORMES = "templates_mail_informes.json"

VARIABLES_INFORMES = [
    "laboratorio", "sold_to", "ship_to", "especie", "fecha_envio", "enviado_por",
    "cantidad_informes", "nombre_archivo",
]

ASUNTO_INFORME = "[AgroFresh] Informe de resultados — {sold_to} — {ship_to}"
CUERPO_INFORME = """Estimados,

Adjuntamos el informe de resultados de {laboratorio} correspondiente a {sold_to} — {ship_to}.

Fecha de envío: {fecha_envio}

Quedamos atentos a cualquier consulta.

Saludos,
AgroFresh"""


def obtener_informe(laboratorio: str) -> dict:
    return _obtener_template(
        ARCHIVO_INFORMES, laboratorio, ASUNTO_INFORME, CUERPO_INFORME, VARIABLES_INFORMES,
    )


def guardar_informe(laboratorio: str, asunto: str, cuerpo: str) -> dict:
    return _guardar_template(ARCHIVO_INFORMES, laboratorio, asunto, cuerpo, VARIABLES_INFORMES)


def valores_informe(datos: dict) -> dict[str, str]:
    """Los valores que reemplazan a las variables del template del informe."""
    return {variable: str(datos.get(variable) or "—") for variable in VARIABLES_INFORMES}


def _layout_sobrio(titulo: str, subtitulo: str, aviso_html: str, cuerpo_html: str, logo: bytes | None) -> str:
    """El correo del informe, a la manera del informe mismo: logo a la izquierda,
    título en mayúsculas centrado, una línea fina debajo y texto negro sobre
    blanco. Sin franja de color. Es solo de los informes: las solicitudes y los
    reanálisis siguen con `_layout`."""
    logo_html = (
        f'<img src="cid:{LOGO_CONTENT_ID}" alt="AgroFresh" width="120" height="48" style="display:block;border:0;">'
        if logo else '<span style="font-size:17px;font-weight:700;color:#7aa93c;">AgroFresh</span>'
    )
    sub = (
        f'<div style="font-size:12px;color:{_TEXTO};margin-top:4px;">{subtitulo}</div>' if subtitulo else ""
    )
    return f"""
<div style="background:{_FONDO_TENUE};padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid {_BORDE};">
    <tr>
      <td style="padding:22px 28px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td width="120" valign="middle">{logo_html}</td>
            <td align="center" valign="middle" style="padding-left:12px;">
              <div style="font-size:17px;font-weight:700;color:#111111;letter-spacing:.02em;">{titulo}</div>{sub}
            </td>
            <td width="120"></td>
          </tr>
        </table>
        <div style="border-bottom:1.5px solid #111111;margin-top:14px;"></div>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px 26px;">{aviso_html}
        <div style="color:#111111;font-size:14px;line-height:1.65;">{cuerpo_html}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 28px;border-top:1px solid {_BORDE};">
        <p style="margin:0;color:{_TEXTO_TENUE};font-size:11px;">Enviado automáticamente por AgroFresh Report Hub.</p>
      </td>
    </tr>
  </table>
</div>
""".strip()


def html_de_texto(
    texto: str, titulo: str, subtitulo: str = "", aviso: str = "",
) -> tuple[str, list[ImagenInline]]:
    """El texto ya escrito, dentro del marco sobrio del correo del informe.
    `aviso`, si lo hay, va destacado arriba del texto -el correo de prueba lo
    usa para decir a quién habría ido de verdad-."""
    logo = _logo_bytes()
    aviso_html = ""
    if aviso:
        aviso_html = (
            '<div style="background:#fff8e1;border:1px solid #e8c32e;padding:10px 14px;margin-bottom:16px;'
            f'color:{_TEXTO};font-size:12.5px;line-height:1.55;">{escape(aviso).replace(chr(10), "<br>")}</div>'
        )
    html = _layout_sobrio(escape(titulo).upper(), escape(subtitulo), aviso_html, escape(texto).replace("\n", "<br>"), logo)
    return html, ([ImagenInline(LOGO_CONTENT_ID, logo)] if logo else [])


def textos_informe(
    laboratorio: str, datos: dict, *, asunto: str | None = None, cuerpo: str | None = None,
) -> tuple[str, str]:
    """Asunto y texto del informe. Parten del template del laboratorio, pero
    quien envía puede haberlos corregido antes de mandar: si llegan `asunto` o
    `cuerpo` ya escritos, valen ellos y no se vuelven a formatear (una llave
    suelta en lo escrito a mano no debe romper el envío)."""
    template = obtener_informe(laboratorio)
    valores = valores_informe(datos)
    asunto_final = asunto if asunto is not None and asunto.strip() else template["asunto"].format_map(valores)
    texto = cuerpo if cuerpo is not None and cuerpo.strip() else template["cuerpo"].format_map(valores)
    return asunto_final, texto


def renderizar_informe(
    laboratorio: str, datos: dict, *, asunto: str | None = None, cuerpo: str | None = None, aviso: str = "",
) -> tuple[str, str, str, list[ImagenInline]]:
    """Arma el correo de un informe (asunto, texto, html y logo)."""
    asunto_final, texto = textos_informe(laboratorio, datos, asunto=asunto, cuerpo=cuerpo)
    planta = " — ".join(p for p in (str(datos.get("sold_to") or "").strip(), str(datos.get("ship_to") or "").strip()) if p)
    html, imagenes = html_de_texto(texto, "Informe de Resultados", planta, aviso)
    if aviso:
        texto = f"{aviso}\n\n{texto}"
    return asunto_final, texto, html, imagenes
