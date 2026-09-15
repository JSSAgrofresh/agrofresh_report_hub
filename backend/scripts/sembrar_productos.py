"""
Carga los productos disponibles para Actimist y Línea de proceso en todos
los laboratorios configurados.

Es idempotente: si un producto (mismo nombre + laboratorio + tipo_aplicacion)
ya existe, no lo duplica.

Uso:
    cd backend
    python scripts/sembrar_productos.py            # solo mostrar qué se agregaría
    python scripts/sembrar_productos.py --aplicar  # escribir
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config_store  # noqa: E402

PRODUCTOS_ACTIMIST = [
    "ECOFOG 80",
    "ECOFOG 100",
    "ECOFOG 160",
    "ACTIMIST PYR",
    "SCHOLAR RTU",
]

PRODUCTOS_LINEA_PROCESO = [
    "FUNGAFLOR 75 SG-1",
    "FUNGAZIL 500 EC",
    "SHIELD-BRITE FDL 230SC (1L)",
    "SCHOLAR",
    "TECTO 500 SC (1L)",
    "GRADUATE A+",
    "SHIELD LIQUID DPA 31% (208L)",
    "SHIELD LIQUID DPA 31%",
    "ACTISEAL PYR (1L)",
    "SHIELD BRITE PYR 400 SC",
    "SHIELD BRITE FDL 230 SC (20L)",
    "SHIELD BRITE TEBU 430 SC",
    "PACRITE AZOXY 250 SC",
]


def main(aplicar: bool) -> None:
    labs_cfg = config_store.leer("laboratorios.json", []) or []
    laboratorios = [l["codigo"] for l in labs_cfg if l.get("activo", True) and l.get("codigo")]
    if not laboratorios:
        laboratorios = ["QUITECA", "AGROFRESH", "ALS", "DIAGNOFRUIT"]

    items: list[dict] = config_store.leer("productos.json", []) or []

    def ya_existe(nombre: str, lab: str, tipo: str) -> bool:
        return any(
            p.get("nombre") == nombre
            and p.get("laboratorio") == lab
            and p.get("tipo_aplicacion") == tipo
            for p in items
        )

    def siguiente_id() -> int:
        return max((p.get("id", 0) for p in items), default=0) + 1

    nuevos: list[dict] = []
    for lab in laboratorios:
        for nombre in PRODUCTOS_ACTIMIST:
            if not ya_existe(nombre, lab, "Actimist"):
                nuevos.append({
                    "id": 0,
                    "nombre": nombre,
                    "codigo": None,
                    "laboratorio": lab,
                    "tipo_aplicacion": "Actimist",
                    "activo": True,
                    "orden": len(items) + len(nuevos) + 1,
                })
        for nombre in PRODUCTOS_LINEA_PROCESO:
            if not ya_existe(nombre, lab, "Línea de proceso"):
                nuevos.append({
                    "id": 0,
                    "nombre": nombre,
                    "codigo": None,
                    "laboratorio": lab,
                    "tipo_aplicacion": "Línea de proceso",
                    "activo": True,
                    "orden": len(items) + len(nuevos) + 1,
                })

    if not nuevos:
        print("✓ Todos los productos ya existen, nada que agregar.")
        return

    print(f"{'APLICANDO' if aplicar else 'SIMULANDO'} — {len(nuevos)} productos nuevos:\n")
    for p in nuevos:
        print(f"  [{p['laboratorio']}] [{p['tipo_aplicacion']}] {p['nombre']}")

    if not aplicar:
        print("\nEjecuta con --aplicar para escribir los cambios.")
        return

    next_id = siguiente_id()
    for p in nuevos:
        p["id"] = next_id
        next_id += 1
    items.extend(nuevos)
    config_store.escribir("productos.json", items)
    print(f"\n✓ {len(nuevos)} productos escritos en productos.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()
    main(args.aplicar)
