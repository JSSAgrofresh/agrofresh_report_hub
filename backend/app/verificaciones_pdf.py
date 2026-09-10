"""PDF del formulario diario de verificaciones .

Mismo contenido que libro_del_dia() del Excel, diseño alineado con
informe_pdf.py: logo AgroFresh, colores corporativos, alta densidad
de información en una sola página A4 apaisada.
"""
from __future__ import annotations

import io
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER, landscape
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

_S_NORMAL  = ParagraphStyle("n",  fontName="Helvetica",      fontSize=7,   leading=9,  textColor=NEGRO)
_S_BOLD    = ParagraphStyle("b",  fontName="Helvetica-Bold", fontSize=7,   leading=9,  textColor=NEGRO)
_S_GRIS    = ParagraphStyle("g",  fontName="Helvetica",      fontSize=6.5, leading=8,  textColor=GRIS_TEXTO)
_S_HEADER  = ParagraphStyle("h",  fontName="Helvetica-Bold", fontSize=7,   leading=9,  textColor=BLANCO)
_S_SECCION = ParagraphStyle("s",  fontName="Helvetica-Bold", fontSize=8,   leading=10, textColor=VERDE_OSCURO)
_S_TITULO  = ParagraphStyle("t",  fontName="Helvetica-Bold", fontSize=11,  leading=13, textColor=NEGRO)

_MARGEN = 1.0 * cm
PAGE_W, PAGE_H = LETTER  # carta vertical (portrait)
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
        ("TOPPADDING",  (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
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

def _seccion_micropipetas(registro, config: dict) -> list:
    anchos = [UTIL_W * f for f in [0.22, 0.08, 0.08, 0.08, 0.09, 0.14, 0.11, 0.11, 0.09]]
    cabecera = ["Equipo", "Peso 1 (g)", "Peso 2 (g)", "Peso 3 (g)", "Vol. medio (µL)", "Rango tolerancia", "Criterio", "Resultado", "Obs."]
    medidas = {m.micropipeta_id: m for m in registro.micropipetas}
    filas = []
    for equipo in config.get("micropipetas", []):
        if not equipo.get("activo", True):
            continue
        m = medidas.get(equipo["id"])
        nom = equipo['volumen_nominal']
        tol = equipo['tolerancia']
        filas.append([
            _p(f"{equipo['nombre']}\n{nom} µL nominal"),
            _n(m.peso_1 if m else None), _n(m.peso_2 if m else None), _n(m.peso_3 if m else None),
            _n(m.volumen_medio if m else None),
            f"{nom - tol} a {nom + tol} µL",
            f"± {_n(tol)} µL",
            (m.resultado if m else None) or "Sin medir",
            (m.observacion if m else "") or "",
        ])
    if not filas:
        filas = [["—"] * 9]
    t = _tabla([cabecera] + filas, anchos)
    for i, equipo in enumerate([e for e in config.get("micropipetas", []) if e.get("activo", True)], start=1):
        m = medidas.get(equipo["id"])
        res = (m.resultado if m else None) or ""
        if res:
            t.setStyle(TableStyle([
                ("TEXTCOLOR", (7, i), (7, i), _veredicto_color(res)),
                ("FONT", (7, i), (7, i), "Helvetica-Bold", 8),
            ]))
    return [_titulo_seccion("1. MICROPIPETAS — verificación gravimétrica"), Spacer(0, 1), t]


def _seccion_balanza(registro, config: dict) -> list:
    anchos = [UTIL_W * f for f in [0.22, 0.10, 0.10, 0.10, 0.10, 0.10, 0.14, 0.10]]
    cabecera = ["Pesa patrón", "Lect. 1 (mg)", "Lect. 2 (mg)", "Lect. 3 (mg)", "Promedio (mg)", "Criterio", "Resultado", "Obs."]
    medidas = {b.pesa_id: b for b in registro.balanza}
    filas = []
    for pesa in config.get("pesas", []):
        if not pesa.get("activo", True):
            continue
        b = medidas.get(pesa["id"])
        filas.append([
            _p(pesa["nombre"]),
            _n(b.lectura_1 if b else None), _n(b.lectura_2 if b else None), _n(b.lectura_3 if b else None),
            _n(b.promedio if b else None),
            f"± {_n(pesa['tolerancia'])} mg",
            (b.resultado if b else None) or "Sin medir",
            (b.observacion if b else "") or "",
        ])
    if not filas:
        filas = [["—"] * 8]
    t = _tabla([cabecera] + filas, anchos)
    for i, pesa in enumerate([p for p in config.get("pesas", []) if p.get("activo", True)], start=1):
        b = medidas.get(pesa["id"])
        res = (b.resultado if b else None) or ""
        if res:
            t.setStyle(TableStyle([
                ("TEXTCOLOR", (6, i), (6, i), _veredicto_color(res)),
                ("FONT", (6, i), (6, i), "Helvetica-Bold", 8),
            ]))
    return [_titulo_seccion("2. BALANZA ANALÍTICA"), Spacer(0, 1), t]


def _seccion_temperatura(registro, config: dict) -> list:
    anchos = [UTIL_W * f for f in [0.30, 0.20, 0.20, 0.20, 0.10]]
    cabecera = ["Punto de control", "Lectura (°C)", "Criterio", "Resultado", "Obs."]
    medidas = {t.punto_id: t for t in registro.temperaturas}
    filas = []
    for punto in config.get("puntos_temperatura", []):
        if not punto.get("activo", True):
            continue
        t = medidas.get(punto["id"])
        filas.append([
            _p(punto["nombre"]),
            _n(t.lectura if t else None),
            f"{_n(punto['minimo'])} a {_n(punto['maximo'])} °C",
            (t.resultado if t else None) or "Sin medir",
            (t.observacion if t else "") or "",
        ])
    # Termómetros de referencia al final
    filas.append([_p("Termómetro 1"), _n(registro.termometro_1), "—", "—", ""])
    filas.append([_p("Termómetro 2"), _n(registro.termometro_2), "—", "—", ""])
    if not filas:
        filas = [["—"] * 5]
    tb = _tabla([cabecera] + filas, anchos)
    for i, punto in enumerate([p for p in config.get("puntos_temperatura", []) if p.get("activo", True)], start=1):
        t = medidas.get(punto["id"])
        res = (t.resultado if t else None) or ""
        if res:
            tb.setStyle(TableStyle([
                ("TEXTCOLOR", (3, i), (3, i), _veredicto_color(res)),
                ("FONT", (3, i), (3, i), "Helvetica-Bold", 8),
            ]))
    return [_titulo_seccion("3. TEMPERATURA"), Spacer(0, 1), tb]


def _seccion_gases(registro, config: dict) -> list:
    anchos = [UTIL_W * f for f in [0.28, 0.18, 0.13, 0.13, 0.18, 0.10]]
    cabecera = ["Gas", "Código cilindro", "P. contenido (psi)", "P. trabajo (psi)", "Criterio", "Resultado"]
    medidas = {g.gas_id: g for g in registro.gases}
    filas = []
    for gas in config.get("gases", []):
        if not gas.get("activo", True):
            continue
        g = medidas.get(gas["id"])
        filas.append([
            _p(gas["nombre"]),
            (g.codigo_cilindro if g else None) or "—",
            _n(g.presion_contenido if g else None),
            _n(g.presion_trabajo if g else None),
            "≥200 psi · 80-120 psi",
            (g.resultado if g else None) or "Sin medir",
        ])
    if not filas:
        filas = [["—"] * 6]
    filas.append([_p("¿Fugas visibles?"), registro.fugas_visibles or "—", "", "", "Debe ser No", registro.resultado_fugas or "Sin medir"])
    tb = _tabla([cabecera] + filas, anchos)
    gases_activos = [gas for gas in config.get("gases", []) if gas.get("activo", True)]
    for i, gas in enumerate(gases_activos, start=1):
        g = medidas.get(gas["id"])
        res = (g.resultado if g else None) or ""
        if res:
            tb.setStyle(TableStyle([
                ("TEXTCOLOR", (5, i), (5, i), _veredicto_color(res)),
                ("FONT", (5, i), (5, i), "Helvetica-Bold", 8),
            ]))
    fila_fugas = len(gases_activos) + 1
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
        Image(_RUTA_LOGO, width=3.2 * cm, height=1.28 * cm)
        if os.path.isfile(_RUTA_LOGO)
        else Paragraph("AgroFresh", _S_TITULO)
    )

    res = registro.resultado
    color_res = _veredicto_color(res)
    titulo_texto = (
        f"<b>Registro de verificaciones diarias</b><br/>"
        f"<font size='7' color='#6B7280'>Laboratorio de Cromatografía AgroFresh</font>"
    )
    titulo = Paragraph(titulo_texto, ParagraphStyle("tt", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=NEGRO))

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
    return [header_tabla, Spacer(0, 4)]


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

def pdf_del_dia(registro, config: dict | None = None) -> bytes:
    """Genera el PDF del formulario diario y devuelve los bytes."""
    cfg = config or {}
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=_MARGEN, rightMargin=_MARGEN,
        topMargin=_MARGEN, bottomMargin=_MARGEN,
    )
    story: list = []
    story += _encabezado(registro)

    # Las secciones se intercalan con un separador mínimo
    secciones = (
        _seccion_micropipetas(registro, cfg)
        + [Spacer(0, 3)]
        + _seccion_balanza(registro, cfg)
        + [Spacer(0, 3)]
        + _seccion_temperatura(registro, cfg)
        + [Spacer(0, 3)]
        + _seccion_gases(registro, cfg)
        + [Spacer(0, 3)]
        + _seccion_inyector_detector(registro)
    )
    story += secciones
    story += _pie(registro)

    doc.build(story)
    return buf.getvalue()
