"""
Informe de costo por kilo (equipo C&M-500) en PDF y en Excel.

El PDF sigue el formato del informe de Accu-Tab (`accutab_informe`): encabezado con logo, cajas de identificación y
de registros, los gráficos y los cuadros de datos. El Excel es para que el cliente tenga su propia base: el resumen
diario, los dos gráficos y todas las lecturas como números.

Los dos gráficos (los mismos de la planilla que se armaba a mano):
  1. kg de fruta por día (barras) y litros de solución madre del día (líneas: lámina, mantención y total).
  2. kg de fruta por día (barras) y litros de producto comercial del día por ingrediente activo (líneas).
"""
from __future__ import annotations

import io
import math
import os
from datetime import datetime
from typing import Any

from reportlab.graphics.shapes import Drawing, Line, PolyLine, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from . import costo_kilo
from .accutab_informe import _TINTA, _esc, _par
from .informe_pdf import _RUTA_LOGO

MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
MESES_LARGO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]
# Un color por ingrediente activo (en un orden fijo, para que no cambie de un informe a otro).
COLOR_ACTIVO = {"FDL": "#C0392B", "TEBU": "#E8A317", "PYR": "#2F7DA3"}
COLORES_EXTRA = ["#7B5EA7", "#16857A", "#E8684A", "#6DAD3C"]
COLOR_BARRAS = "#7A7573"
COLOR_SM = {"sm_lamina": "#2F7DA3", "sm_mant": "#6DAD3C", "sm_total": "#C0392B"}


def color_de(codigo: str, usados: list[str]) -> str:
    if codigo in COLOR_ACTIVO:
        return COLOR_ACTIVO[codigo]
    return COLORES_EXTRA[len([c for c in usados if c not in COLOR_ACTIVO]) % len(COLORES_EXTRA)]


def _miles(n: float | None, dec: int = 0) -> str:
    if n is None:
        return "—"
    s = f"{n:,.{dec}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def _dia(iso: str) -> str:
    d = datetime.fromisoformat(iso)
    return f"{d.day}-{MESES[d.month - 1]}"


def _fecha_corta(iso: str) -> str:
    d = datetime.fromisoformat(iso)
    return f"{d.day:02d}-{d.month:02d}-{d.year}"


def activos_con_consumo(registro: dict[str, Any]) -> list[str]:
    """Los ingredientes activos que se usaron en el período (si ninguno, todos: nunca un informe sin líneas)."""
    r = registro["resumen"]
    con = [c for c in r["codigos"] if (r["totales"]["activos"].get(c) or 0) > 0]
    return con or list(r["codigos"])


def kg_cierre(d: dict[str, Any]) -> float:
    """Lo que marcaba el contador de kg al cierre del día (la plantilla del cliente grafica esto). Informes guardados
    antes de que se registrara el cierre caen al valor del día."""
    return d.get("kg_cierre", d["kg"])


def activo_cierre(d: dict[str, Any], c: str) -> float:
    return (d.get("activos_cierre") or d["activos"]).get(c, 0.0)


def carga_inicial(d: dict[str, Any]) -> float:
    return d.get("sm_inicial", 0.0)


def _escala(maximo: float) -> tuple[float, list[float]]:
    """Un tope «redondo» y las marcas del eje para un máximo cualquiera."""
    if maximo <= 0:
        return 1.0, [0.0, 0.5, 1.0]
    exp = 10 ** math.floor(math.log10(maximo))
    for paso in (1, 2, 2.5, 5, 10):
        if maximo / (paso * exp) <= 5:
            salto = paso * exp
            break
    else:  # pragma: no cover
        salto = 10 * exp
    n = math.ceil(maximo / salto - 1e-9)
    return n * salto, [i * salto for i in range(n + 1)]


def _grafico(titulo: str, etiquetas: list[str], barras: list[float], etiqueta_barras: str,
             lineas: list[tuple[str, list[float], str]], unidad_lineas: str, ancho: float, alto: float,
             punteadas: bool = False) -> Drawing:
    """Barras (eje izquierdo) y líneas (eje derecho), con la leyenda abajo."""
    d = Drawing(ancho, alto)
    ml, mr, mt, mb = 46, 40, 24, 56
    pw, ph = ancho - ml - mr, alto - mt - mb
    d.add(Rect(0, 0, ancho, alto, fillColor=colors.white, strokeColor=None))
    d.add(String(ancho / 2, alto - 14, titulo, fontSize=9, fontName="Helvetica-Bold", textAnchor="middle", fillColor=colors.HexColor("#1A1A1A")))
    tope_b, marcas_b = _escala(max(barras) if barras else 0)
    maximo_l = max((max(v) for _, v, _ in lineas if v), default=0)
    tope_l, marcas_l = _escala(maximo_l)
    n = max(len(etiquetas), 1)

    def yb(v: float) -> float:
        return mb + ph * v / tope_b

    def yl(v: float) -> float:
        return mb + ph * v / tope_l

    for m in marcas_b:
        d.add(Line(ml, yb(m), ml + pw, yb(m), strokeColor=colors.HexColor("#E2E5DE"), strokeWidth=0.6))
        d.add(String(ml - 4, yb(m) - 2.5, _miles(m), fontSize=6.5, textAnchor="end", fillColor=colors.HexColor("#555555")))
    for m in marcas_l:
        d.add(String(ml + pw + 4, yl(m) - 2.5, _miles(m, 0 if tope_l >= 10 else 1), fontSize=6.5, fillColor=colors.HexColor("#555555")))
    d.add(Line(ml, mb, ml + pw, mb, strokeColor=colors.HexColor("#999999"), strokeWidth=0.8))
    ancho_col = pw / n
    centros = [ml + ancho_col * (i + 0.5) for i in range(n)]
    for i, v in enumerate(barras):
        w = ancho_col * 0.62
        d.add(Rect(centros[i] - w / 2, mb, w, max(yb(v) - mb, 0), fillColor=colors.HexColor(COLOR_BARRAS), strokeColor=None))
        if yb(v) - mb > 22:
            d.add(String(centros[i], mb + 4, _miles(v), fontSize=6, fontName="Helvetica-Bold", textAnchor="middle", fillColor=colors.white))
        d.add(String(centros[i], mb - 10, etiquetas[i], fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#333333")))
    for nombre, valores, color in lineas:
        pts: list[float] = []
        for i, v in enumerate(valores):
            pts += [centros[i], yl(v)]
        if len(pts) >= 4:
            d.add(PolyLine(pts, strokeColor=colors.HexColor(color), strokeWidth=1.8 if punteadas else 1.6, strokeDashArray=[1.5, 3] if punteadas else None))
        for i, v in enumerate(valores):
            if punteadas:
                continue
            d.add(Rect(centros[i] - 1.8, yl(v) - 1.8, 3.6, 3.6, fillColor=colors.HexColor(color), strokeColor=colors.white, strokeWidth=0.4))
    # Leyenda (barras primero), en una o dos filas.
    items = [(etiqueta_barras, COLOR_BARRAS, True)] + [(nombre, color, False) for nombre, _, color in lineas]
    x, y = ml, 24.0
    for nombre, color, es_barra in items:
        ancho_item = 22 + len(nombre) * 3.6
        if x + ancho_item > ancho - 6:
            x, y = ml, y - 10
        if es_barra:
            d.add(Rect(x, y - 1, 9, 6, fillColor=colors.HexColor(color), strokeColor=None))
        else:
            d.add(Line(x, y + 2, x + 9, y + 2, strokeColor=colors.HexColor(color), strokeWidth=2))
        d.add(String(x + 12, y, nombre, fontSize=6.5, fillColor=colors.HexColor("#333333")))
        x += ancho_item
    d.add(String(10, mb + ph / 2, "kg de fruta", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#000000")))
    d.add(String(ancho - 6, mb + ph / 2, unidad_lineas, fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#000000")))
    # Los títulos de los ejes van girados: se dibujan con un grupo rotado.
    d.contents = [c for c in d.contents if not (isinstance(c, String) and c.text in ("kg de fruta", unidad_lineas))]
    from reportlab.graphics.shapes import Group
    for texto, x0, ang in (("kg de fruta", 9, 90), (unidad_lineas, ancho - 7, -90)):
        g = Group(String(0, 0, texto, fontSize=6.5, textAnchor="middle", fillColor=colors.black))
        g.rotate(ang)
        g.translate(0, 0)
        g2 = Group(g)
        g2.translate(x0, mb + ph / 2)
        d.add(g2)
    return d


def _series(registro: dict[str, Any]) -> dict[str, Any]:
    r = registro["resumen"]
    dias = r["dias"]
    codigos = activos_con_consumo(registro)
    usados: list[str] = []
    lineas_act = []
    for c in codigos:
        lineas_act.append((f"{c} litros ({registro['nombres'].get(c, c)})", [activo_cierre(d, c) for d in dias], color_de(c, usados)))
        usados.append(c)
    return {
        "etiquetas": [_dia(d["fecha"]) for d in dias],
        "kg": [kg_cierre(d) for d in dias],
        "sm": [("PRODUCTO CARGA INICIAL (Solución Madre / Inicial)", [carga_inicial(d) for d in dias], COLOR_SM["sm_total"])],
        "activos": lineas_act,
        "codigos": codigos,
    }


def generar_pdf(registro: dict[str, Any]) -> bytes:
    """El informe en PDF. `registro` trae cliente/planta/linea/equipo/responsable, `resumen` (de `resumen_diario`),
    `nombres` (código → nombre del activo) y `guardado_en`."""
    r = registro["resumen"]
    s = _series(registro)
    margen_x, margen_y = 12 * mm, 14 * mm
    ancho = A4[0] - 2 * margen_x
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=margen_x, rightMargin=margen_x, topMargin=margen_y,
                            bottomMargin=margen_y, title="Informe de costo por kilo equipo C&M-500")

    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=17)
    sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=9, leading=11, textColor=colors.HexColor("#555555"), spaceBefore=2)
    textos = [[Paragraph("Informe de costo por kilo · equipo C&amp;M-500", h1)], [Paragraph("Departamento técnico AgroFresh Chile", sub)]]
    logo = Image(_RUTA_LOGO, width=75, height=30) if os.path.isfile(_RUTA_LOGO) else ""
    cab = Table([[textos, logo]], colWidths=[ancho - 24 - 80, 80])
    cab.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.5, _TINTA), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    cab._argW = [ancho - 24 - 80 + 12, 80 + 12]

    guardado = registro.get("guardado_en") or ""
    try:
        emitido = datetime.fromisoformat(guardado).astimezone().strftime("%d-%m-%Y")
    except ValueError:
        emitido = datetime.now().strftime("%d-%m-%Y")
    ident = ("Identificación", [
        ("Cliente", _esc(registro.get("cliente"))), ("Planta", _esc(registro.get("planta"))),
        ("Línea", _esc(registro.get("linea"))), ("Equipo", _esc(registro.get("equipo") or "C&M-500")),
        ("Técnico", _esc(registro.get("responsable")))])
    regs = ("Registros", [
        ("Desde", f"{_fecha_corta(r['desde'])} {r['desde_hora']}"), ("Hasta", f"{_fecha_corta(r['hasta'])} {r['hasta_hora']}"),
        ("Días", str(len(r["dias"]))), ("Lecturas analizadas", str(r["lecturas"])), ("Emitido", emitido)])
    dias = len(r["dias"]) or 1
    fruta = ("Fruta procesada", [("Total", f"{_miles(r['totales']['kg'])} kg"), ("Promedio diario", f"{_miles(r['totales']['kg'] / dias)} kg")])
    prod = ("Producto comercial", [
        (f"{c} ({_esc(registro['nombres'].get(c, c))})",
         f"{_miles(r['totales']['activos'].get(c), 1)} L · {_miles(r['totales']['ml_por_kg'].get(c), 3)} ml/kg") for c in s["codigos"]])

    def caja_grafico(g: Drawing) -> Table:
        t = Table([[g]], colWidths=[ancho])
        t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#CCCCCC")), ("LEFTPADDING", (0, 0), (-1, -1), 4),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        return t

    g1 = _grafico("Kg de fruta proceso y carga inicial de solución madre", s["etiquetas"], s["kg"], "KG FRUTA PROCESO", s["sm"],
                  "litros de solución madre", ancho - 8, 190, punteadas=True)
    g2 = _grafico("Litros de producto comercial según activo", s["etiquetas"], s["kg"], "KG FRUTA PROCESO",
                  s["activos"], "litros de producto comercial", ancho - 8, 190)

    # Tabla diaria: día, kg, litros y ml/kg de cada activo.
    est = ParagraphStyle("t", fontName="Helvetica", fontSize=8, leading=10)
    estb = ParagraphStyle("tb", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white)
    cabecera = [Paragraph("Consumo del día", estb), Paragraph("Kg de fruta", estb)]
    for c in s["codigos"]:
        cabecera += [Paragraph(f"{c} litros", estb), Paragraph(f"{c} ml/kg", estb)]
    filas = [cabecera]
    for d in r["dias"]:
        fila = [Paragraph(_fecha_corta(d["fecha"]) + (" *" if d["parcial"] else ""), est), Paragraph(_miles(d["kg"]), est)]
        for c in s["codigos"]:
            fila += [Paragraph(_miles(d["activos"].get(c), 2), est), Paragraph(_miles(d["ml_por_kg"].get(c), 3), est)]
        filas.append(fila)
    tot = [Paragraph("<b>Total</b>", est), Paragraph(f"<b>{_miles(r['totales']['kg'])}</b>", est)]
    for c in s["codigos"]:
        tot += [Paragraph(f"<b>{_miles(r['totales']['activos'].get(c), 2)}</b>", est), Paragraph(f"<b>{_miles(r['totales']['ml_por_kg'].get(c), 3)}</b>", est)]
    filas.append(tot)
    n_cols = len(cabecera)
    tabla = Table(filas, colWidths=[ancho * 0.18] + [ancho * 0.82 / (n_cols - 1)] * (n_cols - 1), repeatRows=1)
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C7FA6")), ("BOX", (0, 0), (-1, -1), 0.8, _TINTA),
        ("LINEABOVE", (0, 1), (-1, -1), 0.4, colors.HexColor("#BBBBBB")), ("LINEABOVE", (0, -1), (-1, -1), 0.8, _TINTA),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    nota = Paragraph(
        "* Día parcial: el equipo no registró el día completo (el primero y el último del período, o un día con pocas lecturas). "
        "El valor de cada día es lo que subió el contador ese día; cuando el contador baja a cero se cuenta como un pozo nuevo.",
        ParagraphStyle("nota", fontName="Helvetica-Oblique", fontSize=7.5, leading=9.5, textColor=colors.HexColor("#555555")))
    pie = Table([[Paragraph("Informe departamento técnico AgroFresh Chile", ParagraphStyle(
        "pie", fontName="Helvetica-Oblique", fontSize=8.5, leading=10.5, alignment=1, textColor=colors.HexColor("#555555")))]], colWidths=[ancho])
    pie.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.8, colors.HexColor("#CCCCCC")), ("TOPPADDING", (0, 0), (-1, -1), 6)]))

    e = 11
    doc.build([cab, Spacer(1, e), _par(ident, regs, ancho), Spacer(1, e), _par(fruta, prod, ancho), Spacer(1, e),
               caja_grafico(g1), Spacer(1, e), caja_grafico(g2), Spacer(1, e),
               KeepTogether([tabla, Spacer(1, 4), nota]), Spacer(1, 14), pie])
    return buf.getvalue()


# ── Excel para el cliente ───────────────────────────────────────────────────────────────────────────

def _rango_texto(desde: str, hasta: str) -> str:
    a, b = datetime.fromisoformat(desde), datetime.fromisoformat(hasta)
    return f"{a.day:02d} DE {MESES_LARGO[a.month - 1]} AL {b.day:02d} DE {MESES_LARGO[b.month - 1]}"


def generar_excel(registro: dict[str, Any]) -> bytes:
    """El Excel del cliente: RESUMEN DIARIO, GRAFICOS (los dos gráficos de siempre, con logo) y LECTURAS (su propia
    base, todo numérico)."""
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, LineChart, Reference
    from openpyxl.chart.label import DataLabelList
    from openpyxl.drawing.image import Image as XlImage
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    r = registro["resumen"]
    s = _series(registro)
    cods = s["codigos"]
    nombres = registro["nombres"]
    wb = Workbook()
    hoja = wb.active
    hoja.title = "RESUMEN DIARIO"
    azul = PatternFill("solid", fgColor="1C7FA6")
    gris = PatternFill("solid", fgColor="EEEEEE")
    fino = Side(style="thin", color="999999")
    borde = Border(left=fino, right=fino, top=fino, bottom=fino)
    blanco_b = Font(bold=True, color="FFFFFF")

    cab = ["FECHA", "KG FRUTA PROCESO DIA", "SOLUCIÓN MADRE LÁMINA (L)", "SOLUCIÓN MADRE MANTENCIÓN (L)", "SOLUCIÓN MADRE TOTAL (L)"]
    for c in cods:
        cab += [f"{c} LTS PRODUCTO COMERCIAL ({nombres.get(c, c)})", f"{c} ML POR KG"]
    cab += ["DÍA PARCIAL"]
    # Lo que grafica la plantilla del cliente: lo que marcaba el equipo al cerrar cada día.
    col_cierre = len(cab) + 1
    cab += ["KG FRUTA PROCESO (cierre del día)", "PRODUCTO CARGA INICIAL (Solución Madre / Inicial)"]
    cab += [f"{c} LTS PC (cierre del día)" for c in cods]
    hoja["A1"] = f"RESUMEN DIARIO · {registro.get('cliente') or ''} · {registro.get('planta') or ''} · Línea {registro.get('linea') or ''}".strip(" ·")
    hoja["A1"].font = Font(bold=True, size=12)
    for j, t in enumerate(cab, start=1):
        c = hoja.cell(row=2, column=j, value=t)
        c.fill, c.font, c.border = azul, blanco_b, borde
        c.alignment = Alignment(wrap_text=True, horizontal="center", vertical="center")
    hoja.row_dimensions[2].height = 48
    for i, d in enumerate(r["dias"], start=3):
        fila = [datetime.fromisoformat(d["fecha"]), d["kg"], d["sm_lamina"], d["sm_mant"], d["sm_total"]]
        for c in cods:
            fila += [d["activos"].get(c, 0.0), d["ml_por_kg"].get(c)]
        fila += ["Sí" if d["parcial"] else "No", kg_cierre(d), carga_inicial(d)] + [activo_cierre(d, c) for c in cods]
        for j, v in enumerate(fila, start=1):
            cel = hoja.cell(row=i, column=j, value=v)
            cel.border = borde
            if j == 1:
                cel.number_format = "dd-mm-yyyy"
            elif isinstance(v, float) or isinstance(v, int):
                cel.number_format = "#,##0.000" if cab[j - 1].endswith("ML POR KG") else ("#,##0" if j in (2, col_cierre) else "#,##0.00")
    ultima = 2 + len(r["dias"])
    t = ultima + 1
    hoja.cell(row=t, column=1, value="TOTAL").font = Font(bold=True)
    hoja.cell(row=t, column=2, value=r["totales"]["kg"])
    hoja.cell(row=t, column=3, value=round(sum(d["sm_lamina"] for d in r["dias"]), 2))
    hoja.cell(row=t, column=4, value=round(sum(d["sm_mant"] for d in r["dias"]), 2))
    hoja.cell(row=t, column=5, value=r["totales"]["sm_total"])
    col = 6
    for c in cods:
        hoja.cell(row=t, column=col, value=r["totales"]["activos"].get(c, 0.0))
        hoja.cell(row=t, column=col + 1, value=r["totales"]["ml_por_kg"].get(c)).number_format = "#,##0.000"
        col += 2
    for j in range(1, len(cab) + 1):
        c = hoja.cell(row=t, column=j)
        c.fill, c.border, c.font = gris, borde, Font(bold=True)
        if j in (2,):
            c.number_format = "#,##0"
        elif j > 2 and c.number_format == "General":
            c.number_format = "#,##0.00"
    hoja.cell(row=t + 2, column=1, value="El valor de cada día es lo que subió el contador ese día; si el contador baja a cero se cuenta como un pozo nuevo. "
              "Un día parcial es uno en que el equipo no registró el día completo.").font = Font(italic=True, color="555555")
    hoja.column_dimensions["A"].width = 14
    for j in range(2, len(cab) + 1):
        hoja.column_dimensions[hoja.cell(row=2, column=j).column_letter].width = 22
    hoja.freeze_panes = "A3"

    # GRAFICOS
    g = wb.create_sheet("GRAFICOS")
    g.sheet_view.showGridLines = False
    g["B3"] = f"RESUMEN DE REGISTRO TECNOLOGIA C&M-500  -  {(registro.get('cliente') or '').upper()}"
    g["B3"].font = Font(bold=True, size=14)
    etiquetas = [("CLIENTE", registro.get("cliente") or ""), ("PLANTA", registro.get("planta") or ""),
                 ("LINEA", registro.get("linea") or ""), ("FECHA", _rango_texto(r["desde"], r["hasta"]))]
    for k, (a, b) in enumerate(etiquetas):
        ca, cb = g.cell(row=5 + k, column=2, value=a), g.cell(row=5 + k, column=3, value=b)
        ca.font, ca.fill = Font(bold=True), gris
        for c in (ca, cb):
            c.border = borde
    g.column_dimensions["B"].width = 12
    g.column_dimensions["C"].width = 30
    if os.path.isfile(_RUTA_LOGO):
        logo = XlImage(_RUTA_LOGO)
        logo.width, logo.height = 214, 74
        g.add_image(logo, "N2")

    n = len(r["dias"])
    fechas = Reference(hoja, min_col=1, min_row=3, max_row=2 + n)

    def combinado(titulo: str, y_barras: str, y_lineas: str, columnas: list[int], ancla: str, punteada: bool = False) -> None:
        barras = BarChart()
        barras.type = "col"
        barras.title = titulo
        barras.y_axis.title = y_barras
        barras.add_data(Reference(hoja, min_col=col_cierre, min_row=2, max_row=2 + n), titles_from_data=True)
        barras.set_categories(fechas)
        barras.series[0].graphicalProperties.solidFill = "7A7573"
        barras.dataLabels = DataLabelList()
        barras.dataLabels.showVal = True
        barras.dataLabels.showSerName = False
        barras.dataLabels.showCatName = False
        barras.dataLabels.showLegendKey = False
        barras.dataLabels.showPercent = False
        barras.x_axis.number_format = "d-mmm"
        barras.x_axis.delete = False
        barras.y_axis.delete = False
        lineas = LineChart()
        for cidx in columnas:
            lineas.add_data(Reference(hoja, min_col=cidx, min_row=2, max_row=2 + n), titles_from_data=True)
        lineas.y_axis.axId = 200
        lineas.y_axis.title = y_lineas
        lineas.y_axis.crosses = "max"
        lineas.y_axis.delete = False
        for k, ser in enumerate(lineas.series):
            ser.smooth = False
            if punteada:
                ser.marker.symbol = "none"
                ser.graphicalProperties.line.dashStyle = "sysDot"
                ser.graphicalProperties.line.solidFill = "C0392B"
                ser.graphicalProperties.line.width = 28000
            else:
                ser.marker.symbol = "circle"
        barras += lineas
        barras.height, barras.width = 11, 30
        barras.legend.position = "b"
        g.add_chart(barras, ancla)

    combinado("KG FRUTA PROCESO y PRODUCTO CARGA INICIAL (Solución Madre)", "KG FRUTA PROCESO DIA", "LTS SS MADRE (Inicial)", [col_cierre + 1], "B10", punteada=True)
    cols_act = [col_cierre + 2 + i for i in range(len(cods))]
    combinado("Litros de producto comercial según activo", "KG FRUTA PROCESO DIA", "LTS PRODUCTO COMERCIAL", cols_act, "B34")

    # LECTURAS: la base completa, numérica.
    lec = wb.create_sheet("LECTURAS")
    enc = ["FECHA", "HORA", "KG FRUTA TEMPORADA", "KG FRUTA PROCESO", "TOTAL AGUA PROCESO", "PRODUCTO CARGA INICIAL (Solución Madre)",
           "PRODUCTO CARGA LAMINA (Solución Madre)", "PRODUCTO MANTENCION (Solución Madre)", "TOTAL PRODUCTO PROCESO (Solución Madre)"]
    enc += [f"{c} LTS PC" for c in cods]
    for j, t in enumerate(enc, start=1):
        c = lec.cell(row=1, column=j, value=t)
        c.fill, c.font = azul, blanco_b
        c.alignment = Alignment(wrap_text=True, horizontal="center", vertical="center")
        lec.column_dimensions[c.column_letter].width = 20
    lec.row_dimensions[1].height = 45
    for i, l in enumerate(registro.get("lecturas") or [], start=2):
        h = [int(x) for x in l["hora"].split(":")]
        from datetime import time as _time
        fila = [datetime.fromisoformat(l["fecha"]), _time(*h), l["kg_temporada"], l["kg_proceso"], l["agua_total"], l["sm_inicial"],
                l["sm_lamina"], l["sm_mant"], l["sm_total"]] + [l["activos"].get(c) for c in cods]
        for j, v in enumerate(fila, start=1):
            cel = lec.cell(row=i, column=j, value=v)
            if j == 1:
                cel.number_format = "dd-mm-yyyy"
            elif j == 2:
                cel.number_format = "hh:mm:ss"
    lec.freeze_panes = "A2"
    wb.active = 1
    salida = io.BytesIO()
    wb.save(salida)
    return salida.getvalue()


def registro_para_informe(resumen: dict[str, Any], lecturas: list[dict[str, Any]], meta: dict[str, Any], catalogo: dict[str, str] | None = None) -> dict[str, Any]:
    """Arma el `registro` que reciben los generadores a partir del resumen diario y los datos de quién es el informe."""
    return {
        **meta,
        "resumen": resumen,
        "lecturas": lecturas,
        "nombres": costo_kilo.nombres_de_activos(resumen["codigos"], catalogo),
    }
