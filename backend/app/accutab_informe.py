"""
Informe PDF de una carga de Trace / Accu-Tab, y su orden en el almacenamiento.

Toda carga que llega al sistema (la manual de Trace o la automática del correo)
termina con su informe PDF: si Trace no adjunta el suyo, se genera acá con los
mismos datos que ve Post Venta (datos del informe, estadísticas de pH y ORP y
un gráfico de cada serie, siempre separados: no comparten escala).

En R2 los informes quedan ordenados por cliente y por fecha, no una carpeta por
reporte:

    accutab/mail/<CLIENTE>/<AAAA-MM-DD>/Informe <HH-MM-SS>.pdf
    accutab/mail/<CLIENTE>/<AAAA-MM-DD>/Datos <HH-MM-SS>/<archivos del equipo>
"""
from __future__ import annotations

import io
import math
import os
import re
import unicodedata
from datetime import datetime
from typing import Any

from reportlab.graphics.shapes import Drawing, Group, Line, PolyLine, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .informe_pdf import _RUTA_LOGO

RAIZ_R2 = "accutab/mail/"
SIN_CLIENTE = "Sin cliente"

_CHARS_INVALIDOS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_ESPACIOS = re.compile(r"\s+")
_SUFIJO_NUMERO = re.compile(r"\s*\(\d+\)\s*$")

VERDE = colors.HexColor("#3D6B1F")
COLOR_PH = colors.HexColor("#1C7FA6")
COLOR_MV = colors.HexColor("#EB6834")


def sanitizar_nombre(texto: str) -> str:
    """Convierte un texto en nombre de carpeta seguro para R2 y Windows."""
    normalizado = unicodedata.normalize("NFKD", texto or "")
    sin_combining = "".join(c for c in normalizado if unicodedata.category(c) != "Mn")
    limpio = _CHARS_INVALIDOS.sub("_", sin_combining)
    limpio = _ESPACIOS.sub(" ", limpio).strip()
    return limpio[:200] or "sin_asunto"


def cliente_desde_asunto(asunto: str | None) -> str:
    """«AGROFRESH_DEMO (1307)» -> «AGROFRESH_DEMO»: el número entre paréntesis es
    un contador del correo, no parte del nombre del cliente."""
    base = _SUFIJO_NUMERO.sub("", asunto or "").strip()
    return sanitizar_nombre(base) if base else SIN_CLIENTE


def carpeta_cliente_fecha(cliente: str | None, fecha: str) -> str:
    """Prefijo de R2 donde van los informes de un cliente en una fecha."""
    seg = sanitizar_nombre(cliente) if (cliente or "").strip() else SIN_CLIENTE
    return f"{RAIZ_R2}{seg}/{fecha}/"


def _n2(v: Any) -> str:
    """Igual que `n2` de Trace: dos decimales y coma."""
    if v is None or (isinstance(v, float) and v != v):
        return "—"
    try:
        return f"{float(v):.2f}".replace(".", ",")
    except (TypeError, ValueError):
        return "—"


def _n0(v: Any) -> str:
    if v is None or (isinstance(v, float) and v != v):
        return "—"
    try:
        return str(int(round(float(v))))
    except (TypeError, ValueError):
        return "—"


def _mv(v: Any) -> str:
    return "—" if _n0(v) == "—" else f"{_n0(v)} mV"


# --- Gráfico: el mismo de Trace (`dibujar`, vista completa): pH y mV en un solo
# lienzo de 1590 x 620 con dos ejes (pH 0-14 a la izquierda, mV 0-1000 a la derecha).
_W, _H = 1590, 620
_ML, _MR, _MT, _MB = 96, 100, 58, 186
_PH_MAX, _MV_MAX = 14, 1000


def _texto(g: Group, x: float, y: float, txt: str, size: float, *, anchor="start", fill="#3B3B3B",
           font="Helvetica", rot: float = 0.0) -> None:
    """Texto con la `y` hacia abajo, como el canvas. `rot` en grados, antihorario en pantalla."""
    s = String(0, 0, txt, fontSize=size, fontName=font, fillColor=colors.HexColor(fill), textAnchor=anchor)
    a = math.radians(rot)
    # El centrado vertical del canvas (baseline "middle") se aproxima con 0.35 * size.
    g.add(Group(s, transform=(math.cos(a), math.sin(a), -math.sin(a), math.cos(a), x, _H - y)))


def _grafico_trace(filas: list[dict], ancho_pt: float) -> Drawing:
    alto_pt = ancho_pt * _H / _W
    d = Drawing(ancho_pt, alto_pt)
    g = Group()
    g.transform = (ancho_pt / _W, 0, 0, alto_pt / _H, 0, 0)
    d.add(g)
    pw, ph = _W - _ML - _MR, _H - _MT - _MB
    n = len(filas)

    def x(i: int) -> float:
        return _ML + (pw / 2 if n == 1 else pw * i / (n - 1))

    def yv(v: float, tope: float) -> float:
        return _H - (_MT + ph - ph * min(v, tope) / tope)

    g.add(Rect(0, 0, _W, _H, fillColor=colors.white, strokeColor=None))
    for i in range(15):
        yy = _H - (_MT + ph - ph * i / 14)
        g.add(Line(_ML, yy, _ML + pw, yy, strokeColor=colors.HexColor("#E2E5DE"), strokeWidth=1))
    g.add(Rect(_ML, _H - _MT - ph, pw, ph, fillColor=None, strokeColor=colors.HexColor("#C9D0C4"), strokeWidth=1.5))

    for i in range(15):
        _texto(g, _ML - 12, _MT + ph - ph * i / 14 + 6.5, str(i), 19, anchor="end")
    for i in range(11):
        _texto(g, _ML + pw + 12, _MT + ph - ph * i / 10 + 6.5, str(i * 100), 19)
    _texto(g, 28, _MT + ph / 2, "pH", 21, anchor="middle", fill="#000", rot=90)
    _texto(g, _W - 24, _MT + ph / 2, "mV", 21, anchor="middle", fill="#000", rot=90)
    _texto(g, _ML + pw / 2, 36, "Relación entre pH y mV en la solución", 23, anchor="middle",
           fill="#1A1A1A", font="Helvetica-Bold")

    sep = pw / max(n - 1, 1)
    salto = max(1, math.ceil(20 / sep))
    for i, f in enumerate(filas):
        fecha = str(f.get("fecha") or "")
        if i == 0 or fecha != str(filas[i - 1].get("fecha") or ""):
            g.add(Line(x(i), _H - (_MT + ph), x(i), _H - (_MT + ph + 8),
                       strokeColor=colors.HexColor("#C9D0C4"), strokeWidth=1))
        if i % salto or len(fecha) < 10:
            continue
        et = f"{fecha[8:10]}-{fecha[5:7]}-{fecha[0:4]}"
        _texto(g, x(i) + 5, _MT + ph + 12, et, 15 if sep >= 26 else 13, anchor="end",
               fill="#77837B", font="Courier", rot=90)

    def linea(color: str, tope: float, clave: str) -> None:
        tramo: list[float] = []
        for i, f in enumerate(filas):
            v = f.get(clave)
            if not isinstance(v, (int, float)):
                if len(tramo) >= 4:
                    g.add(PolyLine(tramo, strokeColor=colors.HexColor(color), strokeWidth=1.7, strokeLineJoin=0))
                tramo = []
                continue
            tramo += [x(i), yv(v, tope)]
        if len(tramo) >= 4:
            g.add(PolyLine(tramo, strokeColor=colors.HexColor(color), strokeWidth=1.7, strokeLineJoin=0))

    linea("#A5A5A5", _MV_MAX, "mv")
    linea("#FF0000", _PH_MAX, "ph")

    cy, cx = _H - 26, _ML + pw / 2
    g.add(Line(cx - 96, _H - cy, cx - 60, _H - cy, strokeColor=colors.HexColor("#A5A5A5"), strokeWidth=4))
    _texto(g, cx - 52, cy + 6.5, "mV", 19)
    g.add(Line(cx + 16, _H - cy, cx + 52, _H - cy, strokeColor=colors.HexColor("#FF0000"), strokeWidth=4))
    _texto(g, cx + 60, cy + 6.5, "pH", 19)
    return d


_TINTA = colors.HexColor("#16201B")
_AZUL = colors.HexColor("#12386B")


def _caja(titulo: str, pares: list[tuple[str, str]], ancho: float, alto: float | None = None) -> Table:
    """Una tabla `inf-t` de Trace: encabezado azul, claves en negrita, filas con borde arriba."""
    k = ParagraphStyle("k", fontName="Helvetica-Bold", fontSize=9.5, leading=14.5)
    v = ParagraphStyle("v", fontName="Helvetica", fontSize=9.5, leading=14.5)
    cab = ParagraphStyle("cab", fontName="Helvetica-Bold", fontSize=8.5, leading=13, textColor=colors.white)
    filas = [[Paragraph(titulo, cab), ""]] + [[Paragraph(a, k), Paragraph(b or "—", v)] for a, b in pares]
    estilo = TableStyle([
        ("SPAN", (0, 0), (1, 0)),
        ("BACKGROUND", (0, 0), (-1, 0), _AZUL),
        ("BOX", (0, 0), (-1, -1), 0.8, _TINTA),
        ("LINEABOVE", (0, 1), (-1, -1), 0.8, _TINTA),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ])
    t = Table(filas, colWidths=[ancho * 0.42, ancho * 0.58])
    t.setStyle(estilo)
    if alto:  # como la grilla de Trace: las dos cajas de una fila miden lo mismo
        _, propio = t.wrap(ancho, 0)
        if alto > propio + 0.5:
            alturas = list(t._rowHeights)
            alturas[-1] += alto - propio
            t = Table(filas, colWidths=[ancho * 0.42, ancho * 0.58], rowHeights=alturas)
            t.setStyle(estilo)
    return t


def _par(izq: tuple, der: tuple, ancho: float) -> Table:
    """Dos cajas lado a lado (grilla de 2 columnas con 9 pt de espacio), de igual alto."""
    mitad = (ancho - 9) / 2
    alto = max(_caja(*izq, mitad).wrap(mitad, 0)[1], _caja(*der, mitad).wrap(mitad, 0)[1])
    t = Table([[_caja(*izq, mitad, alto), "", _caja(*der, mitad, alto)]], colWidths=[mitad, 9, mitad])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t


def _esc(t: Any) -> str:
    return str(t if t not in (None, "") else "—").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def generar_pdf(registro: dict[str, Any]) -> bytes:
    """Informe PDF de una carga: el MISMO informe que imprime Trace («Generar
    informe PDF»): encabezado con logo, identificación y registros, el gráfico
    de pH y mV, y los cuadros de datos y rango de trabajo efectivo."""
    from .accutab_parser import calcular_estadisticas

    filas: list[dict] = registro.get("filas") or []
    est = registro.get("estadisticas") or (calcular_estadisticas(filas) if filas else {})
    ph, mv = est.get("ph") or {}, est.get("mv") or {}
    margen_x, margen_y = 12 * mm, 14 * mm
    ancho = A4[0] - 2 * margen_x
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=margen_x, rightMargin=margen_x,
                            topMargin=margen_y, bottomMargin=margen_y, title="Informe de trazabilidad equipo Accu-Tab")

    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=17)
    sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=9, leading=11, textColor=colors.HexColor("#555555"), spaceBefore=2)
    textos = [[Paragraph("Informe de trazabilidad equipo Accu-Tab", h1)], [Paragraph("Departamento técnico AgroFresh Chile", sub)]]
    logo = Image(_RUTA_LOGO, width=75, height=30) if os.path.isfile(_RUTA_LOGO) else ""
    cab = Table([[textos, logo]], colWidths=[ancho - 24 - 80, 80 ])
    cab.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.5, _TINTA), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    cab._argW = [ancho - 24 - 80 + 12, 80 + 12]

    desde = f"{filas[0].get('fecha', '')} {filas[0].get('hora', '')}".strip() if filas else "—"
    hasta = f"{filas[-1].get('fecha', '')} {filas[-1].get('hora', '')}".strip() if filas else "—"
    guardado = registro.get("guardado_en") or ""
    try:
        emitido = datetime.fromisoformat(guardado).astimezone().strftime("%d-%m-%Y")
    except ValueError:
        emitido = datetime.now().strftime("%d-%m-%Y")

    ident = ("Identificación", [
        ("Cliente", _esc(registro.get("cliente"))), ("Planta", _esc(registro.get("planta"))),
        ("Posición de muestreo", _esc(registro.get("ubicacion"))), ("Especie", _esc(registro.get("especie"))),
        ("N° de serie", _esc(registro.get("equipo"))), ("Técnico", _esc(registro.get("responsable")))])
    regs = ("Registros", [("Desde", _esc(desde)), ("Hasta", _esc(hasta)),
                               ("Lecturas analizadas", str(len(filas))), ("Emitido", emitido)])
    datos_ph = ("Datos pH", [("Mínimo", _n2(ph.get("min"))), ("Máximo", _n2(ph.get("max"))),
                                  ("Promedio", _n2(ph.get("prom"))), ("Desv. est.", _n2(ph.get("desv")))])
    desv_mv = "—" if mv.get("desv") is None else f"{_n2(mv.get('desv'))} mV"
    datos_mv = ("Datos mV", [("Mínimo", _mv(mv.get("min"))), ("Máximo", _mv(mv.get("max"))),
                                  ("Promedio", _mv(mv.get("prom"))), ("Desv. est.", desv_mv)])
    r_ph = ("Rango trabajo efectivo · pH", [("Mínimo", _n2(ph.get("rMin"))), ("Máximo", _n2(ph.get("rMax")))])
    r_mv = ("Rango trabajo efectivo · mV", [("Mínimo", _mv(mv.get("rMin"))), ("Máximo", _mv(mv.get("rMax")))])

    graf = Table([[_grafico_trace(filas, ancho - 12.6)]], colWidths=[ancho])
    graf.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#CCCCCC")),
                              ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                              ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    pie = Table([[Paragraph("Informe departamento técnico AgroFresh Chile", ParagraphStyle(
        "pie", fontName="Helvetica-Oblique", fontSize=8.5, leading=10.5, alignment=1, textColor=colors.HexColor("#555555")))]],
        colWidths=[ancho])
    pie.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.8, colors.HexColor("#CCCCCC")), ("TOPPADDING", (0, 0), (-1, -1), 6)]))

    e = 11  # el espacio entre bloques de Trace (11pt)
    doc.build([cab, Spacer(1, e), _par(ident, regs, ancho), Spacer(1, e), graf, Spacer(1, e),
               _par(datos_ph, datos_mv, ancho), Spacer(1, e), _par(r_ph, r_mv, ancho), Spacer(1, 14), pie])
    return buf.getvalue()


def archivar_en_r2(
    registro: dict[str, Any],
    marca: str,
    pdf: bytes | None,
    archivos: dict[str, bytes] | None = None,
) -> list[str]:
    """Sube el informe y los datos del equipo a accutab/mail/<cliente>/<fecha>/.
    `marca` es «AAAA-MM-DD_HH-MM-SS». Devuelve las claves subidas; nunca lanza
    (un fallo de R2 no debe perder la carga, que ya quedó en el servidor)."""
    from . import r2

    claves: list[str] = []
    try:
        if not r2.disponible():
            return claves
        fecha, hora = marca.split("_", 1)
        base = carpeta_cliente_fecha(registro.get("cliente"), fecha)
        if pdf:
            clave = f"{base}Informe {hora}.pdf"
            r2.subir(clave, pdf, "application/pdf")
            claves.append(clave)
        for nombre, data in (archivos or {}).items():
            limpio = nombre.replace("\\", "/").lstrip("/")
            if not limpio or ".." in limpio.split("/"):
                continue
            clave = f"{base}Datos {hora}/{limpio}"
            r2.subir(clave, data, "application/octet-stream")
            claves.append(clave)
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).exception("No se pudo archivar el informe Accu-Tab %s en R2", marca)
    return claves


def borrar_de_r2(claves: list[str]) -> None:
    """Quita de R2 lo que archivó `archivar_en_r2`. Nunca lanza."""
    from . import r2

    try:
        if not r2.disponible():
            return
        for k in claves:
            if k.startswith(RAIZ_R2):
                r2.eliminar(k)
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).exception("No se pudo borrar de R2 el informe Accu-Tab")
