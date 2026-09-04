"""PDF operativo de solicitud de muestreo, visualmente distinto del informe final."""

import io
import os
import re as _re
from datetime import datetime

from reportlab.graphics.barcode import code128
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .informe_pdf import _RUTA_LOGO, DIRECCION_EMPRESA
from .solicitud_excel import CAMPOS_GENERALES_ETIQUETAS


VERDE = colors.HexColor('#315C21')
VERDE_2 = colors.HexColor('#4D8B2A')
GRIS_1 = colors.HexColor('#F3F4F2')
GRIS_2 = colors.HexColor('#D5D9D2')
GRIS_3 = colors.HexColor('#687066')
NEGRO = colors.HexColor('#172016')
BLANCO = colors.white

_MARGEN_H = 1.25 * cm
_MARGEN_V = 0.8 * cm
ANCHO_UTIL = A4[0] - 2 * _MARGEN_H

_S_TITULO = ParagraphStyle('tituloOrden', fontName='Helvetica-Bold', fontSize=17, leading=19, textColor=VERDE, alignment=1)
_S_FOLIO = ParagraphStyle('folioOrden', fontName='Helvetica-Bold', fontSize=11, leading=13, textColor=VERDE_2, alignment=1)
# Centrada y al pie de la hoja, igual que en el informe de resultados.
_S_DIRECCION_PIE = ParagraphStyle('direccionOrdenPie', fontName='Helvetica', fontSize=7.2, leading=8.5, textColor=GRIS_3, alignment=1)
_S_NUM = ParagraphStyle('numeroPaso', fontName='Helvetica-Bold', fontSize=12, leading=13, textColor=VERDE, alignment=1)
_S_SECCION = ParagraphStyle('seccionOrden', fontName='Helvetica-Bold', fontSize=9, leading=10, textColor=VERDE)
_S_SUB = ParagraphStyle('subOrden', fontName='Helvetica', fontSize=6.8, leading=8, textColor=GRIS_3)
_S_LABEL = ParagraphStyle('labelOrden', fontName='Helvetica-Bold', fontSize=6.6, leading=7.5, textColor=GRIS_3)
_S_VALOR = ParagraphStyle('valorOrden', fontName='Helvetica', fontSize=8.6, leading=10, textColor=NEGRO)
_S_LABEL_INV = ParagraphStyle('labelInv', fontName='Helvetica-Bold', fontSize=6.5, leading=7.5, textColor=GRIS_3)
_S_VALOR_INV = ParagraphStyle('valorInv', fontName='Helvetica', fontSize=8.5, leading=10, textColor=NEGRO)
_S_TABLA_HEAD = ParagraphStyle('tablaHeadOrden', fontName='Helvetica-Bold', fontSize=7.5, leading=8.5, textColor=VERDE)
_S_TABLA = ParagraphStyle('tablaOrden', fontName='Helvetica', fontSize=8, leading=9.5, textColor=NEGRO)
_S_PEQUENO = ParagraphStyle('pequenoOrden', fontName='Helvetica', fontSize=7, leading=8.5, textColor=GRIS_3)
_S_OBS = ParagraphStyle('obsOrden', fontName='Helvetica', fontSize=8.2, leading=10, textColor=NEGRO)

_ETIQUETA_DE_CLAVE = dict(CAMPOS_GENERALES_ETIQUETAS)
_CLAVES_FECHA_ISO = {'fecha_solicitud', 'fecha_muestreo'}


def _fmt_fecha(valor: str | None) -> str:
    if not valor:
        return ''
    try:
        return datetime.strptime(valor, '%Y-%m-%d').strftime('%d-%m-%Y')
    except ValueError:
        return valor


def _codigo_barras(folio: str):
    if not folio.strip():
        return None
    try:
        codigo = code128.Code128(folio.strip(), barHeight=9 * mm, barWidth=0.38 * mm, humanReadable=False, quiet=False)
    except Exception:
        return None
    codigo.hAlign = 'CENTER'
    return codigo


def _etiqueta_analito(analito: dict) -> str:
    return f"{analito['nombre']} ({analito['unidad']})" if analito.get('unidad') else analito['nombre']


def _clave_guardada(campos_lab: dict, analito: dict) -> str | None:
    for candidata in (_etiqueta_analito(analito), analito['nombre']):
        if candidata in campos_lab:
            return candidata
    nombre = analito['nombre'].strip()
    for clave in campos_lab:
        if clave.rsplit(' (', 1)[0].strip() == nombre:
            return clave
    return None


def _seccion(numero: str, titulo: str, subtitulo: str = '', ancho: float = ANCHO_UTIL) -> Table:
    """La cabecera numerada de cada sección. Sin relleno de color -solo el
    número en un recuadro con borde, el título en verde y una línea verde
    abajo-: el color queda para acentuar, no para llenar la hoja."""
    numero_box = Table([[Paragraph(numero, _S_NUM)]], colWidths=[0.8 * cm], rowHeights=[0.72 * cm])
    numero_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('BOX', (0, 0), (-1, -1), 0.9, VERDE_2),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    textos = [Paragraph(titulo, _S_SECCION)]
    if subtitulo:
        textos.append(Paragraph(subtitulo, _S_SUB))
    barra = Table([[numero_box, textos]], colWidths=[0.95 * cm, ancho - 0.95 * cm])
    barra.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LINEBELOW', (0, 0), (-1, -1), 0.9, VERDE_2),
    ]))
    return barra


def _campo(etiqueta: str, valor, invertido: bool = False) -> Table:
    texto = str(valor) if valor not in (None, '') else '—'
    t = Table([[Paragraph(etiqueta.upper(), _S_LABEL_INV if invertido else _S_LABEL)],
               [Paragraph(texto, _S_VALOR_INV if invertido else _S_VALOR)]], colWidths=[None])
    t.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, 0), 1), ('BOTTOMPADDING', (0, 0), (-1, 0), 0),
        ('TOPPADDING', (0, 1), (-1, 1), 1), ('BOTTOMPADDING', (0, 1), (-1, 1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        # 0.25pt es una línea que algunos visores/impresoras directamente no
        # dibujan -por eso los bordes "se escondían"-. 0.4pt es el mínimo que
        # se ve siempre.
        ('LINEBELOW', (0, 1), (-1, 1), 0.4, VERDE_2 if invertido else GRIS_2),
    ]))
    return t


def _rejilla(pares: list[tuple[str, object]], columnas: int = 3, ancho: float = ANCHO_UTIL) -> Table:
    filas = []
    for i in range(0, len(pares), columnas):
        fila = []
        for j in range(columnas):
            fila.append(_campo(*pares[i + j]) if i + j < len(pares) else '')
        filas.append(fila)
    t = Table(filas, colWidths=[ancho / columnas] * columnas)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
    ]))
    return t


def _panel_origen(datos: dict, laboratorio: str, ancho: float) -> Table:
    """El primer panel de la hoja -"1. ORIGEN DE LA SOLICITUD"-. Antes no
    llevaba número (usaba un título suelto en vez de `_seccion`), así que la
    numeración de la hoja saltaba directo al "2": esto lo pone en línea con
    el resto de las secciones."""
    pares = [
        ('N° Solicitud', datos.get('numero_solicitud')),
        ('Laboratorio', laboratorio),
        ('Solicitante', datos.get('solicitante')),
        ('Email', datos.get('email_solicitante')),
        ('Sold To', datos.get('sold_to')),
        ('Ship To', datos.get('ship_to')),
        ('Generado por', datos.get('generado_por')),
    ]
    contenido = [[_seccion('1', 'ORIGEN DE LA SOLICITUD', ancho=ancho)]] + [[_campo(et, val, True)] for et, val in pares]
    t = Table(contenido, colWidths=[ancho])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('LEFTPADDING', (0, 0), (-1, 0), 0), ('RIGHTPADDING', (0, 0), (-1, 0), 0),
        ('TOPPADDING', (0, 0), (-1, 0), 0), ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ('LEFTPADDING', (0, 1), (-1, -1), 8), ('RIGHTPADDING', (0, 1), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 1), ('BOTTOMPADDING', (0, 1), (-1, -1), 1),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 6),
    ]))
    return t


def _construir_elementos(datos: dict, analitos_config: list[dict] | None, espacio_extra: float = 0) -> list:
    laboratorio = datos.get('laboratorio', '')
    campos_lab: dict = datos.get('campos_laboratorio') or {}
    analitos_lab = sorted(
        (a for a in (analitos_config or []) if a.get('laboratorio') == laboratorio),
        key=lambda a: (a.get('categoria') or '', a.get('orden', 0)),
    )
    etiquetas_analitos = {}
    for analito in analitos_lab:
        clave = _clave_guardada(campos_lab, analito)
        if clave is not None:
            etiquetas_analitos[clave] = analito
    filas_analitos = []
    for etiqueta, analito in etiquetas_analitos.items():
        unidad = etiqueta.rsplit(' (', 1)[1][:-1] if etiqueta.endswith(')') and ' (' in etiqueta else '—'
        nombre = etiqueta.rsplit(' (', 1)[0] if unidad != '—' else etiqueta
        filas_analitos.append((analito.get('codigo', ''), nombre, str(campos_lab[etiqueta])))
    campos_aplicacion = {
        k: v for k, v in campos_lab.items()
        if k not in etiquetas_analitos and k != 'Tipo Aplicación'
        and k.strip().casefold() not in {
            'velocidad de línea (m/min)'.casefold(), 'velocidad de linea (m/min)'.casefold(),
            'aplicación en'.casefold(), 'aplicacion en'.casefold(),
        }
    }

    elementos = []
    folio = str(datos.get('numero_solicitud') or '')
    logo = Image(_RUTA_LOGO, width=5.6 * cm, height=2.24 * cm) if os.path.isfile(_RUTA_LOGO) else Paragraph('', _S_VALOR)
    codigo = _codigo_barras(folio)
    # "Solicitud de análisis": es lo que este documento es y lo que dice el
    # resto del sistema (Toma de muestras → Nueva solicitud). "Orden de
    # muestreo" era un nombre que solo vivía acá, en el PDF, y no en ninguna
    # otra parte -de ahí la confusión de quien lo recibe-.
    identidad = [Spacer(1, 12), Paragraph('SOLICITUD DE ANÁLISIS', _S_TITULO), Paragraph(f'N° {folio}', _S_FOLIO)]
    if codigo is not None:
        identidad.extend([Spacer(1, 2), codigo])
    header = Table([[logo, identidad]], colWidths=[6.4 * cm, ANCHO_UTIL - 6.4 * cm])
    header.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('VALIGN', (0, 0), (0, 0), 'MIDDLE'), ('VALIGN', (1, 0), (1, 0), 'BOTTOM'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('LEFTPADDING', (0, 0), (0, 0), 0), ('RIGHTPADDING', (0, 0), (0, 0), 8),
        ('LEFTPADDING', (1, 0), (1, 0), 14), ('RIGHTPADDING', (1, 0), (1, 0), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 0), (-1, -1), 0.9, VERDE_2),
    ]))
    # La dirección va al pie de la hoja, centrada -no acá arriba-.
    elementos.extend([header, Spacer(1, 8)])

    muestra = [
        ('Tipo muestra', datos.get('tipo_muestra')), ('Tipo aplicación', campos_lab.get('Tipo Aplicación')),
        ('Especie', datos.get('especie')), ('Variedad', datos.get('variedad')),
        ('Lote', datos.get('lote')), ('CSG', datos.get('csg')),
        ('N° cámara', datos.get('numero_camara')), ('N° orden', datos.get('numero_orden')),
        ('Posición', datos.get('posicion_muestreo')), ('Producto', datos.get('producto_utilizado')),
        ('Línea proceso', datos.get('linea_proceso')), ('Muestreador', datos.get('nombre_muestreador')),
        ('Kilos procesados', datos.get('kilos_procesados')),
    ]
    muestra.extend(campos_aplicacion.items())
    ancho_muestra = ANCHO_UTIL - 5.15 * cm
    panel_muestra = Table([
        [_seccion('2', 'DATOS DE LA MUESTRA', 'Información para recepción y trazabilidad', ancho_muestra)],
        [_rejilla(muestra, 3, ancho_muestra)],
    ], colWidths=[ancho_muestra])
    panel_muestra.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    # El borde de cada panel se dibuja acá, sobre la fila completa de
    # `cuerpo_superior`, y no dentro de cada tabla por separado: así ambos
    # bordes miden lo mismo de alto -el de la fila más alta-, en vez de que
    # el panel más corto (punto 1) quede con un borde más bajo que el punto 2.
    cuerpo_superior = Table(
        [[_panel_origen(datos, laboratorio, 5.15 * cm), panel_muestra]],
        colWidths=[5.15 * cm, ANCHO_UTIL - 5.15 * cm],
    )
    cuerpo_superior.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('BOX', (0, 0), (0, 0), 0.6, GRIS_2),
        ('BOX', (1, 0), (1, 0), 0.6, GRIS_2),
    ]))
    elementos.extend([cuerpo_superior, Spacer(1, 6)])

    elementos.append(_seccion('3', 'ANÁLISIS REQUERIDOS', 'Checklist técnico para el laboratorio'))
    filas = [[Paragraph('ANALITO SOLICITADO', _S_TABLA_HEAD), Paragraph('DOSIS', _S_TABLA_HEAD)]]
    for _codigo_analito, nombre, valor in filas_analitos:
        filas.append([Paragraph(nombre, _S_TABLA), Paragraph(valor, _S_TABLA)])
    if len(filas) == 1:
        filas.append([Paragraph('Sin análisis configurados', _S_TABLA), Paragraph('—', _S_TABLA)])
    tabla_analisis = Table(filas, colWidths=[10.7 * cm, ANCHO_UTIL - 10.7 * cm], repeatRows=1)
    tabla_analisis.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GRIS_1), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2.8), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.8),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, 0), 0.6, VERDE_2),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, GRIS_2),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [BLANCO, GRIS_1]),
        ('BOX', (0, 0), (-1, -1), 0.6, GRIS_2),
    ]))
    elementos.extend([tabla_analisis, Spacer(1, 6)])

    fechas = [
        ('Solicitud', _fmt_fecha(datos.get('fecha_solicitud'))),
        ('Muestreo', _fmt_fecha(datos.get('fecha_muestreo'))),
        ('Hora', datos.get('hora_muestreo')),
    ]
    fechas_barra = Table([[_campo(et, val) for et, val in fechas]], colWidths=[ANCHO_UTIL / 3] * 3)
    fechas_barra.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('BOX', (0, 0), (-1, -1), 0.6, GRIS_2),
        ('LINEAFTER', (0, 0), (-2, -1), 0.4, GRIS_2),
    ]))
    elementos.extend([_seccion('4', 'PROGRAMACIÓN Y DISTRIBUCIÓN', 'Fechas, observaciones y destinatarios'), fechas_barra, Spacer(1, 4)])

    correos = ' · '.join(datos.get('destinatarios_resultados') or []) or '—'
    obs = datos.get('observacion') or '—'
    cierre = Table([
        [Paragraph('<b>OBSERVACIONES</b>', _S_PEQUENO), Paragraph('<b>DESTINATARIOS DE RESULTADOS</b>', _S_PEQUENO)],
        [Paragraph(obs, _S_OBS), Paragraph(correos, _S_OBS)],
    ], colWidths=[ANCHO_UTIL * 0.5, ANCHO_UTIL * 0.5], rowHeights=[None, 42 + espacio_extra])
    cierre.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('TOPPADDING', (0, 0), (-1, 0), 4), ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
        ('TOPPADDING', (0, 1), (-1, 1), 2), ('BOTTOMPADDING', (0, 1), (-1, 1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('BOX', (0, 0), (-1, -1), 0.6, GRIS_2), ('LINEAFTER', (0, 0), (0, -1), 0.6, GRIS_2),
    ]))
    elementos.extend([cierre, Spacer(1, 6)])

    # Pie de página: fecha y procedencia del documento, y la dirección de la
    # empresa al final de la hoja, centrada -no arriba, junto al logo-.
    hoy = datetime.now().strftime('%d-%m-%Y')
    pie_datos = Table(
        [[Paragraph(f'Fecha del documento: {hoy}', _S_PEQUENO), Paragraph('Documento generado por AgroFresh Report Hub', _S_PEQUENO)]],
        colWidths=[7 * cm, ANCHO_UTIL - 7 * cm],
    )
    pie_datos.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    direccion_pie = Table([[Paragraph(DIRECCION_EMPRESA, _S_DIRECCION_PIE)]], colWidths=[ANCHO_UTIL])
    direccion_pie.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    pie = Table([[pie_datos], [direccion_pie]], colWidths=[ANCHO_UTIL])
    pie.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 0.8, VERDE),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elementos.append(KeepTogether(pie))
    return elementos


def _contar_paginas(pdf_bytes: bytes) -> int:
    return len(_re.findall(rb'/Type\s*/Page(?!s)', pdf_bytes))


def _construir_pdf(elementos: list, titulo: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=_MARGEN_H, rightMargin=_MARGEN_H,
        topMargin=_MARGEN_V, bottomMargin=_MARGEN_V, title=titulo,
    )
    doc.build(elementos)
    return buf.getvalue()


def generar_pdf_solicitud(datos: dict, analitos_config: list[dict] | None = None) -> bytes:
    titulo = f"Solicitud de análisis {datos.get('numero_solicitud', '')}".strip()
    pdf_min = _construir_pdf(_construir_elementos(datos, analitos_config), titulo)
    if _contar_paginas(pdf_min) > 1:
        return pdf_min
    for espacio in [180, 150, 120, 90, 60, 30]:
        pdf = _construir_pdf(_construir_elementos(datos, analitos_config, espacio), titulo)
        if _contar_paginas(pdf) == 1:
            return pdf
    return pdf_min
