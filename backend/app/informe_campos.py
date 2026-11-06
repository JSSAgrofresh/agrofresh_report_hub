"""
Lectura COMPLETA del PDF de un informe propio de AgroFresh («INFORME DE ANÁLISIS N° AGF…»), solo para la auditoría de integridad.

`agrofresh_lectura.leer_agrofresh` (el port del Converter) lee lo necesario para CARGAR el informe a Report y no tiene por qué leer todo.
La auditoría necesita lo contrario: **cada dato que el PDF trae**, tal como lo dice, para compararlo con la solicitud sin depender de lo que
Report haya guardado (así no se le reclama a un laboratorio algo que su PDF sí dice, ni se le perdona algo que su PDF no dice).

Devuelve {identificacion, muestra, dosis, recepcion, resultados}. Un dato escrito «—» es «sin dato» y sale como None. PURO: recibe el texto.
"""
from __future__ import annotations

import re
from typing import Any

# Etiquetas de cada sección, tal como las imprime el PDF, y la clave con que se devuelven.
_IDENTIFICACION = {
    "N° SOLICITUD": "ot", "FECHA SOLICITUD": "fecha_solicitud", "LABORATORIO": "laboratorio", "SOLICITANTE": "solicitante",
    "GENERADO POR": "generado_por", "EMAIL SOLICITANTE": "email_solicitante", "SOLD TO": "sold_to", "SHIP TO": "ship_to",
}
_MUESTRA = {
    "ESPECIE": "especie", "VARIEDAD": "variedad", "TIPO MUESTRA": "tipo_muestra", "TIPO APLICACIÓN": "tipo_aplicacion",
    "LÍNEA PROCESO": "linea_proceso", "POSICIÓN MUESTREO": "posicion_muestreo", "PRODUCTO UTILIZADO": "producto_utilizado", "GASTO": "gasto",
    "KILOS PROCESADOS": "kilos_procesados", "LOTE": "lote", "N° CÁMARA": "numero_camara", "N° ORDEN": "numero_orden",
    "CÓDIGO PRODUCTOR": "codigo_productor", "CÓDIGO PACKING": "codigo_packing", "CÓDIGO DE ENSAYO": "codigo_ensayo", "N° ENSAYO": "numero_ensayo",
    "FECHA MUESTREO": "fecha_muestreo", "HORA MUESTREO": "hora_muestreo", "MUESTREADOR": "muestreador", "OBSERVACIONES": "observaciones",
}
_RECEPCION = {"CÓD. INTERNO MUESTRA": "codigo_interno", "FECHA ANÁLISIS": "fecha_analisis", "FECHA RECEPCIÓN": "fecha_recepcion", "OBSERVACIONES": "observaciones"}


def _secciones(texto: str) -> dict[str, str]:
    """Parte el texto en las secciones numeradas del informe (1 a 5)."""
    marcas = [(m.start(), int(m.group(1))) for m in re.finditer(r"^\s*([1-5])\.\s+[A-ZÁÉÍÓÚ]", texto or "", flags=re.M)]
    out: dict[str, str] = {}
    for i, (ini, n) in enumerate(marcas):
        fin = marcas[i + 1][0] if i + 1 < len(marcas) else len(texto)
        out[str(n)] = texto[ini:fin]
    return out


def _pares(bloque: str, etiquetas: dict[str, str]) -> dict[str, str | None]:
    """«ETIQUETA valor ETIQUETA valor» (varias por línea) → {clave: valor}. «—» o vacío = None."""
    patron = re.compile("(" + "|".join(re.escape(e) for e in sorted(etiquetas, key=len, reverse=True)) + ")(?=\\s|$)")
    out: dict[str, str | None] = {}
    for linea in bloque.splitlines():
        cortes = list(patron.finditer(linea))
        for i, m in enumerate(cortes):
            fin = cortes[i + 1].start() if i + 1 < len(cortes) else len(linea)
            valor = linea[m.end():fin].strip()
            out.setdefault(etiquetas[m.group(1)], None if valor in ("", "—", "-") else valor)
    return out


def dosis_de(bloque: str, nombres: list[str]) -> dict[str, str]:
    """La tabla «ANALITO SOLICITADO / DOSIS» (dos columnas): {nombre del analito: dosis tal como está escrita}. Sin dosis («—») no entra.

    Los nombres vienen del catálogo, que es lo que permite saber dónde termina una dosis («4cc/l agua») y empieza el analito siguiente."""
    m = re.search(r"ANALITO\s+SOLICITADO(.*)", bloque, flags=re.S | re.I)
    if not m or not nombres:
        return {}
    cuerpo = re.sub(r"ANALITO\s+SOLICITADO|\bDOSIS\b", " ", m.group(1), flags=re.I)
    cuerpo = re.sub(r"\s+", " ", cuerpo).strip()
    alternativa = "|".join(re.escape(n) for n in sorted(nombres, key=len, reverse=True))
    patron = re.compile(rf"(?<![\wÁÉÍÓÚáéíóúñ])({alternativa})(?![\wÁÉÍÓÚáéíóúñ])", flags=re.I)
    cortes = list(patron.finditer(cuerpo))
    out: dict[str, str] = {}
    for i, c in enumerate(cortes):
        fin = cortes[i + 1].start() if i + 1 < len(cortes) else len(cuerpo)
        dosis = cuerpo[c.end():fin].strip()
        if dosis and dosis not in ("—", "-"):
            out.setdefault(c.group(1), dosis)
    return out


def leer_completo(texto: str, nombres_analitos: list[str] | None = None) -> dict[str, Any]:
    """Todo lo que trae el PDF. `nombres_analitos`: los nombres del catálogo (para leer la tabla de dosis)."""
    sec = _secciones(texto)
    muestra = sec.get("2", "")
    # La tabla de dosis cuelga de la sección 2 (la 3 empieza en «RECEPCIÓN Y ANÁLISIS»); sus líneas no llevan etiquetas de la muestra.
    lineas_muestra = muestra.split("ANALITO SOLICITADO")[0]
    res_txt = sec.get("5", "")
    resultados: dict[str, str] = {}
    for linea in res_txt.splitlines()[1:]:
        m = re.match(r"^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ][\w .\-/()]*?)\s+((?:[<>]\s*)?\d[\d.,]*|ND)\s*$", linea)
        if m:
            resultados[m.group(1).strip()] = m.group(2).replace(" ", "")
    return {
        "identificacion": _pares(sec.get("1", ""), _IDENTIFICACION),
        "muestra": _pares(lineas_muestra, _MUESTRA),
        "dosis": dosis_de(muestra, nombres_analitos or []),
        "recepcion": _pares(sec.get("3", ""), _RECEPCION),
        "resultados": resultados,
    }
