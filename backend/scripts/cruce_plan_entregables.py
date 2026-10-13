"""
Cruza los clientes de los planes de entregables de los comerciales con las plantas de la lista
de distribución de Línea de proceso.

Solo lee: no escribe nada en la base ni en R2. Deja un Excel en logs/ con:
  - Cruce: cada cliente del plan, su comercial, y la planta del sistema que parece ser
    (Sold To + Ship To oficiales) o los candidatos; una columna vacía para confirmar el nombre.
  - Plantas sin plan: plantas que la lista de distribución le asigna a ese comercial y que ningún
    cliente del plan parece ser (sirve para ver qué falta en el plan o en la lista).
  - Comerciales: qué correos de la lista se tomaron por cada comercial del plan (para revisarlos).

Cada cliente del plan se busca SOLO entre las plantas de su comercial. Si no se puede identificar
al comercial en la lista, se busca entre todas las plantas y se avisa.

Uso (desde la carpeta backend):
  .venv\\Scripts\\python.exe scripts\\cruce_plan_entregables.py "C:\\ruta\\carpeta con los Entregables_*.xlsx"
  .venv\\Scripts\\python.exe scripts\\cruce_plan_entregables.py "C:\\ruta\\Entregables_JCL.xlsx" "C:\\ruta\\Entregables_LA.xlsx"
Si un comercial sale mal identificado:
  --comercial "R. TRAVERSO=rtraverso@agrofresh.com"
"""
from __future__ import annotations

import argparse
import glob
import os
import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from openpyxl import Workbook  # noqa: E402
from openpyxl.styles import Alignment, Font, PatternFill  # noqa: E402
from openpyxl.utils import get_column_letter  # noqa: E402

from app import config_store  # noqa: E402
from app.listas_distribucion import ARCHIVO_CONTACTOS, del_servicio, estado_desde_contactos  # noqa: E402
from app.plan_cruce import correos_de_comercial, normalizar, plantas_de, proponer  # noqa: E402
from app.plan_entregables import leer_plan  # noqa: E402

CARPETA_LOGS = os.path.join(BACKEND_DIR.parent, "logs")
COLORES = {"Igual": "E3F4E6", "Probable": "EAF4D9", "Varias": "FFF3D6", "Revisar": "FFF3D6", "Sin candidato": "F9DADA"}


def _archivos(rutas: list[str]) -> list[str]:
    salida: list[str] = []
    for r in rutas:
        if os.path.isdir(r):
            salida += sorted(glob.glob(os.path.join(r, "*.xlsx")))
        else:
            salida.append(r)
    return salida


def _encabezado(ws, titulos: list[str]) -> None:
    for i, t in enumerate(titulos, 1):
        c = ws.cell(1, i, t)
        c.font, c.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1B5E20")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.freeze_panes = "A2"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rutas", nargs="+", help="Excel de los planes, o la carpeta que los contiene")
    ap.add_argument("--comercial", action="append", default=[], metavar="NOMBRE=correo",
                    help="Fija el correo de un comercial del plan (se puede repetir)")
    args = ap.parse_args()

    fijos = {}
    for par in args.comercial:
        nombre, _, correo = par.partition("=")
        fijos[normalizar(nombre)] = [c.strip().lower() for c in correo.split(",") if c.strip()]

    contactos = del_servicio(config_store.leer(ARCHIVO_CONTACTOS, []), "")  # Línea de proceso
    estado = estado_desde_contactos(contactos)
    internos = [c for c in contactos if c.get("tipo") == "resultado_interno" and c.get("activo", True)]
    todas = sorted((f["sold_to"], f["ship_to"]) for f in estado.values())
    print(f"Línea de proceso: {len(todas)} plantas con lista de distribución.")

    planes = []
    for ruta in _archivos(args.rutas):
        plan = leer_plan(ruta, os.path.basename(ruta))
        planes.append(plan)
        print(f"  {os.path.basename(ruta)}: {plan['comercial']} · {len(plan['filas'])} filas · {len(plan['descuadres'])} descuadres")

    wb = Workbook()
    ws = wb.active
    ws.title = "Cruce"
    cols = ["Estado", "Comercial", "Cliente en el plan", "Análisis planificados", "Sold To propuesto", "Ship To propuesto",
            "Otros candidatos (Sold To / Ship To)", "Nombre oficial: Sold To (confirmar)", "Nombre oficial: Ship To (confirmar)"]
    _encabezado(ws, cols)
    wc = wb.create_sheet("Comerciales")
    _encabezado(wc, ["Comercial en el plan", "Correos tomados de la lista", "Plantas que la lista le asigna", "Clientes en su plan"])
    wp = wb.create_sheet("Plantas sin plan")
    _encabezado(wp, ["Comercial", "Sold To", "Ship To"])

    resumen: dict[str, int] = {}
    for plan in planes:
        nombre = plan["comercial"]
        correos = fijos.get(normalizar(nombre)) or correos_de_comercial(nombre, internos)
        plantas = plantas_de(estado, correos) if correos else []
        aviso = ""
        if not plantas:
            plantas, aviso = todas, " (no se pudo identificar: se busca entre TODAS las plantas)"
        clientes: dict[str, int] = {}
        for f in plan["filas"]:
            clientes[f["cliente_plan"]] = clientes.get(f["cliente_plan"], 0) + f["cantidad"]
        usadas: set[tuple[str, str]] = set()
        filas = []
        for cliente, analisis in sorted(clientes.items()):
            r = proponer(cliente, plantas)
            if r["propuesta"]:
                usadas.add(r["propuesta"])
            filas.append((cliente, analisis, r))
            resumen[r["estado"]] = resumen.get(r["estado"], 0) + 1
        for cliente, analisis, r in sorted(filas, key=lambda x: (list(COLORES).index(x[2]["estado"]), x[0])):
            prop = r["propuesta"] or ("", "")
            otros = "  |  ".join(f"{s} / {h}" for s, h in r["candidatas"] if (s, h) != r["propuesta"])
            ws.append([r["estado"], nombre, cliente, analisis, prop[0], prop[1], otros, prop[0], prop[1]])
            ws.cell(ws.max_row, 1).fill = PatternFill("solid", fgColor=COLORES[r["estado"]])
        wc.append([nombre + aviso, ", ".join(correos) or "—", len(plantas), len(clientes)])
        for sold, ship in plantas:
            if (sold, ship) not in usadas:
                wp.append([nombre, sold, ship])
        print(f"  {nombre}: correos {', '.join(correos) or '—'} · {len(plantas)} plantas{aviso}")

    ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{ws.max_row}"
    for hoja, anchos in ((ws, [14, 22, 28, 12, 34, 38, 70, 34, 38]), (wc, [34, 50, 16, 16]), (wp, [22, 40, 44])):
        for i, a in enumerate(anchos, 1):
            hoja.column_dimensions[get_column_letter(i)].width = a

    os.makedirs(CARPETA_LOGS, exist_ok=True)
    salida = os.path.join(CARPETA_LOGS, f"cruce_plan_entregables_{datetime.now():%Y%m%d_%H%M%S}.xlsx")
    wb.save(salida)
    print("\nResumen:", resumen)
    print("Excel:", salida)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
