"""
Revisa el buzón del Report Hub y deja los informes que llegaron en Ingesta de Datos → Correo.

Es lo mismo que el botón «Revisar ahora» de esa pantalla. SOLO LEE el buzón (no marca, no mueve, no
borra) y NO carga nada a Report: solo registra y clasifica cada informe. Es el script que la tarea
programada correrá cada 5 minutos cuando se encienda la revisión automática.

Uso (PowerShell, dentro de backend):
    .venv\\Scripts\\python.exe scripts\\recibir_informes_correo.py
    .venv\\Scripts\\python.exe scripts\\recibir_informes_correo.py --dias 30
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import correo_informes  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dias", type=int, default=correo_informes.DIAS_POR_DEFECTO, help="Cuántos días atrás mirar (14)")
    args = ap.parse_args(argv)
    try:
        r = correo_informes.sondear(args.dias, disparado_por="script")
    except Exception as exc:  # noqa: BLE001
        print(f"No se pudo revisar el correo: {exc}")
        return 2
    print(f"Revisado: {r['examinados']} correos nuevos examinados, {r['nuevos']} informes registrados (últimos {r['dias']} días).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
