"""
Resuelve a mano los 3 casos de inconsistencia que encontramos en el Excel
maestro de Sold To/Ship To (Filtros_Obligatorios.xlsx, septiembre 2026):
mismo N° Sold To con más de un nombre. El usuario decidió "homogenizarlos,
no es tan delicado" -no son casos especiales, se resuelven con la misma
memoria de mapeos (mapeo_confirmado) que usa cualquier otra corrección
confirmada a mano en Data Core-.

Casos:
- N° 447602: "COPEFRUT SA (CENKIWI)" / "(LINARES)" / "(ROMERAL)" -> se
  mantiene "COPEFRUT SA (CENKIWI)" como el registrado en cliente (fue el
  primero importado en 0007), y se guardan los otros 2 nombres como alias
  hacia el mismo cliente.
- N° 10016745: "QUIMICA ITALQUIM SA" (sin puntos, el que quedó en cliente)
  <- alias "QUIMICA ITALQUIM S.A."

El Ship To duplicado (N° 10005571 "GREENVIC CALLAQUI", aparece bajo
GREENVIC SPA Y bajo GROW SOUTHWEST S.A.) NO se resuelve acá: no hay forma de
saber cuál de los dos es el dueño real sin decisión de negocio, así que solo
se imprime como advertencia para decidir a mano desde Listados.

Uso:
    cd backend && python3 scripts/homogenizar_sold_to_conocidos.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402
from app.ingest import clave_normalizada_empresa  # noqa: E402

ALIAS_SOLD_TO = [
    # (nombre ya registrado en cliente, alias a recordar)
    ("COPEFRUT SA (CENKIWI)", "COPEFRUT SA (LINARES)"),
    ("COPEFRUT SA (CENKIWI)", "COPEFRUT SA (ROMERAL)"),
    ("QUIMICA ITALQUIM SA", "QUIMICA ITALQUIM S.A."),
]


def main() -> None:
    with conexion() as conn, cursor_dict(conn) as cur:
        for nombre_oficial, alias in ALIAS_SOLD_TO:
            cur.execute("SELECT id FROM cliente WHERE nombre = %s", (nombre_oficial,))
            fila = cur.fetchone()
            if not fila:
                print(f"AVISO: no encontré '{nombre_oficial}' en cliente -¿ya se corrigió el nombre?- se omite.")
                continue
            clave = clave_normalizada_empresa(alias)
            cur.execute(
                "INSERT INTO mapeo_confirmado (entidad, cliente_id, valor_crudo, valor_crudo_normalizado, destino_id) "
                "VALUES ('sold_to', NULL, %s, %s, %s) ON CONFLICT (entidad, cliente_id, valor_crudo_normalizado) DO NOTHING",
                (alias, clave, fila["id"]),
            )
            print(f"'{alias}' -> '{nombre_oficial}' (recordado)")

        cur.execute(
            "SELECT c.nombre AS cliente, p.nombre AS planta, p.codigo_sap "
            "FROM planta p JOIN cliente c ON c.id = p.cliente_id WHERE p.codigo_sap = %s",
            ("10005571",),
        )
        conflicto = cur.fetchall()

    print("\nShip To en conflicto -N° 10005571, aparece en más de un Sold To en el Excel- pendiente de decisión manual:")
    for r in conflicto or [{"cliente": "GREENVIC SPA", "planta": "GREENVIC CALLAQUI"}, {"cliente": "GROW SOUTHWEST S.A.", "planta": "GREENVIC CALLAQUI"}]:
        print(f"  {r}")
    print("Corrígelo desde Listados → Ship To cuando definan a cuál Sold To pertenece realmente.")


if __name__ == "__main__":
    main()
