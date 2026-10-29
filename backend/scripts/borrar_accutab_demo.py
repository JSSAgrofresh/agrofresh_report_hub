"""
Borra de Post Venta (Accu-Tab) las cargas de «Agrofresh Demo» (AGROFRESH_DEMO), menos la MAS RECIENTE.

Las cargas demo llegan por correo cada hora y se acumulan (cientos). Se reconocen por el Sold To (o el
equipo, en las del correo) «AGROFRESH_DEMO» / «Agrofresh Demo», sin importar mayusculas, guiones bajos ni
espacios. Se deja la ultima (la de fecha mas reciente) y se borra el resto con la misma rutina que el boton
«Eliminar» de Post Venta: la carpeta del servidor y sus informes y datos en R2. Lo demas no se toca.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\borrar_accutab_demo.py            # solo mira
    .venv\\Scripts\\python.exe scripts\\borrar_accutab_demo.py --aplicar  # borra (deja la lista en logs/)
    .venv\\Scripts\\python.exe scripts\\borrar_accutab_demo.py --cliente "OTRO CLIENTE"  # otro nombre
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import postventa  # noqa: E402

CLIENTE_DEMO = "AGROFRESH_DEMO"


def es_demo(registro: dict, cliente: str = CLIENTE_DEMO) -> bool:
    """El Sold To o el equipo de la carga (las del correo guardan el asunto en `equipo`) es el cliente demo."""
    buscado = postventa._clave(cliente)
    return buscado in {postventa._clave(registro.get("cliente")), postventa._clave(registro.get("equipo"))}


def demo_a_borrar(registros: dict[str, dict], cliente: str = CLIENTE_DEMO) -> tuple[list[str], str | None]:
    """Recibe {carpeta: registro}. Devuelve (carpetas a borrar, la que se queda): se queda la mas reciente
    (el nombre de la carpeta es la fecha de guardado, asi que ordenar por nombre es ordenar por fecha)."""
    demo = sorted(c for c, r in registros.items() if es_demo(r, cliente))
    if not demo:
        return [], None
    return demo[:-1], demo[-1]


def _leer_registros(raiz: str) -> dict[str, dict]:
    registros: dict[str, dict] = {}
    for nombre in os.listdir(raiz):
        if not postventa._PATRON_CARPETA.match(nombre):
            continue
        try:
            with open(os.path.join(raiz, nombre, postventa.ARCHIVO_REGISTRO), encoding="utf-8") as f:
                registros[nombre] = json.load(f)
        except (OSError, ValueError):
            continue
    return registros


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Borrar de verdad. Sin esto solo muestra.")
    ap.add_argument("--cliente", default=CLIENTE_DEMO, help=f"Nombre a borrar (por defecto {CLIENTE_DEMO}).")
    args = ap.parse_args(argv)

    raiz = postventa._raiz_accutab()
    registros = _leer_registros(raiz)
    sobran, queda = demo_a_borrar(registros, args.cliente)
    print(f"\nPost Venta ({raiz})")
    print(f"  Cargas en total: {len(registros)}")
    print(f"  Cargas de {args.cliente}: {len(sobran) + (1 if queda else 0)}")
    if queda is None:
        print("  No hay ninguna: nada que borrar.\n")
        return 0
    print(f"  Se queda la mas reciente: {queda}")
    print(f"  Se borran: {len(sobran)}  -> quedan {len(registros) - len(sobran)} cargas en total")
    for c in sobran[:5]:
        print(f"    {c}")
    if len(sobran) > 5:
        print(f"    ... y {len(sobran) - 5} mas")

    if not args.aplicar:
        print("\nNo se borro nada. Para hacerlo, repite con --aplicar.\n")
        return 0

    logs = _BACKEND.parent / "logs"
    logs.mkdir(exist_ok=True)
    bitacora = logs / f"borrar_accutab_demo_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.json"
    with open(bitacora, "w", encoding="utf-8") as f:
        json.dump({"cliente": args.cliente, "se_queda": queda, "borradas": sobran}, f, ensure_ascii=False, indent=2)
    print(f"\nLista de lo borrado: {bitacora}")

    fallidas = []
    for c in sobran:
        try:
            postventa._borrar_carga(c)
        except Exception as e:  # una que falle no impide borrar las demas
            fallidas.append((c, str(e)))
    print(f"Borradas {len(sobran) - len(fallidas)} cargas.")
    for c, e in fallidas:
        print(f"  NO se pudo borrar {c}: {e}")
    print()
    return 1 if fallidas else 0


if __name__ == "__main__":
    sys.exit(main())
