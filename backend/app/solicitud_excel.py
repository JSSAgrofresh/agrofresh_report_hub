"""
Genera y lee el Excel "maestro" de una solicitud de Toma de muestras.

Cada solicitud se guarda como un único archivo .xlsx (ya no .json): la hoja
"Solicitud" es el documento legible pensado para imprimir/enviar, y una hoja
oculta "_data" guarda el JSON completo de la solicitud en una celda, para
poder reconstruirla sin tener que parsear la hoja "bonita" -así listar/ver/
eliminar siguen funcionando exactamente igual que antes, ahora leyendo desde
Excel en vez de JSON.
"""
import json

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.worksheet import Worksheet

VERDE_OSCURO = "3D6B1F"
VERDE_MEDIO = "70AD47"
VERDE_CLARO = "EBF5E1"
GRIS_TEXTO = "6B7280"
GRIS_LINEA = "D9DCE1"
GRIS_FILA = "F7F8F6"

_BORDE_INFERIOR = Border(bottom=Side(style="thin", color=GRIS_LINEA))
_BORDE_COMPLETO = Border(*(Side(style="thin", color=GRIS_LINEA),) * 4)

# Campos generales en el orden en que aparecen en el documento. El conjunto
# de claves es el mismo que expone el modelo `SolicitudIn` de toma_muestras.py.
CAMPOS_GENERALES_ETIQUETAS: list[tuple[str, str]] = [
    ("numero_solicitud", "N° Solicitud / OT"),
    ("fecha_solicitud", "Fecha Solicitud"),
    ("laboratorio", "Laboratorio"),
    ("solicitante", "Solicitante"),
    ("email_solicitante", "Email Solicitante"),
    ("sold_to", "Sold To"),
    ("ship_to", "Ship To"),
    ("aplicacion", "Aplicación"),
    ("especie", "Especie"),
    ("variedad", "Variedad"),
    ("linea_proceso", "Línea Proceso"),
    ("csg", "CSG"),
    ("lote", "Lote"),
    ("posicion_muestreo", "Posición Muestreo"),
    ("numero_camara", "N° Cámara"),
    ("numero_orden", "N° Orden"),
    ("kilos_procesados", "Kilos Procesados (KG)"),
    ("producto_utilizado", "Producto Utilizado"),
    ("tipo_muestra", "Tipo Muestra"),
    ("fecha_muestreo", "Fecha Muestreo"),
    ("hora_muestreo", "Hora Muestreo"),
    ("nombre_muestreador", "Nombre Muestreador"),
    ("generado_por", "Generado Por"),
    ("email_laboratorio", "Email Laboratorio"),
]


def _titulo_seccion(ws: Worksheet, fila: int, texto: str, columnas: int = 4) -> int:
    ws.merge_cells(start_row=fila, start_column=1, end_row=fila, end_column=columnas)
    celda = ws.cell(row=fila, column=1, value=texto.upper())
    celda.font = Font(bold=True, size=11, color=VERDE_OSCURO)
    celda.fill = PatternFill("solid", fgColor=VERDE_CLARO)
    celda.alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[fila].height = 22
    return fila + 1


def _valor_visible(clave: str, valor):
    if valor in (None, ""):
        return "—"
    if clave == "kilos_procesados":
        return f"{valor} kg"
    return valor


def _escribir_pares(ws: Worksheet, fila: int, pares: list[tuple[str, object]]) -> int:
    """Escribe dos pares etiqueta/valor por fila, como ficha operativa."""
    for indice in range(0, len(pares), 2):
        grupo = pares[indice:indice + 2]
        for bloque, (etiqueta, valor) in enumerate(grupo):
            col_etiqueta = 1 + bloque * 2
            col_valor = col_etiqueta + 1
            c1 = ws.cell(row=fila, column=col_etiqueta, value=etiqueta)
            c2 = ws.cell(row=fila, column=col_valor, value=valor)
            c1.font = Font(bold=True, size=9.5, color=GRIS_TEXTO)
            c1.fill = PatternFill("solid", fgColor=GRIS_FILA)
            c2.font = Font(size=10)
            c1.border = _BORDE_COMPLETO
            c2.border = _BORDE_COMPLETO
            c1.alignment = Alignment(vertical="center", wrap_text=True)
            c2.alignment = Alignment(vertical="center", wrap_text=True)
        if len(grupo) == 1:
            ws.cell(row=fila, column=3).border = _BORDE_COMPLETO
            ws.cell(row=fila, column=4).border = _BORDE_COMPLETO
        ws.row_dimensions[fila].height = 22
        fila += 1
    return fila


def _analitos_del_documento(datos: dict, analitos: list[dict] | None) -> list[dict]:
    laboratorio = datos.get("laboratorio")
    configurados = [
        a for a in (analitos or [])
        if a.get("laboratorio") == laboratorio and a.get("activo", True)
    ]
    configurados.sort(key=lambda a: (a.get("categoria", ""), a.get("orden", 0), a.get("nombre", "")))

    # Una solicitud histórica puede contener un código retirado. Se conserva
    # al final para que nunca se pierda del documento lo que realmente pidió.
    codigos_configurados = {str(a.get("codigo") or "") for a in configurados}
    for codigo in datos.get("analitos_solicitados") or []:
        if codigo not in codigos_configurados:
            configurados.append({"codigo": codigo, "nombre": codigo, "unidad": "", "categoria": ""})
    return configurados


def construir_workbook(datos: dict, analitos: list[dict] | None = None) -> Workbook:
    wb = Workbook()
    ws = wb.active
    ws.title = "Solicitud"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 31
    ws.column_dimensions["C"].width = 24
    ws.column_dimensions["D"].width = 31

    fila = 1
    ws.merge_cells(start_row=fila, start_column=1, end_row=fila, end_column=4)
    titulo = ws.cell(row=fila, column=1, value=f"SOLICITUD DE ANÁLISIS - {datos.get('numero_solicitud', '')}")
    titulo.font = Font(bold=True, size=15, color=VERDE_OSCURO)
    titulo.fill = PatternFill("solid", fgColor=VERDE_CLARO)
    titulo.alignment = Alignment(vertical="center")
    ws.row_dimensions[fila].height = 32
    fila += 1
    ws.merge_cells(start_row=fila, start_column=1, end_row=fila, end_column=4)
    subtitulo = ws.cell(row=fila, column=1, value=f"Laboratorio {datos.get('laboratorio', '')} · AgroFresh Chile")
    subtitulo.font = Font(size=10, color=GRIS_TEXTO)
    subtitulo.alignment = Alignment(vertical="center")
    fila += 2

    fila = _titulo_seccion(ws, fila, "Detalle de la solicitud")
    pares_generales = [
        (etiqueta, _valor_visible(clave, datos.get(clave)))
        for clave, etiqueta in CAMPOS_GENERALES_ETIQUETAS
    ]
    fila = _escribir_pares(ws, fila, pares_generales)
    fila += 1

    campos_lab: dict = datos.get("campos_laboratorio") or {}
    fila = _titulo_seccion(ws, fila, "Detalle del análisis")
    pares_laboratorio = [
        (str(etiqueta), _valor_visible(str(etiqueta), valor))
        for etiqueta, valor in campos_lab.items()
    ] or [("Campos adicionales", "—")]
    fila = _escribir_pares(ws, fila, pares_laboratorio)
    fila += 1

    fila = _titulo_seccion(ws, fila, "Analitos solicitados")
    encabezados = ("CÓDIGO", "ANALITO", "UNIDAD", "SOLICITADO")
    for col, etiqueta in enumerate(encabezados, start=1):
        celda = ws.cell(row=fila, column=col, value=etiqueta)
        celda.font = Font(bold=True, size=9.5, color="FFFFFF")
        celda.fill = PatternFill("solid", fgColor=VERDE_MEDIO)
        celda.border = _BORDE_COMPLETO
        celda.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[fila].height = 23
    fila += 1

    solicitados = {str(codigo) for codigo in (datos.get("analitos_solicitados") or [])}
    lista_analitos = _analitos_del_documento(datos, analitos)
    if not lista_analitos:
        lista_analitos = [{"codigo": "—", "nombre": "Sin analitos configurados", "unidad": ""}]
    for indice, analito in enumerate(lista_analitos):
        codigo = str(analito.get("codigo") or "")
        valores = [
            codigo or "—",
            analito.get("nombre") or codigo or "—",
            analito.get("unidad") or "—",
            "✓" if codigo in solicitados else "",
        ]
        for col, valor in enumerate(valores, start=1):
            celda = ws.cell(row=fila, column=col, value=valor)
            celda.border = _BORDE_COMPLETO
            celda.font = Font(size=10, bold=(col == 4 and bool(valor)), color=(VERDE_OSCURO if col == 4 else "000000"))
            celda.alignment = Alignment(horizontal="center" if col in (1, 3, 4) else "left", vertical="center")
            if indice % 2:
                celda.fill = PatternFill("solid", fgColor=GRIS_FILA)
        ws.row_dimensions[fila].height = 21
        fila += 1
    fila += 1

    fila = _titulo_seccion(ws, fila, "Observaciones")
    ws.merge_cells(start_row=fila, start_column=1, end_row=fila + 2, end_column=4)
    obs = ws.cell(row=fila, column=1, value=datos.get("observaciones") or datos.get("observacion") or "—")
    obs.alignment = Alignment(wrap_text=True, vertical="top")
    obs.font = Font(size=10)
    obs.border = _BORDE_COMPLETO
    ws.row_dimensions[fila].height = 24

    ws.freeze_panes = "A5"
    ws.auto_filter.ref = f"A{fila - len(lista_analitos) - 2}:D{fila - 2}"
    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.sheet_view.zoomScale = 90
    ws.print_area = f"A1:D{fila + 2}"
    ws.oddFooter.center.text = "AgroFresh Report Hub"
    ws.oddFooter.right.text = "Página &P de &N"

    # Hoja oculta con el JSON completo de la solicitud -permite reconstruir
    # la solicitud (listar/ver/eliminar) sin parsear la hoja visible.
    ws_datos = wb.create_sheet("_data")
    ws_datos.sheet_state = "hidden"
    ws_datos["A1"] = json.dumps(datos, ensure_ascii=False)

    return wb


def _etiqueta_analito(analito: dict) -> str:
    return f"{analito['nombre']} ({analito['unidad']})" if analito.get("unidad") else analito["nombre"]


def construir_workbook_exportacion(solicitudes: list[dict], analitos: list[dict]) -> Workbook:
    """Une todas las solicitudes en un único Excel "ancho": una fila por
    solicitud, columnas = datos generales + datos de muestra + una columna
    por cada analito activo configurado (unión por código -así QUITECA y
    AGROFRESH, que comparten los mismos códigos, comparten también las
    mismas columnas de análisis-). Refleja la estructura configurada
    actual, no una lista fija hardcodeada."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Solicitudes"

    # Columnas de analitos: unión por código, ordenadas por categoría/orden;
    # el primer analito visto con ese código fija el nombre/unidad mostrados.
    vistos: dict[str, dict] = {}
    for a in sorted((x for x in analitos if x.get("activo", True)), key=lambda x: (x["laboratorio"], x.get("categoria", ""), x["orden"])):
        if a["codigo"] not in vistos:
            vistos[a["codigo"]] = a
    columnas_analito = list(vistos.values())

    encabezados = [etiqueta for _, etiqueta in CAMPOS_GENERALES_ETIQUETAS] + [
        f"{_etiqueta_analito(a)} [{a['codigo']}]" for a in columnas_analito
    ]

    FUENTE_HEADER = Font(bold=True, size=10, color="FFFFFF")
    RELLENO_HEADER = PatternFill("solid", fgColor=VERDE_OSCURO)
    for col_idx, etiqueta in enumerate(encabezados, start=1):
        c = ws.cell(row=1, column=col_idx, value=etiqueta)
        c.font = FUENTE_HEADER
        c.fill = RELLENO_HEADER
        c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 32

    for fila_idx, datos in enumerate(solicitudes, start=2):
        campos_lab: dict = datos.get("campos_laboratorio") or {}
        for col_idx, (clave, _) in enumerate(CAMPOS_GENERALES_ETIQUETAS, start=1):
            valor = datos.get(clave)
            ws.cell(row=fila_idx, column=col_idx, value=valor if valor not in (None, "") else None)
        for offset, a in enumerate(columnas_analito):
            etiqueta = _etiqueta_analito(a)
            valor = campos_lab.get(etiqueta)
            ws.cell(row=fila_idx, column=len(CAMPOS_GENERALES_ETIQUETAS) + 1 + offset, value=valor or None)

    total_columnas = len(encabezados)
    ws.freeze_panes = "A2"
    if ws.max_row >= 1 and total_columnas >= 1:
        ws.auto_filter.ref = f"A1:{ws.cell(row=1, column=total_columnas).coordinate}"
    for col_idx in range(1, total_columnas + 1):
        letra = ws.cell(row=1, column=col_idx).column_letter
        ws.column_dimensions[letra].width = 16 if col_idx <= len(CAMPOS_GENERALES_ETIQUETAS) else 14

    return wb


def leer_datos_workbook(ruta_o_buffer) -> dict:
    wb = load_workbook(ruta_o_buffer, read_only=True, data_only=True)
    try:
        if "_data" not in wb.sheetnames:
            raise ValueError("El archivo Excel no contiene la hoja de datos de la solicitud (_data).")
        valor = wb["_data"]["A1"].value
    finally:
        wb.close()
    if not valor:
        raise ValueError("El archivo Excel no contiene los datos de la solicitud (_data).")
    return json.loads(valor)
