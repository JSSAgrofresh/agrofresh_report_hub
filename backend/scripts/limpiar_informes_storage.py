"""
Limpia Storage -> Informes (R2, prefijo `informes/`): deja SOLO los PDF de informes que estan en Report.

Cada vez que se genera un informe propio de AgroFresh (Ingreso al laboratorio) el sistema deja una copia en
`informes/<PLANTA>/<FECHA>/<ANALISIS>/AgroFresh/<folio>.pdf`, este o no cargado en Report; con el tiempo se juntan
informes que nunca existieron para el cliente. Un PDF se CONSERVA si su nombre corresponde al N° de informe de algun
informe que esta en Report (`solicitud.nro_solicitud`, lo mismo que usa la ficha del informe para encontrar su PDF):
el N° es el nombre completo («AGF2026-26.pdf») o aparece en el nombre sin pegarse a otras letras o numeros
(«2026-1885-PC Copefrut.pdf»; «AGF2026-2» NO calza con «AGF2026-26»). Todo lo demas es sobrante.

Seguro por defecto:
  * mira primero: sin `--aplicar` solo cuenta y deja la lista completa (conserva / sobra) en logs/;
  * con `--aplicar` NO borra: MUEVE los sobrantes a `informes_papelera/<fecha>/...` (se pueden devolver copiandolos
    de vuelta); `--definitivo` los borra de verdad;
  * si en Report no hay ningun informe con N°, se detiene (nunca trataria todo como sobrante);
  * solo toca PDF dentro de `informes/`; otros archivos y el resto del bucket no se tocan.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\limpiar_informes_storage.py                 # solo mira
    .venv\\Scripts\\python.exe scripts\\limpiar_informes_storage.py --aplicar       # mueve los sobrantes a la papelera
    .venv\\Scripts\\python.exe scripts\\limpiar_informes_storage.py --aplicar --definitivo   # los borra
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

RAIZ = "informes/"
PAPELERA = "informes_papelera/"


def _nombre(clave: str) -> str:
    return clave.rsplit("/", 1)[-1].rsplit(".", 1)[0].strip().casefold()


def calza(nombre: str, nro: str) -> bool:
    """El N° de informe es el nombre entero o aparece en él sin pegarse a otra letra o numero."""
    if nombre == nro:
        return True
    return re.search(rf"(?<![0-9a-z]){re.escape(nro)}(?![0-9a-z])", nombre) is not None


def clasificar(claves: list[str], numeros: set[str]) -> tuple[list[tuple[str, str]], list[str], list[str]]:
    """(conservar [(clave, N° que calza)], sobrantes, no_pdf). Solo los PDF se juzgan; lo demas no se toca."""
    nros = sorted({n.strip().casefold() for n in numeros if n and n.strip()}, key=lambda n: (-len(n), n))
    conservar: list[tuple[str, str]] = []
    sobran: list[str] = []
    otros: list[str] = []
    for clave in sorted(claves):
        if clave.endswith("/"):
            continue
        if not clave.lower().endswith(".pdf"):
            otros.append(clave)
            continue
        nombre = _nombre(clave)
        hallado = next((n for n in nros if calza(nombre, n)), None)
        if hallado:
            conservar.append((clave, hallado))
        else:
            sobran.append(clave)
    return conservar, sobran, otros


def _numeros_en_report() -> set[str]:
    from app.db import conexion, cursor_dict

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT DISTINCT btrim(nro_solicitud) AS n FROM solicitud WHERE nro_solicitud IS NOT NULL AND btrim(nro_solicitud) <> ''")
        return {str(f["n"]) for f in cur.fetchall()}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Mover los sobrantes a la papelera. Sin esto solo muestra.")
    ap.add_argument("--definitivo", action="store_true", help="Con --aplicar: borrarlos de verdad en vez de moverlos.")
    args = ap.parse_args(argv)

    from app import r2

    if not r2.disponible():
        print("R2 no esta configurado en este equipo: nada que revisar.")
        return 1
    numeros = _numeros_en_report()
    if not numeros:
        print("En Report no hay ningun informe con N° de informe: me detengo para no marcar todo como sobrante.")
        return 1
    claves = r2.listar_keys(RAIZ)
    conservar, sobran, otros = clasificar(claves, numeros)
    print(f"\nStorage -> Informes ({RAIZ})")
    print(f"  Informes en Report con N°:  {len(numeros)}")
    print(f"  PDF que SE CONSERVAN:       {len(conservar)}")
    print(f"  PDF SOBRANTES:              {len(sobran)}")
    print(f"  Otros archivos (no se tocan): {len(otros)}")

    marca = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    logs = _BACKEND / "logs"
    logs.mkdir(exist_ok=True)
    ruta = logs / f"limpiar_informes_storage_{marca}.csv"
    with open(ruta, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["decision", "clave", "calza con el N°"])
        w.writerows([["CONSERVAR", c, n] for c, n in conservar])
        w.writerows([["SOBRA", c, ""] for c in sobran])
        w.writerows([["NO SE TOCA", c, ""] for c in otros])
    print(f"  Lista completa: {ruta}")
    for c in sobran[:15]:
        print(f"    sobra: {c}")
    if len(sobran) > 15:
        print(f"    ... y {len(sobran) - 15} mas (estan en la lista)")

    if not sobran:
        print("\nNo hay nada que limpiar.")
        return 0
    if not args.aplicar:
        print("\nSolo miré. Revisa la lista y, si está bien, repite con --aplicar.")
        return 0

    hechos = 0
    for clave in sobran:
        try:
            if not args.definitivo:
                datos = r2.descargar(clave)
                if datos is None:
                    continue
                r2.subir(f"{PAPELERA}{marca}/{clave[len(RAIZ):]}", datos, "application/pdf")
            r2.eliminar(clave)
            hechos += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  No se pudo {'borrar' if args.definitivo else 'mover'} {clave}: {exc}")
    donde = "borrados" if args.definitivo else f"movidos a {PAPELERA}{marca}/"
    print(f"\n{hechos} de {len(sobran)} PDF sobrantes {donde}.")
    return 0 if hechos == len(sobran) else 2


if __name__ == "__main__":
    raise SystemExit(main())
