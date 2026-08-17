"""
Funciones puras de transformación: texto de Excel -> valores listos para SQL.
Sin acceso a base de datos aquí (eso vive en ingest.py).
"""
from __future__ import annotations

import re
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

# Columnas de resultado final por analito
ANALITOS_RESULTADO = {
    "FDL": "FDL FINAL",
    "IMZ": "IMZ FINAL",
    "PYR": "PYR FINAL",
    "TBZ": "TBZ FINAL",
    "AZOX": "AZOXFINAL",
    "TEBU": "TEBU FINAL",
    "DFN": "DFN FINAL",
    "DPA": "DPA FINAL",
}

LABORATORIO_CATALOGO = "Quiteca / AgroFresh"


def texto(fila: dict[str, Any], col: str) -> str | None:
    v = fila.get(col)
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
    """Ya viene homogenizada como YYYY-MM-DD desde el frontend; solo valida el formato."""
    if not valor:
        return None
    s = str(valor).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    return None


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
    return {
        "nro_solicitud": texto(fila, "Informe"),
        "laboratorio": texto(fila, "Laboratorio"),
        "fecha_solicitud": parse_fecha(fila.get("Fecha \nSolicitud")),
        "fecha_muestreo": parse_fecha(fila.get("Fecha de muestreo")),
        "fecha_entrada": parse_fecha(fila.get("Fecha entrada")),
        "fecha_analisis": parse_fecha(fila.get("Fecha análisis")),
        # La base real exporta "SOLD TO" / "SHIP TO"; "Cliente" / "Sucursal" se
        # dejan como alias por si algún Excel viene con esos encabezados en vez.
        "sold_to_raw": elegir(texto(fila, "SOLD TO"), texto(fila, "Cliente")),
        "ship_to_raw": elegir(texto(fila, "SHIP TO"), texto(fila, "Sucursal")),
        "especie": texto(fila, "CROP"),
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
        "temporada": parse_entero_corto(fila.get("Temporada ")),
        "semana_entrada": parse_entero_corto(fila.get("Semana entrada")),
        "semana_muestreo": parse_entero_corto(fila.get("SEMANA")),
        "mes": parse_entero_corto(fila.get("MES")),
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
    return productos


def mapear_resultados(fila: dict[str, Any]) -> list[dict[str, Any]]:
    resultados = []
    for codigo, col in ANALITOS_RESULTADO.items():
        if col not in fila:
            continue
        valor_num, valor_texto = valor_resultado(fila.get(col))
        if valor_num is None and valor_texto is None:
            continue
        resultados.append({"analito_codigo": codigo, "valor_num": valor_num, "valor_texto": valor_texto})
    return resultados
