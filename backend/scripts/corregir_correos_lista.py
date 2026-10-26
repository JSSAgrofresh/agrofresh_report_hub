"""
Corrige los correos mal escritos de la lista de distribución (contactos de «Resultado a clientes» y demás).

Un contacto cuyo correo no es UN correo válido —dos pegados, con el nombre de la persona delante, separados por «/» o
«:», repetidos— se reemplaza por un contacto por cada correo que se le pueda leer (mismos datos de planta, especie y
tipo, otro correo). No agrega a nadie que ya figure igual en esa planta y especie. Los que no tienen ningún correo
legible se dejan como están y se listan para arreglarlos a mano.

Como los demás scripts que escriben, primero MIRA y solo aplica con --aplicar. Al aplicar deja antes un respaldo,
`contactos_laboratorio_respaldo_<fecha>.json`, junto al archivo original (el mismo que deja Listas de distribución).

Uso (ya dentro de backend):
    .venv\\Scripts\\python.exe scripts\\corregir_correos_lista.py
    .venv\\Scripts\\python.exe scripts\\corregir_correos_lista.py --aplicar
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config_store  # noqa: E402
from app.accesos_clientes import corregir_contactos  # noqa: E402
from app.listas_distribucion import ARCHIVO_CONTACTOS  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="Guardar la lista corregida. Sin esto solo muestra lo que haría.")
    args = p.parse_args()

    actuales = config_store.leer(ARCHIVO_CONTACTOS, [])
    nuevos, cambios, sin_arreglo = corregir_contactos(actuales)

    print(f"\nContactos en la lista: {len(actuales)}. Con el correo mal escrito: {len(cambios) + len(sin_arreglo)}.")
    if cambios:
        print(f"\nSe corregirían {len(cambios)} (quedan {len(nuevos)} contactos en total):\n")
        for c in cambios:
            ct = c["contacto"]
            donde = f"{ct.get('sold_to') or '?'} / {ct.get('ship_to') or '?'}" + (f" / {ct['especie']}" if ct.get("especie") else "")
            print(f"  {donde}")
            print(f"    antes:   {c['antes']!r}")
            print(f"    después: {'; '.join(c['despues'])}")
    if sin_arreglo:
        print(f"\n{len(sin_arreglo)} NO tienen ningún correo legible y quedan como están (arréglalos a mano):")
        for ct in sin_arreglo:
            print(f"  · {ct.get('sold_to') or '?'} / {ct.get('ship_to') or '?'}: {ct.get('email')!r}")
    if not cambios:
        print("\nNo hay nada que corregir.")
        return
    if not args.aplicar:
        print("\nNo se escribió nada. Revisa y, para guardar la lista corregida, agrega --aplicar")
        return

    respaldo = f"contactos_laboratorio_respaldo_{datetime.now():%Y%m%d_%H%M%S}.json"
    config_store.escribir(respaldo, actuales)
    config_store.escribir(ARCHIVO_CONTACTOS, nuevos)
    print(f"\nListo. Lista corregida ({len(cambios)} contactos). Respaldo de la anterior: {respaldo}")


if __name__ == "__main__":
    main()
