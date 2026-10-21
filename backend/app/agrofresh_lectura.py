"""
Lector del informe propio de AgroFresh (formato «INFORME DE ANÁLISIS N° AGF2026-47»): port literal de
`leerAgrofreshNuevo` del Converter (public/modules/converter.html). Si se cambia allá, se cambia acá.
El informe antiguo (sin N° AGF) sigue cargándose con el Converter.

El texto es el de `informe_lectura.texto_quiteca` (modo `layout`: cada dato junto a su etiqueta, con Sold To y Ship To).
Devuelve la misma forma que `quiteca_lectura.leer_quiteca`, así que `fila_cruda` y el resto del camino son los mismos.
"""
from __future__ import annotations

import re
from typing import Any

from . import quiteca_lectura as q

FILAS = {
    1: [("N[°º] SOLICITUD", "FECHA SOLICITUD"), ("LABORATORIO", "SOLICITANTE"),
        ("GENERADO POR", "EMAIL SOLICITANTE"), ("SOLD TO", None), ("SHIP TO", None)],
    2: [("ESPECIE", "VARIEDAD"), ("TIPO MUESTRA", "TIPO APLICACI[ÓO]N"),
        ("L[ÍI]NEA PROCESO", "POSICI[ÓO]N MUESTREO"), ("PRODUCTO UTILIZADO", "GASTO"),
        ("KILOS PROCESADOS", "LOTE"), ("N[°º] C[ÁA]MARA", "N[°º] ORDEN"),
        ("C[ÓO]DIGO PRODUCTOR", "C[ÓO]DIGO PACKING"), ("C[ÓO]DIGO DE ENSAYO", "N[°º] ENSAYO"),
        ("FECHA MUESTREO", "HORA MUESTREO"), ("MUESTREADOR", None), ("OBSERVACIONES", None)],
    3: [("C[ÓO]D\\. INTERNO MUESTRA", "FECHA AN[ÁA]LISIS"), ("FECHA RECEPCI[ÓO]N", None)],
}
COLUMNA = {
    "N° SOLICITUD": "OT", "FECHA SOLICITUD": "Fecha Solicitud", "SOLICITANTE": "Solicitante",
    "GENERADO POR": "Generado Por", "EMAIL SOLICITANTE": "Email Solicitante",
    "SOLD TO": "Sold To", "SHIP TO": "Ship To", "ESPECIE": "Especie", "VARIEDAD": "Variedad",
    "TIPO MUESTRA": "Tipo Muestra", "TIPO APLICACIÓN": "Tipo Aplicación",
    "LÍNEA PROCESO": "Línea Proceso", "POSICIÓN MUESTREO": "Posición Muestreo",
    "PRODUCTO UTILIZADO": "Producto Utilizado", "GASTO": "Gasto", "KILOS PROCESADOS": "Kilos Procesados (KG)",
    "LOTE": "Lote", "N° CÁMARA": "N° Cámara", "N° ORDEN": "N° Orden", "CÓDIGO PRODUCTOR": "CSG",
    "FECHA MUESTREO": "Fecha Muestreo", "HORA MUESTREO": "Hora Muestreo",
    "MUESTREADOR": "Nombre Muestreador", "OBSERVACIONES": "Observación",
    "FECHA ANÁLISIS": "Fecha Análisis", "FECHA RECEPCIÓN": "Fecha entrada",
}
_NUEVO = re.compile(r"INFORME DE AN[ÁA]LISIS\s+N[°º]?\s*AGF\d", re.I)


def es_informe_nuevo(texto: str) -> bool:
    return bool(_NUEVO.search(texto))


def _limpio(v: Any) -> str | None:
    t = str("" if v is None else v).strip()
    return None if (not t or t in ("—", "-")) else t


def leer_agrofresh(texto: str) -> dict[str, Any]:
    inf: dict[str, Any] = {"datos": {}, "resultados": {}, "sueltos": [], "avisos": []}
    d, avisos = inf["datos"], inf["avisos"]
    d["Laboratorio"] = "Agrofresh"
    d["Tipo de servicio"] = "Cromatografía"
    n = re.search(r"INFORME DE AN[ÁA]LISIS\s+N[°º]?\s*(AGF[\w-]+)", texto, re.I)
    if n:
        d["N° Solicitud"] = n.group(1).upper()
    e = re.search(r"Emisi[óo]n:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", texto, re.I)
    d["Fecha Informe"] = q.a_fecha(e.group(1), avisos) if e else None

    celdas: dict[str, tuple[str, str, Any]] = {}
    seccion = 0
    lineas = [ln.strip() for ln in texto.split("\n")]
    for l in lineas:
        s = re.match(r"^([1-5])\.\s+[A-ZÁÉÍÓÚ]", l)
        if s:
            seccion = int(s.group(1))
            continue
        if seccion in (4, 5):
            break
        filas = FILAS.get(seccion)
        if not filas:
            continue
        for izq, der in filas:
            m = re.match("^(" + izq + r")\s*(.*)$", l, re.I)
            if not m:
                continue
            resto, val_der = m.group(2), None
            if der:
                rd = re.match(r"^(.*?)\s*(?:^|\s)(" + der + r")\s*(.*)$", resto, re.I)
                if rd:
                    resto, val_der = rd.group(1), (rd.group(2), rd.group(3))
            celdas[f"{seccion}|{izq}"] = (m.group(1), resto, val_der)
            break

    def poner(etiqueta: str, valor: str) -> None:
        clave = re.sub(r"\s+", " ", etiqueta).upper().replace("Nº", "N°", 1)
        col, v = COLUMNA.get(clave), _limpio(valor)
        if col and v is not None:
            d[col] = v.upper() if col == "OT" else v

    for et, val, der in celdas.values():
        poner(et, val)
        if der:
            poner(der[0], der[1])

    for c in ("Fecha Solicitud", "Fecha Muestreo", "Fecha Análisis", "Fecha entrada"):
        if d.get(c):
            d[c] = q.a_fecha(d[c], avisos)
    if d.get("Hora Muestreo"):
        d["Hora Muestreo"] = q.a_hora(d["Hora Muestreo"])
    for c in ("Gasto", "Kilos Procesados (KG)"):
        if d.get(c):
            d[c] = q.a_numero(d[c])

    modo = ""
    for l in lineas:
        if re.match(r"^\d\.\s+RECEPCI", l, re.I):
            modo = ""
        if re.match(r"^ANALITO SOLICITADO", l, re.I):
            modo = "pedidos"
            continue
        if re.match(r"^\d\.\s+RESULTADOS", l, re.I):
            modo = "esperando"
            continue
        if modo == "esperando" and re.match(r"^Analito\b", l, re.I):
            modo = "resultados"
            continue
        if modo == "pedidos":
            if re.match(r"^\d\.", l):
                modo = ""
        elif modo == "resultados":
            if re.match(r"^Resultados expresados", l, re.I) or re.match(r"^DECLARACIONES", l, re.I):
                break
            r = re.match(r"^([A-Za-zÁÉÍÓÚñÑ][A-Za-zÁÉÍÓÚñÑ0-9 .\-()]*?)\s+(ND|<?\s?[\d.,]+)$", l)
            if r:
                q.guardar(inf, r.group(1), re.sub(r"\s+", "", r.group(2)))

    # Rastro para encontrar el informe desde Report (como hace el Converter al completar desde la solicitud).
    traza = f"Informe AgroFresh N° {d.get('N° Solicitud') or '—'}" + (f" · Solicitud {d['OT']}" if d.get("OT") else "")
    d["Observación"] = " · ".join(x for x in (_limpio(d.get("Observación")), traza) if x)

    for k in [k for k, v in d.items() if v is None or v == "" or v == "-"]:
        del d[k]
    faltan = [c for c in q.OBLIGATORIOS if not d.get(c)]
    if faltan:
        avisos.append("Sin dato para: " + ", ".join(faltan))
    if not inf["resultados"] and not inf["sueltos"]:
        avisos.append("No se encontró ningún resultado en el informe")
    return inf
