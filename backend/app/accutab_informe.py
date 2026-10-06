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
import re
import unicodedata
from datetime import datetime
from typing import Any

from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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


def _num(v: Any, dec: int = 2) -> str:
    if v is None or (isinstance(v, float) and v != v):
        return "—"
    try:
        return f"{float(v):,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return "—"


def _grafico(titulo: str, filas: list[dict], campo: str, color, dec: int) -> Drawing:
    ancho, alto = 17 * cm, 6 * cm
    d = Drawing(ancho, alto)
    puntos = [(i, f.get(campo)) for i, f in enumerate(filas) if isinstance(f.get(campo), (int, float))]
    d.add(String(0, alto - 10, titulo, fontSize=10, fontName="Helvetica-Bold", fillColor=color))
    if len(puntos) < 2:
        d.add(String(0, alto / 2, "Sin datos suficientes para graficar.", fontSize=9))
        return d
    paso = max(1, len(puntos) // 400)
    datos = [(float(i), float(v)) for i, v in puntos[::paso]]
    lp = LinePlot()
    lp.x, lp.y = 1.6 * cm, 1.2 * cm
    lp.width, lp.height = ancho - 2.2 * cm, alto - 2.2 * cm
    lp.data = [datos]
    lp.lines[0].strokeColor = color
    lp.lines[0].strokeWidth = 1
    lp.xValueAxis.valueMin = 0
    lp.xValueAxis.valueMax = max(1, len(filas) - 1)
    lp.xValueAxis.valueSteps = [round(k * (len(filas) - 1) / 4) for k in range(5)]

    def etiqueta(v: float) -> str:
        f = filas[min(len(filas) - 1, max(0, int(round(v))))]
        return f"{f.get('fecha', '')} {f.get('hora', '')}".strip()

    lp.xValueAxis.labelTextFormat = etiqueta
    lp.xValueAxis.labels.fontSize = 6
    lp.yValueAxis.labels.fontSize = 7
    lp.yValueAxis.labelTextFormat = lambda v: _num(v, dec)
    lp.yValueAxis.visibleGrid = True
    lp.yValueAxis.gridStrokeColor = colors.HexColor("#E1E5DC")
    d.add(lp)
    return d


def generar_pdf(registro: dict[str, Any]) -> bytes:
    """Informe PDF a partir de un registro de Trace (el `registro.json`)."""
    filas: list[dict] = registro.get("filas") or []
    est = registro.get("estadisticas") or {}
    ph, mv = est.get("ph") or {}, est.get("mv") or {}
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.6 * cm, bottomMargin=1.6 * cm,
        title="Informe Trace Accu-Tab",
    )
    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=16, textColor=VERDE, spaceAfter=2)
    sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#5B6B5F"), spaceAfter=10)
    h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, textColor=VERDE, spaceBefore=10, spaceAfter=4)

    guardado = registro.get("guardado_en") or ""
    try:
        emision = datetime.fromisoformat(guardado).astimezone().strftime("%d-%m-%Y %H:%M")
    except ValueError:
        emision = datetime.now().strftime("%d-%m-%Y %H:%M")
    periodo = "—"
    if filas:
        periodo = f"{filas[0].get('fecha', '')} {filas[0].get('hora', '')}  →  {filas[-1].get('fecha', '')} {filas[-1].get('hora', '')}"

    cuerpo: list = [
        Paragraph("INFORME DE TRAZABILIDAD ACCU-TAB", h1),
        Paragraph(f"pH y ORP · emitido el {emision} · "
                  f"{'ingesta automática desde correo' if registro.get('origen') == 'email' else 'carga manual desde Trace'}", sub),
    ]
    datos = [
        ("Cliente (Sold To)", registro.get("cliente")),
        ("Planta (Ship To)", registro.get("planta")),
        ("Posición de muestreo", registro.get("ubicacion")),
        ("Especie", registro.get("especie")),
        ("Equipo", registro.get("equipo")),
        ("Responsable", registro.get("responsable")),
        ("Período medido", periodo),
        ("Mediciones", f"{len(filas):,}".replace(",", ".")),
    ]
    t = Table([[k, v or "—"] for k, v in datos], colWidths=[5 * cm, 12 * cm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9), ("FONT", (1, 0), (1, -1), "Helvetica", 9),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EBF5E1")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9D3C4")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    cuerpo += [t, Paragraph("Estadísticas", h2)]

    cab = ["Serie", "Promedio", "Mínimo", "Máximo", "Desv. est."]
    est_tab = Table(
        [cab,
         ["pH", _num(ph.get("prom")), _num(ph.get("min")), _num(ph.get("max")), _num(ph.get("desv"))],
         ["ORP (mV)", _num(mv.get("prom"), 0), _num(mv.get("min"), 0), _num(mv.get("max"), 0), _num(mv.get("desv"), 0)]],
        colWidths=[4 * cm, 3.25 * cm, 3.25 * cm, 3.25 * cm, 3.25 * cm],
    )
    est_tab.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9), ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
        ("BACKGROUND", (0, 0), (-1, 0), VERDE), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9D3C4")), ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ]))
    cuerpo += [est_tab, Spacer(1, 8), _grafico("pH", filas, "ph", COLOR_PH, 2),
               Spacer(1, 6), _grafico("ORP (mV)", filas, "mv", COLOR_MV, 0)]
    doc.build(cuerpo)
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
