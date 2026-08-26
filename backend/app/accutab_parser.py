"""
Parser de archivos CSV/XLS del equipo Accu-Tab.

Replica la logica de Trace (trace.html) en Python para poder generar
registros automaticamente desde la ingesta de correo sin intervencion
manual.  Soporta las tres formas de archivo que acepta Trace:

  Forma 1 - Registro continuo: fecha en cada fila, columnas Date/Time/pH/ORP.
  Forma 2 - Un archivo por dia: fecha en el nombre (20260727.csv).
  Forma 3 - Hanna (pH y ORP en equipos separados): archivos .xls con
            hojas pH504ML u ORP504ML.
"""

from __future__ import annotations

import csv
import io
import math
import re
from datetime import datetime
from pathlib import Path


TOLERANCIA_MIN = 7


def _a_numero(v: str | None) -> float | None:
    if not v:
        return None
    s = v.strip().replace(" ", "")
    if not s:
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif s.count(",") == 1:
        s = s.replace(",", ".")
    elif s.count(",") > 1:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _buscar_col(cols: list[str], *claves: str) -> int:
    for i, c in enumerate(cols):
        x = c.lower()
        if any(k in x for k in claves):
            return i
    return -1


def _fila_header(lineas: list[str], *obligatorias: str) -> int:
    for i, linea in enumerate(lineas[:25]):
        low = linea.lower()
        if all(o in low for o in obligatorias):
            return i
    return -1


def _separar(linea: str) -> list[str]:
    reader = csv.reader(io.StringIO(linea))
    for row in reader:
        return row
    return []


def _fecha_desde_nombre(nombre: str) -> str | None:
    m = re.search(r"(20\d{2})[-_ ]?(\d{2})[-_ ]?(\d{2})", nombre)
    if not m:
        return None
    try:
        d = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if d.day != int(m.group(3)):
            return None
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    except ValueError:
        return None


def _armar_fila(
    fecha: str, hora: str, modo: str,
    ph_txt: str, mv_txt: str, archivo: str,
) -> dict | None:
    ph = _a_numero(ph_txt)
    mv = _a_numero(mv_txt)
    hora_norm = hora if len(hora) > 5 else hora + ":00"
    try:
        ts = datetime.fromisoformat(f"{fecha}T{hora_norm}").timestamp() * 1000
    except (ValueError, OSError):
        return None
    if ph is None or mv is None:
        return None
    if ph < 0 or ph > 14:
        return None
    if mv < -2000 or mv > 2000:
        return None
    return {
        "ts": ts, "fecha": fecha, "hora": hora,
        "modo": modo, "ph": ph, "mv": mv,
        "temp": None, "archivo": archivo, "desfase": None,
    }


MODO_1 = {"0": "MANUAL", "1": "CERO", "2": "AUTO"}
MODO_2 = {"0": "MANUAL", "1": "AUTOMATICO"}


def leer_continuo(texto: str, nombre: str) -> list[dict]:
    lineas = texto.splitlines()
    i_cab = _fila_header(lineas, "date", "time")
    if i_cab < 0:
        return []
    cols = [c.strip() for c in _separar(lineas[i_cab])]
    i_f = _buscar_col(cols, "date")
    i_h = _buscar_col(cols, "time")
    i_m = _buscar_col(cols, "manu", "modo", "mode")
    i_p = _buscar_col(cols, "ph")
    i_o = _buscar_col(cols, "orp", "mv")
    if i_f < 0 or i_h < 0 or i_p < 0 or i_o < 0:
        return []
    filas = []
    for linea in lineas[i_cab + 1:]:
        if not linea.strip():
            continue
        c = _separar(linea)
        modo = MODO_1.get((c[i_m] if i_m >= 0 and i_m < len(c) else "").strip(), "—")
        fila = _armar_fila(
            (c[i_f] if i_f < len(c) else "").strip(),
            (c[i_h] if i_h < len(c) else "").strip(),
            modo,
            (c[i_p] if i_p < len(c) else "").strip(),
            (c[i_o] if i_o < len(c) else "").strip(),
            nombre,
        )
        if fila:
            filas.append(fila)
    return filas


def leer_diario(texto: str, nombre: str) -> list[dict]:
    fecha = _fecha_desde_nombre(nombre)
    if not fecha:
        return []
    lineas = texto.splitlines()
    i_cab = _fila_header(lineas, "time", "ph")
    if i_cab < 0:
        i_cab = _fila_header(lineas, "time")
    if i_cab < 0:
        return []
    cols = [c.strip() for c in _separar(lineas[i_cab])]
    i_h = _buscar_col(cols, "time", "hora")
    i_m = _buscar_col(cols, "manual", "automatico", "modo")
    i_p = _buscar_col(cols, "ph")
    i_o = _buscar_col(cols, "orp", "mv")
    if i_h < 0 or i_p < 0 or i_o < 0:
        return []
    filas = []
    for linea in lineas[i_cab + 1:]:
        if not linea.strip():
            continue
        c = _separar(linea)
        modo = MODO_2.get((c[i_m] if i_m >= 0 and i_m < len(c) else "").strip(), "—")
        fila = _armar_fila(
            fecha,
            (c[i_h] if i_h < len(c) else "").strip(),
            modo,
            (c[i_p] if i_p < len(c) else "").strip(),
            (c[i_o] if i_o < len(c) else "").strip(),
            nombre,
        )
        if fila:
            filas.append(fila)
    return filas


def _leer_hanna_hoja(filas_crudas: list[list[str]], tipo: str, nombre: str) -> list[dict]:
    if not filas_crudas or len(filas_crudas) < 2:
        return []
    cab = [str(x).strip() for x in filas_crudas[0]]
    i_f = _buscar_col(cab, "date", "fecha")
    i_h = _buscar_col(cab, "time", "hora")
    i_v = _buscar_col(cab, "ph") if tipo == "ph" else _buscar_col(cab, "mv", "orp")
    i_t = _buscar_col(cab, "temp")
    if i_f < 0 or i_h < 0 or i_v < 0:
        return []
    filas = []
    for row in filas_crudas[1:]:
        if len(row) <= max(i_f, i_h, i_v):
            continue
        fecha = str(row[i_f]).strip()
        hora = str(row[i_h]).strip()
        if not fecha and not hora:
            continue
        val = _a_numero(str(row[i_v]))
        if val is None:
            continue
        hora_norm = hora if len(hora) > 5 else hora + ":00"
        try:
            ts = datetime.fromisoformat(f"{fecha}T{hora_norm}").timestamp() * 1000
        except (ValueError, OSError):
            continue
        if tipo == "ph" and (val < 0 or val > 14):
            continue
        if tipo == "orp" and (val < -2000 or val > 2000):
            continue
        temp = _a_numero(str(row[i_t])) if i_t >= 0 and i_t < len(row) else None
        filas.append({
            "ts": ts, "fecha": fecha, "hora": hora_norm,
            "modo": "—",
            "ph": val if tipo == "ph" else None,
            "mv": val if tipo == "orp" else None,
            "temp": temp, "archivo": nombre, "desfase": None,
        })
    filas.sort(key=lambda f: f["ts"])
    return filas


def unir_ph_orp(filas_ph: list[dict], filas_orp: list[dict]) -> list[dict]:
    filas_ph.sort(key=lambda f: f["ts"])
    filas_orp.sort(key=lambda f: f["ts"])
    tol = TOLERANCIA_MIN * 60000
    usado = [False] * len(filas_orp)
    salida = []
    for p in filas_ph:
        mejor = -1
        dist = float("inf")
        for i, o in enumerate(filas_orp):
            if usado[i]:
                continue
            d = abs(o["ts"] - p["ts"])
            if d > tol:
                continue
            if d < dist:
                dist = d
                mejor = i
        if mejor >= 0:
            usado[mejor] = True
            salida.append({
                "ts": p["ts"], "fecha": p["fecha"], "hora": p["hora"],
                "modo": "—", "ph": p["ph"], "mv": filas_orp[mejor]["mv"],
                "temp": p["temp"],
                "archivo": p["archivo"] + " + " + filas_orp[mejor]["archivo"],
                "desfase": round(dist / 60000),
            })
        else:
            salida.append(p)
    for i, o in enumerate(filas_orp):
        if not usado[i]:
            salida.append(o)
    salida.sort(key=lambda f: f["ts"])
    return salida


def calcular_estadisticas(filas: list[dict]) -> dict:
    ph_vals = [f["ph"] for f in filas if f.get("ph") is not None]
    mv_vals = [f["mv"] for f in filas if f.get("mv") is not None]

    def serie(v: list[float]) -> dict:
        if not v:
            return {"min": None, "max": None, "prom": None, "desv": None, "rMin": None, "rMax": None}
        promedio = sum(v) / len(v)
        varianza = sum((x - promedio) ** 2 for x in v) / len(v)
        desviacion = math.sqrt(varianza)
        return {
            "min": min(v), "max": max(v),
            "prom": promedio, "desv": desviacion,
            "rMin": promedio - desviacion, "rMax": promedio + desviacion,
        }

    return {"n": len(filas), "ph": serie(ph_vals), "mv": serie(mv_vals)}


def parsear_archivos_csv(archivos: dict[str, bytes]) -> list[dict] | None:
    """
    Recibe un dict {nombre_archivo: contenido_bytes} con los CSV/TXT del
    equipo AccuTab. Intenta parsearlos como Forma 1 (continuo), luego
    Forma 2 (diario). Devuelve la lista de filas unificadas o None si
    no se pudo parsear nada.
    """
    todas_las_filas: list[dict] = []
    filas_ph: list[dict] = []
    filas_orp: list[dict] = []
    hay_separados = False

    for nombre, data in archivos.items():
        ext = Path(nombre).suffix.lower()
        if ext not in (".csv", ".txt", ".dat", ""):
            continue
        try:
            texto = data.decode("utf-8", errors="replace")
        except Exception:
            continue

        # Detectar si es un archivo que solo tiene pH o solo ORP
        # (carpeta PH/ u ORP/ en el ZIP)
        nombre_lower = nombre.lower()
        carpeta = Path(nombre).parent.name.lower() if "/" in nombre else ""

        # Intentar Forma 1 primero
        filas = leer_continuo(texto, Path(nombre).name)
        if filas:
            todas_las_filas.extend(filas)
            continue

        # Intentar Forma 2
        filas = leer_diario(texto, Path(nombre).name)
        if filas:
            todas_las_filas.extend(filas)
            continue

        # Intentar como archivo separado pH o ORP por contenido
        lineas = texto.splitlines()
        i_cab = -1
        for probe in [("time", "ph"), ("time",), ("date", "time")]:
            i_cab = _fila_header(lineas, *probe)
            if i_cab >= 0:
                break
        if i_cab >= 0:
            cols_lower = [c.strip().lower() for c in _separar(lineas[i_cab])]
            tiene_ph = any("ph" in c for c in cols_lower)
            tiene_orp = any(c in ("orp", "mv") for c in cols_lower)
            if tiene_ph and not tiene_orp:
                hay_separados = True
                fecha = _fecha_desde_nombre(nombre)
                if fecha:
                    cols = [c.strip() for c in _separar(lineas[i_cab])]
                    i_h = _buscar_col(cols, "time", "hora")
                    i_p = _buscar_col(cols, "ph")
                    for linea in lineas[i_cab + 1:]:
                        if not linea.strip():
                            continue
                        c = _separar(linea)
                        hora = (c[i_h] if i_h >= 0 and i_h < len(c) else "").strip()
                        val = _a_numero((c[i_p] if i_p >= 0 and i_p < len(c) else "").strip())
                        if not hora or val is None or val < 0 or val > 14:
                            continue
                        hora_norm = hora if len(hora) > 5 else hora + ":00"
                        try:
                            ts = datetime.fromisoformat(f"{fecha}T{hora_norm}").timestamp() * 1000
                        except (ValueError, OSError):
                            continue
                        filas_ph.append({
                            "ts": ts, "fecha": fecha, "hora": hora_norm,
                            "modo": "—", "ph": val, "mv": None,
                            "temp": None, "archivo": Path(nombre).name, "desfase": None,
                        })
            elif tiene_orp and not tiene_ph:
                hay_separados = True
                fecha = _fecha_desde_nombre(nombre)
                if fecha:
                    cols = [c.strip() for c in _separar(lineas[i_cab])]
                    i_h = _buscar_col(cols, "time", "hora")
                    i_o = _buscar_col(cols, "orp", "mv")
                    for linea in lineas[i_cab + 1:]:
                        if not linea.strip():
                            continue
                        c = _separar(linea)
                        hora = (c[i_h] if i_h >= 0 and i_h < len(c) else "").strip()
                        val = _a_numero((c[i_o] if i_o >= 0 and i_o < len(c) else "").strip())
                        if not hora or val is None or val < -2000 or val > 2000:
                            continue
                        hora_norm = hora if len(hora) > 5 else hora + ":00"
                        try:
                            ts = datetime.fromisoformat(f"{fecha}T{hora_norm}").timestamp() * 1000
                        except (ValueError, OSError):
                            continue
                        filas_orp.append({
                            "ts": ts, "fecha": fecha, "hora": hora_norm,
                            "modo": "—", "ph": None, "mv": val,
                            "temp": None, "archivo": Path(nombre).name, "desfase": None,
                        })

    if hay_separados and (filas_ph or filas_orp):
        unidas = unir_ph_orp(filas_ph, filas_orp)
        todas_las_filas.extend(unidas)

    if not todas_las_filas:
        return None

    todas_las_filas.sort(key=lambda f: f["ts"])
    return todas_las_filas
