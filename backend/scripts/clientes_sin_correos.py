"""
Lista los clientes SIN correos de distribución, según el Excel maestro.

Solo LEE el Excel (no toca la base ni los contactos). Usa la hoja
"Informes Laboratorios-Pack Line", la misma que importa
`importar_contactos_resultado.py`: por cada fila vigente mira las columnas de
especies (K-S) y reporta

  - SIN NADA : ninguna especie tiene correo de cliente (ni admin, comercial
               ni técnico).
  - SIN DISTRIBUCION : no tiene correo de cliente en NINGUNA especie, pero sí
               hay interno (admin/comercial/técnico).
  - POR ESPECIE : tiene correos en algunas especies y le faltan otras.

Uso (desde la carpeta backend):
  .venv\\Scripts\\python.exe scripts\\clientes_sin_correos.py
  .venv\\Scripts\\python.exe scripts\\clientes_sin_correos.py --excel "C:\\ruta\\maestro.xlsx"

Por defecto lee scripts\\importar_contactos_resultado_excel.xlsx. Deja un CSV
en logs\\ para abrirlo en Excel.
"""

import argparse
import csv
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from importar_contactos_resultado import (  # noqa: E402
    COLS_ESP,
    EXCEL_PATH,
    es_vigente,
    leer_excel,
    limpiar_emails,
)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--excel", default=str(EXCEL_PATH), help="ruta del Excel maestro")
    args = p.parse_args()
    if not Path(args.excel).exists():
        sys.exit(f"No existe el Excel: {args.excel}")

    ws = leer_excel(args.excel)
    sin_nada, sin_dist, por_especie = [], [], []
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, values_only=True):
        if not row[0] or not es_vigente(row[2]):
            continue
        cliente = f"{str(row[4] or '').strip()} · {str(row[6] or '').strip()}"
        internos = limpiar_emails(row[7]) + limpiar_emails(row[8]) + limpiar_emails(row[9])
        con = [c for i, c in COLS_ESP.items() if limpiar_emails(row[i])]
        sin = [c for i, c in COLS_ESP.items() if not limpiar_emails(row[i])]
        if not con and not internos:
            sin_nada.append(cliente)
        elif not con:
            sin_dist.append(cliente)
        elif sin:
            por_especie.append((cliente, sin))

    print(f"\n=== SIN NADA (ni cliente ni interno): {len(sin_nada)} ===")
    for c in sin_nada:
        print(f"  - {c}")
    print(f"\n=== SIN CORREO DE CLIENTE en ninguna especie (solo internos): {len(sin_dist)} ===")
    for c in sin_dist:
        print(f"  - {c}")
    print(f"\n=== FALTAN ALGUNAS ESPECIES: {len(por_especie)} ===")
    for c, sin in por_especie:
        print(f"  - {c}\n      sin correo en: {', '.join(sin)}")

    logs = SCRIPT_DIR.parent.parent / "logs"
    logs.mkdir(exist_ok=True)
    ruta = logs / f"clientes_sin_correos_{datetime.now():%Y%m%d_%H%M}.csv"
    with open(ruta, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["Estado", "Cliente · Planta", "Especies sin correo de cliente"])
        w.writerows(("SIN NADA", c, "TODAS") for c in sin_nada)
        w.writerows(("SIN CORREO CLIENTE", c, "TODAS") for c in sin_dist)
        w.writerows(("FALTAN ESPECIES", c, ", ".join(s)) for c, s in por_especie)
    print(f"\nCSV: {ruta}")


if __name__ == "__main__":
    main()
