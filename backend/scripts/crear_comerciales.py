"""
Crea cuentas de tipo «comercial» con nombre y correo numerados (Comercial 1, comercial1@agrofresh.com, ...).

La idea: el administrador general entra después a Administración → Usuarios, ve quién es quién y les pone a mano el
nombre, el correo y las plantas (Editar). Mientras no tengan plantas asignadas no ven nada. Cada cuenta nace con
Report y Storage, solo lectura, y con una contraseña temporal que su dueño debe cambiar al entrar.

Como los demás scripts que escriben en la base, primero MIRA y solo aplica con --aplicar. Las contraseñas temporales
se muestran UNA vez, al aplicar: no se guardan en claro en ninguna parte.

Uso (ya dentro de backend, después de la migración 0063):
    .venv\\Scripts\\python.exe scripts\\crear_comerciales.py --cantidad 4
    .venv\\Scripts\\python.exe scripts\\crear_comerciales.py --cantidad 4 --aplicar
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from psycopg2.extras import Json  # noqa: E402

from app import seguridad  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

DOMINIO = "agrofresh.com"
MODULOS = ["reports", "storage"]
REPORTES = ["laboratorio"]


def planificar(correos_existentes: set[str], cantidad: int) -> list[tuple[int, str, str]]:
    """(número, nombre, correo) de las cuentas nuevas. Salta los números cuyo correo ya existe, así volver a correr
    el script nunca pisa ni duplica una cuenta."""
    existentes = {c.casefold() for c in correos_existentes}
    plan: list[tuple[int, str, str]] = []
    n = 0
    while len(plan) < cantidad:
        n += 1
        correo = f"comercial{n}@{DOMINIO}"
        if correo.casefold() in existentes:
            continue
        plan.append((n, f"Comercial {n}", correo))
    return plan


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--cantidad", type=int, default=4, help="Cuántas cuentas crear (por defecto 4).")
    p.add_argument("--aplicar", action="store_true", help="Escribir en la base. Sin esto solo muestra lo que haría.")
    args = p.parse_args()
    if not 1 <= args.cantidad <= 50:
        raise SystemExit("La cantidad tiene que estar entre 1 y 50.")

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT email FROM usuario")
        plan = planificar({f["email"] for f in cur.fetchall()}, args.cantidad)

        print(f"\nSe crearían {len(plan)} cuentas de comercial (Report y Storage, solo lectura, sin plantas):\n")
        for _, nombre, correo in plan:
            print(f"  {nombre:<14} {correo}")
        if not args.aplicar:
            print("\nNo se escribió nada. Para crearlas: agrega --aplicar")
            return

        creadas = []
        for _, nombre, correo in plan:
            temporal = seguridad.password_temporal()
            cur.execute(
                """
                INSERT INTO usuario
                    (email, nombre, tipo_acceso, area, modulos, reportes, plantas_asignadas, password_hash, debe_cambiar)
                VALUES (%s, %s, 'comercial', NULL, %s, %s, %s, %s, TRUE)
                """,
                (correo, nombre, MODULOS, REPORTES, Json([]), seguridad.hashear_password(temporal)),
            )
            creadas.append((nombre, correo, temporal))

    print("\nCreadas. Anota las contraseñas ahora: no se vuelven a mostrar (si se pierde una, se reinicia desde Usuarios).\n")
    for nombre, correo, temporal in creadas:
        print(f"  {nombre:<14} {correo:<34} {temporal}")
    print(
        "\nSiguiente paso: Administración → Usuarios → Editar en cada una, para ponerle su nombre, su correo y sus plantas."
    )


if __name__ == "__main__":
    main()
