"""
PDF de una solicitud de análisis — diseñado para caber en una sola hoja A4.

Diseño propio, distinto del informe de análisis: paleta verde AgroFresh pero
con encabezado tipo banner, secciones con acento lateral grueso, y campos con
aspecto de formulario sobre fondo gris claro. El informe usa líneas finas y
rejilla plana —ambos documentos son profesionales pero se distinguen al
instante.
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

ANCHO_UTIL = 18.0 * cm

# ── Estilos tipográficos (compactos para caber en 1 hoja) ──────────────
_S_BANNER_TITULO = ParagraphStyle(
    'bannerTitulo', fontName='Helvetica-Bold', fontSize=14, leading=16,
    textColor=BLANCO, alignment=0,
)
_S_BANNER_FOLIO = ParagraphStyle(
    'bannerFolio', fontName='Helvetica-Bold', fontSize=9.5, leading=11,
    textColor=VERDE_FOLIO, alignment=2,
)
_S_DIRECCION = ParagraphStyle(
    'direccion', fontName='Helvetica', fontSize=7, leading=9,
    textColor=GRIS_LABEL,
)
_S_SECCION = ParagraphStyle(
    'seccion', fontName='Helvetica-Bold', fontSize=8.5, leading=10,
    textColor=VERDE_OSCURO,
)
_S_LABEL = ParagraphStyle(
    'label', fontName='Helvetica-Bold', fontSize=6.5, leading=7.5,
    textColor=GRIS_LABEL, spaceBefore=0, spaceAfter=0,
)
_S_VALOR = ParagraphStyle(
    'valor', fontName='Helvetica', fontSize=8.5, leading=10,
    textColor=NEGRO, spaceBefore=0, spaceAfter=0,
)
_S_TABLA_HEAD = ParagraphStyle(
    'tHead', fontName='Helvetica-Bold', fontSize=8, leading=9.5,
    textColor=BLANCO,
)
_S_TABLA_CELDA = ParagraphStyle(
    'tCelda', fontName='Helvetica', fontSize=8.5, leading=10,
    textColor=NEGRO,
)
_S_OBS = ParagraphStyle(
    'obs', fontName='Helvetica', fontSize=8.5, leading=10.5,
    textColor=NEGRO,
)
_S_CORREO = ParagraphStyle(
    'correo', fontName='Helvetica', fontSize=8.5, leading=12,
    textColor=NEGRO,
)
_S_CORREO_HINT = ParagraphStyle(
    'correoHint', fontName='Helvetica-Oblique', fontSize=7.5, leading=9,
    textColor=GRIS_LABEL,
)
_S_PIE = ParagraphStyle(
    'pie', fontName='Helvetica', fontSize=7, textColor=GRIS_LABEL,
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

_SP = 4


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
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
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
        ('TOPPADDING', (0, 0), (-1, 0), 2),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 0),
        ('TOPPADDING', (0, 1), (-1, 1), 0),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
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
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
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


def _seccion_correos(datos: dict) -> list:
    correos: list[str] = []
    email_sol = datos.get('email_solicitante')
    if email_sol:
        correos.append(email_sol)
    email_lab = datos.get('email_laboratorio')
    if email_lab:
        correos.append(email_lab)
    destinatarios_extra: list[str] = datos.get('destinatarios_extra') or []
    correos.extend(destinatarios_extra)

    texto = ' · '.join(correos) if correos else '—'

    filas = [
        [Paragraph(texto, _S_CORREO)],
        [Spacer(1, 18)],
        [Paragraph(
            'Escriba aquí correos adicionales para el envío de resultados',
            _S_CORREO_HINT,
        )],
    ]
    t = Table(filas, colWidths=[ANCHO_UTIL])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_CAMPO),
        ('TOPPADDING', (0, 0), (0, 0), 6),
        ('BOTTOMPADDING', (0, 0), (0, 0), 2),
        ('TOPPADDING', (0, 1), (0, 1), 0),
        ('BOTTOMPADDING', (0, 1), (0, 1), 0),
        ('TOPPADDING', (0, 2), (0, 2), 0),
        ('BOTTOMPADDING', (0, 2), (0, 2), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ('ROUNDEDCORNERS', [2, 2, 2, 2]),
    ]))
    return [t]


# ── PDF principal ───────────────────────────────────────────────────────

def generar_pdf_solicitud(
    datos: dict,
    analitos_config: list[dict] | None = None,
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.4 * cm,
        rightMargin=1.4 * cm,
        topMargin=0.8 * cm,
        bottomMargin=0.8 * cm,
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

    # ── ENCABEZADO: banner verde oscuro compacto ────────────────────────
    logo_img = (
        Image(_RUTA_LOGO, width=3.4 * cm, height=1.36 * cm)
        if os.path.isfile(_RUTA_LOGO)
        else Paragraph('', _S_VALOR)
    )

    logo_box = Table([[logo_img]], colWidths=[4 * cm])
    logo_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
    ]))

    titulo_col = [
        Paragraph('SOLICITUD DE ANÁLISIS', _S_BANNER_TITULO),
        Spacer(1, 2),
        Paragraph(f"N° {datos.get('numero_solicitud', '')}", _S_BANNER_FOLIO),
    ]

    banner = Table(
        [[logo_box, titulo_col]],
        colWidths=[4.8 * cm, ANCHO_UTIL - 4.8 * cm],
    )
    banner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), VERDE_BANNER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (0, 0), 8),
        ('RIGHTPADDING', (-1, 0), (-1, 0), 10),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('ROUNDEDCORNERS', [5, 5, 5, 5]),
    ]))
    elementos.append(banner)
    elementos.append(Spacer(1, 2))
    elementos.append(Paragraph(DIRECCION_EMPRESA, _S_DIRECCION))
    elementos.append(Spacer(1, _SP + 2))

    # ── 1. IDENTIFICACIÓN + SOLICITANTE + CLIENTE en una sola franja ────
    pares_id = [
        (_ETIQUETA_DE_CLAVE['numero_solicitud'], datos.get('numero_solicitud')),
        (_ETIQUETA_DE_CLAVE['generado_por'], datos.get('generado_por')),
        (_ETIQUETA_DE_CLAVE['laboratorio'], laboratorio),
        (_ETIQUETA_DE_CLAVE['solicitante'], datos.get('solicitante')),
        (_ETIQUETA_DE_CLAVE['email_solicitante'], datos.get('email_solicitante')),
        (_ETIQUETA_DE_CLAVE['sold_to'], datos.get('sold_to')),
        (_ETIQUETA_DE_CLAVE['ship_to'], datos.get('ship_to')),
    ]
    elementos.append(_titulo_seccion('IDENTIFICACIÓN'))
    elementos.append(Spacer(1, 3))
    elementos.append(_rejilla_formulario(pares_id, columnas=3))
    elementos.append(Spacer(1, _SP))

    # ── 2. IDENTIFICACIÓN DE LA MUESTRA ─────────────────────────────────
    pares_muestra = _pares_de_claves(datos, _CLAVES_MUESTRA)
    if campos_lab.get('Tipo Aplicación'):
        pares_muestra.insert(0, ('Tipo Aplicación', campos_lab['Tipo Aplicación']))
    elementos.append(_titulo_seccion('IDENTIFICACIÓN DE LA MUESTRA'))
    elementos.append(Spacer(1, 3))
    elementos.append(_rejilla_formulario(pares_muestra, columnas=3))
    elementos.append(Spacer(1, _SP))

    # ── 3. INFORMACIÓN DE APLICACIÓN ────────────────────────────────────
    if campos_aplicacion:
        elementos.append(_titulo_seccion('INFORMACIÓN DE APLICACIÓN'))
        elementos.append(Spacer(1, 3))
        elementos.append(_rejilla_formulario(list(campos_aplicacion.items()), columnas=3))
        elementos.append(Spacer(1, _SP))

    # ── 4. ANÁLISIS SOLICITADOS ─────────────────────────────────────────
    if filas_analitos:
        elementos.append(_titulo_seccion('ANÁLISIS SOLICITADOS'))
        elementos.append(Spacer(1, 3))

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
            colWidths=[2.8 * cm, 10.6 * cm, 4.6 * cm],
            repeatRows=1,
        )
        tabla_analitos.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), VERDE_OSCURO),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LINEBELOW', (0, 0), (-1, 0), 1, VERDE_MEDIO),
            ('LINEBELOW', (0, 1), (-1, -1), 0.5, GRIS_BORDE),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [BLANCO, VERDE_CLARO]),
            ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ]))
        elementos.append(tabla_analitos)
        elementos.append(Spacer(1, _SP + 2))

    # ── 5. OBSERVACIONES ────────────────────────────────────────────────
    elementos.append(_titulo_seccion('OBSERVACIONES'))
    elementos.append(Spacer(1, 3))
    obs_text = datos.get('observacion') or '—'
    obs_box = Table(
        [[Paragraph(obs_text, _S_OBS)]],
        colWidths=[ANCHO_UTIL],
    )
    obs_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), GRIS_CAMPO),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('BOX', (0, 0), (-1, -1), 0.5, GRIS_BORDE),
        ('ROUNDEDCORNERS', [2, 2, 2, 2]),
    ]))
    elementos.append(obs_box)
    elementos.append(Spacer(1, _SP))

    # ── 6. FECHAS ───────────────────────────────────────────────────────
    elementos.append(_titulo_seccion('FECHAS'))
    elementos.append(Spacer(1, 3))
    elementos.append(_rejilla_formulario(
        _pares_de_claves(datos, _CLAVES_FECHAS),
        columnas=3,
    ))
    elementos.append(Spacer(1, _SP))

    # ── 7. CORREOS ──────────────────────────────────────────────────────
    elementos.append(_titulo_seccion('CORREOS'))
    elementos.append(Spacer(1, 3))
    elementos.extend(_seccion_correos(datos))
    elementos.append(Spacer(1, _SP + 2))

    # ── PIE ─────────────────────────────────────────────────────────────
    hoy = datetime.now().strftime('%d-%m-%Y')
    pie = Table(
        [[
            Paragraph(f'Fecha del documento: {hoy}', _S_PIE),
            Paragraph('Documento generado por AgroFresh Report Hub', _S_PIE),
        ]],
        colWidths=[9 * cm, 9 * cm],
    )
    pie.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 0.5, VERDE_MEDIO),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    elementos.append(KeepTogether(pie))

    doc.build(elementos)
    return buffer.getvalue()
