"""
PDF de una solicitud de Toma de muestras. Reutiliza los colores, estilos y
el patrón visual de `informe_pdf.py` (título con línea fina, tabla con
encabezado verde) en vez de crear un sistema de PDF paralelo.
"""
import io
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
import os

from .informe_pdf import (
    _ESTILO_FOOTER,
    _ESTILO_LABEL,
    _ESTILO_SUBTITULO,
    _ESTILO_TABLA_CELDA,
    _ESTILO_TABLA_HEAD,
    _ESTILO_TITULO,
    _ESTILO_VALOR,
    _RUTA_LOGO,
    GRIS_LABEL,
    GRIS_LINEA,
    VERDE_CLARO,
    VERDE_OSCURO,
    _titulo_seccion,
)
from .solicitud_excel import CAMPOS_GENERALES_ETIQUETAS


def _fila_campo(etiqueta: str, valor) -> list:
    texto = str(valor) if valor not in (None, "") else "—"
    return [Paragraph(etiqueta, _ESTILO_LABEL), Paragraph(texto, _ESTILO_VALOR)]


def generar_pdf_solicitud(datos: dict) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.4 * cm,
        bottomMargin=1.5 * cm,
        title=f"Solicitud de muestreo {datos.get('numero_solicitud', '')}".strip(),
    )

    elementos = []

    # --- Encabezado ---
    logo = Image(_RUTA_LOGO, width=3.3 * cm, height=1.32 * cm) if os.path.isfile(_RUTA_LOGO) else Paragraph('', _ESTILO_VALOR)
    titulo_cel = [
        Paragraph('SOLICITUD DE MUESTREO', _ESTILO_TITULO),
        Paragraph(f"Laboratorio {datos.get('laboratorio', '')} · AgroFresh Chile", _ESTILO_SUBTITULO),
        Spacer(1, 3),
        Paragraph(f"N° Solicitud: {datos.get('numero_solicitud', '')}", _ESTILO_SUBTITULO),
    ]
    encabezado = Table([[logo, titulo_cel]], colWidths=[6 * cm, 11.6 * cm])
    encabezado.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
                ('LINEBELOW', (0, 0), (-1, -1), 0.75, GRIS_LINEA),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]
        )
    )
    elementos.append(encabezado)
    elementos.append(Spacer(1, 12))

    # --- Información general: pares etiqueta/valor, 2 columnas por fila ---
    elementos.append(_titulo_seccion('INFORMACIÓN GENERAL'))
    campos_a_mostrar = [(e, datos.get(c)) for c, e in CAMPOS_GENERALES_ETIQUETAS]
    filas_generales = []
    for i in range(0, len(campos_a_mostrar), 2):
        par = campos_a_mostrar[i : i + 2]
        fila = _fila_campo(*par[0])
        fila += _fila_campo(*par[1]) if len(par) > 1 else ['', '']
        filas_generales.append(fila)
    tabla_general = Table(filas_generales, colWidths=[3.2 * cm, 5.6 * cm, 3.2 * cm, 5.6 * cm])
    tabla_general.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 4.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
            ]
        )
    )
    elementos.append(tabla_general)
    elementos.append(Spacer(1, 12))

    # --- Análisis de laboratorio: lo que efectivamente trae la solicitud ---
    campos_lab: dict = datos.get('campos_laboratorio') or {}
    if campos_lab:
        elementos.append(_titulo_seccion('ANÁLISIS DE LABORATORIO'))
        elementos.append(Spacer(1, 6))
        filas = [[Paragraph('CAMPO', _ESTILO_TABLA_HEAD), Paragraph('VALOR', _ESTILO_TABLA_HEAD)]]
        for etiqueta, valor in campos_lab.items():
            filas.append([Paragraph(etiqueta, _ESTILO_TABLA_CELDA), Paragraph(str(valor), _ESTILO_TABLA_CELDA)])
        tabla_lab = Table(filas, colWidths=[8.8 * cm, 8.8 * cm])
        tabla_lab.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, 0), VERDE_CLARO),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                    ('LINEBELOW', (0, 0), (-1, 0), 1, VERDE_OSCURO),
                    ('LINEBELOW', (0, 1), (-1, -1), 0.5, GRIS_LINEA),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [None, GRIS_LABEL]),
                ]
            )
        )
        elementos.append(tabla_lab)
        elementos.append(Spacer(1, 12))

    # --- Observaciones ---
    elementos.append(_titulo_seccion('OBSERVACIONES'))
    elementos.append(Spacer(1, 5))
    elementos.append(Paragraph(datos.get('observacion') or '—', _ESTILO_VALOR))
    elementos.append(Spacer(1, 20))

    # --- Pie ---
    hoy = datetime.now().strftime('%d-%m-%Y')
    pie = Table(
        [[Paragraph(f'Fecha del documento: {hoy}', _ESTILO_FOOTER), Paragraph('Documento generado por AgroFresh Report Hub.', _ESTILO_FOOTER)]],
        colWidths=[8.8 * cm, 8.8 * cm],
    )
    pie.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, -1), 0.5, GRIS_LINEA), ('TOPPADDING', (0, 0), (-1, -1), 6), ('ALIGN', (1, 0), (1, 0), 'RIGHT')]))
    elementos.append(KeepTogether(pie))

    doc.build(elementos)
    return buffer.getvalue()
