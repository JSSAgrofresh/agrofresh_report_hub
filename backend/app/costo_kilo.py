"""
Costo por kilo (equipo C&M-500): cuánto producto se gasta cada día por kilo de fruta.

El equipo C&M-500 dosifica fungicida en el pozo de la línea de proceso y deja un CSV con una lectura cada
10 minutos. Este módulo LEE ese CSV directo (no hace falta «tabularlo» antes) y calcula el valor diario;
el informe en PDF y Excel está en `costo_kilo_informe.py` y la API en `costo_kilo_api.py`.

El archivo original del equipo:

    00000000,                                  <- una línea basura que el equipo escribe primero
    FECHA,HORA,No USUARIO,...,KG FRUTA PROCESO,...,FDL LT PC,...,TEBU LT PC,...,1 LOTE FDL,...,
    2025-12-05,11:52:40,1,1,1,3070744,552840,...

(coma como separador, una coma sobrante al final de cada línea, fecha AAAA-MM-DD). La versión «tabulada» que
se hacía a mano (`;`, fecha DD-MM-AAAA, sin la línea basura) también se lee.

**Los contadores son ACUMULADOS del proceso** (kg de fruta, litros de producto…) y se reinician a cero cuando
se arma un pozo nuevo. El valor del día es lo que SUBIÓ el contador ese día; si baja, es un reinicio y se
cuenta desde cero. (El primer día solo cuenta desde la primera lectura: antes no hay datos.)

Los ingredientes activos salen de las columnas «<CÓDIGO> LT PC» y se cruzan con el catálogo de analitos del
sistema (FDL, TEBU, PYR…): un activo nuevo del catálogo aparece solo si el archivo trae su columna.
"""
from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from typing import Any

# El equipo escribe «TEB» donde el catálogo del sistema dice «TEBU».
ALIAS_CODIGO = {"TEB": "TEBU"}

# Nombres de respaldo para cuando no se puede leer el catálogo (la base): los activos que ya conocemos.
NOMBRES_BASE = {"FDL": "Fludioxonil", "TEBU": "Tebuconazole", "PYR": "Pirimetanil"}

# Campos acumulados que se llevan a valor diario.
CAMPOS_ACUMULADOS = ("kg_proceso", "kg_temporada", "sm_lamina", "sm_mant", "sm_total", "agua_total")


def _sin_formato(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("﻿", "")).strip().upper()


def decodificar(contenido: bytes | str) -> str:
    if isinstance(contenido, str):
        return contenido
    for cod in ("utf-8-sig", "latin-1"):
        try:
            return contenido.decode(cod)
        except UnicodeDecodeError:
            continue
    return contenido.decode("utf-8", errors="replace")


def _lineas(texto: str) -> list[str]:
    return [l for l in texto.replace("\r\n", "\n").replace("\r", "\n").split("\n")]


def _fila_encabezado(lineas: list[str]) -> int:
    """Índice de la fila de encabezados (la que nombra los kg de fruta y los litros de producto)."""
    for i, l in enumerate(lineas[:15]):
        u = _sin_formato(l)
        if "KG FRUTA PROCESO" in u and ("LT PC" in u or "PPM MADRE" in u):
            return i
    return -1


def es_costo_kilo(contenido: bytes | str) -> bool:
    """¿Este archivo es del C&M-500 (costo por kilo) y no un pH/ORP de Accu-Tab?"""
    try:
        return _fila_encabezado(_lineas(decodificar(contenido))) >= 0
    except Exception:  # noqa: BLE001
        return False


def _numero(v: str | None) -> float | None:
    if v is None:
        return None
    s = v.strip().replace(" ", "")
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif s.count(",") == 1:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _fecha(v: str) -> date | None:
    v = v.strip()
    for formato in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(v, formato).date()
        except ValueError:
            continue
    return None


def _hora(v: str) -> tuple[int, int, int] | None:
    m = re.fullmatch(r"\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*", v)
    if not m:
        return None
    h, mi, s = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    return (h, mi, s) if h < 24 and mi < 60 and s < 60 else None


def _codigo(txt: str) -> str:
    c = txt.strip().upper()
    return ALIAS_CODIGO.get(c, c)


def _mapa_columnas(encabezados: list[str]) -> dict[str, Any]:
    """Qué columna es qué, por el NOMBRE (el equipo puede agregar activos o cambiar el orden)."""
    campos: dict[str, int] = {}
    activos: dict[str, dict[str, int]] = {}
    nombres = {
        "FECHA": "fecha", "HORA": "hora",
        "KG FRUTA TEMPORADA": "kg_temporada", "KG FRUTA PROCESO": "kg_proceso",
        "AGUA INICIAL PROCESO": "agua_inicial", "AGUA UTILIZADA LAMINA": "agua_lamina", "TOTAL AGUA PROCESO": "agua_total",
        "PRO. CARGA INICIAL": "sm_inicial", "PRO. CARGA LAMINA": "sm_lamina", "PRO. EN MANT": "sm_mant",
        "TOTAL PRO. PROCESO": "sm_total",
    }
    for i, h in enumerate(encabezados):
        u = _sin_formato(h)
        if u in nombres:
            campos[nombres[u]] = i
            continue
        m = re.fullmatch(r"([A-Z]{2,6}) (?:LTS?|LT) PC", u)
        if m:
            activos.setdefault(_codigo(m.group(1)), {})["litros"] = i
            continue
        m = re.fullmatch(r"([A-Z]{2,6}) PPM (MADRE|CONS\.?|SOLUCION)", u)
        if m:
            activos.setdefault(_codigo(m.group(1)), {})["ppm_" + ("madre" if m.group(2) == "MADRE" else "sol")] = i
    return {"campos": campos, "activos": {c: d for c, d in activos.items() if "litros" in d}}


def leer_csv(contenido: bytes | str) -> list[dict[str, Any]]:
    """Las lecturas del CSV del C&M-500 (original o tabulado), en orden de fecha y hora. Los acumulados quedan como
    vienen: el valor diario lo calcula `resumen_diario`. Lanza ValueError con un mensaje legible si no es de este equipo."""
    lineas = _lineas(decodificar(contenido))
    i = _fila_encabezado(lineas)
    if i < 0:
        raise ValueError("El archivo no es del equipo C&M-500: no trae las columnas de kg de fruta y litros de producto.")
    cabecera = lineas[i]
    delim = ";" if cabecera.count(";") > cabecera.count(",") else ","
    enc = next(csv.reader([cabecera], delimiter=delim))
    while enc and not enc[-1].strip():
        enc.pop()
    mapa = _mapa_columnas(enc)
    campos, activos = mapa["campos"], mapa["activos"]
    if "fecha" not in campos or "hora" not in campos or "kg_proceso" not in campos:
        raise ValueError("Al archivo le faltan las columnas FECHA, HORA o KG FRUTA PROCESO.")
    if not activos:
        raise ValueError("El archivo no trae ninguna columna de litros de producto («<ACTIVO> LT PC»).")

    def v(f: list[str], clave: str) -> float | None:
        j = campos.get(clave)
        return _numero(f[j]) if j is not None and j < len(f) else None

    lecturas: list[dict[str, Any]] = []
    for linea in lineas[i + 1:]:
        if not linea.strip():
            continue
        f = next(csv.reader([linea], delimiter=delim))
        if len(f) <= max(campos["fecha"], campos["hora"]):
            continue
        d, h = _fecha(f[campos["fecha"]]), _hora(f[campos["hora"]])
        if d is None or h is None:
            continue
        lectura: dict[str, Any] = {
            "fecha": d.isoformat(),
            "hora": f"{h[0]:02d}:{h[1]:02d}:{h[2]:02d}",
            "activos": {},
        }
        for clave in ("kg_temporada", "kg_proceso", "agua_total", "sm_inicial", "sm_lamina", "sm_mant", "sm_total"):
            lectura[clave] = v(f, clave)
        for cod, cols in activos.items():
            lectura["activos"][cod] = _numero(f[cols["litros"]]) if cols["litros"] < len(f) else None
        lecturas.append(lectura)
    if not lecturas:
        raise ValueError("El archivo no trae ninguna lectura válida (fecha y hora).")
    lecturas.sort(key=lambda r: (r["fecha"], r["hora"]))
    return lecturas


def _incrementos(valores: list[float | None]) -> list[float]:
    """Lo que subió un contador acumulado entre lecturas. Si baja es un reinicio (pozo nuevo): se cuenta desde cero."""
    salida: list[float] = []
    previo: float | None = None
    for x in valores:
        if x is None:
            salida.append(0.0)
            continue
        if previo is None:
            salida.append(0.0)
        else:
            d = x - previo
            salida.append(d if d >= 0 else x)
        previo = x
    return salida


def resumen_diario(lecturas: list[dict[str, Any]]) -> dict[str, Any]:
    """El valor de cada día: kg de fruta, litros de solución madre y litros de producto por ingrediente activo, y los
    ml de producto por kg de fruta. Los días en que faltó parte del día (el primero y el último, o uno con el equipo
    casi todo apagado) quedan marcados `parcial`."""
    codigos = sorted({c for l in lecturas for c in l["activos"]})
    series = {c: _incrementos([l[c] for l in lecturas]) for c in CAMPOS_ACUMULADOS}
    series_act = {c: _incrementos([l["activos"].get(c) for l in lecturas]) for c in codigos}
    dias: dict[str, dict[str, Any]] = {}
    for n, l in enumerate(lecturas):
        d = dias.setdefault(l["fecha"], {
            "fecha": l["fecha"], "lecturas": 0, "primera": l["hora"], "ultima": l["hora"],
            "kg": 0.0, "sm_lamina": 0.0, "sm_mant": 0.0, "sm_total": 0.0, "activos": {c: 0.0 for c in codigos},
        })
        d["lecturas"] += 1
        d["ultima"] = l["hora"]
        # Lo que marcaba el equipo en la última lectura del día: es lo que grafica la plantilla del cliente.
        d["kg_cierre"] = l["kg_proceso"] or 0.0
        d["sm_inicial"] = l["sm_inicial"] or 0.0
        d["activos_cierre"] = {c: (l["activos"].get(c) or 0.0) for c in codigos}
        d["kg"] += series["kg_proceso"][n]
        for c in ("sm_lamina", "sm_mant", "sm_total"):
            d[c] += series[c][n]
        for c in codigos:
            d["activos"][c] += series_act[c][n]
    lista = [dias[k] for k in sorted(dias)]
    for pos, d in enumerate(lista):
        d["parcial"] = (pos == 0 and d["primera"] >= "01:00:00") or (pos == len(lista) - 1 and d["ultima"] < "23:00:00") or d["lecturas"] < 24
        for c in ("kg", "sm_lamina", "sm_mant", "sm_total"):
            d[c] = round(d[c], 2)
        d["activos"] = {c: round(x, 2) for c, x in d["activos"].items()}
        d["ml_por_kg"] = {c: (round(x * 1000 / d["kg"], 4) if d["kg"] > 0 else None) for c, x in d["activos"].items()}
    kg_total = round(sum(d["kg"] for d in lista), 2)
    totales_act = {c: round(sum(d["activos"][c] for d in lista), 2) for c in codigos}
    return {
        "desde": lecturas[0]["fecha"], "hasta": lecturas[-1]["fecha"],
        "desde_hora": lecturas[0]["hora"], "hasta_hora": lecturas[-1]["hora"],
        "lecturas": len(lecturas),
        "codigos": codigos,
        "dias": lista,
        "totales": {
            "kg": kg_total,
            "sm_total": round(sum(d["sm_total"] for d in lista), 2),
            "activos": totales_act,
            "ml_por_kg": {c: (round(totales_act[c] * 1000 / kg_total, 4) if kg_total > 0 else None) for c in codigos},
        },
    }


def semanas_iso(desde: str, hasta: str) -> str:
    """«W49-50» para el rango del informe (semanas ISO de la primera y la última fecha)."""
    a = date.fromisoformat(desde).isocalendar()[1]
    b = date.fromisoformat(hasta).isocalendar()[1]
    return f"W{a}" if a == b else f"W{a}-{b}"


def nombres_de_activos(codigos: list[str], desde_catalogo: dict[str, str] | None = None) -> dict[str, str]:
    """El nombre de cada ingrediente activo: el del catálogo del sistema si se pudo leer, si no el conocido; si ni
    así, el código."""
    salida = {}
    for c in codigos:
        salida[c] = (desde_catalogo or {}).get(c) or NOMBRES_BASE.get(c) or c
    return salida


# ── Recepción por correo (a la espera de la matriz de asuntos) ──────────────────────────────────────

# La matriz «asunto → cliente, línea…» está por definirse (el correo se prueba por primera vez un lunes). Mientras
# esté vacía el correo NO se convierte en informe: se guarda tal cual en R2 para procesarlo cuando la matriz exista.
MATRIZ_ASUNTOS: list[dict[str, Any]] = []


def interpretar_asunto(asunto: str) -> dict[str, str] | None:
    """Cliente / planta / línea que dice el asunto, según `MATRIZ_ASUNTOS`; `None` si todavía no hay matriz o el
    asunto no calza con ninguna fila."""
    for fila in MATRIZ_ASUNTOS:
        patron = fila.get("patron")
        if patron and re.search(patron, asunto or "", re.IGNORECASE):
            return {k: v for k, v in fila.items() if k != "patron"}
    return None


def hay_costo_kilo(adjuntos: list[tuple[str, bytes]]) -> bool:
    """¿Alguno de los adjuntos de un correo es un CSV del C&M-500?"""
    return any(n.lower().endswith(".csv") and es_costo_kilo(d) for n, d in adjuntos)
