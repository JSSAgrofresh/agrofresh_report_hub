"""
Elimina TODOS los datos transaccionales de solicitudes de la base de datos.

Se borran (en orden):
  1. pendiente_revision  — sin FK a solicitud, independiente
  2. solicitud           — en cascada elimina resultado y producto_aplicado

Las tablas de verificaciones (verif_*), catálogos (cliente, planta, analito,
valor_lista, etc.) y usuarios NO se tocan.

Solo lectura por defecto; agrega --aplicar para ejecutar de verdad:

    cd backend
    .venv\\Scripts\\python.exe scripts\\limpiar_bd_solicitudes.py
    .venv\\Scripts\\python.exe scripts\\limpiar_bd_solicitudes.py --aplicar
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
from app import config  # carga el .env y expone DB_HOST / DATABASE_URL


def get_conn():
    if config.DATABASE_URL:
        return psycopg2.connect(config.DATABASE_URL)
    return psycopg2.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        dbname=config.DB_NAME,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        options="-c search_path=lab,public",
    )


def contar(cur, tabla: str) -> int:
    cur.execute(f"SELECT COUNT(*) FROM {tabla}")
    return cur.fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true", help="Ejecutar el borrado de verdad")
    args = parser.parse_args()

    conn = get_conn()
    try:
        cur = conn.cursor()

        n_solicitudes = contar(cur, "solicitud")
        n_resultados = contar(cur, "resultado")
        n_productos = contar(cur, "producto_aplicado")
        n_pendientes = contar(cur, "pendiente_revision")

        print("Estado actual de la base de datos:")
        print(f"  solicitud          : {n_solicitudes:>8,} filas")
        print(f"  resultado          : {n_resultados:>8,} filas  (se borra en cascada)")
        print(f"  producto_aplicado  : {n_productos:>8,} filas  (se borra en cascada)")
        print(f"  pendiente_revision : {n_pendientes:>8,} filas")

        if not args.aplicar:
            total = n_solicitudes + n_pendientes
            print(f"\n[SIMULACIÓN] Se eliminarían {total:,} filas directas "
                  f"(+ {n_resultados + n_productos:,} en cascada).")
            print("Agrega --aplicar para ejecutar de verdad.")
            return

        print("\nBorrando datos…")
        cur.execute("DELETE FROM pendiente_revision")
        print(f"  ✓ pendiente_revision: {cur.rowcount:,} filas eliminadas")
        cur.execute("DELETE FROM solicitud")
        print(f"  ✓ solicitud (+ cascada): {cur.rowcount:,} filas eliminadas")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print("\nListo. La base quedó sin solicitudes.")


if __name__ == "__main__":
    main()
