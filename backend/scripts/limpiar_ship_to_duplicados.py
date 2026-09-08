"""
Repara el daño de un bug en `importar_listados_finales.py` (ya corregido):
esa versión creaba, bajo el cliente placeholder "SIN SOLD TO ASIGNADO", una
sucursal duplicada por cada Ship To del maestro que YA existía correctamente
vinculada a su cliente real -en vez de reconocerla y solo activarla ahí-.

Esto borra esos duplicados: una `planta` bajo el placeholder cuyo nombre
(sin distinguir mayúsculas ni espacios de más) coincide con una `planta` que
ya existe bajo OTRO cliente. Solo borra el duplicado si no tiene ninguna
`solicitud` apuntándolo todavía -si la tiene, lo deja y lo avisa, para que se
revise a mano en vez de arriesgar perder un dato real-.

No toca las sucursales que de verdad no existían en ningún lado antes y
quedaron bajo el placeholder legítimamente -esas siguen ahí para revincular
a mano desde Listados → Ship To → Editar-.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\limpiar_ship_to_duplicados.py            # solo mirar
    .venv\\Scripts\\python.exe scripts\\limpiar_ship_to_duplicados.py --aplicar  # borrar los duplicados
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402

PLACEHOLDER_SIN_SOLD_TO = "SIN SOLD TO ASIGNADO"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="Borrar de verdad. Sin esto solo muestra.")
    args = p.parse_args()

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT id FROM cliente WHERE lower(trim(nombre)) = lower(%s)", (PLACEHOLDER_SIN_SOLD_TO,))
        fila = cur.fetchone()
        if not fila:
            print(f"\nNo existe el cliente '{PLACEHOLDER_SIN_SOLD_TO}': no hay nada que limpiar.\n")
            return
        placeholder_id = fila["id"]

        cur.execute(
            """
            SELECT ph.id AS id_duplicado, ph.nombre AS nombre_duplicado,
                   real.id AS id_real, c.nombre AS cliente_real,
                   (SELECT count(*) FROM solicitud WHERE planta_id = ph.id) AS solicitudes
              FROM planta ph
              JOIN planta real
                ON real.cliente_id <> %s
               AND lower(regexp_replace(trim(real.nombre), '\\s+', ' ', 'g'))
                 = lower(regexp_replace(trim(ph.nombre), '\\s+', ' ', 'g'))
              JOIN cliente c ON c.id = real.cliente_id
             WHERE ph.cliente_id = %s
             ORDER BY ph.nombre
            """,
            (placeholder_id, placeholder_id),
        )
        duplicados = cur.fetchall()

    if not duplicados:
        print("\nNo hay duplicados que limpiar bajo el placeholder.\n")
        return

    con_solicitudes = [d for d in duplicados if d["solicitudes"] > 0]
    sin_solicitudes = [d for d in duplicados if d["solicitudes"] == 0]

    print(f"\nEncontrados {len(duplicados)} duplicado(s) bajo '{PLACEHOLDER_SIN_SOLD_TO}':")
    for d in duplicados:
        aviso = f" (¡tiene {d['solicitudes']} solicitud(es)! no se borra sola)" if d["solicitudes"] else ""
        print(f"   {d['nombre_duplicado']:<40} ya existe en {d['cliente_real']}{aviso}")

    if con_solicitudes:
        print(f"\n{len(con_solicitudes)} de esos duplicados ya tienen solicitudes apuntándolos: "
              "revísalos a mano en Listados → Ship To antes de decidir qué hacer con ellos.")

    if not args.aplicar:
        print(f"\nModo mirar (sin --aplicar): no se borró nada. "
              f"Se borrarían {len(sin_solicitudes)} de {len(duplicados)}.\n")
        return

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        for d in sin_solicitudes:
            cur.execute("DELETE FROM planta WHERE id = %s", (d["id_duplicado"],))

    print(f"\nListo: se borraron {len(sin_solicitudes)} duplicado(s) sin solicitudes. "
          f"Quedaron {len(con_solicitudes)} para revisar a mano.\n")


if __name__ == "__main__":
    main()
