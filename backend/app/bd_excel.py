"""
Descarga de la BD de resultados (Report → Laboratorio) en Excel.

Mismo formato que la matriz de Solicitudes (`solicitud_excel.py`): dos filas de
encabezado -banda por laboratorio y nombre de columna- y UNA FILA POR
SOLICITUD. La diferencia es lo que hay en las columnas de analitos:

    Solicitudes   ✓ = se pidió ese analito           «FDL Dosis» = dosis anotada
    BD            el RESULTADO medido del analito    «FDL Dosis» = dosis aplicada

Las columnas se acotan a lo que hay en la descarga: un grupo o un analito que
no tiene ni un dato entre las filas descargadas no aparece. Así, si se filtra
por un laboratorio salen solo sus analitos, y si se filtra por un ingrediente
sale solo ese (más su dosis). Las columnas generales son siempre las mismas.

`construir_workbook_bd` es pura (sin base ni request): recibe las filas ya
armadas, para poder probarla sola. La consulta vive en `reportes.py`.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

from .solicitud_excel import (
    _BORDE_COMPLETO,
    VERDE_CLARO,
    VERDE_OSCURO,
    _grupos_exportacion,
)

# Columnas generales de la BD: las de Solicitudes que la base guarda, más las
# que solo existen en la base (N° Informe, semana, mes, temporada, servicio).
# (clave en la fila, encabezado)
GENERALES_BD: list[tuple[str, str]] = [
    ("nro_informe", "N° Informe"),
    ("nro_solicitud", "N° Solicitud"),
    ("fecha_solicitud", "Fecha Solicitud"),
    ("fecha_muestreo", "Fecha Muestreo"),
    ("fecha_entrada", "Fecha Entrada"),
    ("fecha_informe", "Fecha Informe"),
    ("fecha_analisis", "Fecha Análisis"),
    ("hora_muestreo", "Hora Muestreo"),
    ("semana", "Semana"),
    ("mes", "Mes"),
    ("temporada", "Temporada"),
    ("laboratorio", "Laboratorio"),
    ("tipo_servicio", "Tipo de Servicio"),
    ("solicitante", "Solicitante"),
    ("sold_to", "Sold To"),
    ("ship_to", "Ship To"),
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
    ("nombre_muestreador", "Nombre Muestreador"),
    ("generado_por", "Generado Por"),
    ("email_solicitante", "Email Solicitante"),
    ("email_laboratorio", "Email Laboratorio"),
    ("observacion", "Observación"),
]

# La ingesta guarda algunos analitos con un código y el catálogo de Toma de
# muestras usa otro para el MISMO analito (mapeo.py vs ANALITOS_DEFECTO). Sin
# esta tabla, el resultado de "E. Coli" caería en «Otros» en vez de en su
# columna de siempre.
ALIAS_CODIGO: dict[str, str] = {
    "ECOLI": "ECOLI100",
    "COLT": "COLIF100",
    "HONG": "HONGOS",
    "COLA": "COLIFG",
    "ECOLA": "ECOLIG",
    "ENTB": "ENTERO",
    "CEN": "CENIZAS",
    "AFLA": "AFLAT",
}

TITULO_FUNGICIDAS_BASE = "ANÁLISIS DE RESIDUOS DE FUNGICIDAS"
_PREFIJO_FUNGICIDAS = "QUITECA / AGROFRESH"


def titulo_fungicidas(laboratorios: set[str]) -> str:
    """Banda del grupo de fungicidas según los laboratorios que hay en la
    descarga: si solo está Quiteca, dice Quiteca; si están los dos, los dos.
    (En Solicitudes la banda es fija porque ahí el formato es el mismo para todos.)"""
    presentes = [nombre for nombre in ("QUITECA", "AGROFRESH") if nombre in laboratorios]
    rotulo = " / ".join(presentes) if presentes else _PREFIJO_FUNGICIDAS
    return f"{rotulo} — {TITULO_FUNGICIDAS_BASE}"


def _laboratorios_de(valor: Any) -> set[str]:
    """{'QUITECA', 'AGROFRESH'} que menciona el nombre de laboratorio de una fila
    («Quiteca», «AGROFRESH», «Quiteca / AgroFresh»...)."""
    texto = str(valor or "").casefold()
    return {n for n in ("QUITECA", "AGROFRESH") if n.casefold() in texto}


TITULO_OTROS = "OTROS ANALITOS (sin columna propia en el formato)"
# Estas columnas del formato de Solicitudes no tienen dato en la base o se
# reemplazan por «Otros»: no se muestran.
_CAMPOS_OMITIDOS = {
    "Gasto",
    "Analito Pesticida 1", "Resultado Pesticida 1",
    "Analito Pesticida 2", "Resultado Pesticida 2",
    "Analito Pesticida 3", "Resultado Pesticida 3",
}

Columna = tuple[str, str, str]  # (tipo, clave, encabezado)


def codigo_de_formato(codigo: str | None) -> str:
    """El código con el que el formato de Solicitudes conoce a este analito."""
    c = (codigo or "").strip()
    return ALIAS_CODIGO.get(c.upper(), c)


def _valor_celda(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, (date, int, float, str)) or v is None:
        return v if v != "" else None
    return str(v)  # Decimal y demás: openpyxl no los escribe


def _numero(v: Any) -> Any:
    """Decimal/str numérico -> número; lo que no lo es queda como texto."""
    if v is None or isinstance(v, (int, float)):
        return v
    try:
        return float(v)
    except (TypeError, ValueError):
        return str(v)


def columnas_de_bd(
    filas: list[dict[str, Any]],
    analitos: list[dict],
    ingredientes: set[str] | None = None,
) -> list[tuple[str, list[Columna]]]:
    """Grupos de columnas de la descarga, ya acotados a lo que tiene datos.

    `ingredientes`: si viene, solo esos analitos (por el código con el que están
    en la base); `None` = todos los que aparezcan.
    """
    permitidos = {codigo_de_formato(i) for i in ingredientes} if ingredientes else None
    con_resultado: dict[str, str] = {}   # código de formato -> nombre (por si cae en «Otros»)
    con_dosis: set[str] = set()
    hay_tipo_aplicacion = False
    for fila in filas:
        for codigo, res in (fila.get("resultados") or {}).items():
            cod = codigo_de_formato(codigo)
            if permitidos is not None and cod not in permitidos:
                continue
            con_resultado.setdefault(cod, res.get("nombre") or codigo)
        for codigo in fila.get("dosis") or {}:
            cod = codigo_de_formato(codigo)
            if permitidos is None or cod in permitidos:
                con_dosis.add(cod)
        if fila.get("tipo_aplicacion"):
            hay_tipo_aplicacion = True

    grupos: list[tuple[str, list[Columna]]] = [
        ("GENERAL", [("general", clave, etiqueta) for clave, etiqueta in GENERALES_BD])
    ]
    conocidos: set[str] = set()
    for titulo, columnas in _grupos_exportacion(analitos)[1:]:  # [0] es el GENERAL de Solicitudes
        elegidas: list[Columna] = []
        es_fungicidas = titulo.startswith(_PREFIJO_FUNGICIDAS)
        for tipo, clave, etiqueta in columnas:
            if tipo == "analito":
                conocidos.add(clave)
                if clave in con_resultado:
                    elegidas.append((tipo, clave, etiqueta))
            elif tipo == "analito_dosis":
                if clave in con_dosis:
                    elegidas.append((tipo, clave, etiqueta))
            elif tipo == "campo" and etiqueta not in _CAMPOS_OMITIDOS:
                if etiqueta == "Tipo Aplicación" and hay_tipo_aplicacion:
                    elegidas.append(("tipo_aplicacion", clave, etiqueta))
        if elegidas and es_fungicidas:
            codigos = {clave for _, clave, _ in elegidas}
            labs: set[str] = set()
            for fila in filas:
                tiene = any(codigo_de_formato(c) in codigos for c in list(fila.get("resultados") or {}) + list(fila.get("dosis") or {}))
                if tiene:
                    labs |= _laboratorios_de(fila.get("laboratorio"))
            titulo = titulo_fungicidas(labs)
        if elegidas:
            grupos.append((titulo, elegidas))

    otros: list[Columna] = []
    for cod in sorted(set(con_resultado) - conocidos):
        otros.append(("analito", cod, con_resultado[cod] if con_resultado[cod] == cod else f"{con_resultado[cod]} ({cod})"))
    for cod in sorted(con_dosis - conocidos):
        otros.append(("analito_dosis", cod, f"{cod} Dosis"))
    if otros:
        grupos.append((TITULO_OTROS, otros))
    return grupos


def construir_workbook_bd(
    filas: list[dict[str, Any]],
    analitos: list[dict],
    ingredientes: set[str] | None = None,
    nota_filtro: str | None = None,
) -> Workbook:
    """`filas`: una por solicitud, con las claves de GENERALES_BD y además
    `resultados` {código: {"valor": ..., "nombre": ...}}, `dosis` {código: valor}
    y `tipo_aplicacion`."""
    wb = Workbook()
    ws = wb.active
    ws.title = "BD"
    grupos = columnas_de_bd(filas, analitos, ingredientes)
    columnas = [c for _, grupo in grupos for c in grupo]

    inicio = 1
    for titulo, grupo in grupos:
        fin = inicio + len(grupo) - 1
        if fin > inicio:
            ws.merge_cells(start_row=1, start_column=inicio, end_row=1, end_column=fin)
        celda = ws.cell(row=1, column=inicio, value=titulo)
        celda.font = Font(bold=True, size=10, color=VERDE_OSCURO)
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        for col in range(inicio, fin + 1):
            ws.cell(row=1, column=col).fill = PatternFill("solid", fgColor=VERDE_CLARO)
            ws.cell(row=1, column=col).border = _BORDE_COMPLETO
        inicio = fin + 1

    for col, (_, _, etiqueta) in enumerate(columnas, start=1):
        c = ws.cell(row=2, column=col, value=etiqueta)
        c.font = Font(bold=True, size=9, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=VERDE_OSCURO)
        c.border = _BORDE_COMPLETO
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 28
    ws.row_dimensions[2].height = 36

    for fila_idx, fila in enumerate(filas, start=3):
        resultados = {codigo_de_formato(k): v for k, v in (fila.get("resultados") or {}).items()}
        dosis = {codigo_de_formato(k): v for k, v in (fila.get("dosis") or {}).items()}
        for col, (tipo, clave, _) in enumerate(columnas, start=1):
            if tipo == "general":
                valor = _valor_celda(fila.get(clave))
            elif tipo == "analito":
                valor = _numero((resultados.get(clave) or {}).get("valor"))
            elif tipo == "analito_dosis":
                valor = _numero(dosis.get(clave))
            else:  # tipo_aplicacion
                valor = fila.get("tipo_aplicacion")
            celda = ws.cell(row=fila_idx, column=col, value=valor if valor not in (None, "") else None)
            celda.border = _BORDE_COMPLETO
            es_dato = tipo in ("analito", "analito_dosis")
            celda.alignment = Alignment(horizontal="center" if es_dato else "left", vertical="center")
            if tipo == "analito" and valor is not None:
                celda.font = Font(bold=True, color=VERDE_OSCURO)
            if isinstance(valor, date):
                celda.number_format = "DD-MM-YYYY"
        ws.row_dimensions[fila_idx].height = 22

    ws.freeze_panes = "A3"
    ultima = max(2, 2 + len(filas))
    ws.auto_filter.ref = f"A2:{ws.cell(row=ultima, column=len(columnas)).coordinate}"
    ws.sheet_view.showGridLines = False
    for col in range(1, len(columnas) + 1):
        letra = ws.cell(row=2, column=col).column_letter
        etiqueta = str(ws.cell(row=2, column=col).value or "")
        ws.column_dimensions[letra].width = min(28, max(13, len(etiqueta) * 0.85))

    if nota_filtro:
        # Hoja aparte para que quien reciba el archivo sepa que NO es la BD completa.
        nota = wb.create_sheet("Filtros aplicados")
        nota["A1"] = "Esta descarga NO es la base de datos completa"
        nota["A1"].font = Font(bold=True, color="B45309", size=12)
        nota["A2"] = nota_filtro
        nota["A2"].alignment = Alignment(wrap_text=True, vertical="top")
        nota.column_dimensions["A"].width = 90
    return wb
