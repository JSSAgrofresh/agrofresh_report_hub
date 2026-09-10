"""PDF del formulario diario de verificaciones (REG-03).

Mismo contenido que libro_del_dia() del Excel, diseño alineado con
informe_pdf.py: logo AgroFresh, colores corporativos, alta densidad
de información en una sola página A4 apaisada.
"""
from __future__ import annotations

import io
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Colores corporativos ───────────────────────────────────────────────────

VERDE_OSCURO = colors.HexColor("#3D6B1F")
VERDE_CLARO  = colors.HexColor("#EBF5E1")
ROJO         = colors.HexColor("#B0271F")
VERDE_OK     = colors.HexColor("#2F7D32")
GRIS_TEXTO   = colors.HexColor("#6B7280")
GRIS_LINEA   = colors.HexColor("#E1E5DC")
BLANCO       = colors.white
NEGRO        = colors.HexColor("#111111")

_RUTA_LOGO = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "src", "assets", "agrofresh-logo.png",
)

# ── Estilos tipográficos ───────────────────────────────────────────────────

_S_NORMAL  = ParagraphStyle("n",  fontName="Helvetica",      fontSize=8,   leading=10, textColor=NEGRO)
_S_BOLD    = ParagraphStyle("b",  fontName="Helvetica-Bold", fontSize=8,   leading=10, textColor=NEGRO)
_S_GRIS    = ParagraphStyle("g",  fontName="Helvetica",      fontSize=7.5, leading=9,  textColor=GRIS_TEXTO)
_S_HEADER  = ParagraphStyle("h",  fontName="Helvetica-Bold", fontSize=8,   leading=10, textColor=BLANCO)
_S_SECCION = ParagraphStyle("s",  fontName="Helvetica-Bold", fontSize=9,   leading=11, textColor=VERDE_OSCURO)
_S_TITULO  = ParagraphStyle("t",  fontName="Helvetica-Bold", fontSize=13,  leading=15, textColor=NEGRO)

_MARGEN = 1.2 * cm
PAGE_W, PAGE_H = landscape(A4)
UTIL_W = PAGE_W - 2 * _MARGEN


# ── Helpers ────────────────────────────────────────────────────────────────

def _n(v) -> str:
    if v is None:
        return "—"
    try:
        f = float(v)
        return str(int(f)) if f.is_integer() else str(v)
    except (TypeError, ValueError):
        return str(v)


def _p(texto, estilo=_S_NORMAL) -> Paragraph:
    return Paragraph(str(texto) if texto is not None else "—", estilo)


def _veredicto_color(resultado: str) -> colors.HexColor:
    if resultado.startswith("No"):
        return ROJO
    if resultado == "Aceptable":
        return VERDE_OK
    return GRIS_TEXTO


def _tabla(datos: list, col_anchos: list, estilo_extra: list | None = None) -> Table:
    base = [
        ("FONT",        (0, 0), (-1, 0), "Helvetica-Bold", 8),
        ("BACKGROUND",  (0, 0), (-1, 0), VERDE_OSCURO),
        ("TEXTCOLOR",   (0, 0), (-1, 0), BLANCO),
        ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
        ("ALIGN",       (0, 0), (0, -1), "LEFT"),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE",    (0, 1), (-1, -1), 8),
        ("FONT",        (0, 1), (-1, -1), "Helvetica"),
        ("GRID",        (0, 0), (-1, -1), 0.3, GRIS_LINEA),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BLANCO, colors.HexColor("#F8F9F6")]),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if estilo_extra:
        base.extend(estilo_extra)
    t = Table(datos, colWidths=col_anchos, repeatRows=1)
    t.setStyle(TableStyle(base))
    return t


def _titulo_seccion(texto: str) -> Paragraph:
    return Paragraph(texto, _S_SECCION)


def _colorear_resultado(tabla: Table, col: int, filas_datos: list) -> None:
    """Colorea la celda de resultado de cada fila según su valor."""
    for i, fila in enumerate(filas_datos, start=1):
        val = fila[col] if isinstance(fila[col], str) else ""
        if val.startswith("No") or val == "Aceptable":
            tabla.setStyle(TableStyle([
                ("TEXTCOLOR", (col, i), (col, i), _veredicto_color(val)),
                ("FONT", (col, i), (col, i), "Helvetica-Bold", 8),
            ]))


# ── Secciones ─────────────────────────────────────────────────────────────

def _seccion_micropipetas(registro) -> list:
    anchos = [UTIL_W * f for f in [0.26, 0.10, 0.10, 0.10, 0.10, 0.12, 0.12, 0.10]]
    cabecera = ["Equipo", "Peso 1 (g)", "Peso 2 (g)", "Peso 3 (g)", "Vol. medio (µL)", "Criterio", "Resultado", "Obs."]
    filas = [
        [
            _p(m.nombre),
            _n(m.peso_1), _n(m.peso_2), _n(m.peso_3),
            _n(m.volumen_medio),
            f"± {_n(m.tolerancia)} µL",
            m.resultado or "Sin medir",
            m.observacion or "",
        ]
        for m in registro.micropipetas
    ] or [["—"] * 8]
    t = _tabla([cabecera] + filas, anchos)
    for i, m in enumerate(registro.micropipetas, start=1):
        t.setStyle(TableStyle([
            ("TEXTCOLOR", (6, i), (6, i), _veredicto_color(m.resultado or "")),
            ("FONT", (6, i), (6, i), "Helvetica-Bold", 8),
        ]))
    return [_titulo_seccion("1. MICROPIPETAS — verificación gravimétrica"), Spacer(0, 1), t]


def _seccion_balanza(registro) -> list:
    anchos = [UTIL_W * f for f in [0.22, 0.10, 0.10, 0.10, 0.10, 0.10, 0.14, 0.10, 0.04]]
    cabecera = ["Pesa patrón", "Lect. 1 (mg)", "Lect. 2 (mg)", "Lect. 3 (mg)", "Promedio (mg)", "Criterio", "Resultado", "Obs."]
    anchos2 = anchos[:8]
    filas = [
        [
            _p(b.nombre),
            _n(b.lectura_1), _n(b.lectura_2), _n(b.lectura_3),
            _n(b.promedio),
            f"± {_n(b.tolerancia)} mg",
            b.resultado or "Sin medir",
            b.observacion or "",
        ]
        for b in registro.balanza
    ] or [["—"] * 8]
    t = _tabla([cabecera] + filas, anchos2)
    for i, b in enumerate(registro.balanza, start=1):
        t.setStyle(TableStyle([
            ("TEXTCOLOR", (6, i), (6, i), _veredicto_color(b.resultado or "")),
            ("FONT", (6, i), (6, i), "Helvetica-Bold", 8),
        ]))
    return [_titulo_seccion("2. BALANZA ANALÍTICA"), Spacer(0, 1), t]


def _seccion_temperatura(registro) -> list:
    anchos = [UTIL_W * f for f in [0.30, 0.20, 0.20, 0.20, 0.10]]
    cabecera = ["Punto de control", "Lectura (°C)", "Criterio", "Resultado", "Obs."]
    filas = [
        [_p(t.nombre), _n(t.lectura), f"{_n(t.minimo)} a {_n(t.maximo)} °C", t.resultado or "Sin medir", t.observacion or ""]
        for t in registro.temperaturas
    ] or [["—"] * 5]
    # Termómetros de referencia al final de la tabla
    filas.append([_p("Termómetro 1"), _n(registro.termometro_1), "—", "—", ""])
    filas.append([_p("Termómetro 2"), _n(registro.termometro_2), "—", "—", ""])
    tb = _tabla([cabecera] + filas, anchos)
    for i, t in enumerate(registro.temperaturas, start=1):
        tb.setStyle(TableStyle([
            ("TEXTCOLOR", (3, i), (3, i), _veredicto_color(t.resultado or "")),
            ("FONT", (3, i), (3, i), "Helvetica-Bold", 8),
        ]))
    return [_titulo_seccion("3. TEMPERATURA"), Spacer(0, 1), tb]


def _seccion_gases(registro) -> list:
    anchos = [UTIL_W * f for f in [0.28, 0.18, 0.13, 0.13, 0.18, 0.10]]
    cabecera = ["Gas", "Código cilindro", "P. contenido (psi)", "P. trabajo (psi)", "Criterio", "Resultado"]
    filas = [
        [_p(g.nombre), g.codigo_cilindro or "—", _n(g.presion_contenido), _n(g.presion_trabajo), "≥200 psi · 80-120 psi", g.resultado or "Sin medir"]
        for g in registro.gases
    ] or [["—"] * 6]
    filas.append([_p("¿Fugas visibles?"), registro.fugas_visibles or "—", "", "", "Debe ser No", registro.resultado_fugas or "Sin medir"])
    tb = _tabla([cabecera] + filas, anchos)
    for i, g in enumerate(registro.gases, start=1):
        tb.setStyle(TableStyle([
            ("TEXTCOLOR", (5, i), (5, i), _veredicto_color(g.resultado or "")),
            ("FONT", (5, i), (5, i), "Helvetica-Bold", 8),
        ]))
    fila_fugas = len(registro.gases) + 1
    tb.setStyle(TableStyle([
        ("TEXTCOLOR", (5, fila_fugas), (5, fila_fugas), _veredicto_color(registro.resultado_fugas or "")),
        ("FONT", (5, fila_fugas), (5, fila_fugas), "Helvetica-Bold", 8),
    ]))
    return [_titulo_seccion("4. PRESIÓN DE GASES"), Spacer(0, 1), tb]


def _seccion_inyector_detector(registro) -> list:
    iny = registro.inyector
    det = registro.detector
    w3 = UTIL_W / 3 - 0.2 * cm

    # Inyector
    anchos_i = [w3 * f for f in [0.55, 0.25, 0.20]]
    cabecera_i = ["Inyector — parámetro", "Valor", "Resultado"]
    filas_i = [
        ["Limpieza de aguja", iny.limpieza_aguja or "—", ""],
        ["¿Aguja dañada?", iny.aguja_danada or "—", ""],
        ["Aguja reemplazada", iny.aguja_reemplazada or "—", ""],
        ["Cambio de septa", iny.cambio_septa or "—", ""],
        [_p("Resultado sección", _S_BOLD), "", iny.resultado or "Sin medir"],
    ]
    ti = _tabla([cabecera_i] + filas_i, anchos_i)
    ti.setStyle(TableStyle([
        ("TEXTCOLOR", (2, 5), (2, 5), _veredicto_color(iny.resultado or "")),
        ("FONT", (2, 5), (2, 5), "Helvetica-Bold", 8),
    ]))

    # Detector
    anchos_d = [w3 * f for f in [0.55, 0.25, 0.20]]
    cabecera_d = ["Detector — parámetro", "Valor", "Resultado"]
    filas_d = [
        ["Voltaje de la perla (V)", _n(det.voltaje_perla), det.resultado_voltaje or "Sin medir"],
        ["Método cargado", det.metodo_nombre or det.metodo_correcto or "—", det.resultado_metodo or "Sin medir"],
        ["Output del detector", _n(det.output_detector), det.resultado_output or "Sin medir"],
        [_p("Resultado sección", _S_BOLD), "", det.resultado or "Sin medir"],
    ]
    td = _tabla([cabecera_d] + filas_d, anchos_d)
    for i, (_, _, res) in enumerate(filas_d, start=1):
        val = res if isinstance(res, str) else ""
        if val.startswith("No") or val == "Aceptable":
            td.setStyle(TableStyle([
                ("TEXTCOLOR", (2, i), (2, i), _veredicto_color(val)),
                ("FONT", (2, i), (2, i), "Helvetica-Bold", 8),
            ]))

    lado = (UTIL_W - 0.4 * cm) / 2
    fila_tabla = Table(
        [[ti, td]],
        colWidths=[lado, lado],
    )
    fila_tabla.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [_titulo_seccion("5. INYECTOR Y DETECTOR"), Spacer(0, 1), fila_tabla]


# ── Encabezado del documento ───────────────────────────────────────────────

def _encabezado(registro) -> list:
    logo_img = (
        Image(_RUTA_LOGO, width=3.8 * cm, height=1.52 * cm)
        if os.path.isfile(_RUTA_LOGO)
        else Paragraph("AgroFresh", _S_TITULO)
    )

    res = registro.resultado
    color_res = _veredicto_color(res)
    titulo_texto = (
        f"<b>REG-03 · Registro de verificaciones diarias</b><br/>"
        f"<font size='8' color='#6B7280'>Laboratorio de Cromatografía AgroFresh</font>"
    )
    titulo = Paragraph(titulo_texto, ParagraphStyle("tt", fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=NEGRO))

    campos = [
        f"<b>Fecha:</b> {registro.fecha.strftime('%d-%m-%Y')}",
        f"<b>Temp. agua:</b> {_n(registro.temperatura_agua)} °C  &nbsp; <b>Z:</b> {_n(registro.factor_z)} µL/mg",
        f"<b>Analista:</b> {registro.analista or '—'}",
    ]
    info = Paragraph("<br/>".join(campos), _S_NORMAL)

    resultado_color_hex = "#B0271F" if res.startswith("No") else "#2F7D32"
    res_p = Paragraph(
        f'<b><font size="11" color="{resultado_color_hex}">{res}</font></b>',
        ParagraphStyle("rr", fontName="Helvetica-Bold", fontSize=11, leading=13, alignment=1),
    )

    ancho_logo = 4 * cm
    ancho_res  = 3.5 * cm
    ancho_info = UTIL_W - ancho_logo - ancho_res - 0.4 * cm
    header_tabla = Table(
        [[logo_img, titulo, info, res_p]],
        colWidths=[ancho_logo, UTIL_W * 0.3, ancho_info - UTIL_W * 0.3, ancho_res],
    )
    header_tabla.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",        (3, 0), (3, 0), "CENTER"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW",    (0, 0), (-1, 0), 0.5, VERDE_OSCURO),
    ]))
    return [header_tabla, Spacer(0, 8)]


def _pie(registro) -> list:
    revisado = registro.revisado_por or "—"
    obs = registro.observaciones or "—"
    editado = ""
    if registro.editado_por:
        editado = f" · Editado por {registro.editado_por}"
        if registro.observacion_edicion:
            editado += f": {registro.observacion_edicion}"

    texto = (
        f"<b>Observaciones:</b> {obs}{editado}"
        f"&nbsp;&nbsp;&nbsp;&nbsp;<b>Revisado por:</b> {revisado}"
        f"&nbsp;&nbsp;&nbsp;&nbsp;<b>Creado por:</b> {registro.creado_por or '—'}"
    )
    return [Spacer(0, 4), Paragraph(texto, _S_GRIS)]


# ── Función pública ────────────────────────────────────────────────────────

def pdf_del_dia(registro) -> bytes:
    """Genera el PDF del formulario diario y devuelve los bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=_MARGEN, rightMargin=_MARGEN,
        topMargin=_MARGEN, bottomMargin=_MARGEN,
    )
    story: list = []
    story += _encabezado(registro)

    # Las secciones se intercalan con un separador mínimo
    secciones = (
        _seccion_micropipetas(registro)
        + [Spacer(0, 6)]
        + _seccion_balanza(registro)
        + [Spacer(0, 6)]
        + _seccion_temperatura(registro)
        + [Spacer(0, 6)]
        + _seccion_gases(registro)
        + [Spacer(0, 6)]
        + _seccion_inyector_detector(registro)
    )
    story += secciones
    story += _pie(registro)

    doc.build(story)
    return buf.getvalue()
