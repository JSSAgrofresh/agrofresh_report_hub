"""
Explica por qué una solicitud NO aparece en Toma de muestras → Solicitudes.

El listado lee el índice (`solicitud_archivo`) y descarta en silencio las
solicitudes cuyos datos no pasan la validación de `Solicitud`. Este script
hace lo mismo que el endpoint pero imprime el MOTIVO de cada descarte.
Solo lee: no escribe nada en la base ni en R2.

Uso:
    cd backend
    python scripts/diagnosticar_listado_solicitudes.py            # todas las descartadas
    python scripts/diagnosticar_listado_solicitudes.py OT-AGF0050 # una en particular
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import indice_solicitudes  # noqa: E402
from app.toma_muestras import Solicitud  # noqa: E402


def diagnosticar(pares: list[tuple[str, dict]], filtro: str = "") -> tuple[int, list[tuple[str, str]]]:
    """(total revisadas, [(archivo, motivo)]) de las que el listado descartaría."""
    descartadas: list[tuple[str, str]] = []
    for nombre, datos in pares:
        try:
            Solicitud(archivo=nombre, **datos)
        except (ValueError, KeyError) as exc:
            descartadas.append((nombre, str(exc)))
    if filtro:
        descartadas = [d for d in descartadas if filtro.lower() in d[0].lower()]
    return len(pares), descartadas


def main() -> None:
    filtro = sys.argv[1] if len(sys.argv) > 1 else ""
    pares = indice_solicitudes.listar()
    total, descartadas = diagnosticar(pares, filtro)
    print(f"\nEn el índice: {total} solicitud(es).")
    if filtro:
        en_indice = [n for n, _ in pares if filtro.lower() in n.lower()]
        print(f"Coinciden con '{filtro}' en el índice: {en_indice or 'NINGUNA (no está indexada)'}")
    print(f"El listado descartaría por datos inválidos: {len(descartadas)}\n")
    for nombre, motivo in descartadas:
        print(f"--- {nombre}\n{motivo}\n")
    if not descartadas:
        print("Ninguna falla la validación. Si igual faltan en pantalla, mira el filtro por cuenta\n"
              "(muestreador solo ve las suyas) o los filtros de la pantalla.\n")


if __name__ == "__main__":
    main()
