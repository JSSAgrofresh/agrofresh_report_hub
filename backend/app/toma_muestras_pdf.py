"""
PDF de una solicitud de análisis.

Diseño propio, distinto del informe de análisis: paleta azul marino,
encabezado tipo banner, secciones con acento lateral grueso, campos con
aspecto de formulario sobre fondo gris claro. El informe usa verde y líneas
finas —ambos documentos son profesionales pero se distinguen al instante.
"""
import io
import os
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

# ── Paleta azul marino ──────────────────────────────────────────────────
AZUL_OSCURO = colors.HexColor('#1B3A5C')
AZUL_MEDIO = colors.HexColor('#2563EB')
AZUL_CLARO = colors.HexColor('#EFF6FF')
AZUL_ACENTO = colors.HexColor('#3B82F6')
GRIS_CAMPO = colors.HexColor('#F3F4F6')
GRIS_BORDE = colors.HexColor('#D1D5DB')
GRIS_TEXTO = colors.HexColor('#374151')
GRIS_LABEL = colors.HexColor('#6B7280')
NEGRO = colors.HexColor('#111827')
BLANCO = colors.white

ANCHO_UTIL = 17.6 * cm

# ── Estilos tipográficos ────────────────────────────────────────────────
_S_BANNER_TITULO = ParagraphStyle(
    'bannerTitulo', fontName='Helvetica-Bold', fontSize=16, leading=19,
    textColor=BLANCO, alignment=0,
)
_S_BANNER_FOLIO = ParagraphStyle(
    'bannerFolio', fontName='Helvetica-Bold', fontSize=10.5, leading=13,
    textColor=colors.HexColor('#93C5FD'), alignment=2,
)
_S_DIRECCION = ParagraphStyle(
    'direccion', fontName='Helvetica', fontSize=8, leading=10,
    textColor=GRIS_LABEL,
)
_S_SECCION = ParagraphStyle(
    'seccion', fontName='Helvetica-Bold', fontSize=10, leading=12,
    textColor=AZUL_OSCURO,
)
_S_LABEL = ParagraphStyle(
    'label', fontName='Helvetica-Bold', fontSize=7.5, leading=8.5,
    textColor=GRIS_LABEL, spaceBefore=0, spaceAfter=0,
)
_S_VALOR = ParagraphStyle(
    'valor', fontName='Helvetica', fontSize=9.5, leading=11.5,
    textColor=NEGRO, spaceBefore=0, spaceAfter=0,
)
_S_TABLA_HEAD = ParagraphStyle(
    'tHead', fontName='Helvetica-Bold', fontSize=9, leading=11,
    textColor=BLANCO,
)
_S_TABLA_CELDA = ParagraphStyle(
    'tCelda', fontName='Helvetica', fontSize=9.5, leading=12,
    textColor=NEGRO,
)
_S_OBS = ParagraphStyle(
    'obs', fontName='Helvetica', fontSize=9.5, leading=12.5,
    textColor=NEGRO,
)
_S_FIRMA_NOMBRE = ParagraphStyle(
    'firmaN', fontName='Helvetica-Bold', fontSize=10, textColor=NEGRO,
)
_S_FIRMA_CARGO = ParagraphStyle(
    'firmaC', fontName='Helvetica', fontSize=8.5, textColor=GRIS_LABEL,
)
_S_PIE = ParagraphStyle(
    'pie', fontName='Helvetica', fontSize=8, textColor=GRIS_LABEL,
)

_ETIQUETA_DE_CLAVE = dict(CAMPOS_GENERALES_ETIQUETAS)

_CLAVES_SOLICITANTE = ["solicitante", "email_solicitante"]
_CLAVES_CLIENTE = ["sold_to", "ship_to"]
_CLAVES_MUESTRA = [
    "tipo_muestra", "especie", "variedad", "csg", "lote",
    "numero_camara", "numero_orden", "posicion_muestreo",
    "kilos_procesados", "producto_utilizado", "aplicacion",
    "linea_proceso", "nombre_muestreador",
]
_CLAVES_FECHAS = ["fecha_solicitud", "fecha_muestreo", "hora_muestreo"]
_CLAVES_FECHA_ISO = {"fecha_solicitud", "fecha_muestreo"}


# ── Helpers ─────────────────────────────────────────────────────────────

def _fmt_fecha(valor: str | None) -> str:
    if not valor:
        return ''
    try:
        return datetime.strptime(valor, '%Y-%m-%d').strftime('%d-%m-%Y')
    except ValueError:
        return valor


def _titulo_seccion(texto: str) -> Table:
    """Sección con barra lateral azul gruesa a la izquierda."""
    t = Table(
        [[Paragraph(texto, _S_SECCION)]],
        colWidths=[ANCHO_UTIL],
    )
    t.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('LINEBEFORE', (0, 0), (0, -1), 3.5, AZUL_MEDIO),
        ('BACKGROUND', (0, 0), (-1, -1), AZUL_CLARO),
    ]))
    return t


def _campo_box(etiqueta: str, valor) -> Table:
    """Un campo individual con aspecto de caja: fondo gris claro, label
    diminuto arriba, valor debajo."""
    txt = str(valor) if valor not in (None, '') else '—'
    t = Table(
        [[Paragraph(etiqueta, _S_LABEL)], [Paragraph(txt, _S_VALOR)]],
        colWidths=[None],
    )
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_CAMPO),
        ('TOPPADDING', (0, 0), (-1, 0), 4),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 0),
        ('TOPPADDING', (0, 1), (-1, 1), 1),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
    ]))
    return t


def _rejilla_formulario(
    pares: list[tuple[str, object]],
    columnas: int = 2,
) -> Table:
    """Campos tipo formulario en rejilla: cada celda es una caja con label
    y valor, separadas por un pequeño gap visual."""
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
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
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


# ── PDF principal ───────────────────────────────────────────────────────

def generar_pdf_solicitud(
    datos: dict,
    analitos_config: list[dict] | None = None,
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.1 * cm,
        bottomMargin=1.1 * cm,
        title=f"Solicitud de análisis {datos.get('numero_solicitud', '')}".strip(),
    )

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

    # ── ENCABEZADO: banner azul marino de ancho completo ────────────────
    logo_img = (
        Image(_RUTA_LOGO, width=3.8 * cm, height=1.52 * cm)
        if os.path.isfile(_RUTA_LOGO)
        else Paragraph('', _S_VALOR)
    )

    # Logo en una caja blanca dentro del banner
    logo_box = Table([[logo_img]], colWidths=[4.4 * cm])
    logo_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
    ]))

    titulo_col = [
        Paragraph('SOLICITUD DE ANÁLISIS', _S_BANNER_TITULO),
        Spacer(1, 4),
        Paragraph(
            f"N° {datos.get('numero_solicitud', '')}",
            _S_BANNER_FOLIO,
        ),
    ]

    banner = Table(
        [[logo_box, titulo_col]],
        colWidths=[5.2 * cm, ANCHO_UTIL - 5.2 * cm],
    )
    banner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), AZUL_OSCURO),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (0, 0), 10),
        ('RIGHTPADDING', (-1, 0), (-1, 0), 12),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
    ]))
    elementos.append(banner)

    # Dirección debajo del banner
    elementos.append(Spacer(1, 4))
    elementos.append(Paragraph(DIRECCION_EMPRESA, _S_DIRECCION))
    elementos.append(Spacer(1, 10))

    # ── 1. IDENTIFICACIÓN ───────────────────────────────────────────────
    elementos.append(_titulo_seccion('IDENTIFICACIÓN'))
    elementos.append(Spacer(1, 5))
    elementos.append(_rejilla_formulario([
        (_ETIQUETA_DE_CLAVE['numero_solicitud'], datos.get('numero_solicitud')),
        (_ETIQUETA_DE_CLAVE['generado_por'], datos.get('generado_por')),
        (_ETIQUETA_DE_CLAVE['laboratorio'], laboratorio),
    ], columnas=3))
    elementos.append(Spacer(1, 8))

    # ── 2. DATOS DEL SOLICITANTE ────────────────────────────────────────
    elementos.append(_titulo_seccion('DATOS DEL SOLICITANTE'))
    elementos.append(Spacer(1, 5))
    elementos.append(_rejilla_formulario(
        _pares_de_claves(datos, _CLAVES_SOLICITANTE),
    ))
    elementos.append(Spacer(1, 8))

    # ── 3. DATOS DEL CLIENTE / DESTINO ──────────────────────────────────
    elementos.append(_titulo_seccion('DATOS DEL CLIENTE / DESTINO'))
    elementos.append(Spacer(1, 5))
    elementos.append(_rejilla_formulario(
        _pares_de_claves(datos, _CLAVES_CLIENTE),
    ))
    elementos.append(Spacer(1, 8))

    # ── 4. IDENTIFICACIÓN DE LA MUESTRA ─────────────────────────────────
    pares_muestra = _pares_de_claves(datos, _CLAVES_MUESTRA)
    if campos_lab.get('Tipo Aplicación'):
        pares_muestra.insert(0, ('Tipo Aplicación', campos_lab['Tipo Aplicación']))
    elementos.append(_titulo_seccion('IDENTIFICACIÓN DE LA MUESTRA'))
    elementos.append(Spacer(1, 5))
    elementos.append(_rejilla_formulario(pares_muestra, columnas=3))
    elementos.append(Spacer(1, 8))

    # ── 5. INFORMACIÓN DE APLICACIÓN ────────────────────────────────────
    if campos_aplicacion:
        elementos.append(_titulo_seccion('INFORMACIÓN DE APLICACIÓN'))
        elementos.append(Spacer(1, 5))
        elementos.append(_rejilla_formulario(list(campos_aplicacion.items())))
        elementos.append(Spacer(1, 8))

    # ── 6. ANÁLISIS SOLICITADOS / ANALITOS ──────────────────────────────
    if filas_analitos:
        elementos.append(_titulo_seccion('ANÁLISIS SOLICITADOS'))
        elementos.append(Spacer(1, 5))

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

        tabla_analitos = Table(
            filas_tabla,
            colWidths=[3 * cm, 10.2 * cm, 4.4 * cm],
            repeatRows=1,
        )
        tabla_analitos.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), AZUL_OSCURO),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEBELOW', (0, 0), (-1, 0), 1.5, AZUL_MEDIO),
            ('LINEBELOW', (0, 1), (-1, -1), 0.5, GRIS_BORDE),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [BLANCO, AZUL_CLARO]),
            ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ]))
        elementos.append(tabla_analitos)
        elementos.append(Spacer(1, 10))

    # ── 7. OBSERVACIONES ────────────────────────────────────────────────
    elementos.append(_titulo_seccion('OBSERVACIONES'))
    elementos.append(Spacer(1, 5))
    obs_text = datos.get('observacion') or '—'
    obs_box = Table(
        [[Paragraph(obs_text, _S_OBS)]],
        colWidths=[ANCHO_UTIL],
    )
    obs_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_CAMPO),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
    ]))
    elementos.append(obs_box)
    elementos.append(Spacer(1, 8))

    # ── 8. FECHAS ───────────────────────────────────────────────────────
    elementos.append(_titulo_seccion('FECHAS'))
    elementos.append(Spacer(1, 5))
    elementos.append(_rejilla_formulario(
        _pares_de_claves(datos, _CLAVES_FECHAS),
        columnas=3,
    ))
    elementos.append(Spacer(1, 12))

    # ── 9. FIRMAS ───────────────────────────────────────────────────────
    def _bloque_firma(titulo: str) -> Table:
        t = Table(
            [
                [Paragraph('', _S_FIRMA_NOMBRE)],
                [Paragraph(titulo, _S_FIRMA_CARGO)],
            ],
            colWidths=[7.5 * cm],
        )
        t.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, 0), 0.75, AZUL_OSCURO),
            ('TOPPADDING', (0, 0), (-1, 0), 5),
            ('TOPPADDING', (0, 1), (-1, 1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return t

    firmas = Table(
        [[_bloque_firma('Solicitado por'), '', _bloque_firma('Recibido por (laboratorio)')]],
        colWidths=[7.5 * cm, 2.6 * cm, 7.5 * cm],
    )
    firmas.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elementos.append(KeepTogether(firmas))
    elementos.append(Spacer(1, 10))

    # ── PIE ─────────────────────────────────────────────────────────────
    hoy = datetime.now().strftime('%d-%m-%Y')
    pie = Table(
        [[
            Paragraph(f'Fecha del documento: {hoy}', _S_PIE),
            Paragraph('Documento generado por AgroFresh Report Hub', _S_PIE),
        ]],
        colWidths=[8.8 * cm, 8.8 * cm],
    )
    pie.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 0.75, AZUL_MEDIO),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    elementos.append(KeepTogether(pie))

    doc.build(elementos)
    return buffer.getvalue()
