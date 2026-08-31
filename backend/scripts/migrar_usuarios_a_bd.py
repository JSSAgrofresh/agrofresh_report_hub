"""
Pasa el padrón de cuentas desde `usuarios.json` (R2 o disco) a la tabla
`usuario`.

Se corre UNA vez, después de aplicar la migración 0019. Es idempotente: una
cuenta que ya está en la tabla se salta, así que volver a correrlo no
duplica ni pisa nada.

Nadie sale de acá con contrasena. Las cuentas quedan con `password_hash` en
NULL, que significa "existe pero todavía no puede entrar". Después:

    python scripts/clave.py jorge.sandoval@agrofresh.com

Es a propósito: una contrasena generada por un script y mostrada en la
consola termina en el historial de la terminal, y una escrita en el código
termina en git para siempre.

Uso:
    cd backend
    python scripts/migrar_usuarios_a_bd.py            # solo mirar
    python scripts/migrar_usuarios_a_bd.py --aplicar  # insertar de verdad
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config_store  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.usuarios import CORREO_MAESTRO  # noqa: E402

# Con qué cuentas nace el sistema si `usuarios.json` no existe. Es la misma
# lista que tenía `usuarios.py` antes de mover el padrón a la base.
SEMILLA: list[dict] = [
    {
        "email": CORREO_MAESTRO,
        "nombre": "Jorge Sandoval",
        "tipoAcceso": "admin_general",
    },
    {
        "email": "psalazar@agrofresh.com",
        "nombre": "Patricia Salazar",
        "tipoAcceso": "admin_area",
        "area": "cromatografia",
        "modulos": ["converter", "reports", "storage", "toma_muestras"],
        "reportes": ["laboratorio", "emitir"],
    },
    {
        "email": "rpoblete@agrofresh.com",
        "nombre": "Rodrigo Poblete",
        "tipoAcceso": "admin_area",
        "area": "postventa",
        "modulos": ["trace", "reports"],
        "reportes": ["postventa"],
    },
]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="Insertar de verdad. Sin esto solo muestra.")
    args = p.parse_args()

    cuentas = config_store.leer("usuarios.json", [])
    origen = "usuarios.json"
    if not cuentas:
        cuentas, origen = SEMILLA, "la lista inicial (no había usuarios.json)"
    print(f"\n{len(cuentas)} cuenta(s) en {origen}.\n")

    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        nuevas = omitidas = 0
        for c in cuentas:
            email = (c.get("email") or "").strip()
            if not email:
                continue
            cur.execute("SELECT 1 FROM usuario WHERE lower(email) = lower(%s)", (email,))
            if cur.fetchone():
                print(f"  ya estaba   {email}")
                omitidas += 1
                continue
            print(f"  {'se inserta ' if args.aplicar else 'se insertaría'} {email:<38} {c.get('tipoAcceso')}")
            nuevas += 1
            if not args.aplicar:
                continue
            cur.execute(
                """
                INSERT INTO usuario
                    (email, nombre, tipo_acceso, area, cliente_nombre, planta_nombre, modulos, reportes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    email,
                    c.get("nombre") or email,
                    c.get("tipoAcceso") or "muestreador",
                    c.get("area"),
                    c.get("clienteNombre"),
                    c.get("plantaNombre"),
                    c.get("modulos"),
                    c.get("reportes"),
                ),
            )

        print(f"\n{nuevas} nueva(s), {omitidas} ya estaba(n).")
        if not args.aplicar:
            print("\nEsto fue solo una vista previa. Agrega --aplicar para insertarlas.")
            return
        print(
            "\nNinguna cuenta tiene contrasena todavía, así que ninguna puede entrar.\n"
            "Asigna la primera para poder administrar el resto:\n\n"
            f"    python scripts/clave.py {CORREO_MAESTRO}\n"
        )


if __name__ == "__main__":
    main()
