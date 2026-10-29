"""
Junta las carpetas «gemelas» del laboratorio propio en `auditoria/` de R2: `Agrofresh/` y `AgroFresh/` son el mismo
laboratorio escrito distinto (la base lo guarda como «Agrofresh» y la configuracion como «AGROFRESH»), y dividian sus
informes en dos carpetas. Todo queda en `AgroFresh/` (como en Storage -> Informes). Desde este cambio el sistema ya
escribe siempre `AgroFresh/`, asi que no se vuelven a partir.

Por cada archivo de la variante mal escrita: lo copia a `AgroFresh/...`, actualiza `informe_auditoria.r2_key` (para que
la ficha del informe y el Panel de control sigan encontrando su PDF) y recien entonces borra el original. Si ya existe
un archivo con ese nombre en `AgroFresh/` NO lo pisa: lo deja donde esta y lo avisa. Si algo falla a la mitad, el
archivo queda en los dos lados (nunca se pierde).

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\unir_carpetas_auditoria.py            # solo mira
    .venv\\Scripts\\python.exe scripts\\unir_carpetas_auditoria.py --aplicar  # junta
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

CORRECTA = "AgroFresh"


def plan(claves: list[str]) -> tuple[list[tuple[str, str]], list[str]]:
    """Con las claves relativas de `auditoria/`: ([(origen, destino)], [conflictos]). Un conflicto es un origen cuyo
    destino ya existe."""
    existentes = set(claves)
    mover, conflictos = [], []
    for k in sorted(claves):
        primero, _, resto = k.partition("/")
        if not resto or primero == CORRECTA or primero.strip().casefold() != CORRECTA.casefold():
            continue
        destino = f"{CORRECTA}/{resto}"
        (conflictos if destino in existentes else mover).append(k if destino in existentes else (k, destino))
    return mover, conflictos


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Juntar de verdad. Sin esto solo muestra.")
    args = ap.parse_args(argv)

    from app import r2_auditoria as r2a
    from app.db import conexion, cursor_dict

    if not r2a.disponible():
        print("R2 no esta configurado en este equipo.")
        return 1
    claves = r2a.listar_recursivo("")
    mover, conflictos = plan(claves)
    print(f"\nauditoria/: {len(claves)} archivos")
    print(f"  A juntar en {CORRECTA}/:  {len(mover)}")
    print(f"  Con conflicto (ya existe en {CORRECTA}/, no se tocan): {len(conflictos)}")
    for o, d in mover[:10]:
        print(f"    {o}  ->  {d}")
    for c in conflictos[:10]:
        print(f"    conflicto: {c}")
    if not mover:
        print("\nNada que juntar.")
        return 0
    if not args.aplicar:
        print("\nSolo miré. Si está bien, repite con --aplicar.")
        return 0

    hechos = 0
    for origen, destino in mover:
        try:
            r2a.copiar(origen, destino)
            with conexion() as conn, cursor_dict(conn) as cur:
                cur.execute("UPDATE informe_auditoria SET r2_key = %s WHERE r2_key = %s", (destino, origen))
            r2a.eliminar(origen)
            hechos += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  No se pudo mover {origen}: {exc}")
    print(f"\n{hechos} de {len(mover)} archivos juntados en {CORRECTA}/.")
    return 0 if hechos == len(mover) else 2


if __name__ == "__main__":
    raise SystemExit(main())
