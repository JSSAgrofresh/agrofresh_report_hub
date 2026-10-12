"""
Ordena en R2 las carpetas viejas de Accutab: de accutab/mail/<asunto>/<archivos>
(una carpeta por correo) a accutab/mail/<CLIENTE>/<AAAA-MM-DD>/Datos <HH-MM-SS>/<archivos>,
igual que las cargas nuevas. El cliente sale del asunto sin «(1307)»; la fecha y hora,
del ultimo archivo de esa carpeta (hora de Chile). Copia y luego borra el original.

Por defecto solo MIRA. Con --aplicar mueve.

Uso (desde backend):
    .venv\\Scripts\\python.exe scripts\\ordenar_r2_accutab.py
    .venv\\Scripts\\python.exe scripts\\ordenar_r2_accutab.py --aplicar
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import accutab_informe, config  # noqa: E402
from app import r2  # noqa: E402

RAIZ = accutab_informe.RAIZ_R2
_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CHILE = ZoneInfo("America/Santiago")


def objetos(cliente_s3, bucket: str) -> list[tuple[str, object]]:
    """(clave, ultima modificacion) de todo lo que hay bajo accutab/mail/."""
    salida = []
    for pagina in cliente_s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=RAIZ):
        for o in pagina.get("Contents", []):
            salida.append((o["Key"], o["LastModified"]))
    return salida


def planear(objs: list[tuple[str, object]]) -> dict[str, tuple[str, list[tuple[str, str]]]]:
    """{carpeta vieja: (carpeta nueva, [(clave vieja, clave nueva)])}. Las que ya
    estan en el orden nuevo (cliente/fecha/...) no se tocan."""
    grupos: dict[str, list[tuple[str, object]]] = defaultdict(list)
    for clave, mod in objs:
        partes = clave[len(RAIZ):].split("/")
        if len(partes) < 2 or not partes[0]:
            continue  # un archivo suelto en la raiz o una carpeta vacia
        if len(partes) >= 3 and _FECHA.match(partes[1]):
            continue  # ya ordenada
        grupos[partes[0]].append((clave, mod))
    usadas: set[str] = set()
    plan = {}
    for carpeta, lista in sorted(grupos.items()):
        cliente = accutab_informe.cliente_desde_asunto(carpeta)
        ultimo = max(m for _, m in lista).astimezone(CHILE)
        base = f"{cliente}/{ultimo:%Y-%m-%d}/Datos {ultimo:%H-%M-%S}"
        nueva, n = base, 2
        while nueva in usadas:
            nueva, n = f"{base} ({n})", n + 1
        usadas.add(nueva)
        pares = []
        for clave, _ in lista:
            resto = clave[len(RAIZ) + len(carpeta) + 1:]
            if resto:
                pares.append((clave, f"{RAIZ}{nueva}/{resto}"))
        plan[carpeta] = (nueva, pares)
    return plan


def aplicar(cliente_s3, bucket: str, plan) -> int:
    movidos = 0
    for _, (_, pares) in plan.items():
        for vieja, nueva in pares:
            cliente_s3.copy_object(Bucket=bucket, CopySource={"Bucket": bucket, "Key": vieja}, Key=nueva)
            cliente_s3.delete_object(Bucket=bucket, Key=vieja)
            movidos += 1
    return movidos


def main() -> int:
    ap = argparse.ArgumentParser(description="Ordena las carpetas de Accutab en R2 por cliente y fecha.")
    ap.add_argument("--aplicar", action="store_true", help="Mueve los archivos (sin esto solo cuenta).")
    args = ap.parse_args()
    if not r2.disponible():
        print("R2 no esta configurado en el .env.")
        return 1
    s3 = r2._get_client()
    plan = planear(objetos(s3, config.R2_BUCKET))
    por_destino: dict[str, int] = defaultdict(int)
    for nueva, pares in plan.values():
        por_destino["/".join(nueva.split("/")[:2])] += len(pares)
    print(f"Carpetas viejas por ordenar: {len(plan)} · archivos: {sum(len(p) for _, p in plan.values())}")
    for destino, n in sorted(por_destino.items()):
        print(f"  {destino}: {n} archivo(s)")
    if not args.aplicar:
        print("No se movio nada. Con --aplicar se ordenan.")
        return 0
    print(f"Movidos: {aplicar(s3, config.R2_BUCKET, plan)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
