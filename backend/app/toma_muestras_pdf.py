"""
PDF de una solicitud de análisis — ocupa toda la hoja A4.

Diseño propio, distinto del informe de análisis: paleta verde AgroFresh pero
con encabezado tipo banner, secciones con acento lateral grueso, y campos con
aspecto de formulario sobre fondo gris claro. El informe usa líneas finas y
rejilla plana —ambos documentos son profesionales pero se distinguen al
instante.

La sección CORREOS se estira para llenar el espacio restante de la página:
se construye el PDF dos veces —la primera con una caja mínima para medir
cuánto espacio sobra, y la segunda con la caja expandida.
"""
import io
import os
import re as _re
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

from .informe_pdf import _RUTA_LOGO, DIRECCION_EMPRESA
from .solicitud_excel import CAMPOS_GENERALES_ETIQUETAS

# ── Paleta verde AgroFresh ──────────────────────────────────────────────
VERDE_BANNER = colors.HexColor('#24391A')
VERDE_OSCURO = colors.HexColor('#3D6B1F')
VERDE_MEDIO = colors.HexColor('#4D8B2A')
VERDE_CLARO = colors.HexColor('#EBF5E1')
VERDE_FOLIO = colors.HexColor('#A3D977')
GRIS_CAMPO = colors.HexColor('#F3F4F6')
GRIS_BORDE = colors.HexColor('#D1D5DB')
GRIS_TEXTO = colors.HexColor('#374151')
GRIS_LABEL = colors.HexColor('#6B7280')
NEGRO = colors.HexColor('#111827')
BLANCO = colors.white

_MARGEN_H = 1.5 * cm
_MARGEN_V = 1.0 * cm
ANCHO_UTIL = A4[0] - 2 * _MARGEN_H

# ── Estilos tipográficos ────────────────────────────────────────────────
_S_BANNER_TITULO = ParagraphStyle(
    'bannerTitulo', fontName='Helvetica-Bold', fontSize=15, leading=18,
    textColor=VERDE_OSCURO, alignment=0,
)
_S_BANNER_FOLIO = ParagraphStyle(
    'bannerFolio', fontName='Helvetica-Bold', fontSize=10, leading=12,
    textColor=VERDE_MEDIO, alignment=2,
)
_S_DIRECCION = ParagraphStyle(
    'direccion', fontName='Helvetica', fontSize=7.5, leading=9.5,
    textColor=GRIS_LABEL,
)
_S_SECCION = ParagraphStyle(
    'seccion', fontName='Helvetica-Bold', fontSize=9, leading=11,
    textColor=VERDE_OSCURO,
)
_S_LABEL = ParagraphStyle(
    'label', fontName='Helvetica-Bold', fontSize=7, leading=8,
    textColor=GRIS_LABEL, spaceBefore=0, spaceAfter=0,
)
_S_VALOR = ParagraphStyle(
    'valor', fontName='Helvetica', fontSize=9, leading=11,
    textColor=NEGRO, spaceBefore=0, spaceAfter=0,
)
_S_TABLA_HEAD = ParagraphStyle(
    'tHead', fontName='Helvetica-Bold', fontSize=8.5, leading=10,
    textColor=VERDE_OSCURO,
)
_S_TABLA_CELDA = ParagraphStyle(
    'tCelda', fontName='Helvetica', fontSize=9, leading=11,
    textColor=NEGRO,
)
_S_OBS = ParagraphStyle(
    'obs', fontName='Helvetica', fontSize=9, leading=11.5,
    textColor=NEGRO,
)
_S_CORREO = ParagraphStyle(
    'correo', fontName='Helvetica', fontSize=9, leading=13,
    textColor=NEGRO,
)
_S_CORREO_HINT = ParagraphStyle(
    'correoHint', fontName='Helvetica-Oblique', fontSize=7.5, leading=9,
    textColor=GRIS_LABEL,
)
_S_PIE = ParagraphStyle(
    'pie', fontName='Helvetica', fontSize=7.5, textColor=GRIS_LABEL,
)

_ETIQUETA_DE_CLAVE = dict(CAMPOS_GENERALES_ETIQUETAS)

_CLAVES_MUESTRA = [
    "tipo_muestra", "especie", "variedad", "csg", "lote",
    "numero_camara", "numero_orden", "posicion_muestreo",
    "kilos_procesados", "producto_utilizado", "aplicacion",
    "linea_proceso", "nombre_muestreador",
]
_CLAVES_FECHAS = ["fecha_solicitud", "fecha_muestreo", "hora_muestreo"]
_CLAVES_FECHA_ISO = {"fecha_solicitud", "fecha_muestreo"}

_SP = 7


# ── Helpers ─────────────────────────────────────────────────────────────

def _fmt_fecha(valor: str | None) -> str:
    if not valor:
        return ''
    try:
        return datetime.strptime(valor, '%Y-%m-%d').strftime('%d-%m-%Y')
    except ValueError:
        return valor


def _titulo_seccion(texto: str) -> Table:
    t = Table(
        [[Paragraph(texto, _S_SECCION)]],
        colWidths=[ANCHO_UTIL],
    )
    t.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('LINEBEFORE', (0, 0), (0, -1), 3, VERDE_MEDIO),
        ('BACKGROUND', (0, 0), (-1, -1), VERDE_CLARO),
    ]))
    return t


def _campo_box(etiqueta: str, valor) -> Table:
    txt = str(valor) if valor not in (None, '') else '—'
    t = Table(
        [[Paragraph(etiqueta, _S_LABEL)], [Paragraph(txt, _S_VALOR)]],
        colWidths=[None],
    )
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_CAMPO),
        ('TOPPADDING', (0, 0), (-1, 0), 3),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 0),
        ('TOPPADDING', (0, 1), (-1, 1), 1),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ('ROUNDEDCORNERS', [2, 2, 2, 2]),
    ]))
    return t


def _rejilla_formulario(
    pares: list[tuple[str, object]],
    columnas: int = 2,
) -> Table:
    filas: list[list] = []
    for i in range(0, len(pares), columnas):
        fila = []
        for j in range(columnas):
            if i + j < len(pares):
                et, val = pares[i + j]
                fila.append(_campo_box(et, val))
            else:
                fila.append('')
        filas.append(fila)

    ancho_col = ANCHO_UTIL / columnas
    t = Table(filas, colWidths=[ancho_col] * columnas)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 1),
        ('RIGHTPADDING', (0, 0), (-1, -1), 1),
    ]))
    return t


def _rejilla_formulario_vertical(
    columnas_pares: list[list[tuple[str, object]]],
) -> Table:
    """Distribuye cada lista de campos verticalmente en su propia columna."""
    total_filas = max(len(columna) for columna in columnas_pares)
    filas: list[list] = []
    for i in range(total_filas):
        fila = []
        for columna in columnas_pares:
            if i < len(columna):
                et, val = columna[i]
                fila.append(_campo_box(et, val))
            else:
                fila.append('')
        filas.append(fila)

    ancho_col = ANCHO_UTIL / len(columnas_pares)
    t = Table(filas, colWidths=[ancho_col] * len(columnas_pares))
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 1),
        ('RIGHTPADDING', (0, 0), (-1, -1), 1),
    ]))
    return t


def _pares_de_claves(datos: dict, claves: list[str]) -> list[tuple[str, object]]:
    pares = []
    for c in claves:
        valor = datos.get(c)
        if c in _CLAVES_FECHA_ISO and valor:
            valor = _fmt_fecha(valor)
        pares.append((_ETIQUETA_DE_CLAVE[c], valor))
    return pares


def _etiqueta_analito(analito: dict) -> str:
    return (
        f"{analito['nombre']} ({analito['unidad']})"
        if analito.get('unidad')
        else analito['nombre']
    )


def _caja_correos(datos: dict, espacio_libre: float) -> Table:
    correos: list[str] = datos.get('destinatarios_resultados') or []

    texto = ' · '.join(correos) if correos else '—'
    espacio = max(espacio_libre - 40, 8)

    filas = [
        [Paragraph(texto, _S_CORREO)],
        [Spacer(1, espacio)],
        [Paragraph(
            'Destinatarios de resultados configurados para el laboratorio',
            _S_CORREO_HINT,
        )],
    ]
    t = Table(filas, colWidths=[ANCHO_UTIL])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_CAMPO),
        ('TOPPADDING', (0, 0), (0, 0), 8),
        ('BOTTOMPADDING', (0, 0), (0, 0), 2),
        ('TOPPADDING', (0, 1), (0, 1), 0),
        ('BOTTOMPADDING', (0, 1), (0, 1), 0),
        ('TOPPADDING', (0, 2), (0, 2), 0),
        ('BOTTOMPADDING', (0, 2), (0, 2), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ('ROUNDEDCORNERS', [2, 2, 2, 2]),
    ]))
    return t


def _pie() -> Table:
    hoy = datetime.now().strftime('%d-%m-%Y')
    pie = Table(
        [[
            Paragraph(f'Fecha del documento: {hoy}', _S_PIE),
            Paragraph('Documento generado por AgroFresh Report Hub', _S_PIE),
        ]],
        colWidths=[9 * cm, ANCHO_UTIL - 9 * cm],
    )
    pie.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 0.5, VERDE_MEDIO),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    return pie


# ── Construcción de elementos ───────────────────────────────────────────

def _construir_elementos(
    datos: dict,
    analitos_config: list[dict] | None,
    espacio_correos: float,
) -> list:
    elementos = []
    laboratorio = datos.get('laboratorio', '')
    campos_lab: dict = datos.get('campos_laboratorio') or {}

    analitos_lab = sorted(
        (a for a in (analitos_config or []) if a.get('laboratorio') == laboratorio),
        key=lambda a: (a.get('categoria') or '', a.get('orden', 0)),
    )
    etiquetas_analitos = {_etiqueta_analito(a): a for a in analitos_lab}
    filas_analitos = [
        (
            a.get('categoria') or 'General',
            etiqueta,
            a.get('codigo', ''),
            a.get('unidad') or '—',
            campos_lab[etiqueta],
        )
        for etiqueta, a in etiquetas_analitos.items()
        if etiqueta in campos_lab
    ]
    campos_aplicacion = {
        k: v for k, v in campos_lab.items()
        if k not in etiquetas_analitos and k != 'Tipo Aplicación'
    }

    # ── ENCABEZADO ──────────────────────────────────────────────────────
    logo_img = (
        Image(_RUTA_LOGO, width=3.6 * cm, height=1.44 * cm)
        if os.path.isfile(_RUTA_LOGO)
        else Paragraph('', _S_VALOR)
    )
    logo_box = Table([[logo_img]], colWidths=[4.2 * cm])
    logo_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
    ]))
    titulo_col = [
        Paragraph('SOLICITUD DE ANÁLISIS', _S_BANNER_TITULO),
        Spacer(1, 3),
        Paragraph(f"N° {datos.get('numero_solicitud', '')}", _S_BANNER_FOLIO),
    ]
    banner = Table(
        [[logo_box, titulo_col]],
        colWidths=[5 * cm, ANCHO_UTIL - 5 * cm],
    )
    banner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), VERDE_CLARO),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (0, 0), 9),
        ('RIGHTPADDING', (-1, 0), (-1, 0), 11),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('BOX', (0, 0), (-1, -1), 0.75, VERDE_MEDIO),
        ('ROUNDEDCORNERS', [5, 5, 5, 5]),
    ]))
    elementos.append(banner)
    elementos.append(Spacer(1, 3))
    elementos.append(Paragraph(DIRECCION_EMPRESA, _S_DIRECCION))
    elementos.append(Spacer(1, _SP))

    # ── 1. IDENTIFICACIÓN DE LA SOLICITUD ──────────────────────────────
    pares_id_izquierda = [
        (_ETIQUETA_DE_CLAVE['solicitante'], datos.get('solicitante')),
        (_ETIQUETA_DE_CLAVE['laboratorio'], laboratorio),
        (_ETIQUETA_DE_CLAVE['sold_to'], datos.get('sold_to')),
        (_ETIQUETA_DE_CLAVE['ship_to'], datos.get('ship_to')),
    ]
    pares_id_derecha = [
        (_ETIQUETA_DE_CLAVE['generado_por'], datos.get('generado_por')),
        ('Email Solicitante', datos.get('email_solicitante')),
    ]
    elementos.append(_titulo_seccion('IDENTIFICACIÓN DE LA SOLICITUD'))
    elementos.append(Spacer(1, 4))
    elementos.append(_rejilla_formulario_vertical([
        pares_id_izquierda,
        pares_id_derecha,
    ]))
    elementos.append(Spacer(1, _SP))

    # ── 2. IDENTIFICACIÓN DE LA MUESTRA ─────────────────────────────────
    claves_muestra_ordenadas = [
        'tipo_muestra',
        'variedad',
        'numero_camara',
        'producto_utilizado',
        'aplicacion',
        'especie',
        'numero_orden',
        'lote',
        'posicion_muestreo',
        'csg',
        'nombre_muestreador',
    ]
    valores_muestra = {
        clave: datos.get(clave)
        for clave in claves_muestra_ordenadas
    }
    pares_muestra = [
        (_ETIQUETA_DE_CLAVE['tipo_muestra'], valores_muestra['tipo_muestra']),
        ('Tipo Aplicación', campos_lab.get('Tipo Aplicación')),
        (_ETIQUETA_DE_CLAVE['especie'], valores_muestra['especie']),
        (_ETIQUETA_DE_CLAVE['variedad'], valores_muestra['variedad']),
        (_ETIQUETA_DE_CLAVE['numero_camara'], valores_muestra['numero_camara']),
        (_ETIQUETA_DE_CLAVE['numero_orden'], valores_muestra['numero_orden']),
        (_ETIQUETA_DE_CLAVE['producto_utilizado'], valores_muestra['producto_utilizado']),
        (_ETIQUETA_DE_CLAVE['lote'], valores_muestra['lote']),
        (_ETIQUETA_DE_CLAVE['posicion_muestreo'], valores_muestra['posicion_muestreo']),
        (_ETIQUETA_DE_CLAVE['aplicacion'], valores_muestra['aplicacion']),
        (_ETIQUETA_DE_CLAVE['csg'], valores_muestra['csg']),
        (_ETIQUETA_DE_CLAVE['nombre_muestreador'], valores_muestra['nombre_muestreador']),
        (_ETIQUETA_DE_CLAVE['kilos_procesados'], datos.get('kilos_procesados')),
        (_ETIQUETA_DE_CLAVE['linea_proceso'], datos.get('linea_proceso')),
    ]
    elementos.append(_titulo_seccion('IDENTIFICACIÓN DE LA MUESTRA'))
    elementos.append(Spacer(1, 4))
    elementos.append(_rejilla_formulario(pares_muestra, columnas=3))
    elementos.append(Spacer(1, _SP))

    # ── 3. INFORMACIÓN DE APLICACIÓN ────────────────────────────────────
    if campos_aplicacion:
        elementos.append(_titulo_seccion('INFORMACIÓN DE APLICACIÓN'))
        elementos.append(Spacer(1, 4))
        elementos.append(_rejilla_formulario(list(campos_aplicacion.items()), columnas=3))
        elementos.append(Spacer(1, _SP))

    # ── 4. ANÁLISIS SOLICITADOS ─────────────────────────────────────────
    if filas_analitos:
        elementos.append(_titulo_seccion('ANÁLISIS SOLICITADOS'))
        elementos.append(Spacer(1, 4))
        filas_tabla = [[
            Paragraph('CÓDIGO', _S_TABLA_HEAD),
            Paragraph('ANALITO', _S_TABLA_HEAD),
            Paragraph('VALOR / DOSIS', _S_TABLA_HEAD),
        ]]
        for _cat, etiqueta, codigo, unidad, valor in filas_analitos:
            nombre = (
                etiqueta.rsplit(' (', 1)[0]
                if unidad != '—' and etiqueta.endswith(f'({unidad})')
                else etiqueta
            )
            filas_tabla.append([
                Paragraph(codigo, _S_TABLA_CELDA),
                Paragraph(nombre, _S_TABLA_CELDA),
                Paragraph(str(valor), _S_TABLA_CELDA),
            ])
        tabla = Table(
            filas_tabla,
            colWidths=[2.8 * cm, 10.6 * cm, ANCHO_UTIL - 13.4 * cm],
            repeatRows=1,
        )
        tabla.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), VERDE_CLARO),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
            ('LINEBELOW', (0, 0), (-1, 0), 1, VERDE_MEDIO),
            ('LINEBELOW', (0, 1), (-1, -1), 0.5, GRIS_BORDE),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [BLANCO, VERDE_CLARO]),
            ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ]))
        elementos.append(tabla)
        elementos.append(Spacer(1, _SP))

    # ── 5. OBSERVACIONES ────────────────────────────────────────────────
    elementos.append(_titulo_seccion('OBSERVACIONES'))
    elementos.append(Spacer(1, 4))
    obs_text = datos.get('observacion') or '—'
    obs_box = Table([[Paragraph(obs_text, _S_OBS)]], colWidths=[ANCHO_UTIL])
    obs_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_CAMPO),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ('ROUNDEDCORNERS', [2, 2, 2, 2]),
    ]))
    elementos.append(obs_box)
    elementos.append(Spacer(1, _SP))

    # ── 6. FECHAS ───────────────────────────────────────────────────────
    elementos.append(_titulo_seccion('FECHAS'))
    elementos.append(Spacer(1, 4))
    elementos.append(_rejilla_formulario(
        _pares_de_claves(datos, _CLAVES_FECHAS), columnas=3,
    ))
    elementos.append(Spacer(1, _SP))

    # ── 7. CORREOS ──────────────────────────────────────────────────────
    elementos.append(_titulo_seccion('CORREOS'))
    elementos.append(Spacer(1, 4))
    elementos.append(_caja_correos(datos, espacio_correos))
    elementos.append(Spacer(1, 6))

    # ── PIE ─────────────────────────────────────────────────────────────
    elementos.append(KeepTogether(_pie()))

    return elementos


def _contar_paginas(pdf_bytes: bytes) -> int:
    return len(_re.findall(rb'/Type\s*/Page(?!s)', pdf_bytes))


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


# ── Función pública ─────────────────────────────────────────────────────

def generar_pdf_solicitud(
    datos: dict,
    analitos_config: list[dict] | None = None,
) -> bytes:
    titulo = f"Solicitud de análisis {datos.get('numero_solicitud', '')}".strip()

    # Paso 1: construir con caja de correos mínima para medir
    elems_min = _construir_elementos(datos, analitos_config, espacio_correos=50)
    pdf_min = _construir_pdf(elems_min, titulo)
    n_paginas = _contar_paginas(pdf_min)

    if n_paginas <= 1:
        # Cabe en 1 página con caja mínima — calcular cuánto sobra y
        # reconstruir con la caja expandida.
        # Medir alto real del contenido con caja mínima usando el PDF.
        # El espacio libre es ~ (alto_pagina - alto_contenido_actual).
        # alto_contenido_actual ≈ alto_pagina - espacio_blanco_abajo.
        # Como no podemos leer el espacio blanco directamente del PDF,
        # usamos un truco: sabemos que la caja mínima tiene 50pt de
        # espacio libre interno. Probamos con 200pt más y si cabe, OK.
        for intento in [200, 150, 100, 75]:
            elems = _construir_elementos(datos, analitos_config, espacio_correos=50 + intento)
            pdf = _construir_pdf(elems, titulo)
            if _contar_paginas(pdf) <= 1:
                return pdf
        return pdf_min

    # Si con caja mínima ya son >1 página, devolver tal cual.
    return pdf_min
