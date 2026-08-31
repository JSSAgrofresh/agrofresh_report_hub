"""
Lista y borra los schemas de respaldo que deja cada promoción de Data Core.

Promover renombra el schema entero: `lab` pasa a llamarse
`lab_backup_<fecha>` y la copia de trabajo toma su lugar. Eso hace que
promover sea instantáneo y reversible, pero nada borra los respaldos
después: cada promoción deja una copia COMPLETA de la base ocupando disco
para siempre, y la vista ERD termina mostrando las mismas tablas repetidas
una vez por respaldo.

Por defecto solo muestra qué hay. Para borrar hay que pedirlo explícitamente.

Uso:
    cd backend
    python scripts/limpiar_respaldos.py                  # solo mirar
    python scripts/limpiar_respaldos.py --conservar 3    # cuántos dejar (default 2)
    python scripts/limpiar_respaldos.py --aplicar        # borrar de verdad

Se conservan siempre los más recientes: el arranque del backend los usa para
reparar tablas que una versión antigua de /promover dejaba fuera de `lab`.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402


def _tamano(n: int) -> str:
    for unidad in ("B", "KB", "MB", "GB"):
        if n < 1024 or unidad == "GB":
            return f"{n:.0f} {unidad}" if unidad == "B" else f"{n / 1:.1f} {unidad}"
        n /= 1024
    return f"{n:.1f} GB"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--conservar", type=int, default=2, help="Cuántos respaldos recientes dejar (default 2).")
    p.add_argument("--aplicar", action="store_true", help="Borrar de verdad. Sin esto solo muestra.")
    args = p.parse_args()
    if args.conservar < 0:
        raise SystemExit("--conservar no puede ser negativo.")

    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            SELECT n.nspname AS schema,
                   COALESCE(sum(pg_total_relation_size(c.oid)), 0) AS bytes,
                   count(c.oid) FILTER (WHERE c.relkind = 'r') AS tablas
            FROM pg_namespace n
            LEFT JOIN pg_class c ON c.relnamespace = n.oid
            WHERE n.nspname = 'lab' OR n.nspname LIKE 'lab\\_%'
            GROUP BY 1 ORDER BY 1
            """
        )
        filas = cur.fetchall()
        if not filas:
            print("No se encontró ningún schema `lab`.")
            return

        print(f"\n{'SCHEMA':<34}{'TABLAS':>8}{'TAMAÑO':>12}")
        print("-" * 54)
        for f in filas:
            print(f"  {f['schema']:<32}{f['tablas']:>8}{_tamano(f['bytes']):>12}")

        respaldos = sorted(
            (f for f in filas if f["schema"].startswith("lab_backup_")),
            key=lambda f: f["schema"],
            reverse=True,
        )
        total = sum(f["bytes"] for f in respaldos)
        print(f"\n{len(respaldos)} respaldo(s), {_tamano(total)} en total.")
        if not respaldos:
            print("Nada que limpiar.")
            return

        conservar = respaldos[: args.conservar]
        borrar = respaldos[args.conservar:]
        if conservar:
            print(f"\nSe conservan los {len(conservar)} más recientes:")
            for f in conservar:
                print(f"   {f['schema']}")
        if not borrar:
            print("\nNo sobra ninguno para borrar.")
            return

        liberado = sum(f["bytes"] for f in borrar)
        print(f"\n{'Se borrarían' if not args.aplicar else 'Se borran'} {len(borrar)}, liberando {_tamano(liberado)}:")
        for f in borrar:
            print(f"   {f['schema']:<32}{_tamano(f['bytes']):>12}")

        if not args.aplicar:
            print("\nEsto fue solo una vista previa. Agrega --aplicar para borrarlos.")
            return

        for f in borrar:
            # El nombre viene de information_schema y calza con lab_backup_%,
            # así que no hay texto de terceros en la sentencia.
            cur.execute(f'DROP SCHEMA IF EXISTS "{f["schema"]}" CASCADE')
            print(f"   borrado {f['schema']}")
        print(f"\nListo: {len(borrar)} respaldo(s) borrado(s), {_tamano(liberado)} liberados.")


if __name__ == "__main__":
    main()
