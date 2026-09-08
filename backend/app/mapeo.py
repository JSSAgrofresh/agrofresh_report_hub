"""
Funciones puras de transformación: texto de Excel -> valores listos para SQL.
Sin acceso a base de datos aquí (eso vive en ingest.py).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

# Columnas de dosis por analito (ver src/features/ingest/lib/sqlMap.ts en el frontend).
# El Excel nativo antiguo usa "FDL_dosis" (guion bajo); la plantilla nueva de
# Cargar Datos (69 columnas) usa "FDL Dosis" (con espacio) y además trae DPA,
# que el formato antiguo no traía como dosis.
ANALITOS_DOSIS: dict[str, str | tuple[str, ...]] = {
    "FDL": ("FDL_dosis", "FDL Dosis"),
    "IMZ": ("IMZ_dosis", "IMZ Dosis"),
    "PYR": ("PYR_dosis", "PYR Dosis"),
    "TBZ": ("TBZ_dosis", "TBZ Dosis"),
    "AZOX": ("AZOX_dosis", "AZOX Dosis"),
    "TEBU": ("TEBU_dosis", "TEBU Dosis"),
    "DPA": "DPA Dosis",
}

# En la plantilla nueva, cada uno de estos 7 pesticidas trae además una
# columna con su propio nombre ("FDL", "IMZ", ...) que es el RESULTADO de
# residuo de ese pesticida (ver ANALITOS_RESULTADO más abajo) -"...Dosis" es
# la dosis aplicada, la columna sin sufijo es el resultado de laboratorio-.
# Acá se usa además como marca de "hubo actividad con este producto" para
# decidir si corresponde crear la fila de producto_aplicado: un resultado de
# residuo real implica que el producto se aplicó, así que sirve igual de bien
# que un casillero dedicado. El Excel nativo antiguo nunca tuvo una columna
# con ese nombre exacto (tenía "FDL_dosis" y "FDL FINAL"), así que no hay
# riesgo de colisión entre formatos.
ANALITOS_APLICADO_MARCA = {codigo: codigo for codigo in ANALITOS_DOSIS}

# Columnas de resultado final por analito. Puede ser un solo nombre de columna
# o una tupla con varios: los 7 pesticidas de Quiteca/AgroFresh llegan como
# "FDL FINAL" etc. desde el Excel nativo, como "FDL ppm" etc. desde Converter,
# y como "FDL" etc. (sin sufijo) desde la plantilla nueva de 69 columnas -ver
# el comentario de ANALITOS_APLICADO_MARCA-. DFN no tiene columna de dosis ni
# de "aplicado" en la plantilla nueva (no es uno de los 7 fijos): su resultado
# solo puede entrar por los 3 casilleros libres de Analito/Resultado Pesticida.
ANALITOS_RESULTADO: dict[str, str | tuple[str, ...]] = {
    "FDL": ("FDL FINAL", "FDL ppm", "FDL"),
    "IMZ": ("IMZ FINAL", "IMZ ppm", "IMZ"),
    "PYR": ("PYR FINAL", "PYR ppm", "PYR"),
    "TBZ": ("TBZ FINAL", "TBZ ppm", "TBZ"),
    "AZOX": ("AZOXFINAL", "AZOX ppm", "AZOX"),
    "TEBU": ("TEBU FINAL", "TEBU ppm", "TEBU"),
    "DFN": "DFN FINAL",
    "DPA": ("DPA FINAL", "DPA ppm", "DPA"),
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
    """Construye el dict de la fila `solicitud`, sin resolver aún cliente_id/planta_id.

    Reconoce dos formatos de encabezado por campo: el del Excel nativo
    histórico (Quiteca/AgroFresh, con guiones bajos y saltos de línea) y el de
    la plantilla nueva de Cargar Datos (69 columnas, ver
    backend/app/estructura_excel.py) -ambos conviven porque Converter y
    archivos antiguos siguen usando el primero-.
    """
    fecha_entrada = parse_fecha(fila.get("Fecha entrada"))
    fecha_muestreo = elegir(parse_fecha(fila.get("Fecha de muestreo")), parse_fecha(fila.get("Fecha Muestreo")))
    return {
        "nro_solicitud": elegir(texto(fila, "Informe"), texto(fila, "N° Informe")),
        "laboratorio": texto(fila, "Laboratorio"),
        "fecha_solicitud": elegir(parse_fecha(fila.get("Fecha \nSolicitud")), parse_fecha(fila.get("Fecha Solicitud"))),
        "fecha_muestreo": fecha_muestreo,
        "fecha_entrada": fecha_entrada or fecha_muestreo,
        "fecha_analisis": elegir(parse_fecha(fila.get("Fecha análisis")), parse_fecha(fila.get("Fecha Análisis"))),
        "fecha_informe": parse_fecha(fila.get("Fecha Informe")),
        "hora_muestreo": texto(fila, "Hora Muestreo"),
        # La base real exporta "SOLD TO" / "SHIP TO"; "Cliente" / "Sucursal" y
        # "Sold To" / "Ship To" (plantilla nueva) se dejan como alias.
        "sold_to_raw": elegir(texto(fila, "SOLD TO"), texto(fila, "Cliente"), texto(fila, "Sold To")),
        "ship_to_raw": elegir(texto(fila, "SHIP TO"), texto(fila, "Sucursal"), texto(fila, "Ship To")),
        # "CROP" es el nombre real del Excel de Quiteca/AgroFresh; "Especie" es el
        # nombre que usa Converter y la plantilla nueva de Cargar Datos.
        "especie": elegir(texto(fila, "CROP"), texto(fila, "Especie")),
        "variedad": texto(fila, "Variedad"),
        "tipo_servicio": texto(fila, "Tipo de servicio"),
        "tipo_muestra": texto(fila, "Tipo Muestra"),
        "lote": texto(fila, "Lote"),
        "nro_camara": elegir(texto(fila, "Cámara"), texto(fila, "N° Cámara")),
        "nro_linea": elegir(texto(fila, "Línea"), texto(fila, "Línea Proceso")),
        "posicion_muestreo": elegir(texto(fila, "Posición"), texto(fila, "Posición Muestreo")),
        "kg_procesados": elegir(parse_numero(fila.get("Kg \nprocesados")), parse_numero(fila.get("Kilos Procesados (KG)"))),
        "csg": elegir(texto(fila, "Cód. Productor (CSG)"), texto(fila, "CSG")),
        "solicitante": elegir(texto(fila, "Asesor \nde servicio"), texto(fila, "Solicitante")),
        "nombre_muestreador": elegir(texto(fila, "Nombre del responsable"), texto(fila, "Nombre Muestreador")),
        "nro_orden": elegir(texto(fila, "orden"), texto(fila, "Codigo interno\ndel cliente"), texto(fila, "N° Orden")),
        # "N° Solicitud" (ej. "OT-AGF0025") es el folio interno del laboratorio,
        # distinto del N° Informe -que es la clave real, ver estructura_excel.py-;
        # se guarda como referencia libre, igual que "Reference/s" del formato viejo.
        "referencia": elegir(texto(fila, "Reference/s"), texto(fila, "N° Solicitud")),
        "referencia_proceso": texto(fila, "Referencia reporte proceso+O:T"),
        "producto_utilizado": texto(fila, "Producto Utilizado"),
        "generado_por": texto(fila, "Generado Por"),
        "email_solicitante": texto(fila, "Email Solicitante"),
        "email_laboratorio": texto(fila, "Email Laboratorio"),
        "observacion": elegir(texto(fila, "Observaciones"), texto(fila, "Observación")),
        "observacion_2": concatenar(texto(fila, "Dosis"), texto(fila, "Observación adicional")),
        "temporada": parse_entero_corto(valor_columna(fila, "Temporada")),
        "semana_entrada": parse_entero_corto(fila.get("Semana entrada")),
        # No se usa la columna "SEMANA" del Excel (no es confiable): se calcula
        # a partir de la fecha de entrada, igual que =NUM.DE.SEMANA([Fecha entrada]).
        "semana_muestreo": calcular_semana(fecha_entrada or fecha_muestreo),
        # La columna "MES" del Excel nativo se respeta si viene; Converter (Quiteca,
        # Diagnofruit, ALS) y la plantilla nueva no la entregan, así que ahí se
        # calcula desde fecha_entrada igual que semana_muestreo.
        "mes": parse_entero_corto(fila.get("MES")) or calcular_mes(fecha_entrada or fecha_muestreo),
    }


def mapear_productos_aplicados(fila: dict[str, Any]) -> list[dict[str, Any]]:
    """Una fila por analito que tenga dosis o que venga marcado como aplicado
    (por la restricción UNIQUE(solicitud_id, analito_id))."""
    tipo_aplicacion = elegir(texto(fila, "TIPO APP"), texto(fila, "Tipo Aplicación"))
    producto_raw = elegir(texto(fila, "APP"), texto(fila, "Producto Utilizado"))
    # "Línea de Proceso" (sin salto de línea) es el mismo campo -tipo de lavado,
    # ej. "Agua"/"Cera"- que "Línea de \nProceso" del Excel nativo, solo que sin
    # el salto de línea que trae ese encabezado en el archivo original. No
    # confundir con "Línea Proceso" (col. 14 de la plantilla nueva), que es el
    # NÚMERO de línea -ver "nro_linea" en mapear_solicitud-, un campo distinto.
    linea_proceso = concatenar(
        texto(fila, "Tratamiento"), texto(fila, "Línea de \nProceso"), texto(fila, "Línea de Proceso")
    )
    gasto = parse_numero(fila.get("Gasto"))

    productos = []
    for codigo, col_dosis in ANALITOS_DOSIS.items():
        cols = (col_dosis,) if isinstance(col_dosis, str) else col_dosis
        col = next((c for c in cols if c in fila), None)
        dosis = parse_numero(fila.get(col)) if col else None
        # La plantilla nueva marca "se aplicó este producto" con una columna
        # propia (ej. "FDL" = "✓"), separada de la dosis: una fila puede estar
        # marcada como aplicada sin traer dosis numérica todavía.
        marcador = ANALITOS_APLICADO_MARCA.get(codigo)
        aplicado = bool(texto(fila, marcador)) if marcador else False
        if dosis is None and not aplicado:
            continue
        productos.append(
            {
                "analito_codigo": codigo,
                "dosis": dosis,
                "tipo_aplicacion": tipo_aplicacion,
                "producto_raw": producto_raw,
                "linea_proceso": linea_proceso,
                "gasto": gasto,
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
                    "gasto": gasto,
                }
            )
    return productos


# Cuántos pares "Analito Pesticida N" / "Resultado Pesticida N" trae la
# plantilla nueva -pesticidas fuera de los 7 fijos (FDL/IMZ/PYR/TEBU/AZOX/
# TBZ/DPA) que ya tienen columna propia-. El código del analito viene como
# texto libre en la celda, no como nombre de columna.
_PESTICIDAS_LIBRES = 3


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

    for i in range(1, _PESTICIDAS_LIBRES + 1):
        analito_libre = texto(fila, f"Analito Pesticida {i}")
        if not analito_libre:
            continue
        valor_num, valor_texto = valor_resultado(fila.get(f"Resultado Pesticida {i}"))
        if valor_num is None and valor_texto is None:
            continue
        resultados.append({"analito_codigo": analito_libre, "valor_num": valor_num, "valor_texto": valor_texto})

    return resultados
