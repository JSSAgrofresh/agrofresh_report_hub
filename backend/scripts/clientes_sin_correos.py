"""
Lista los clientes/plantas SIN correos para distribuir resultados.

Solo LEE (no escribe nada). Para cada planta (Ship To) y cada especie con la
que tiene solicitudes, resuelve los contactos de «Resultado a clientes» igual
que el envío real (`toma_muestras._contactos_resultado`) y clasifica:

  SIN NADA        no hay ningún contacto activo con correo (ni cliente ni
                  interno): hoy el correo iría solo a Jorge y Claudia.
  SIN DISTRIBUCION hay internos (técnicos/comerciales) pero ningún contacto
                  `resultado_cliente`: no hay lista de distribución al cliente.
  SOLO GLOBAL     lo único que encuentra es el contacto global (sin cliente
                  ni planta): la planta no está realmente configurada.

También lista las plantas activas sin ninguna solicitud (sin especie).
Deja un CSV en logs/ para abrirlo en Excel.

Uso (desde la carpeta backend):
  .venv\\Scripts\\python.exe scripts\\clientes_sin_correos.py
"""

from __future__ import annotations

import csv
import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.db import conexion, cursor_dict  # noqa: E402
from app.toma_muestras import _contactos_resultado  # noqa: E402


def clasificar(sold_to: str, ship_to: str, especie: str) -> str:
    activos = [
        c for c in _contactos_resultado(sold_to, ship_to, especie)
        if c.get("activo", True) and str(c.get("email") or "").strip()
    ]
    if not activos:
        return "SIN NADA"
    if all(not (c.get("sold_to") or "").strip() and not (c.get("ship_to") or "").strip() for c in activos):
        return "SOLO GLOBAL"
    if not any(c.get("tipo") == "resultado_cliente" for c in activos):
        return "SIN DISTRIBUCION"
    return "OK"


def main() -> None:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """
            SELECT c.nombre AS sold_to, p.nombre AS ship_to,
                   COALESCE(NULLIF(TRIM(s.especie), ''), '') AS especie, COUNT(s.id) AS solicitudes
            FROM planta p
            JOIN cliente c ON c.id = p.cliente_id
            LEFT JOIN solicitud s ON s.planta_id = p.id
            WHERE c.activo AND p.activo
            GROUP BY c.nombre, p.nombre, COALESCE(NULLIF(TRIM(s.especie), ''), '')
            ORDER BY c.nombre, p.nombre, especie
            """
        )
        filas = cur.fetchall()

    problemas = []
    for f in filas:
        estado = clasificar(f["sold_to"], f["ship_to"], f["especie"])
        if estado != "OK":
            problemas.append((estado, f["sold_to"], f["ship_to"], f["especie"] or "(sin solicitudes)", f["solicitudes"]))

    for titulo, clave in (
        ("SIN NADA (ningún correo)", "SIN NADA"),
        ("SIN DISTRIBUCION (solo internos, ninguno al cliente)", "SIN DISTRIBUCION"),
        ("SOLO GLOBAL (planta sin configurar)", "SOLO GLOBAL"),
    ):
        grupo = [p for p in problemas if p[0] == clave]
        print(f"\n=== {titulo}: {len(grupo)} combinaciones ===")
        actual = None
        for _, sold_to, ship_to, especie, n in grupo:
            if (sold_to, ship_to) != actual:
                print(f"\n{sold_to} · {ship_to}")
                actual = (sold_to, ship_to)
            print(f"    - {especie}  ({n} solicitudes)")

    logs = BACKEND_DIR.parent / "logs"
    logs.mkdir(exist_ok=True)
    ruta = logs / f"clientes_sin_correos_{datetime.now():%Y%m%d_%H%M}.csv"
    with open(ruta, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["Estado", "Cliente (Sold To)", "Planta (Ship To)", "Especie", "Solicitudes"])
        w.writerows(problemas)
    print(f"\nCSV: {ruta}")


if __name__ == "__main__":
    main()
