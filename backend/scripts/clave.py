"""
Asigna la contrasena de una cuenta.

Existe para dos momentos: darle contrasena a la primera cuenta (que todavía
no tiene a nadie que pueda administrarla desde el sistema) y rescatar a
alguien que quedó fuera. El resto del tiempo, las contrasenas se manejan
desde el sistema.

La contrasena se pide por teclado y no se muestra ni se pasa por argumento:
lo que se escribe en la línea de comandos queda en el historial de la
terminal, a la vista de cualquiera que abra esa consola después.

Uso:
    cd backend
    python scripts/clave.py jorge.sandoval@agrofresh.com
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import seguridad  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("email", help="Correo de la cuenta.")
    p.add_argument(
        "--obligar-cambio",
        action="store_true",
        help="Marcarla para que su dueno tenga que cambiarla al entrar.",
    )
    args = p.parse_args()

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id, email, nombre, tipo_acceso FROM usuario WHERE lower(email) = lower(%s)",
            (args.email.strip(),),
        )
        fila = cur.fetchone()
        if fila is None:
            raise SystemExit(
                f"No hay ninguna cuenta con el correo {args.email!r}.\n"
                "¿Corriste `python scripts/migrar_usuarios_a_bd.py --aplicar`?"
            )

        print(f"\nCuenta: {fila['nombre']} <{fila['email']}>  ({fila['tipo_acceso']})")
        print(f"Mínimo {seguridad.LARGO_MINIMO_PASSWORD} caracteres. Una frase larga sirve.\n")

        clave = getpass.getpass("Contrasena nueva: ")
        if clave != getpass.getpass("Repítela: "):
            raise SystemExit("Las dos contrasenas no coinciden. No se cambió nada.")
        try:
            seguridad.validar_password(clave)
        except seguridad.PasswordInvalida as e:
            raise SystemExit(str(e)) from e

        cur.execute(
            "UPDATE usuario SET password_hash = %s, debe_cambiar = %s, actualizado_en = now() WHERE id = %s",
            (seguridad.hashear_password(clave), args.obligar_cambio, fila["id"]),
        )
        # Cualquier sesión abierta se abrió con la clave anterior. Si esto se
        # está usando porque alguien cree que se la vieron, dejarlas vivas
        # haría inútil el cambio.
        cur.execute("DELETE FROM sesion WHERE usuario_id = %s", (fila["id"],))
        print(f"\nListo. {fila['email']} ya puede entrar.")


if __name__ == "__main__":
    main()
