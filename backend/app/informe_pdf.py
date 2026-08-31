"""Genera el PDF del informe de análisis para una solicitud ya cruzada con su
resultado del GC.

Diseño inspirado en informes de laboratorio profesionales (estilo Analab):
encabezado sobrio con logo lateral, secciones enmarcadas en cuadrantes con
borde, y la personalidad visual AgroFresh (paleta verde, tipografía limpia).
"""

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
VERDE_MEDIO = colors.HexColor('#4D8B2A')
VERDE_CLARO = colors.HexColor('#EBF5E1')
VERDE_BANNER = colors.HexColor('#24391A')
GRIS_FONDO = colors.HexColor('#F7F8F7')
GRIS_TEXTO = colors.HexColor('#374151')
GRIS_LINEA = colors.HexColor('#C5C9C5')
GRIS_LABEL = colors.HexColor('#6B7280')
NEGRO_TEXTO = colors.HexColor('#111827')
BLANCO = colors.white

_RUTA_LOGO = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'src', 'assets', 'agrofresh-logo.png')

DIRECCION_EMPRESA = "Manuel Montt, 4060 | Parque Industrial km 90 Rancagua | CHILE"

_MARGEN_H = 1.5 * cm
_MARGEN_V = 1.0 * cm
ANCHO_UTIL = A4[0] - 2 * _MARGEN_H

_PAT_CODIGO_COLUMNA = re.compile(r"\(([A-Za-z]+)\)\s*$")
_PREFIJO_RESULTADO = "Resultado:"

# ── Estilos tipográficos ───────────────────────────────────────────────

_S_TITULO = ParagraphStyle(
    'titulo', fontName='Helvetica-Bold', fontSize=15, leading=18,
    textColor=NEGRO_TEXTO, alignment=1,
)
_S_FOLIO = ParagraphStyle(
    'folio', fontName='Helvetica-Bold', fontSize=10, leading=12,
    textColor=VERDE_OSCURO, alignment=1,
)
_S_INFO_HEADER = ParagraphStyle(
    'infoHeader', fontName='Helvetica', fontSize=7.5, leading=9.5,
    textColor=GRIS_LABEL, alignment=1,
)
_S_PAGINA = ParagraphStyle(
    'pagina', fontName='Helvetica', fontSize=8, leading=10,
    textColor=GRIS_TEXTO, alignment=2,
)
_S_SECCION = ParagraphStyle(
    'seccion', fontName='Helvetica-Bold', fontSize=9, leading=11,
    textColor=VERDE_OSCURO,
)
_S_SUBSECCION = ParagraphStyle(
    'subseccion', fontName='Helvetica-Bold', fontSize=8, leading=10,
    textColor=VERDE_OSCURO,
)
_S_LABEL = ParagraphStyle(
    'label', fontName='Helvetica-Bold', fontSize=7, leading=8.5,
    textColor=GRIS_LABEL,
)
_S_VALOR = ParagraphStyle(
    'valor', fontName='Times-Roman', fontSize=9.5, leading=11,
    textColor=NEGRO_TEXTO,
)
_S_METODO = ParagraphStyle(
    'metodo', fontName='Times-Italic', fontSize=8, leading=10,
    textColor=GRIS_TEXTO,
)
_S_NOTA = ParagraphStyle(
    'nota', fontName='Times-Roman', fontSize=7.5, leading=9.5,
    textColor=GRIS_TEXTO,
)
_S_TABLA_HEAD = ParagraphStyle(
    'tablaHead', fontName='Helvetica-Bold', fontSize=8.5, leading=10,
    textColor=VERDE_OSCURO,
)
_S_TABLA_CELDA = ParagraphStyle(
    'tablaCelda', fontName='Times-Roman', fontSize=9.5, leading=11,
    textColor=NEGRO_TEXTO,
)
_S_TABLA_CELDA_NEG = ParagraphStyle(
    'tablaCeldaNeg', fontName='Times-Italic', fontSize=9, leading=10,
    textColor=GRIS_LABEL,
)
_S_FIRMA_NOMBRE = ParagraphStyle(
    'firmaNombre', fontName='Times-Bold', fontSize=9.5, leading=11,
    textColor=NEGRO_TEXTO,
)
_S_FIRMA_CARGO = ParagraphStyle(
    'firmaCargo', fontName='Times-Roman', fontSize=9, leading=10,
    textColor=GRIS_TEXTO,
)
_S_PIE = ParagraphStyle(
    'pie', fontName='Times-Roman', fontSize=8, textColor=GRIS_LABEL,
)

METODOLOGIA_TEXTO = (
    "CQ-CROM-023-T · Pesticidas GC-MS/ECD y LC-MS/MS · "
    "Laboratorio de Cromatografía AgroFresh Chile"
)

NOTAS_TEXTO = (
    "Los resultados de este informe corresponden exclusivamente a la(s) "
    "muestra(s) identificada(s) en este documento. \"No detectado\" indica "
    "un valor bajo el límite de detección del método. Este informe no debe "
    "reproducirse parcialmente sin autorización escrita del laboratorio."
)

_SP = 5


# ── Helpers ────────────────────────────────────────────────────────────

def _nombre_ensayo(campos: dict[str, str], codigo: str) -> str:
    for columna in campos:
        if columna.startswith(_PREFIJO_RESULTADO):
            continue
        m = _PAT_CODIGO_COLUMNA.search(columna)
        if m and m.group(1).upper() == codigo:
            return columna
    return codigo


def _fecha_iso_a_ddmmyyyy(valor: str | None) -> str:
    if not valor:
        return ''
    try:
        return datetime.strptime(valor, '%Y-%m-%d').strftime('%d-%m-%Y')
    except ValueError:
        return valor


def _fecha_inyeccion_a_ddmmyyyy(valor: str | None) -> str:
    if not valor:
        return ''
    try:
        return datetime.strptime(valor, '%m/%d/%Y %I:%M:%S %p').strftime('%d-%m-%Y')
    except ValueError:
        return valor


def _fila_campo(etiqueta: str, valor) -> list:
    texto = str(valor) if valor not in (None, '') else '—'
    return [Paragraph(etiqueta, _S_LABEL), Paragraph(texto, _S_VALOR)]


def _cuadrante(titulo: str, contenido_tabla: Table) -> Table:
    """Envuelve una sección en un cuadrante con borde fino y título en barra verde."""
    barra_titulo = Table(
        [[Paragraph(titulo, _S_SECCION)]],
        colWidths=[ANCHO_UTIL],
    )
    barra_titulo.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), VERDE_CLARO),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, -1), 0.75, VERDE_OSCURO),
    ]))
    cuadrante = Table(
        [[barra_titulo], [contenido_tabla]],
        colWidths=[ANCHO_UTIL],
    )
    cuadrante.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
        ('TOPPADDING', (0, 0), (0, 0), 0),
        ('BOTTOMPADDING', (0, 0), (0, 0), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 1), (0, 1), 0),
        ('BOTTOMPADDING', (0, 1), (0, 1), 0),
    ]))
    return cuadrante


def _rejilla_campos(pares: list[tuple[str, str]], columnas: int = 2) -> Table:
    filas: list[list] = []
    for i in range(0, len(pares), columnas):
        fila: list = []
        for j in range(columnas):
            if i + j < len(pares):
                etiqueta, valor = pares[i + j]
                fila.extend(_fila_campo(etiqueta, valor))
            else:
                fila.extend(['', ''])
        filas.append(fila)

    ancho_par = ANCHO_UTIL / columnas
    prop_et = 0.38 if columnas < 3 else 0.48
    anchos: list[float] = []
    for _ in range(columnas):
        anchos.extend([ancho_par * prop_et, ancho_par * (1 - prop_et)])

    t = Table(filas, colWidths=anchos)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 0), (-1, -1), 0.3, GRIS_LINEA),
    ]))
    return t


def _rejilla_campos_vertical(
    pares_izquierda: list[tuple[str, str]],
    pares_derecha: list[tuple[str, str]],
) -> Table:
    """Distribuye campos de arriba hacia abajo en dos columnas independientes."""
    filas: list[list] = []
    total_filas = max(len(pares_izquierda), len(pares_derecha))
    for i in range(total_filas):
        fila: list = []
        if i < len(pares_izquierda):
            fila.extend(_fila_campo(*pares_izquierda[i]))
        else:
            fila.extend(['', ''])
        if i < len(pares_derecha):
            fila.extend(_fila_campo(*pares_derecha[i]))
        else:
            fila.extend(['', ''])
        filas.append(fila)

    ancho_par = ANCHO_UTIL / 2
    t = Table(
        filas,
        colWidths=[ancho_par * 0.38, ancho_par * 0.62] * 2,
    )
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 0), (-1, -1), 0.3, GRIS_LINEA),
    ]))
    return t


def _contar_paginas(pdf_bytes: bytes) -> int:
    return len(re.findall(rb'/Type\s*/Page(?!s)', pdf_bytes))


# ── Construcción de elementos ──────────────────────────────────────────

def _construir_elementos(
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
    fecha_recepcion: str | None,
    espacio_extra: float,
) -> list:
    elementos = []
    hoy = datetime.now().strftime('%d-%m-%Y')

    # ── ENCABEZADO: logo lateral y datos centrados en la página ────────
    logo_img = (
        Image(_RUTA_LOGO, width=5.0 * cm, height=2.0 * cm)
        if os.path.isfile(_RUTA_LOGO)
        else Paragraph('', _S_VALOR)
    )

    pagina_p = Paragraph('Página 1 de 1', _S_PAGINA)

    bloque_titulo = Table([
        [Paragraph('INFORME DE ANÁLISIS', _S_TITULO)],
        [Paragraph(f'N° Informe: {folio}', _S_FOLIO)],
        [Paragraph(DIRECCION_EMPRESA, _S_INFO_HEADER)],
    ], colWidths=[ANCHO_UTIL - 9.6 * cm])
    bloque_titulo.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))

    header = Table(
        [[logo_img, bloque_titulo, '']],
        colWidths=[4.8 * cm, ANCHO_UTIL - 9.6 * cm, 4.8 * cm],
    )
    header.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LINEBELOW', (0, 0), (-1, -1), 0.75, VERDE_MEDIO),
    ]))
    elementos.append(header)
    elementos.append(Spacer(1, _SP))

    # ── IDENTIFICACIÓN DE LA SOLICITUD ─────────────────────────────────
    pares_sol_izquierda = [
        ('SOLICITANTE', campos.get('Solicitante', '')),
        ('SOLD TO', campos.get('Sold To (Nombre)', '')),
        ('SHIP TO', campos.get('Ship To (Nombre)', '')),
    ]
    pares_sol_derecha = [
        ('N° SOLICITUD', campos.get('N° Solicitud', '')),
        ('GENERADO POR', campos.get('Generado Por', '')),
        ('FECHA SOLICITUD', campos.get('Fecha Solicitud', '')),
    ]
    contenido_sol = _rejilla_campos_vertical(
        pares_sol_izquierda,
        pares_sol_derecha,
    )
    elementos.append(_cuadrante('Identificación de la Solicitud', contenido_sol))
    elementos.append(Spacer(1, _SP))

    # ── IDENTIFICACIÓN DE LA MUESTRA (dos columnas verticales) ─────────
    pares_muestra_izquierda = [
        ('TIPO MUESTRA', campos.get('Tipo Muestra', '')),
        ('TIPO APLICACIÓN', campos.get('Tipo Aplicación', '')),
        ('ESPECIE', campos.get('Especie', '')),
        ('VARIEDAD', campos.get('Variedad', '')),
        ('N° CÁMARA', campos.get('N° Cámara', '')),
        ('N° ORDEN', campos.get('N° Orden', '')),
        ('PRODUCTO', campos.get('Producto Utilizado', '')),
        ('LOTE', campos.get('Lote', '')),
        ('POSICIÓN', campos.get('Posición Muestreo', '')),
    ]
    pares_muestra_derecha = [
        ('CSG', campos.get('CSG', '')),
        ('MUESTREADOR', campos.get('Nombre Muestreador', '')),
        ('FECHA MUESTREO', campos.get('Fecha Muestreo', '')),
        ('HORA MUESTREO', campos.get('Hora Muestreo', '')),
    ]
    if campos.get('Línea Proceso'):
        pares_muestra_derecha.append(('LÍNEA PROCESO', campos['Línea Proceso']))

    rejilla_muestra = _rejilla_campos_vertical(
        pares_muestra_izquierda,
        pares_muestra_derecha,
    )

    # Observaciones dentro del cuadrante
    obs_text = campos.get('Observación') or '—'
    obs_label = Table(
        [[Paragraph('OBSERVACIONES', _S_SUBSECCION)]],
        colWidths=[ANCHO_UTIL],
    )
    obs_label.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('LINEABOVE', (0, 0), (-1, -1), 0.3, GRIS_LINEA),
    ]))
    obs_valor = Table(
        [[Paragraph(obs_text, _S_VALOR)]],
        colWidths=[ANCHO_UTIL],
    )
    obs_valor.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))

    contenido_muestra = Table(
        [[rejilla_muestra], [obs_label], [obs_valor]],
        colWidths=[ANCHO_UTIL],
    )
    contenido_muestra.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elementos.append(_cuadrante('Identificación de la Muestra', contenido_muestra))
    elementos.append(Spacer(1, _SP))

    # ── IDENTIFICACIÓN DEL ANÁLISIS ────────────────────────────────────
    pares_analisis = [
        ('ID INFORME', codigo_vial or ''),
        ('FECHA RECEPCIÓN', _fecha_iso_a_ddmmyyyy(fecha_recepcion)),
        ('FECHA ANÁLISIS', _fecha_inyeccion_a_ddmmyyyy(fecha_inyeccion)),
    ]
    contenido_analisis = _rejilla_campos(pares_analisis, columnas=3)
    elementos.append(_cuadrante('Identificación del Análisis', contenido_analisis))
    elementos.append(Spacer(1, _SP))

    # ── DETERMINACIONES / RESULTADOS (cuadrante) ──────────────────────
    filas_resultado = [[
        Paragraph('ENSAYO', _S_TABLA_HEAD),
        Paragraph('UNIDAD', _S_TABLA_HEAD),
        Paragraph('RESULTADO', _S_TABLA_HEAD),
    ]]
    for codigo in analitos_solicitados:
        valor = resultados_por_codigo.get(codigo)
        if valor is None or valor <= 0:
            resultado_cel = Paragraph('No detectado', _S_TABLA_CELDA_NEG)
        else:
            resultado_cel = Paragraph(f'{valor:.4f}'.rstrip('0').rstrip('.'), _S_TABLA_CELDA)
        filas_resultado.append([
            Paragraph(_nombre_ensayo(campos, codigo), _S_TABLA_CELDA),
            Paragraph('ppm', _S_TABLA_CELDA),
            resultado_cel,
        ])

    cantidad_filas_resultado = max(7, len(analitos_solicitados))
    for _ in range(cantidad_filas_resultado - len(analitos_solicitados)):
        filas_resultado.append(['', '', ''])

    tabla_resultados = Table(
        filas_resultado,
        colWidths=[10.2 * cm, 3.2 * cm, ANCHO_UTIL - 13.4 * cm],
        rowHeights=[None] + [17] * cantidad_filas_resultado,
        repeatRows=1,
    )
    tabla_resultados.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), VERDE_CLARO),
        ('TEXTCOLOR', (0, 0), (-1, 0), VERDE_OSCURO),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 1, VERDE_MEDIO),
        ('LINEBELOW', (0, 1), (-1, -1), 0.3, GRIS_LINEA),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [BLANCO, GRIS_FONDO]),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_LINEA),
    ]))

    # Metodología debajo de resultados, dentro del mismo cuadrante
    metodo_block = Table(
        [[Paragraph(f'<b>Metodología:</b> {METODOLOGIA_TEXTO}', _S_METODO)]],
        colWidths=[ANCHO_UTIL],
    )
    metodo_block.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_FONDO),
    ]))

    contenido_resultados = Table(
        [[tabla_resultados], [metodo_block]],
        colWidths=[ANCHO_UTIL],
    )
    contenido_resultados.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elementos.append(_cuadrante('Determinaciones / Resultados de los Ensayos', contenido_resultados))
    elementos.append(Spacer(1, _SP))

    # ── NOTAS Y CONDICIONES (letra pequeña, sin cuadrante) ────────────
    notas_titulo = Table(
        [[Paragraph('Notas y Condiciones del Informe', ParagraphStyle(
            'notasTit', fontName='Helvetica-Bold', fontSize=7.5, leading=9,
            textColor=GRIS_LABEL,
        ))]],
        colWidths=[ANCHO_UTIL],
    )
    notas_titulo.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
    ]))
    elementos.append(notas_titulo)
    elementos.append(Paragraph(NOTAS_TEXTO, _S_NOTA))

    # Spacer expandible para llenar la página
    if espacio_extra > 0:
        elementos.append(Spacer(1, espacio_extra))

    elementos.append(Spacer(1, 6))

    # ── FIRMAS ─────────────────────────────────────────────────────────
    def _bloque_firma(nombre: str, cargo: str) -> Table:
        t = Table(
            [
                [Paragraph(nombre or '—', _S_FIRMA_NOMBRE)],
                [Paragraph(cargo or '—', _S_FIRMA_CARGO)],
            ],
            colWidths=[7 * cm],
        )
        t.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, 0), 0.75, NEGRO_TEXTO),
            ('TOPPADDING', (0, 0), (-1, 0), 5),
            ('TOPPADDING', (0, 1), (-1, 1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return t

    firmas = Table(
        [[
            _bloque_firma(analizado_por_nombre, analizado_por_cargo),
            '',
            _bloque_firma(aprobado_por_nombre, aprobado_por_cargo),
        ]],
        colWidths=[7 * cm, ANCHO_UTIL - 14 * cm, 7 * cm],
    )
    firmas.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elementos.append(KeepTogether(firmas))
    elementos.append(Spacer(1, 6))

    # ── PIE ────────────────────────────────────────────────────────────
    pie = Table(
        [[
            Paragraph(f'Fecha del informe: {hoy}', _S_PIE),
            Paragraph('Documento generado por AgroFresh Report Hub', _S_PIE),
        ]],
        colWidths=[9 * cm, ANCHO_UTIL - 9 * cm],
    )
    pie.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 0.5, VERDE_MEDIO),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    elementos.append(KeepTogether(pie))

    return elementos


def _construir_pdf(elementos: list, titulo: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=_MARGEN_H, rightMargin=_MARGEN_H,
        topMargin=_MARGEN_V, bottomMargin=_MARGEN_V,
        title=titulo,
    )
    doc.build(elementos)
    return buf.getvalue()


# ── Función pública ────────────────────────────────────────────────────

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
    titulo = f"Informe de análisis {campos.get('N° Solicitud', '')}".strip()
    args = dict(
        campos=campos,
        analitos_solicitados=analitos_solicitados,
        resultados_por_codigo=resultados_por_codigo,
        codigo_vial=codigo_vial,
        fecha_inyeccion=fecha_inyeccion,
        folio=folio,
        analizado_por_nombre=analizado_por_nombre,
        analizado_por_cargo=analizado_por_cargo,
        aprobado_por_nombre=aprobado_por_nombre,
        aprobado_por_cargo=aprobado_por_cargo,
        fecha_recepcion=fecha_recepcion,
    )

    elems_min = _construir_elementos(**args, espacio_extra=0)
    pdf_min = _construir_pdf(elems_min, titulo)
    n_paginas = _contar_paginas(pdf_min)

    if n_paginas <= 1:
        for intento in [200, 150, 100, 75, 50, 25]:
            elems = _construir_elementos(**args, espacio_extra=intento)
            pdf = _construir_pdf(elems, titulo)
            if _contar_paginas(pdf) <= 1:
                return pdf
        return pdf_min

    return pdf_min
