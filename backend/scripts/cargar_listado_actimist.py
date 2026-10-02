"""
Carga el listado de Actimist (Sold To / Ship To) desde la dinámica del Planner.

Necesita la migración 0048_listado_actimist.sql. Solo escribe en
`cliente_actimist` / `planta_actimist`: el listado de Línea de proceso no se
toca. Nunca borra ni modifica lo que ya existe; lo que ya está se reconoce por
código SAP (o por nombre) y se deja igual. Se puede correr más de una vez.

Por defecto SOLO MUESTRA qué haría. Para escribir, `--aplicar`.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\cargar_listado_actimist.py "C:\\ruta\\Base de datos Planner.xlsx"
    .venv\\Scripts\\python.exe scripts\\cargar_listado_actimist.py "C:\\ruta\\Base de datos Planner.xlsx" --aplicar

Lo mismo se puede hacer desde Listados → Actimist → «Importar Excel», que
también muestra el plan antes de confirmar.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import listado_actimist  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("excel", help="Excel con Sold to Number / Sold to Name / Ship to Number / Ship to Name")
    parser.add_argument("--aplicar", action="store_true", help="Escribe en la base (sin esto solo muestra)")
    args = parser.parse_args()

    with open(args.excel, "rb") as f:
        filas = listado_actimist.leer_excel(f.read())

    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        clientes, plantas = listado_actimist.leer_actual(cur)
        plan = listado_actimist.planear(filas, clientes, plantas)

        print(f"\nFilas leídas del Excel: {plan['filas']}")
        print(f"Listado de Actimist hoy: {len(clientes)} Sold To, {len(plantas)} Ship To\n")
        print(f"  Sold To nuevos ........ {len(plan['clientes_nuevos'])}")
        print(f"  Ship To nuevos ........ {len(plan['plantas_nuevas'])}")
        print(f"  Sold To que ya estaban  {plan['clientes_existentes']}")
        print(f"  Ship To que ya estaban  {plan['plantas_existentes']}")
        if plan["avisos"]:
            print(f"\nAvisos ({len(plan['avisos'])}):")
            for a in plan["avisos"]:
                marca = "NO SE CARGA" if a["omitida"] else "aviso"
                print(f"  fila {a['fila']:>4} [{marca}] {a['sold_to']} / {a['ship_to'] or '—'}: {a['motivo']}")

        if not args.aplicar:
            print("\nNo se escribió nada. Para cargar, repite con --aplicar.\n")
            return
        creados = listado_actimist.aplicar(cur, plan)
    print(f"\nListo: se crearon {creados['clientes']} Sold To y {creados['plantas']} Ship To en Actimist.\n")


if __name__ == "__main__":
    main()
