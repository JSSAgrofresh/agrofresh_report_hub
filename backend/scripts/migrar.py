"""
Aplica un archivo .sql de `migrations/` usando la MISMA conexión que usa el
sistema.

Existe para no tener que repetir a mano los datos de la base. Con `psql` hay
que acordarse del host, del nombre y del usuario —o pegar la URL entera de
Neon, que además lleva la contraseña y termina en el historial de la
terminal—. Acá todo eso sale de `backend/.env`, que es donde ya está.

Cada archivo se aplica en UNA transacción: si algo falla a mitad de camino,
no queda media migración aplicada.

Uso:
    cd backend
    python scripts/migrar.py                    # qué migraciones hay
    python scripts/migrar.py 0019               # aplica la 0019
    python scripts/migrar.py 0019_usuarios_y_sesiones.sql
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion  # noqa: E402

CARPETA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "migrations")


def _disponibles() -> list[str]:
    return sorted(f for f in os.listdir(CARPETA) if f.endswith(".sql"))


def main() -> None:
    if len(sys.argv) != 2:
        print("\nMigraciones disponibles:\n")
        for f in _disponibles():
            print(f"   {f}")
        print("\nPara aplicar una:  python scripts/migrar.py 0019\n")
        return

    pedido = sys.argv[1]
    # Se acepta "0019", "0019_usuarios_y_sesiones" o el nombre completo: en la
    # práctica uno se acuerda del número, no del nombre entero.
    candidatos = [f for f in _disponibles() if f == pedido or f.startswith(pedido)]
    if not candidatos:
        raise SystemExit(f"No hay ninguna migración que empiece con {pedido!r}. Corre el script sin argumentos para verlas.")
    if len(candidatos) > 1:
        raise SystemExit(f"{pedido!r} calza con varias: {', '.join(candidatos)}. Sé más específico.")

    ruta = os.path.join(CARPETA, candidatos[0])
    with open(ruta, encoding="utf-8") as f:
        sql = f.read()

    print(f"\nAplicando {candidatos[0]}…")
    with conexion() as conn, conn.cursor() as cur:
        cur.execute(sql)
    print("Listo. Quedó aplicada.\n")


if __name__ == "__main__":
    main()
