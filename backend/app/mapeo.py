"""
Funciones puras de transformación: texto de Excel -> valores listos para SQL.
Sin acceso a base de datos aquí (eso vive en ingest.py).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

# Columnas de dosis por analito (ver src/features/ingest/lib/sqlMap.ts en el frontend)
ANALITOS_DOSIS = {
    "FDL": "FDL_dosis",
    "IMZ": "IMZ_dosis",
    "PYR": "PYR_dosis",
    "TBZ": "TBZ_dosis",
    "AZOX": "AZOX_dosis",
    "TEBU": "TEBU_dosis",
}

# Columnas de resultado final por analito. Puede ser un solo nombre de columna
# o una tupla con varios: los 7 pesticidas de Quiteca/AgroFresh llegan como
# "FDL FINAL" etc. desde el Excel nativo, pero como "FDL ppm" etc. desde
# Converter (mismo analito, dos formatos de origen distintos).
ANALITOS_RESULTADO: dict[str, str | tuple[str, ...]] = {
    "FDL": ("FDL FINAL", "FDL ppm"),
    "IMZ": ("IMZ FINAL", "IMZ ppm"),
    "PYR": ("PYR FINAL", "PYR ppm"),
    "TBZ": ("TBZ FINAL", "TBZ ppm"),
    "AZOX": ("AZOXFINAL", "AZOX ppm"),
    "TEBU": ("TEBU FINAL", "TEBU ppm"),
    "DFN": "DFN FINAL",
    "DPA": ("DPA FINAL", "DPA ppm"),
    # Diagnofruit y ALS (Corthon): mismos nombres de columna que usa Converter,
    # así no hace falta traducirlos antes de subir (ver converter.html).
    "LEV": "Levaduras UFC/mL",
    "BOT": "Botrytis conidia/mL",
    "ALT": "Alternaria conidia/mL",
    "GEO": "Geotrichum esporas/mL",
    "PEN": "Penicillium conidia/mL",
    "ECOLI": "E. Coli UFC/100mL",
    "COLT": "Coliformes Totales UFC/100mL",
    "PB": "Plomo mg/kg",
    "HG": "Mercurio mg/kg",
    "AS": "Arsénico mg/kg",
    "CD": "Cadmio mg/kg",
    "AL": "Aluminio mg/kg",
    "HONG": "Hongos UFC/g",
    # "Levaduras UFC/g" (ALS, alimento) todavía no tiene su propio código en el
    # catálogo (solo existe "LEV" para Diagnofruit, que es UFC/mL de agua) —
    # queda con un código provisorio para que el dato no se pierda; se puede
    # crear el analito real desde "Gestionar analitos" y corregirlo después.
    "LEVG": "Levaduras UFC/g",
    "COLA": "Coliformes Totales UFC/g",
    "ECOLA": "Escherichia coli UFC/g",
    "ENTB": "Recuento Enterobacterias UFC/g",
    "SALM": "Salmonella 25g (P/A)",
    "CEN": "Cenizas Insolubles en Ácido (%)",
    "AFLA": "Aflatoxinas Totales B1+B2+G1+G2 (µg/kg)",
}

LABORATORIO_CATALOGO = "Quiteca / AgroFresh"


def valor_columna(fila: dict[str, Any], col: str) -> Any:
    """Valor de una columna, tolerando espacios de más en el nombre buscado.

    Los encabezados del archivo ya llegan sin espacios sobrantes -el lector
    les hace trim-, así que un nombre con espacio al final acá nunca calzaría
    y el dato entraría vacío sin que nadie se entere. Pasó exactamente eso con
    "Temporada ", que nunca llegó a la base.
    """
    if col in fila:
        return fila[col]
    return fila.get(col.strip())


def texto(fila: dict[str, Any], col: str) -> str | None:
    v = valor_columna(fila, col)
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def parse_numero(valor: Any) -> float | None:
    """Coma o punto decimal, igual que el resto del sistema. None si no se puede convertir."""
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    s = str(valor).strip()
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif s.count(",") == 1:
        s = s.replace(",", ".")
    elif s.count(",") > 1:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_entero_corto(valor: Any) -> int | None:
    n = parse_numero(valor)
    if n is None:
        return None
    return int(round(n))


def parse_fecha(valor: Any) -> str | None:
    """Fecha del Excel como YYYY-MM-DD, venga en la forma que venga.

    No se puede asumir que el frontend ya la normalizó: cuando una celda de
    fecha llega como objeto Date, se serializa a JSON como ISO completo
    ("2026-01-03T00:00:00.000Z") y una validación de solo diez caracteres la
    descarta entera. Eso dejaba TODAS las fechas en nulo sin ningún error, y
    el reporte terminaba agrupando cada muestra bajo "Sin fecha".

    Se aceptan las tres formas en que un Excel entrega una fecha: ya
    normalizada, ISO completo, y el número de serie de Excel.
    """
    if valor is None or valor == "":
        return None

    if isinstance(valor, datetime):
        return valor.date().isoformat()
    if isinstance(valor, date):
        return valor.isoformat()

    # Número de serie de Excel: días desde el 30-12-1899 (el 1900 bisiesto
    # que Excel inventó ya está considerado en esa fecha base).
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        if 1 <= valor <= 2958465:
            return (date(1899, 12, 30) + timedelta(days=int(valor))).isoformat()
        return None

    s = str(valor).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    # ISO con hora, con o sin zona: "2026-01-03T00:00:00.000Z".
    m = re.match(r"^(\d{4}-\d{2}-\d{2})[T ]", s)
    if m:
        try:
            date.fromisoformat(m.group(1))
        except ValueError:
            return None
        return m.group(1)
    return None


def calcular_semana(fecha_iso: str | None) -> int | None:
    """Replica NUM.DE.SEMANA de Excel (sistema 1, el que usa por defecto sin
    segundo argumento): semanas de domingo a sábado, semana 1 = la que
    contiene el 1 de enero. La columna 'SEMANA' del Excel no es confiable
    (viene con valores fijos tipo '2' para filas de meses distintos), así que
    la semana se calcula siempre a partir de la fecha de entrada real."""
    if not fecha_iso:
        return None
    fecha = date.fromisoformat(fecha_iso)
    enero1 = date(fecha.year, 1, 1)
    dow_enero1 = (enero1.weekday() + 1) % 7 + 1  # Python lun=0..dom=6 -> Excel dom=1..sáb=7
    offset = (fecha - enero1).days
    return (offset + dow_enero1) // 7 + 1


def calcular_mes(fecha_iso: str | None) -> int | None:
    if not fecha_iso:
        return None
    return date.fromisoformat(fecha_iso).month


def valor_resultado(valor: Any) -> tuple[float | None, str | None]:
    """Un resultado final puede ser número, 'ND', o texto libre (<L.C, etc.)."""
    if valor is None:
        return None, None
    s = str(valor).strip()
    if not s:
        return None, None
    n = parse_numero(s)
    if n is not None:
        return n, None
    return None, s


def elegir(*valores: str | None) -> str | None:
    """Primer valor no vacío."""
    for v in valores:
        if v:
            return v
    return None


def concatenar(*valores: str | None, separador: str = " / ") -> str | None:
    partes = [v for v in valores if v]
    if not partes:
        return None
    # si son iguales, no duplicar
    unicos = list(dict.fromkeys(partes))
    return separador.join(unicos)


def mapear_solicitud(fila: dict[str, Any]) -> dict[str, Any]:
    """Construye el dict de la fila `solicitud`, sin resolver aún cliente_id/planta_id."""
    fecha_entrada = parse_fecha(fila.get("Fecha entrada"))
    return {
        "nro_solicitud": texto(fila, "Informe"),
        "laboratorio": texto(fila, "Laboratorio"),
        "fecha_solicitud": parse_fecha(fila.get("Fecha \nSolicitud")),
        "fecha_muestreo": parse_fecha(fila.get("Fecha de muestreo")),
        "fecha_entrada": fecha_entrada,
        "fecha_analisis": parse_fecha(fila.get("Fecha análisis")),
        # La base real exporta "SOLD TO" / "SHIP TO"; "Cliente" / "Sucursal" se
        # dejan como alias por si algún Excel viene con esos encabezados en vez.
        "sold_to_raw": elegir(texto(fila, "SOLD TO"), texto(fila, "Cliente")),
        "ship_to_raw": elegir(texto(fila, "SHIP TO"), texto(fila, "Sucursal")),
        # "CROP" es el nombre real del Excel de Quiteca/AgroFresh; "Especie" es el
        # nombre que usa Converter para Diagnofruit/ALS.
        "especie": elegir(texto(fila, "CROP"), texto(fila, "Especie")),
        "variedad": texto(fila, "Variedad"),
        "tipo_servicio": texto(fila, "Tipo de servicio"),
        "lote": texto(fila, "Lote"),
        "nro_camara": texto(fila, "Cámara"),
        "nro_linea": texto(fila, "Línea"),
        "posicion_muestreo": texto(fila, "Posición"),
        "kg_procesados": parse_numero(fila.get("Kg \nprocesados")),
        "csg": texto(fila, "Cód. Productor (CSG)"),
        "solicitante": texto(fila, "Asesor \nde servicio"),
        "nombre_muestreador": texto(fila, "Nombre del responsable"),
        "nro_orden": elegir(texto(fila, "orden"), texto(fila, "Codigo interno\ndel cliente")),
        "referencia": texto(fila, "Reference/s"),
        "referencia_proceso": texto(fila, "Referencia reporte proceso+O:T"),
        "observacion": texto(fila, "Observaciones"),
        "observacion_2": concatenar(texto(fila, "Dosis"), texto(fila, "Observación adicional")),
        "temporada": parse_entero_corto(valor_columna(fila, "Temporada")),
        "semana_entrada": parse_entero_corto(fila.get("Semana entrada")),
        # No se usa la columna "SEMANA" del Excel (no es confiable): se calcula
        # a partir de la fecha de entrada, igual que =NUM.DE.SEMANA([Fecha entrada]).
        "semana_muestreo": calcular_semana(fecha_entrada),
        # La columna "MES" del Excel nativo se respeta si viene; Converter (Quiteca,
        # Diagnofruit, ALS) no la entrega, así que ahí se calcula desde fecha_entrada
        # igual que semana_muestreo.
        "mes": parse_entero_corto(fila.get("MES")) or calcular_mes(fecha_entrada),
    }


def mapear_productos_aplicados(fila: dict[str, Any]) -> list[dict[str, Any]]:
    """Una fila por analito que tenga dosis (por la restricción UNIQUE(solicitud_id, analito_id))."""
    tipo_aplicacion = texto(fila, "TIPO APP")
    producto_raw = texto(fila, "APP")
    linea_proceso = concatenar(texto(fila, "Tratamiento"), texto(fila, "Línea de \nProceso"))

    productos = []
    for codigo, col_dosis in ANALITOS_DOSIS.items():
        dosis = parse_numero(fila.get(col_dosis))
        if dosis is None:
            continue
        productos.append(
            {
                "analito_codigo": codigo,
                "dosis": dosis,
                "tipo_aplicacion": tipo_aplicacion,
                "producto_raw": producto_raw,
                "linea_proceso": linea_proceso,
            }
        )

    # Converter (Quiteca) no trae dosis por analito, solo un tratamiento general
    # para todo el informe (ej. "FOGGER"): sin esto, tipo_aplicacion se perdía
    # siempre en los datos que suben desde Converter. Se replica para cada
    # analito que sí tenga resultado, igual que hace mapear_resultados().
    if not productos and (tipo_aplicacion or linea_proceso):
        for r in mapear_resultados(fila):
            productos.append(
                {
                    "analito_codigo": r["analito_codigo"],
                    "dosis": None,
                    "tipo_aplicacion": tipo_aplicacion,
                    "producto_raw": producto_raw,
                    "linea_proceso": linea_proceso,
                }
            )
    return productos


def mapear_resultados(fila: dict[str, Any]) -> list[dict[str, Any]]:
    resultados = []
    for codigo, columnas in ANALITOS_RESULTADO.items():
        cols = (columnas,) if isinstance(columnas, str) else columnas
        col = next((c for c in cols if c in fila), None)
        if col is None:
            continue
        valor_num, valor_texto = valor_resultado(fila.get(col))
        if valor_num is None and valor_texto is None:
            continue
        resultados.append({"analito_codigo": codigo, "valor_num": valor_num, "valor_texto": valor_texto})
    return resultados
