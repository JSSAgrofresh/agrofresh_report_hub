"""
SOLO LECTURA: inventario de todo lo que hay en el bucket de R2, para poder ordenarlo con datos.

No mueve, no borra y no escribe nada en R2. Muestra:
  * cada carpeta de primer nivel (`solicitudes/`, `accutab/`, `informes/`, `auditoria/`, `_config/`...) con cuantos
    archivos tiene, cuanto pesa y la fecha del mas reciente, y dice si es una carpeta que el sistema conoce;
  * lo que NO es del sistema (carpetas de primer nivel desconocidas);
  * carpetas vacias (marcadores `algo/` sin nada dentro);
  * carpetas «gemelas»: el mismo nombre escrito de dos maneras en el mismo lugar (mayusculas, tildes, espacios:
    «Linea de Proceso» / «Línea de proceso»), que dividen los archivos en dos carpetas;
  * claves raras (barras dobles, espacios al principio o al final, nombres sin extension).
Deja la lista completa de archivos en logs/ (CSV) y los hallazgos en otro CSV.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\revisar_r2.py
"""
from __future__ import annotations

import csv
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Lo que el sistema mismo crea y lee en el bucket (ver CLAUDE.md). Todo lo demas es «desconocido».
CONOCIDAS = {
    "_config": "Configuración del sistema (listas, plantillas, permisos…). No se toca nunca.",
    "solicitudes": "Solicitudes de Toma de muestras (Excel, PDF, fotos).",
    "accutab": "Informes y datos de Accu-Tab (Post Venta).",
    "informes": "Storage → Informes: PDF de informes ordenados por planta/fecha/análisis/laboratorio.",
    "informes_papelera": "Papelera de la limpieza de Informes (reversible).",
    "auditoria": "Copia de los PDF que sube el Converter (la lee la ficha del informe).",
    "correo_informes": "PDF que llegaron al buzón de informes.",
    "costo_kilo": "Costo por kilo (C&M-500): informes y CSV originales.",
    "respaldos": "Respaldos de la base de datos (`respaldos/base/`, los borra solo a los 90 días).",
    "respaldos_bd": "Respaldos de esquemas de la base (`respaldar_schemas.py`).",
    "cruces": "Fotos de las muestras cruzadas en Ingreso al laboratorio (`cruces/<fecha>/<folio>/`).",
}


def normalizar(texto: str) -> str:
    """Sin tildes, mayusculas ni espacios de mas: lo que distingue dos carpetas «gemelas»."""
    s = unicodedata.normalize("NFKD", texto or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.casefold().split())


def resumen_por_carpeta(objetos: list[dict], profundidad: int = 1) -> dict[str, dict]:
    """{carpeta: {archivos, bytes, ultimo}} agrupando por los primeros `profundidad` segmentos de la clave."""
    salida: dict[str, dict] = {}
    for o in objetos:
        clave = o["clave"]
        if clave.endswith("/"):
            continue
        partes = clave.split("/")
        carpeta = "/".join(partes[:profundidad]) if len(partes) > profundidad else "(raíz)"
        r = salida.setdefault(carpeta, {"archivos": 0, "bytes": 0, "ultimo": None})
        r["archivos"] += 1
        r["bytes"] += o.get("tamano", 0)
        f = o.get("fecha")
        if f and (r["ultimo"] is None or f > r["ultimo"]):
            r["ultimo"] = f
    return salida


def carpetas_vacias(claves: list[str]) -> list[str]:
    """Marcadores `algo/` sin ningun archivo adentro."""
    todas = set(claves)
    vacias = []
    for c in sorted(claves):
        if not c.endswith("/"):
            continue
        if not any(o != c and o.startswith(c) for o in todas):
            vacias.append(c)
    return vacias


def carpetas_gemelas(claves: list[str]) -> list[tuple[str, list[str]]]:
    """Carpetas hermanas (mismo padre) cuyo nombre solo cambia en mayusculas, tildes o espacios.
    Devuelve [(padre, [escrituras distintas])]."""
    hijos: dict[str, set[str]] = defaultdict(set)
    for c in claves:
        partes = [p for p in c.split("/") if p != ""]
        carpetas = partes[:-1] if not c.endswith("/") else partes
        for i, nombre in enumerate(carpetas):
            hijos["/".join(carpetas[:i])].add(nombre)
    # Un padre solo se compara dentro de «su version normalizada»: si el padre mismo tiene gemelas, los hijos
    # de cada una se juntan para que se vea que son la misma carpeta partida.
    por_padre_norm: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for padre, nombres in hijos.items():
        pn = "/".join(normalizar(p) for p in padre.split("/")) if padre else ""
        for n in nombres:
            por_padre_norm[pn][normalizar(n)].add(n)
    salida = []
    for pn, grupos in sorted(por_padre_norm.items()):
        for _, escrituras in sorted(grupos.items()):
            if len(escrituras) > 1:
                salida.append((pn or "(raíz)", sorted(escrituras)))
    return salida


def claves_raras(claves: list[str]) -> list[tuple[str, str]]:
    raras = []
    for c in claves:
        if "//" in c:
            raras.append((c, "barra doble"))
        elif any(p != p.strip() for p in c.split("/")):
            raras.append((c, "espacio al principio o al final de un nombre"))
        elif not c.endswith("/") and "." not in c.rsplit("/", 1)[-1]:
            raras.append((c, "archivo sin extensión"))
    return raras


def _leer_objetos() -> list[dict]:
    from app import config, r2

    cliente = r2._get_client()
    objetos: list[dict] = []
    for pagina in cliente.get_paginator("list_objects_v2").paginate(Bucket=config.R2_BUCKET):
        for o in pagina.get("Contents", []):
            objetos.append({"clave": o["Key"], "tamano": o.get("Size", 0), "fecha": o.get("LastModified")})
    return objetos


def _mb(n: int) -> str:
    return f"{n / 1_048_576:,.1f} MB"


def main() -> int:
    from app import r2

    if not r2.disponible():
        print("R2 no esta configurado en este equipo (faltan las variables R2_* del .env).")
        return 1
    objetos = _leer_objetos()
    claves = [o["clave"] for o in objetos]
    print(f"\nBucket: {len(objetos):,} objetos, {_mb(sum(o['tamano'] for o in objetos))}")

    print("\n== Carpetas de primer nivel ==")
    nivel1 = resumen_por_carpeta(objetos, 1)
    for carpeta, r in sorted(nivel1.items(), key=lambda kv: -kv[1]["bytes"]):
        conocida = CONOCIDAS.get(carpeta.rstrip("/"))
        marca = "" if conocida else "   <-- NO ES DEL SISTEMA"
        ultimo = r["ultimo"].strftime("%d-%m-%Y") if r["ultimo"] else "—"
        print(f"  {carpeta:<24}{r['archivos']:>7,} archivos {_mb(r['bytes']):>12}   último {ultimo}{marca}")

    vacias = carpetas_vacias(claves)
    gemelas = carpetas_gemelas(claves)
    raras = claves_raras(claves)
    print(f"\n== Hallazgos ==\n  Carpetas vacías: {len(vacias)}\n  Carpetas gemelas (mismo nombre escrito distinto): {len(gemelas)}\n  Claves raras: {len(raras)}")
    for padre, escrituras in gemelas[:25]:
        print(f"    en {padre}: " + "  |  ".join(escrituras))
    if len(gemelas) > 25:
        print(f"    ... y {len(gemelas) - 25} más (están en el CSV)")

    marca = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    logs = _BACKEND / "logs"
    logs.mkdir(exist_ok=True)
    ruta_a = logs / f"revisar_r2_archivos_{marca}.csv"
    with open(ruta_a, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["clave", "bytes", "modificado"])
        for o in sorted(objetos, key=lambda o: o["clave"]):
            w.writerow([o["clave"], o["tamano"], o["fecha"].strftime("%Y-%m-%d %H:%M") if o["fecha"] else ""])
    ruta_h = logs / f"revisar_r2_hallazgos_{marca}.csv"
    with open(ruta_h, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["tipo", "detalle"])
        for padre, escrituras in gemelas:
            w.writerow(["carpetas gemelas", f"en {padre}: " + " | ".join(escrituras)])
        for c in vacias:
            w.writerow(["carpeta vacía", c])
        for c, motivo in raras:
            w.writerow(["clave rara", f"{c}  ({motivo})"])
        for carpeta, r in nivel1.items():
            if carpeta.rstrip("/") not in CONOCIDAS:
                w.writerow(["carpeta desconocida", f"{carpeta} ({r['archivos']} archivos, {_mb(r['bytes'])})"])
    print(f"\nListas completas:\n  {ruta_a}\n  {ruta_h}\nNo se cambió nada en R2.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
