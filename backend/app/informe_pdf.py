"""Genera el PDF del informe de análisis para una solicitud ya cruzada con su
resultado del GC. Diseño sobrio: títulos de sección tipográficos con una
línea fina (no bloques de color), y el color reservado para el encabezado de
la tabla de resultados. Incluye el folio interno del informe y un bloque de
firma con los responsables configurados en informe_config."""

import io
import os
import re
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

VERDE_OSCURO = colors.HexColor('#3D6B1F')
VERDE_CLARO = colors.HexColor('#EBF5E1')
GRIS_LABEL = colors.HexColor('#F7F8F7')
GRIS_TEXTO = colors.HexColor('#6B7280')
GRIS_LINEA = colors.HexColor('#D9DCE1')
NEGRO_TEXTO = colors.HexColor('#1F2937')

_RUTA_LOGO = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'src', 'assets', 'agrofresh-logo.png')

# TODO: reemplazar por la dirección real de AgroFresh Chile -no hay una
# fuente de verdad para esto en el sistema todavía, así que se deja un
# valor placeholder explícito en vez de inventar una dirección real.
DIRECCION_EMPRESA = "AgroFresh Chile S.A. — Dirección pendiente de configurar"

_PAT_CODIGO_COLUMNA = re.compile(r"\(([A-Za-z]+)\)\s*$")
_PREFIJO_RESULTADO = "Resultado:"

_ESTILO_TITULO = ParagraphStyle('titulo', fontName='Helvetica-Bold', fontSize=14, leading=16, textColor=NEGRO_TEXTO, alignment=2)
_ESTILO_SUBTITULO = ParagraphStyle('subtitulo', fontName='Helvetica', fontSize=8, textColor=GRIS_TEXTO, alignment=2)
_ESTILO_DIRECCION = ParagraphStyle('direccion', fontName='Helvetica', fontSize=7.3, textColor=GRIS_TEXTO, leading=9.5)
_ESTILO_FOLIO = ParagraphStyle('folio', fontName='Helvetica-Bold', fontSize=8.5, textColor=VERDE_OSCURO, alignment=2)
_ESTILO_SECCION = ParagraphStyle('seccion', fontName='Helvetica-Bold', fontSize=8.5, textColor=VERDE_OSCURO, spaceAfter=0)
_ESTILO_LABEL = ParagraphStyle('label', fontName='Helvetica-Bold', fontSize=6.8, textColor=GRIS_TEXTO)
_ESTILO_VALOR = ParagraphStyle('valor', fontName='Helvetica', fontSize=9, textColor=NEGRO_TEXTO, leading=12)
_ESTILO_METODO = ParagraphStyle('metodo', fontName='Helvetica-Oblique', fontSize=7.8, textColor=GRIS_TEXTO, leading=11)
_ESTILO_NOTA = ParagraphStyle('nota', fontName='Helvetica', fontSize=7.3, textColor=GRIS_TEXTO, leading=10)
_ESTILO_TABLA_HEAD = ParagraphStyle('tablahead', fontName='Helvetica-Bold', fontSize=7.8, textColor=VERDE_OSCURO)
_ESTILO_TABLA_CELDA = ParagraphStyle('tablacelda', fontName='Helvetica', fontSize=9, textColor=NEGRO_TEXTO)
_ESTILO_TABLA_CELDA_NEG = ParagraphStyle('tablaceldaneg', fontName='Helvetica-Oblique', fontSize=8.5, textColor=GRIS_TEXTO)
_ESTILO_FOOTER = ParagraphStyle('footer', fontName='Helvetica', fontSize=7.3, textColor=GRIS_TEXTO)
_ESTILO_FIRMA_NOMBRE = ParagraphStyle('firmanombre', fontName='Helvetica-Bold', fontSize=9, textColor=NEGRO_TEXTO)
_ESTILO_FIRMA_CARGO = ParagraphStyle('firmacargo', fontName='Helvetica', fontSize=7.8, textColor=GRIS_TEXTO)

METODOLOGIA_TEXTO = "CQ-CROM-023-T · Pesticidas GC-MS/ECD y LC-MS/MS · Laboratorio de Cromatografía AgroFresh Chile"

NOTAS_TEXTO = (
    "Los resultados de este informe corresponden exclusivamente a la(s) muestra(s) identificada(s) en este "
    "documento. LD: Límite de Detección. LC: Límite de Cuantificación. \"No detectado\" indica un valor bajo "
    "el límite de detección del método. Este informe no debe reproducirse parcialmente sin autorización "
    "escrita del laboratorio."
)


def _nombre_ensayo(campos: dict[str, str], codigo: str) -> str:
    for columna in campos:
        if columna.startswith(_PREFIJO_RESULTADO):
            continue
        m = _PAT_CODIGO_COLUMNA.search(columna)
        if m and m.group(1).upper() == codigo:
            return columna
    return codigo


def _titulo_seccion(texto: str) -> Table:
    """Título de sección sobrio: texto en verde con una línea fina debajo,
    sin relleno de color -reemplaza las barras sólidas de la versión anterior."""
    t = Table([[Paragraph(texto, _ESTILO_SECCION)]], colWidths=[17.6 * cm])
    t.setStyle(
        TableStyle(
            [
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LINEBELOW', (0, 0), (-1, -1), 1, VERDE_OSCURO),
            ]
        )
    )
    return t


def _fila_campo(etiqueta: str, valor: str) -> list:
    return [Paragraph(etiqueta, _ESTILO_LABEL), Paragraph(valor or '—', _ESTILO_VALOR)]


def generar_informe_pdf(
    campos: dict[str, str],
    analitos_solicitados: list[str],
    resultados_por_codigo: dict[str, float | None],
    codigo_vial: str | None,
    fecha_inyeccion: str | None,
    folio: str,
    analizado_por_nombre: str,
    analizado_por_cargo: str,
    aprobado_por_nombre: str,
    aprobado_por_cargo: str,
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.4 * cm,
        bottomMargin=1.5 * cm,
        title=f"Informe de análisis {campos.get('N° Solicitud', '')}".strip(),
    )

    elementos = []

    # --- Encabezado: logo + dirección (izquierda) · identificador (derecha) ---
    logo_cel = [
        Image(_RUTA_LOGO, width=4.2 * cm, height=1.68 * cm) if os.path.isfile(_RUTA_LOGO) else Paragraph('', _ESTILO_VALOR),
        Spacer(1, 4),
        Paragraph(DIRECCION_EMPRESA, _ESTILO_DIRECCION),
    ]
    titulo_cel = [
        Paragraph('INFORME DE ANÁLISIS', _ESTILO_TITULO),
        Spacer(1, 4),
        Paragraph(f'N° Informe: {folio}', _ESTILO_FOLIO),
    ]
    encabezado = Table([[logo_cel, titulo_cel]], colWidths=[9.6 * cm, 8 * cm])
    encabezado.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
                ('LINEBELOW', (0, 0), (-1, -1), 0.75, GRIS_LINEA),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]
        )
    )
    elementos.append(encabezado)
    elementos.append(Spacer(1, 12))

    # --- Solicitante ---
    elementos.append(_titulo_seccion('SOLICITANTE'))
    tabla_solicitante = Table(
        [
            [
                *_fila_campo('SOLICITANTE', campos.get('Solicitante', '')),
                *_fila_campo('GENERADO POR', campos.get('Generado Por', '')),
            ],
            [
                *_fila_campo('SOLD TO', campos.get('Sold To (Nombre)', '')),
                *_fila_campo('FECHA SOLICITUD', campos.get('Fecha Solicitud', '')),
            ],
        ],
        colWidths=[3.2 * cm, 5.6 * cm, 3.2 * cm, 5.6 * cm],
    )
    tabla_solicitante.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
            ]
        )
    )
    elementos.append(tabla_solicitante)
    elementos.append(Spacer(1, 10))

    # --- Identificación de la muestra ---
    elementos.append(_titulo_seccion('IDENTIFICACIÓN DE LA MUESTRA'))
    especie_variedad = ' / '.join(v for v in [campos.get('Especie', ''), campos.get('Variedad', '')] if v) or '—'
    fecha_entidad = ' · '.join(
        v for v in [campos.get('Fecha Muestreo', ''), campos.get('Hora Muestreo', ''), campos.get('Nombre Muestreador', '')] if v
    ) or '—'
    tratamiento = ' · '.join(v for v in [campos.get('Producto Utilizado', ''), campos.get('Tipo Aplicación', '')] if v) or '—'
    tabla_muestra = Table(
        [
            [
                *_fila_campo('SOLICITUD DE MUESTREO', campos.get('N° Solicitud', '')),
                *_fila_campo('IDENTIFICACIÓN MUESTRA (NI)', codigo_vial or '—'),
            ],
            [
                *_fila_campo('TIPO DE MUESTRA', campos.get('Tipo Muestra', '')),
                *_fila_campo('ESPECIE / VARIEDAD', especie_variedad),
            ],
            [
                *_fila_campo('LOTE', campos.get('Lote', '')),
                *_fila_campo('FECHA INYECCIÓN GC', fecha_inyeccion or '—'),
            ],
            [Paragraph('FECHA Y ENTIDAD DE MUESTREO', _ESTILO_LABEL), Paragraph(fecha_entidad, _ESTILO_VALOR), '', ''],
            [Paragraph('OBSERVACIONES / TRATAMIENTO', _ESTILO_LABEL), Paragraph(tratamiento, _ESTILO_VALOR), '', ''],
        ],
        colWidths=[3.2 * cm, 5.6 * cm, 3.2 * cm, 5.6 * cm],
    )
    tabla_muestra.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
                ('SPAN', (1, 3), (3, 3)),
                ('SPAN', (1, 4), (3, 4)),
            ]
        )
    )
    elementos.append(tabla_muestra)
    elementos.append(Spacer(1, 10))

    # --- Metodología ---
    elementos.append(_titulo_seccion('METODOLOGÍA'))
    elementos.append(Spacer(1, 5))
    elementos.append(Paragraph(METODOLOGIA_TEXTO, _ESTILO_METODO))
    elementos.append(Spacer(1, 12))

    # --- Resultados: solo los analitos que esta solicitud pidió, nunca de más ---
    elementos.append(_titulo_seccion('DETERMINACIONES / RESULTADOS DE LOS ENSAYOS'))
    elementos.append(Spacer(1, 6))
    filas_resultado = [[
        Paragraph('ENSAYO', _ESTILO_TABLA_HEAD),
        Paragraph('UNIDAD', _ESTILO_TABLA_HEAD),
        Paragraph('LD / LC', _ESTILO_TABLA_HEAD),
        Paragraph('RESULTADO', _ESTILO_TABLA_HEAD),
    ]]
    for codigo in analitos_solicitados:
        valor = resultados_por_codigo.get(codigo)
        if valor is None or valor <= 0:
            resultado_cel = Paragraph('No detectado', _ESTILO_TABLA_CELDA_NEG)
        else:
            resultado_cel = Paragraph(f'{valor:.4f}'.rstrip('0').rstrip('.'), _ESTILO_TABLA_CELDA)
        filas_resultado.append(
            [
                Paragraph(_nombre_ensayo(campos, codigo), _ESTILO_TABLA_CELDA),
                Paragraph('ppm', _ESTILO_TABLA_CELDA),
                Paragraph('—', _ESTILO_TABLA_CELDA_NEG),
                resultado_cel,
            ]
        )
    tabla_resultados = Table(filas_resultado, colWidths=[8.6 * cm, 3 * cm, 3 * cm, 2.6 * cm], repeatRows=1)
    tabla_resultados.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), VERDE_CLARO),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LINEBELOW', (0, 0), (-1, 0), 1, VERDE_OSCURO),
                ('LINEBELOW', (0, 1), (-1, -1), 0.5, GRIS_LINEA),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, GRIS_LABEL]),
            ]
        )
    )
    elementos.append(tabla_resultados)
    elementos.append(Spacer(1, 14))

    # --- Notas ---
    elementos.append(_titulo_seccion('NOTAS Y CONDICIONES DEL INFORME'))
    elementos.append(Spacer(1, 5))
    elementos.append(Paragraph(NOTAS_TEXTO, _ESTILO_NOTA))
    elementos.append(Spacer(1, 26))

    # --- Firmas ---
    def _bloque_firma(nombre: str, cargo: str) -> Table:
        t = Table(
            [[Paragraph(nombre or '—', _ESTILO_FIRMA_NOMBRE)], [Paragraph(cargo or '—', _ESTILO_FIRMA_CARGO)]],
            colWidths=[7.5 * cm],
        )
        t.setStyle(
            TableStyle(
                [
                    ('LINEABOVE', (0, 0), (-1, 0), 0.75, NEGRO_TEXTO),
                    ('TOPPADDING', (0, 0), (-1, 0), 5),
                    ('TOPPADDING', (0, 1), (-1, 1), 1),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ]
            )
        )
        return t

    firmas = Table(
        [[_bloque_firma(analizado_por_nombre, analizado_por_cargo), '', _bloque_firma(aprobado_por_nombre, aprobado_por_cargo)]],
        colWidths=[7.5 * cm, 2.6 * cm, 7.5 * cm],
    )
    firmas.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elementos.append(KeepTogether(firmas))
    elementos.append(Spacer(1, 20))

    # --- Pie ---
    hoy = datetime.now().strftime('%d-%m-%Y')
    pie = Table(
        [[Paragraph(f'Fecha del informe: {hoy}', _ESTILO_FOOTER), Paragraph('Este informe es una copia electrónica — no requiere firma física.', _ESTILO_FOOTER)]],
        colWidths=[8.8 * cm, 8.8 * cm],
    )
    pie.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, -1), 0.5, GRIS_LINEA), ('TOPPADDING', (0, 0), (-1, -1), 6), ('ALIGN', (1, 0), (1, 0), 'RIGHT')]))
    elementos.append(KeepTogether(pie))

    doc.build(elementos)
    return buffer.getvalue()
