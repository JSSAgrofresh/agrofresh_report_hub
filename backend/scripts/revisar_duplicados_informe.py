"""
Lista los N° Informe repetidos en `solicitud`, antes de aplicar la migración
0023 (que agrega UNIQUE en nro_solicitud).

Si aparece algo acá, la migración 0023 se va a detener con un error explícito
en vez de aplicarse a medias. Hay que resolver cada caso a mano -fusionar las
dos solicitudes, borrar la que sobra, o renombrar el N° Informe que está mal-
antes de reintentarla.

Esto no modifica nada. Solo mira y reporta.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\revisar_duplicados_informe.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402


def main() -> None:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            SELECT nro_solicitud, count(*) AS repeticiones,
                   array_agg(id ORDER BY id) AS ids
            FROM solicitud
            WHERE nro_solicitud IS NOT NULL
            GROUP BY nro_solicitud
            HAVING count(*) > 1
            ORDER BY count(*) DESC, nro_solicitud
            """
        )
        duplicados = cur.fetchall()

    if not duplicados:
        print("\nNo hay N° Informe duplicados. La migración 0023 puede aplicarse sin problema.\n")
        return

    print(f"\n{len(duplicados)} N° Informe duplicados:\n")
    for d in duplicados:
        print(f"  {d['nro_solicitud']!r}: {d['repeticiones']} veces -> solicitud.id {d['ids']}")
    print(
        "\nRevisa cada uno antes de correr la migración 0023 (agrega UNIQUE a "
        "nro_solicitud): compara los registros por id, decide cuál es el correcto, "
        "y fusiona, borra o renombra los demás.\n"
    )


if __name__ == "__main__":
    main()
