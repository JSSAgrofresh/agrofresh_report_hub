"""
SOLO LECTURA: ¿la solicitud encuentra la lista de distribución que la tabla de
Listas de distribución SÍ muestra? (caso OT-QUI0061: la lista guardaba «Cereza»,
el formulario decía «Cerezas» y la solicitud salió «Sin lista de distribución».)

Dos revisiones:
  A) Por combinación: cada planta con correos de cliente × cada especie activa de
     Listados. Si la tabla tiene correos para esa planta y especie (por su categoría)
     pero la búsqueda de la solicitud no los trae, es un hueco ANTES de que alguien lo sufra.
  B) Lo ya emitido: solicitudes guardadas que salieron «Sin lista» aunque su planta
     y especie sí tienen correos de cliente en la tabla (hay que avisar al laboratorio).

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\auditar_lista_en_solicitudes.py
    .venv\\Scripts\\python.exe scripts\\auditar_lista_en_solicitudes.py --solo-a   # sin mirar lo emitido
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import indice_solicitudes, listas_distribucion as ld, toma_muestras as tm  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402


def _plantas_con_cliente(contactos: list[dict]) -> dict[tuple[str, str], list[dict]]:
    plantas: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for c in contactos:
        if c.get("tipo") == "resultado_cliente" and c.get("activo", True) and c.get("email") and not c.get("servicio"):
            plantas[(ld.norm(c.get("sold_to")), ld.norm(c.get("ship_to")))].append(c)
    return plantas


def _tabla_tiene(contactos_planta: list[dict], especie: str) -> bool:
    """Lo que la tabla muestra: contactos sin especie, o de la misma categoría que `especie`."""
    cat = ld.categoria_de_especie(especie)
    for c in contactos_planta:
        esp = (c.get("especie") or "").strip()
        if not esp or (cat is not None and ld.categoria_de_especie(esp) == cat):
            return True
    return False


def _solicitud_encuentra(sold_to: str, ship_to: str, especie: str, contactos: list[dict]) -> bool:
    r = tm.destinatarios_resultado_por_tipo("", ship_to, sold_to, especie, contactos=contactos, nuevo=True)
    admins = {e.casefold() for e in r["bcc"]}
    propios = {c.casefold() for c in tm.DESTINATARIOS_SIN_LISTA} | admins
    return any(e.casefold() not in propios for e in r["to"])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--solo-a", action="store_true", help="no revisar las solicitudes ya emitidas")
    args = ap.parse_args()

    contactos = tm._leer_config("contactos_laboratorio.json", [])
    plantas = _plantas_con_cliente(contactos)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT valor FROM lab.valor_lista WHERE tipo = 'especie' AND activo ORDER BY valor")
        especies = [f["valor"] for f in cur.fetchall()]

    print(f"\n   Plantas con correos de cliente: {len(plantas)} · especies activas en Listados: {len(especies)}\n")
    print("   === A) Combinaciones que la tabla muestra pero la solicitud NO encuentra ===")
    huecos = 0
    for (st, sh), lista in sorted(plantas.items()):
        sold_to, ship_to = lista[0].get("sold_to") or "", lista[0].get("ship_to") or ""
        for esp in especies:
            if _tabla_tiene(lista, esp) and not _solicitud_encuentra(sold_to, ship_to, esp, contactos):
                huecos += 1
                print(f"   · {sold_to} | {ship_to} | {esp}")
    print(f"\n   {huecos} hueco(s).\n" if huecos else "   Ninguno.\n")

    if args.solo_a:
        return 1 if huecos else 0

    print("   === B) Solicitudes emitidas que salieron «Sin lista» teniendo lista en la tabla ===")
    malas = []
    for archivo, datos in indice_solicitudes.listar():
        if datos.get("es_prueba") or not tm.solicitud_sin_lista(datos, contactos):
            continue
        lista = plantas.get((ld.norm(datos.get("sold_to")), ld.norm(datos.get("ship_to"))))
        if lista and _tabla_tiene(lista, str(datos.get("especie") or "")):
            malas.append((datos.get("numero_solicitud") or archivo, datos))
    for num, d in malas:
        print(f"   · {num} | {d.get('laboratorio')} | {d.get('sold_to')} | {d.get('ship_to')} | {d.get('especie')} | enviada={bool(d.get('enviada'))}")
    print(f"\n   {len(malas)} solicitud(es).\n" if malas else "   Ninguna.\n")
    return 1 if (huecos or malas) else 0


if __name__ == "__main__":
    sys.exit(main())
