"""
Marca el tipo de servicio (Actimist, Ecofog, RYD) de los informes que ya estaban en Report ANTES de la
migración 0055, para que Report deje de mostrarlos mientras no se enciendan en Administración General →
Funciones. Lo que se carga desde ahora ya llega marcado.

El servicio se deduce de lo que quedó guardado (la solicitud de Toma de muestras del informe, o el «Tipo
Aplicación» de sus productos): ver `app/clasificar_servicio.py`. Lo que es Línea de proceso, o no se puede
deducir, no se toca. Nunca pisa un servicio ya puesto.

Primero mira y cuenta; escribe solo con --aplicar. Deja un respaldo de los ids en logs/.

Uso:
    .venv\\Scripts\\python.exe scripts\\clasificar_servicio_solicitudes.py
    .venv\\Scripts\\python.exe scripts\\clasificar_servicio_solicitudes.py --aplicar
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.clasificar_servicio import clasificar_todas  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.funciones import columna_servicio_existe  # noqa: E402

ETIQUETA = {"actimist": "Actimist", "ecofog": "Ecofog", "ryd": "RYD"}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Escribir de verdad. Sin esto solo muestra.")
    args = ap.parse_args(argv)

    if not columna_servicio_existe():
        print("\nFalta correr la migración 0055_solicitud_servicio.sql. No se cambió nada.\n")
        return 1

    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        r = clasificar_todas(cur, aplicar=args.aplicar)

    print(f"\nInformes sin servicio marcado: {r['revisadas']}")
    print(f"  Línea de proceso (o sin dato, no se tocan): {r['linea_de_proceso']}")
    for servicio, n in r["por_servicio"].items():
        ej = ", ".join(r["ejemplos"][servicio])
        print(f"  {ETIQUETA[servicio]}: {n}" + (f"   (ej.: {ej})" if n else ""))
    if r["origen"]:
        print("  Se dedujo de: " + ", ".join(f"{k} ({v})" for k, v in r["origen"].items()))

    if not args.aplicar:
        print("\nNo se escribió nada. Para marcarlos de verdad, agrega --aplicar.\n")
        return 0

    logs = _BACKEND / "logs"
    logs.mkdir(exist_ok=True)
    respaldo = logs / f"clasificar_servicio_{datetime.now():%Y%m%d_%H%M%S}.json"
    respaldo.write_text(json.dumps({"ids": r["ids"]}, indent=1), encoding="utf-8")
    print(f"\nListo: {r['escritos']} informes marcados. Respaldo de los ids: {respaldo}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
