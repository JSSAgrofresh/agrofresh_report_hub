"""Informe formal de errores por laboratorio (PDF) y Excel: lo que se adjunta al reclamo."""
from __future__ import annotations

import io
import os
from collections import defaultdict
from datetime import datetime
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from . import integridad as it
from .informe_pdf import _RUTA_LOGO

VERDE = colors.HexColor("#3f6b2a")
GRIS = colors.HexColor("#5d6878")
COLOR_GRAVEDAD = {it.ALTO: colors.HexColor("#b0271f"), it.MEDIO: colors.HexColor("#b4730d"), it.INFO: GRIS}
NOMBRE_GRAVEDAD = {it.ALTO: "Grave", it.MEDIO: "A revisar", it.INFO: "Informativo"}
MAX_FILAS_POR_TIPO = 400


def _p(texto: Any, estilo: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(texto if texto is not None else "—")), estilo)


def _fecha(iso: str | None) -> str:
    try:
        return datetime.fromisoformat(str(iso)[:19]).strftime("%d-%m-%Y")
    except (TypeError, ValueError):
        return "—"


def generar_pdf(laboratorio: str, resultado: dict[str, Any], hallazgos: list[dict], generado_por: str = "", fecha_analisis: str | None = None) -> bytes:
    """El informe de errores de UN laboratorio. `hallazgos` ya viene filtrado a ese laboratorio y sin los «informativos»."""
    estilos = getSampleStyleSheet()
    base = ParagraphStyle("b", parent=estilos["Normal"], fontName="Helvetica", fontSize=8, leading=10)
    chico = ParagraphStyle("c", parent=base, fontSize=7, leading=9, textColor=GRIS)
    negrita = ParagraphStyle("n", parent=base, fontName="Helvetica-Bold")
    titulo = ParagraphStyle("t", parent=base, fontName="Helvetica-Bold", fontSize=16, leading=19, textColor=VERDE)
    sub = ParagraphStyle("s", parent=base, fontSize=10, leading=13, textColor=GRIS)
    h2 = ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=10, spaceAfter=4)

    lab = next((l for l in resultado.get("laboratorios", []) if it.di.lab_base(l["laboratorio"]) == it.di.lab_base(laboratorio)), None) or {}
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.4 * cm, bottomMargin=1.5 * cm,
                            title=f"Informe de errores - {laboratorio}", author="AgroFresh Report Hub")
    ancho = A4[0] - 3.0 * cm
    historia: list[Any] = []

    logo = Image(_RUTA_LOGO, width=75, height=30) if os.path.isfile(_RUTA_LOGO) else ""
    cab = Table([[logo, [_p("Informe de errores de integridad de datos", titulo), _p(f"Laboratorio {laboratorio} · solicitudes de AgroFresh contra los informes recibidos", sub)]]],
                colWidths=[3 * cm, ancho - 3 * cm])
    cab.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, 0), 1.2, VERDE), ("BOTTOMPADDING", (0, 0), (-1, 0), 6)]))
    historia += [cab, Spacer(1, 6)]
    emitido = datetime.now().strftime("%d-%m-%Y %H:%M")
    historia.append(_p(f"Emitido el {emitido}" + (f" por {generado_por}" if generado_por else "") + (f" · análisis del {_fecha(fecha_analisis)}" if fecha_analisis else ""), chico))
    historia.append(Spacer(1, 8))

    graves = [h for h in hallazgos if h["gravedad"] == it.ALTO]
    medios = [h for h in hallazgos if h["gravedad"] == it.MEDIO]
    revisados, mal = lab.get("informes_revisados", 0), lab.get("informes_con_problema", 0)
    cifras = [["Solicitudes revisadas", lab.get("solicitudes_revisadas", 0)], ["Informes revisados", revisados], ["Informes con errores", mal],
              ["Informes sin errores", max(revisados - mal, 0)], ["Errores graves", len(graves)], ["A revisar", len(medios)]]
    valor = ParagraphStyle("v", parent=base, fontSize=15, leading=18)
    celdas = [[_p(k, chico) for k, _ in cifras[i:i + 3]] for i in (0, 3)]
    nums = [[Paragraph(f"<b>{v}</b>", valor) for _, v in cifras[i:i + 3]] for i in (0, 3)]
    t = Table([celdas[0], nums[0], celdas[1], nums[1]], colWidths=[ancho / 3] * 3)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#c8d1dc")), ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e3e7ee")),
                           ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f7fa")), ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#f5f7fa")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    historia += [t, Spacer(1, 6)]

    if not hallazgos:
        historia.append(_p("No se encontraron errores en los informes de este laboratorio.", negrita))
        doc.build(historia)
        return buf.getvalue()

    # Resumen por tipo de error.
    por_tipo: dict[str, list[dict]] = defaultdict(list)
    for h in hallazgos:
        por_tipo[h["codigo"]].append(h)
    orden = sorted(por_tipo, key=lambda c: (0 if por_tipo[c][0]["gravedad"] == it.ALTO else 1, -len(por_tipo[c])))
    historia.append(_p("Resumen por tipo de error", h2))
    filas = [[_p("Gravedad", negrita), _p("Tipo de error", negrita), _p("Casos", negrita)]]
    for c in orden:
        g = por_tipo[c][0]["gravedad"]
        filas.append([Paragraph(f'<font color="{COLOR_GRAVEDAD[g].hexval().replace("0x", "#")}"><b>{NOMBRE_GRAVEDAD[g]}</b></font>', base), _p(it.titulo_de(c), base), _p(len(por_tipo[c]), base)])
    r = Table(filas, colWidths=[3 * cm, ancho - 6 * cm, 3 * cm], repeatRows=1)
    r.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d5dce5")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    historia.append(r)

    # Detalle por tipo.
    for c in orden:
        casos = por_tipo[c]
        g = casos[0]["gravedad"]
        bloque: list[Any] = [_p(f"{it.titulo_de(c)}  ·  {len(casos)} caso(s)", h2)]
        if casos[0].get("sugerencia"):
            bloque.append(_p(f"Qué se solicita: {casos[0]['sugerencia']}", chico))
            bloque.append(Spacer(1, 3))
        filas = [[_p(x, negrita) for x in ("OT / informe", "Cliente / planta", "Detalle")]]
        for h in casos[:MAX_FILAS_POR_TIPO]:
            fecha = f" · muestreo {_fecha(h.get('fecha_muestreo'))}" if h.get("fecha_muestreo") else ""
            filas.append([Paragraph(f"<b>{escape(str(h.get('ot') or '—'))}</b><br/>{escape(str(h.get('informe') or 'sin informe'))}", base),
                          Paragraph(f"{escape(str(h.get('sold_to') or '—'))}<br/><font color='#5d6878'>{escape(str(h.get('ship_to') or '—'))} · {escape(str(h.get('especie') or '—'))}{fecha}</font>", base),
                          _p(h.get("detalle"), base)])
        if len(casos) > MAX_FILAS_POR_TIPO:
            filas.append([_p(f"… y {len(casos) - MAX_FILAS_POR_TIPO} casos más (están en el Excel).", chico), "", ""])
        anchos = [3.1 * cm, 5.3 * cm, ancho - 8.4 * cm]
        tabla = Table(filas, colWidths=anchos, repeatRows=1)
        tabla.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")), ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d5dce5")),
                                   ("LINEBEFORE", (0, 1), (0, -1), 2, COLOR_GRAVEDAD[g]), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        historia.append(KeepTogether(bloque + [tabla]) if len(casos) <= 6 else KeepTogether(bloque))
        if len(casos) > 6:
            historia.append(tabla)

    def _pie(canvas, documento):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(GRIS)
        canvas.drawString(1.5 * cm, 0.8 * cm, f"AgroFresh Report Hub · Integridad de datos · {laboratorio}")
        canvas.drawRightString(A4[0] - 1.5 * cm, 0.8 * cm, f"Página {documento.page}")
        canvas.restoreState()

    doc.build(historia, onFirstPage=_pie, onLaterPages=_pie)
    return buf.getvalue()


def generar_excel(laboratorio: str | None, resultado: dict[str, Any], hallazgos: list[dict]) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Resumen"
    ws.append(["Laboratorio", "Solicitudes revisadas", "Informes revisados", "Informes con errores", "Graves", "A revisar"])
    for l in resultado.get("laboratorios", []):
        if laboratorio and it.di.lab_base(l["laboratorio"]) != it.di.lab_base(laboratorio):
            continue
        ws.append([l["laboratorio"], l["solicitudes_revisadas"], l["informes_revisados"], l["informes_con_problema"], l["altos"], l["medios"]])
    ws2 = wb.create_sheet("Hallazgos")
    ws2.append(["Gravedad", "Tipo de error", "Laboratorio", "OT", "N° informe", "Sold To", "Ship To", "Especie", "Muestreo", "Detalle", "Qué se solicita"])
    for h in hallazgos:
        ws2.append([NOMBRE_GRAVEDAD[h["gravedad"]], it.titulo_de(h["codigo"]), h["laboratorio"], h.get("ot"), h.get("informe"), h.get("sold_to"), h.get("ship_to"),
                    h.get("especie"), h.get("fecha_muestreo"), h.get("detalle"), h.get("sugerencia")])
    for hoja in (ws, ws2):
        for c in hoja[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="3F6B2A")
        for i in range(1, hoja.max_column + 1):
            hoja.column_dimensions[get_column_letter(i)].width = 22
    ws2.column_dimensions["J"].width = 90
    ws2.column_dimensions["K"].width = 50
    ws2.auto_filter.ref = ws2.dimensions
    ws2.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
