"""
Vacía los datos de Report/Data Core (`solicitud`, `resultado`,
`producto_aplicado`, `pendiente_revision`) para poder volver a cargar un
Excel de prueba desde cero -por ejemplo, para comprobar de punta a punta que
el chequeo de integridad contra Listados (Data Core → Chequeo de integridad)
funciona con datos reales-.

LO QUE ESTO NO TOCA -a propósito-:
  - Listados (cliente, planta, valor_lista): son el catálogo, no un reporte.
  - `mapeo_confirmado`: la memoria de homologaciones ya confirmadas a mano.
  - `analito` / `analito_limite`: el catálogo de analitos y sus límites.
  - Toma de muestras (las solicitudes de laboratorio, módulo AgroFresh Lab):
    viven en R2/disco como archivos .xlsx, es un sistema completamente aparte
    de este -ver toma_muestras.py-. Esto no borra ni una.
  - `lab_staging` / `lab_backup_*` (si existieran de una auditoría en curso):
    se dejan intactos.

Es DESTRUCTIVO e IRREVERSIBLE sobre la base en vivo. Corre primero
`deploy\\windows\\respaldar.ps1` -o un respaldo manual con pg_dump- antes de
usar --aplicar. Pide escribir "SI" para confirmar; no hay forma de saltarse
esa confirmación desde la línea de comandos.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\vaciar_reportes.py            # solo mirar cuántas filas hay
    .venv\\Scripts\\python.exe scripts\\vaciar_reportes.py --aplicar  # vaciar de verdad (pide confirmar)
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402

# Orden: primero las que dependen de `solicitud` (por más que tengan
# ON DELETE CASCADE, ser explícito acá deja claro qué se está vaciando y no
# depende de que la restricción exista tal cual en todas las instalaciones).
TABLAS = ("resultado", "producto_aplicado", "solicitud", "pendiente_revision")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="Vaciar de verdad. Sin esto solo cuenta filas.")
    args = p.parse_args()

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        conteos = {}
        for tabla in TABLAS:
            cur.execute(f"SELECT count(*) AS n FROM {tabla}")
            conteos[tabla] = cur.fetchone()["n"]

    print("\nFilas actuales:")
    for tabla, n in conteos.items():
        print(f"   {tabla:<20} {n:>8,}".replace(",", "."))
    total = sum(conteos.values())

    if total == 0:
        print("\nYa está todo vacío: no hay nada que borrar.\n")
        return

    if not args.aplicar:
        print(f"\nModo mirar (sin --aplicar): no se borró nada. {total:,} fila(s) en total.\n".replace(",", "."))
        return

    print(f"\nSe van a BORRAR {total:,} fila(s) de {', '.join(TABLAS)}.".replace(",", "."))
    print("Esto es IRREVERSIBLE. Asegúrate de haber corrido el respaldo antes de seguir.")
    respuesta = input('Escribe "SI" (en mayúsculas) para confirmar: ').strip()
    if respuesta != "SI":
        print("Cancelado: no se borró nada.\n")
        return

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        for tabla in TABLAS:
            cur.execute(f"DELETE FROM {tabla}")

    print(f"\nListo: se borraron {total:,} fila(s). La base de Report/Data Core quedó vacía.\n".replace(",", "."))
    print("Listados, Toma de muestras y el catálogo de analitos quedaron intactos.\n")


if __name__ == "__main__":
    main()
