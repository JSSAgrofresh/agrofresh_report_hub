"""
Valida que un Excel de la plantilla nueva de Cargar Datos (Data Core) traiga
exactamente las 69 columnas esperadas, en el orden esperado, con el nombre
exacto esperado.

Esto es una validación de AYUDA para el Paso 1 del wizard "Cargar Datos" -le
dice al usuario, antes de seguir, qué está mal con su archivo y cómo
arreglarlo-. No reemplaza ni endurece `/api/ingest/preview` ni
`/api/ingest/confirmar`: esos endpoints siguen aceptando el formato nativo
antiguo y el de Converter tal como lo hacían antes (ver mapeo.py), porque
todavía se usan en producción y este cambio no debe romperlos.
"""
from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any

# Orden y nombre exacto de las 69 columnas de la plantilla oficial.
COLUMNAS_ESPERADAS: tuple[str, ...] = (
    "N° Informe",
    "N° Solicitud",
    "Fecha Solicitud",
    "Fecha Muestreo",
    "Fecha Análisis",
    "Fecha Informe",
    "Hora Muestreo",
    "Laboratorio",
    "Solicitante",
    "Sold To",
    "Ship To",
    "Especie",
    "Variedad",
    "Línea Proceso",
    "CSG",
    "Lote",
    "Posición Muestreo",
    "N° Cámara",
    "N° Orden",
    "Kilos Procesados (KG)",
    "Producto Utilizado",
    "Tipo Muestra",
    "Nombre Muestreador",
    "Generado Por",
    "Email Solicitante",
    "Email Laboratorio",
    "Observación",
    "FDL",
    "FDL Dosis",
    "IMZ",
    "IMZ Dosis",
    "PYR",
    "PYR Dosis",
    "TEBU",
    "TEBU Dosis",
    "AZOX",
    "AZOX Dosis",
    "TBZ",
    "TBZ Dosis",
    "DPA",
    "DPA Dosis",
    "Tipo Aplicación",
    "Gasto",
    "Levaduras UFC/mL",
    "Botrytis conidia/mL",
    "Alternaria conidia/mL",
    "Geotrichum esporas/mL",
    "Penicillium conidia/mL",
    "E. Coli UFC/100mL",
    "Coliformes Totales UFC/100mL",
    "Plomo mg/kg",
    "Mercurio mg/kg",
    "Arsénico mg/kg",
    "Cadmio mg/kg",
    "Aluminio mg/kg",
    "Hongos UFC/g",
    "Levaduras UFC/g",
    "Coliformes Totales UFC/g",
    "Escherichia coli UFC/g",
    "Recuento Enterobacterias UFC/g",
    "Salmonella 25g (P/A)",
    "Cenizas Insolubles en Ácido (%)",
    "Aflatoxinas Totales B1+B2+G1+G2 (µg/kg)",
    "Analito Pesticida 1",
    "Resultado Pesticida 1",
    "Analito Pesticida 2",
    "Resultado Pesticida 2",
    "Analito Pesticida 3",
    "Resultado Pesticida 3",
)

_ESPERADAS_NORMALIZADAS = {c.strip().lower(): c for c in COLUMNAS_ESPERADAS}
_UMBRAL_PARECIDO = 0.6


def _normalizar(col: str) -> str:
    return str(col or "").strip().lower()


def _sugerir(col: str) -> str | None:
    """Nombre esperado más parecido a `col`, si hay uno razonablemente cercano
    -para poder decir "debería llamarse X" en vez de solo "nombre incorrecto"."""
    clave = _normalizar(col)
    mejor: tuple[float, str] | None = None
    for esperada_norm, esperada in _ESPERADAS_NORMALIZADAS.items():
        ratio = SequenceMatcher(None, clave, esperada_norm).ratio()
        if ratio >= _UMBRAL_PARECIDO and (mejor is None or ratio > mejor[0]):
            mejor = (ratio, esperada)
    return mejor[1] if mejor else None


def validar_estructura(columnas: list[Any]) -> dict[str, Any]:
    """Compara `columnas` (los encabezados tal como vienen en la fila 1 del
    Excel, en orden) contra la plantilla oficial de 69 columnas.

    Devuelve {"valido": bool, "errores": [str, ...], "advertencias": [str, ...]}
    con mensajes concretos y accionables, nunca un genérico "archivo inválido".
    """
    errores: list[str] = []
    advertencias: list[str] = []

    if not columnas:
        return {"valido": False, "errores": ["El archivo está vacío: no tiene ninguna columna en la primera fila."], "advertencias": []}

    nombres = [str(c).strip() if c is not None else "" for c in columnas]

    vacias = sum(1 for n in nombres if not n)
    if vacias:
        errores.append(f"Hay {vacias} columna(s) sin nombre en el encabezado (celda vacía en la fila 1).")

    # Encabezados duplicados (comparando ya normalizado, para pescar también
    # "Sold To" repetido como "SOLD TO" o "Sold To ").
    vistos: dict[str, int] = {}
    for n in nombres:
        if not n:
            continue
        clave = _normalizar(n)
        vistos[clave] = vistos.get(clave, 0) + 1
    duplicados = [_ESPERADAS_NORMALIZADAS.get(c, c) for c, veces in vistos.items() if veces > 1]
    if duplicados:
        errores.append(f"Hay encabezados duplicados: {', '.join(sorted(duplicados))}.")

    if len(nombres) != len(COLUMNAS_ESPERADAS):
        errores.append(
            f"Se encontraron {len(nombres)} columnas y se esperaban {len(COLUMNAS_ESPERADAS)}."
        )

    nombres_normalizados = {_normalizar(n) for n in nombres if n}
    faltantes = [c for c in COLUMNAS_ESPERADAS if _normalizar(c) not in nombres_normalizados]
    for f in faltantes:
        errores.append(f"Falta la columna: \"{f}\".")

    esperadas_normalizadas_set = set(_ESPERADAS_NORMALIZADAS.keys())
    sobrantes = [n for n in nombres if n and _normalizar(n) not in esperadas_normalizadas_set]
    vistos_sobrante: set[str] = set()
    for s in sobrantes:
        clave = _normalizar(s)
        if clave in vistos_sobrante:
            continue
        vistos_sobrante.add(clave)
        sugerencia = _sugerir(s)
        if sugerencia:
            errores.append(f"La columna \"{s}\" no es válida. ¿Debería llamarse \"{sugerencia}\"?")
        else:
            errores.append(f"La columna \"{s}\" no es una columna esperada de la plantilla.")

    # Orden: solo se avisa si el set de nombres calza (nada faltante/sobrante/
    # duplicado) pero el orden es distinto -si ya hay errores de nombre no
    # tiene sentido además quejarse del orden, sería ruido redundante-.
    if not errores and nombres != list(COLUMNAS_ESPERADAS):
        primera_diferencia = next(
            (i for i, (real, esperada) in enumerate(zip(nombres, COLUMNAS_ESPERADAS)) if real != esperada),
            None,
        )
        if primera_diferencia is not None:
            errores.append(
                f"El orden de las columnas no coincide: en la posición {primera_diferencia + 1} viene "
                f"\"{nombres[primera_diferencia]}\" y debería venir \"{COLUMNAS_ESPERADAS[primera_diferencia]}\"."
            )

    return {"valido": not errores, "errores": errores, "advertencias": advertencias}
