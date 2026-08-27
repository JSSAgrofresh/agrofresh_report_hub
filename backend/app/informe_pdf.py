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
GRIS_TEXTO = colors.HexColor('#374151')
GRIS_LINEA = colors.HexColor('#9CA3AF')
NEGRO_TEXTO = colors.HexColor('#111827')

_RUTA_LOGO = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'src', 'assets', 'agrofresh-logo.png')

DIRECCION_EMPRESA = "Manuel Montt, 4060 | Parque Industrial km 90 Rancagua | CHILE"

# Ancho de contenido: A4 menos los márgenes laterales del documento.
ANCHO_UTIL = 17.6 * cm

_PAT_CODIGO_COLUMNA = re.compile(r"\(([A-Za-z]+)\)\s*$")
_PREFIJO_RESULTADO = "Resultado:"

_ESTILO_TITULO = ParagraphStyle('titulo', fontName='Helvetica-Bold', fontSize=15.5, leading=17.5, textColor=NEGRO_TEXTO, alignment=2)
_ESTILO_SUBTITULO = ParagraphStyle('subtitulo', fontName='Helvetica', fontSize=9.3, textColor=GRIS_TEXTO, alignment=2)
_ESTILO_DIRECCION = ParagraphStyle('direccion', fontName='Helvetica', fontSize=8.6, textColor=GRIS_TEXTO, leading=11)
_ESTILO_FOLIO = ParagraphStyle('folio', fontName='Helvetica-Bold', fontSize=9.8, textColor=VERDE_OSCURO, alignment=2)
_ESTILO_SECCION = ParagraphStyle('seccion', fontName='Helvetica-Bold', fontSize=9.8, textColor=VERDE_OSCURO, spaceAfter=0)
_ESTILO_SUBSECCION = ParagraphStyle('subseccion', fontName='Helvetica-Bold', fontSize=8.8, textColor=VERDE_OSCURO, spaceAfter=0)
_ESTILO_LABEL = ParagraphStyle('label', fontName='Helvetica-Bold', fontSize=7.7, leading=8.8, textColor=GRIS_TEXTO)
_ESTILO_VALOR = ParagraphStyle('valor', fontName='Helvetica', fontSize=9.9, textColor=NEGRO_TEXTO, leading=11.8)
_ESTILO_METODO = ParagraphStyle('metodo', fontName='Helvetica-Oblique', fontSize=9.1, textColor=GRIS_TEXTO, leading=12.3)
_ESTILO_NOTA = ParagraphStyle('nota', fontName='Helvetica', fontSize=8.6, textColor=GRIS_TEXTO, leading=11.3)
_ESTILO_TABLA_HEAD = ParagraphStyle('tablahead', fontName='Helvetica-Bold', fontSize=9.1, textColor=VERDE_OSCURO)
_ESTILO_TABLA_CELDA = ParagraphStyle('tablacelda', fontName='Helvetica', fontSize=10.3, textColor=NEGRO_TEXTO)
_ESTILO_TABLA_CELDA_NEG = ParagraphStyle('tablaceldaneg', fontName='Helvetica-Oblique', fontSize=9.8, textColor=GRIS_TEXTO)
_ESTILO_FOOTER = ParagraphStyle('footer', fontName='Helvetica', fontSize=8.6, textColor=GRIS_TEXTO)
_ESTILO_FIRMA_NOMBRE = ParagraphStyle('firmanombre', fontName='Helvetica-Bold', fontSize=10.3, textColor=NEGRO_TEXTO)
_ESTILO_FIRMA_CARGO = ParagraphStyle('firmacargo', fontName='Helvetica', fontSize=9.1, textColor=GRIS_TEXTO)

METODOLOGIA_TEXTO = "CQ-CROM-023-T · Pesticidas GC-MS/ECD y LC-MS/MS · Laboratorio de Cromatografía AgroFresh Chile"

# Sin la leyenda de LD/LC: esa columna ya no existe en la tabla de resultados.
NOTAS_TEXTO = (
    "Los resultados de este informe corresponden exclusivamente a la(s) muestra(s) identificada(s) en este "
    "documento. \"No detectado\" indica un valor bajo el límite de detección del método. Este informe no debe "
    "reproducirse parcialmente sin autorización escrita del laboratorio."
)


def _nombre_ensayo(campos: dict[str, str], codigo: str) -> str:
    for columna in campos:
        if columna.startswith(_PREFIJO_RESULTADO):
            continue
        m = _PAT_CODIGO_COLUMNA.search(columna)
        if m and m.group(1).upper() == codigo:
            return columna
    return codigo


def _titulo_seccion(texto: str, ancho: float = 17.6 * cm) -> Table:
    """Título de sección sobrio: texto en verde con una línea fina debajo,
    sin relleno de color -reemplaza las barras sólidas de la versión anterior."""
    t = Table([[Paragraph(texto, _ESTILO_SECCION)]], colWidths=[ancho])
    t.setStyle(
        TableStyle(
            [
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LINEBELOW', (0, 0), (-1, -1), 1, VERDE_OSCURO),
            ]
        )
    )
    return t


def _fila_campo(etiqueta: str, valor) -> list:
    texto = str(valor) if valor not in (None, '') else '—'
    return [Paragraph(etiqueta, _ESTILO_LABEL), Paragraph(texto, _ESTILO_VALOR)]


def _lista_vertical(pares: list[tuple[str, str]]) -> Table:
    """Columna de campos etiqueta/valor, uno por fila (para ir dentro de un
    bloque de dos columnas lado a lado -ver `_dos_columnas`-)."""
    filas = [_fila_campo(et, val) for et, val in pares]
    t = Table(filas, colWidths=[3.1 * cm, 5.3 * cm])
    t.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 2.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
            ]
        )
    )
    return t


def _rejilla_campos(pares: list[tuple[str, str]], columnas: int = 2) -> Table:
    """Campos etiqueta/valor a lo ancho de la página, repartidos en varias
    columnas de pares. Reemplaza al bloque de dos secciones lado a lado: cada
    sección ocupa ahora todo el ancho y sus campos se acomodan en rejilla, que
    es más compacto que una única lista vertical y no obliga a partir el
    documento en dos temas paralelos."""
    filas: list[list] = []
    for i in range(0, len(pares), columnas):
        fila: list = []
        for j in range(columnas):
            if i + j < len(pares):
                etiqueta, valor = pares[i + j]
                fila.extend(_fila_campo(etiqueta, valor))
            else:
                # Relleno para que la última fila tenga el mismo número de
                # celdas: sin esto ReportLab rechaza la tabla.
                fila.extend(['', ''])
        filas.append(fila)

    # El ancho se reparte entre las columnas pedidas en vez de ser fijo: con
    # 3 columnas un par etiqueta/valor de tamaño fijo se saldría de la hoja.
    # Con más columnas la etiqueta se lleva una fracción mayor: los valores
    # que caben en 3 columnas son cortos (fechas, horas) y las etiquetas no,
    # y sin esto "FECHA SOLICITUD" se parte en dos líneas.
    ancho_par = ANCHO_UTIL / columnas
    proporcion_etiqueta = 0.37 if columnas < 3 else 0.5
    anchos: list[float] = []
    for _ in range(columnas):
        anchos.extend([ancho_par * proporcion_etiqueta, ancho_par * (1 - proporcion_etiqueta)])

    t = Table(filas, colWidths=anchos)
    t.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
            ]
        )
    )
    return t


def _fecha_iso_a_ddmmyyyy(valor: str | None) -> str:
    if not valor:
        return ''
    try:
        return datetime.strptime(valor, '%Y-%m-%d').strftime('%d-%m-%Y')
    except ValueError:
        return valor


def _fecha_inyeccion_a_ddmmyyyy(valor: str | None) -> str:
    """Formato de Agilent ChemStation: '7/25/2026 9:14:59 AM' -> '25-07-2026'."""
    if not valor:
        return ''
    try:
        return datetime.strptime(valor, '%m/%d/%Y %I:%M:%S %p').strftime('%d-%m-%Y')
    except ValueError:
        return valor


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
    fecha_recepcion: str | None = None,
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.1 * cm,
        bottomMargin=1.1 * cm,
        title=f"Informe de análisis {campos.get('N° Solicitud', '')}".strip(),
    )

    elementos = []

    # --- Encabezado: logo + dirección (izquierda) · identificador (derecha) ---
    logo_cel = [
        Image(_RUTA_LOGO, width=4.6 * cm, height=1.84 * cm) if os.path.isfile(_RUTA_LOGO) else Paragraph('', _ESTILO_VALOR),
        Spacer(1, 3),
        Paragraph(DIRECCION_EMPRESA, _ESTILO_DIRECCION),
    ]
    titulo_cel = [
        Paragraph('INFORME DE ANÁLISIS', _ESTILO_TITULO),
        Spacer(1, 3),
        Paragraph(f'N° Informe: {folio}', _ESTILO_FOLIO),
    ]
    encabezado = Table([[logo_cel, titulo_cel]], colWidths=[9.6 * cm, 8 * cm])
    encabezado.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
                ('LINEBELOW', (0, 0), (-1, -1), 0.75, GRIS_LINEA),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ]
        )
    )
    elementos.append(encabezado)
    elementos.append(Spacer(1, 7))

    # --- Solicitante (Sold To y Ship To siempre visibles, aunque Ship To
    # venga vacío -se muestra la etiqueta igual, con "—" en el valor-) ---
    elementos.append(_titulo_seccion('SOLICITANTE'))
    tabla_solicitante = Table(
        [
            [
                *_fila_campo('SOLICITANTE', campos.get('Solicitante', '')),
                *_fila_campo('GENERADO POR', campos.get('Generado Por', '')),
            ],
            [
                *_fila_campo('SOLD TO', campos.get('Sold To (Nombre)', '')),
                *_fila_campo('SHIP TO', campos.get('Ship To (Nombre)', '')),
            ],
            [*_fila_campo('N° SOLICITUD', campos.get('N° Solicitud', '')), '', ''],
        ],
        colWidths=[3.2 * cm, 5.6 * cm, 3.2 * cm, 5.6 * cm],
    )
    tabla_solicitante.setStyle(
        TableStyle(
            [
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
                ('SPAN', (1, 2), (3, 2)),
            ]
        )
    )
    elementos.append(tabla_solicitante)
    elementos.append(Spacer(1, 6))

    # --- Identificación de la muestra: una sola sección a lo ancho de la
    # página. Antes compartía la fila con un bloque de fechas a la derecha;
    # las fechas bajaron a su propia sección (después de Observaciones), así
    # que acá ya no hay dos columnas de secciones compitiendo.
    hoy = datetime.now().strftime('%d-%m-%Y')
    pares_muestra = [
        ('N° VIAL (NI)', codigo_vial or ''),
        ('TIPO MUESTRA', campos.get('Tipo Muestra', '')),
        ('ESPECIE', campos.get('Especie', '')),
        ('VARIEDAD', campos.get('Variedad', '')),
        ('LOTE', campos.get('Lote', '')),
        ('CSG', campos.get('CSG', '')),
        ('N° CÁMARA', campos.get('N° Cámara', '')),
        ('N° ORDEN', campos.get('N° Orden', '')),
        ('POSICIÓN', campos.get('Posición Muestreo', '')),
        ('PRODUCTO', campos.get('Producto Utilizado', '')),
        ('TIPO APLICACIÓN', campos.get('Tipo Aplicación', '')),
    ]
    if campos.get('Línea Proceso'):
        pares_muestra.append(('LÍNEA PROCESO', campos.get('Línea Proceso', '')))
    if campos.get('Aplicación'):
        pares_muestra.append(('APLICACIÓN', campos.get('Aplicación', '')))
    pares_muestra.append(('MUESTREADOR', campos.get('Nombre Muestreador', '')))
    elementos.append(_titulo_seccion('IDENTIFICACIÓN DE LA MUESTRA'))
    elementos.append(Spacer(1, 3))
    elementos.append(_rejilla_campos(pares_muestra))
    elementos.append(Spacer(1, 6))

    # --- Observaciones: campo independiente, no combinado con Tratamiento ---
    elementos.append(_titulo_seccion('OBSERVACIONES'))
    elementos.append(Spacer(1, 3))
    elementos.append(Paragraph(campos.get('Observación') or '—', _ESTILO_VALOR))
    elementos.append(Spacer(1, 6))

    # --- Fechas: entre Observaciones y Metodología, a lo ancho de la página ---
    elementos.append(_titulo_seccion('FECHAS'))
    elementos.append(Spacer(1, 3))
    elementos.append(
        _rejilla_campos(
            [
                ('FECHA SOLICITUD', campos.get('Fecha Solicitud', '')),
                ('FECHA MUESTREO', campos.get('Fecha Muestreo', '')),
                ('HORA MUESTREO', campos.get('Hora Muestreo', '')),
                ('FECHA RECEPCIÓN', _fecha_iso_a_ddmmyyyy(fecha_recepcion)),
                ('FECHA ANÁLISIS', _fecha_inyeccion_a_ddmmyyyy(fecha_inyeccion)),
                ('FECHA INFORME', hoy),
            ],
            columnas=3,
        )
    )
    elementos.append(Spacer(1, 6))

    # --- Metodología ---
    elementos.append(_titulo_seccion('METODOLOGÍA'))
    elementos.append(Spacer(1, 3))
    elementos.append(Paragraph(METODOLOGIA_TEXTO, _ESTILO_METODO))
    elementos.append(Spacer(1, 7))

    # --- Resultados: solo los analitos que esta solicitud pidió, nunca de más ---
    elementos.append(_titulo_seccion('DETERMINACIONES / RESULTADOS DE LOS ENSAYOS'))
    elementos.append(Spacer(1, 4))
    # Sin columna LD / LC: los límites de detección y cuantificación no se
    # informan por ensayo, así que la columna solo mostraba guiones.
    filas_resultado = [[
        Paragraph('ENSAYO', _ESTILO_TABLA_HEAD),
        Paragraph('UNIDAD', _ESTILO_TABLA_HEAD),
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
                resultado_cel,
            ]
        )
    tabla_resultados = Table(filas_resultado, colWidths=[10.6 * cm, 3.4 * cm, 3.6 * cm], repeatRows=1)
    tabla_resultados.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), VERDE_CLARO),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 3.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
                ('LINEBELOW', (0, 0), (-1, 0), 1, VERDE_OSCURO),
                ('LINEBELOW', (0, 1), (-1, -1), 0.5, GRIS_LINEA),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, GRIS_LABEL]),
            ]
        )
    )
    elementos.append(tabla_resultados)
    elementos.append(Spacer(1, 8))

    # --- Notas ---
    elementos.append(_titulo_seccion('NOTAS Y CONDICIONES DEL INFORME'))
    elementos.append(Spacer(1, 3))
    elementos.append(Paragraph(NOTAS_TEXTO, _ESTILO_NOTA))
    elementos.append(Spacer(1, 12))

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
    elementos.append(Spacer(1, 8))

    # --- Pie: solo el folio. La leyenda de "copia electrónica" que iba bajo
    # la firma se quitó a pedido; la fecha del informe ya está en FECHAS y no
    # se repite acá para no dispersar la misma fecha por el documento.
    pie = Table([[Paragraph(f'N° Informe: {folio}', _ESTILO_FOOTER)]], colWidths=[ANCHO_UTIL])
    pie.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, -1), 0.5, GRIS_LINEA), ('TOPPADDING', (0, 0), (-1, -1), 4)]))
    elementos.append(KeepTogether(pie))

    doc.build(elementos)
    return buffer.getvalue()
