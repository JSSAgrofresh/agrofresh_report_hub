"""
PDF de una solicitud de Toma de muestras. Reutiliza los colores, estilos y
el patrón visual de `informe_pdf.py` (título con línea fina, tabla con
encabezado verde) en vez de crear un sistema de PDF paralelo.
"""
import io
import os
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .informe_pdf import (
    DIRECCION_EMPRESA,
    _ESTILO_DIRECCION,
    _ESTILO_FIRMA_CARGO,
    _ESTILO_FIRMA_NOMBRE,
    _ESTILO_FOLIO,
    _ESTILO_FOOTER,
    _ESTILO_LABEL,
    _ESTILO_TABLA_CELDA,
    _ESTILO_TABLA_HEAD,
    _ESTILO_TITULO,
    _ESTILO_VALOR,
    _RUTA_LOGO,
    GRIS_LABEL,
    GRIS_LINEA,
    NEGRO_TEXTO,
    VERDE_CLARO,
    VERDE_OSCURO,
    _rejilla_campos,
    _titulo_seccion,
)
from .solicitud_excel import CAMPOS_GENERALES_ETIQUETAS

_ETIQUETA_DE_CLAVE = dict(CAMPOS_GENERALES_ETIQUETAS)

# Agrupación de los campos generales en las secciones del documento (§4).
_CLAVES_SOLICITANTE = ["solicitante", "email_solicitante"]
_CLAVES_CLIENTE = ["sold_to", "ship_to"]
_CLAVES_MUESTRA = [
    "tipo_muestra",
    "especie",
    "variedad",
    "csg",
    "lote",
    "numero_camara",
    "numero_orden",
    "posicion_muestreo",
    "kilos_procesados",
    "producto_utilizado",
    "aplicacion",
    "linea_proceso",
    "nombre_muestreador",
]
_CLAVES_FECHAS = ["fecha_solicitud", "fecha_muestreo", "hora_muestreo"]


def _fila_campo(etiqueta: str, valor) -> list:
    texto = str(valor) if valor not in (None, "") else "—"
    return [Paragraph(etiqueta, _ESTILO_LABEL), Paragraph(texto, _ESTILO_VALOR)]


def _tabla_pares(pares: list[tuple[str, object]]) -> Table:
    """Grilla de 2 columnas etiqueta/valor por fila (2 pares por fila)."""
    filas = []
    for i in range(0, len(pares), 2):
        grupo = pares[i : i + 2]
        fila = list(_fila_campo(*grupo[0]))
        fila += _fila_campo(*grupo[1]) if len(grupo) > 1 else ["", ""]
        filas.append(fila)
    t = Table(filas, colWidths=[3.2 * cm, 5.6 * cm, 3.2 * cm, 5.6 * cm])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, GRIS_LINEA),
            ]
        )
    )
    return t


_CLAVES_FECHA_ISO = {"fecha_solicitud", "fecha_muestreo"}


def _pares_de_claves(datos: dict, claves: list[str]) -> list[tuple[str, object]]:
    pares = []
    for c in claves:
        valor = datos.get(c)
        if c in _CLAVES_FECHA_ISO and valor:
            try:
                valor = datetime.strptime(valor, "%Y-%m-%d").strftime("%d-%m-%Y")
            except ValueError:
                pass
        pares.append((_ETIQUETA_DE_CLAVE[c], valor))
    return pares


def _etiqueta_analito(analito: dict) -> str:
    return f"{analito['nombre']} ({analito['unidad']})" if analito.get("unidad") else analito["nombre"]


def generar_pdf_solicitud(datos: dict, analitos_config: list[dict] | None = None) -> bytes:
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
    laboratorio = datos.get("laboratorio", "")
    campos_lab: dict = datos.get("campos_laboratorio") or {}

    # Separa los analitos configurados (van a la tabla de ANALITOS,
    # agrupados por categoría en el orden del mantenedor) del resto de
    # campos_laboratorio (Tipo Aplicación y campos propios del tipo de
    # aplicación, ej. Dosis Aplicada/Presión Actimist), que van a
    # INFORMACIÓN DE APLICACIÓN.
    analitos_lab = sorted(
        (a for a in (analitos_config or []) if a.get("laboratorio") == laboratorio),
        key=lambda a: (a.get("categoria") or "", a.get("orden", 0)),
    )
    etiquetas_analitos = {_etiqueta_analito(a): a for a in analitos_lab}
    filas_analitos = [
        (a.get("categoria") or "General", etiqueta, a.get("codigo", ""), a.get("unidad") or "—", campos_lab[etiqueta])
        for etiqueta, a in etiquetas_analitos.items()
        if etiqueta in campos_lab
    ]
    campos_aplicacion = {k: v for k, v in campos_lab.items() if k not in etiquetas_analitos and k != "Tipo Aplicación"}

    # --- Encabezado: logo + dirección (izquierda) · N° Solicitud (derecha) ---
    logo_cel = [
        Image(_RUTA_LOGO, width=4.6 * cm, height=1.84 * cm) if os.path.isfile(_RUTA_LOGO) else Paragraph("", _ESTILO_VALOR),
        Spacer(1, 3),
        Paragraph(DIRECCION_EMPRESA, _ESTILO_DIRECCION),
    ]
    titulo_cel = [
        Paragraph("SOLICITUD DE ANÁLISIS", _ESTILO_TITULO),
        Spacer(1, 3),
        Paragraph(f"N° Solicitud: {datos.get('numero_solicitud', '')}", _ESTILO_FOLIO),
    ]
    encabezado = Table([[logo_cel, titulo_cel]], colWidths=[9.6 * cm, 8 * cm])
    encabezado.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.75, GRIS_LINEA),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    elementos.append(encabezado)
    elementos.append(Spacer(1, 7))

    # --- 1. Identificación (solo identificadores del documento: N° de
    # solicitud, quién la generó, laboratorio -Tipo Aplicación es parte de
    # la identificación de la muestra, no de este bloque) ---
    elementos.append(_titulo_seccion("IDENTIFICACIÓN"))
    elementos.append(
        _tabla_pares(
            [
                (_ETIQUETA_DE_CLAVE["numero_solicitud"], datos.get("numero_solicitud")),
                (_ETIQUETA_DE_CLAVE["generado_por"], datos.get("generado_por")),
                (_ETIQUETA_DE_CLAVE["laboratorio"], laboratorio),
            ]
        )
    )
    elementos.append(Spacer(1, 6))

    # --- 2. Datos del solicitante ---
    elementos.append(_titulo_seccion("DATOS DEL SOLICITANTE"))
    elementos.append(_tabla_pares(_pares_de_claves(datos, _CLAVES_SOLICITANTE)))
    elementos.append(Spacer(1, 6))

    # --- 3. Datos del cliente / destino (Sold To y Ship To siempre
    # visibles, aunque Ship To no se haya ingresado) ---
    elementos.append(_titulo_seccion("DATOS DEL CLIENTE / DESTINO"))
    elementos.append(_tabla_pares(_pares_de_claves(datos, _CLAVES_CLIENTE)))
    elementos.append(Spacer(1, 6))

    # --- 4. Identificación de la muestra: una sola sección a lo ancho de la
    # página, igual que en el informe de análisis. Las fechas ya no van en una
    # columna al lado: bajan a su propia sección, después de Observaciones.
    # Tratamiento, Producto Utilizado y Tipo Aplicación quedan dentro de la
    # identificación de la muestra (no como sección aparte). ---
    pares_muestra = _pares_de_claves(datos, _CLAVES_MUESTRA)
    if campos_lab.get("Tipo Aplicación"):
        pares_muestra.append(("Tipo Aplicación", campos_lab.get("Tipo Aplicación")))
    elementos.append(_titulo_seccion("IDENTIFICACIÓN DE LA MUESTRA"))
    elementos.append(Spacer(1, 3))
    elementos.append(_rejilla_campos(pares_muestra))
    elementos.append(Spacer(1, 6))

    # --- 5. Información de aplicación (campos propios del tipo de aplicación,
    # ej. dosis/presión -distintos de Tipo Aplicación, que ya va en la
    # identificación de la muestra-) ---
    if campos_aplicacion:
        elementos.append(_titulo_seccion("INFORMACIÓN DE APLICACIÓN"))
        elementos.append(_tabla_pares(list(campos_aplicacion.items())))
        elementos.append(Spacer(1, 6))

    # --- 6. Análisis solicitados / Analitos, agrupados por categoría ---
    if filas_analitos:
        elementos.append(_titulo_seccion("ANÁLISIS SOLICITADOS / ANALITOS"))
        elementos.append(Spacer(1, 4))
        filas = [
            [
                Paragraph("CATEGORÍA", _ESTILO_TABLA_HEAD),
                Paragraph("CÓDIGO", _ESTILO_TABLA_HEAD),
                Paragraph("ANALITO", _ESTILO_TABLA_HEAD),
                Paragraph("UNIDAD", _ESTILO_TABLA_HEAD),
                Paragraph("VALOR / DOSIS", _ESTILO_TABLA_HEAD),
            ]
        ]
        for categoria, etiqueta, codigo, unidad, valor in filas_analitos:
            nombre = etiqueta.rsplit(" (", 1)[0] if unidad != "—" and etiqueta.endswith(f"({unidad})") else etiqueta
            filas.append(
                [
                    Paragraph(categoria, _ESTILO_TABLA_CELDA),
                    Paragraph(codigo, _ESTILO_TABLA_CELDA),
                    Paragraph(nombre, _ESTILO_TABLA_CELDA),
                    Paragraph(unidad, _ESTILO_TABLA_CELDA),
                    Paragraph(str(valor), _ESTILO_TABLA_CELDA),
                ]
            )
        tabla_analitos = Table(
            filas, colWidths=[3.4 * cm, 2.4 * cm, 6 * cm, 2.4 * cm, 3.4 * cm], repeatRows=1
        )
        tabla_analitos.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), VERDE_CLARO),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                    ("LINEBELOW", (0, 0), (-1, 0), 1, VERDE_OSCURO),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.5, GRIS_LINEA),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [None, GRIS_LABEL]),
                ]
            )
        )
        elementos.append(tabla_analitos)
        elementos.append(Spacer(1, 8))

    # --- 7. Observaciones ---
    elementos.append(_titulo_seccion("OBSERVACIONES"))
    elementos.append(Spacer(1, 3))
    elementos.append(Paragraph(datos.get("observacion") or "—", _ESTILO_VALOR))
    elementos.append(Spacer(1, 6))

    # --- 8. Fechas: después de Observaciones, igual que en el informe ---
    elementos.append(_titulo_seccion("FECHAS"))
    elementos.append(Spacer(1, 3))
    elementos.append(_rejilla_campos(_pares_de_claves(datos, _CLAVES_FECHAS), columnas=3))
    elementos.append(Spacer(1, 10))

    # --- 8. Firmas (siempre al final del documento) ---
    def _bloque_firma(titulo: str) -> Table:
        t = Table([[Paragraph("", _ESTILO_FIRMA_NOMBRE)], [Paragraph(titulo, _ESTILO_FIRMA_CARGO)]], colWidths=[7.5 * cm])
        t.setStyle(
            TableStyle(
                [
                    ("LINEABOVE", (0, 0), (-1, 0), 0.75, NEGRO_TEXTO),
                    ("TOPPADDING", (0, 0), (-1, 0), 5),
                    ("TOPPADDING", (0, 1), (-1, 1), 1),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        return t

    elementos.append(_titulo_seccion("FIRMAS"))
    elementos.append(Spacer(1, 10))
    firmas = Table(
        [[_bloque_firma("Solicitado por"), "", _bloque_firma("Recibido por (laboratorio)")]],
        colWidths=[7.5 * cm, 2.6 * cm, 7.5 * cm],
    )
    firmas.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elementos.append(KeepTogether(firmas))
    elementos.append(Spacer(1, 8))

    # --- Pie ---
    hoy = datetime.now().strftime("%d-%m-%Y")
    pie = Table(
        [
            [
                Paragraph(f"Fecha del documento: {hoy}", _ESTILO_FOOTER),
                Paragraph("Documento generado por AgroFresh Report Hub.", _ESTILO_FOOTER),
            ]
        ],
        colWidths=[8.8 * cm, 8.8 * cm],
    )
    pie.setStyle(
        TableStyle(
            [("LINEABOVE", (0, 0), (-1, -1), 0.5, GRIS_LINEA), ("TOPPADDING", (0, 0), (-1, -1), 4), ("ALIGN", (1, 0), (1, 0), "RIGHT")]
        )
    )
    elementos.append(KeepTogether(pie))

    doc.build(elementos)
    return buffer.getvalue()
