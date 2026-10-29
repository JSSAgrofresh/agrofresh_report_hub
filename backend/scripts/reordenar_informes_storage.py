"""
Reordena Storage -> Informes (R2 `informes/`) al orden nuevo:

    informes/<PLANTA>/<LABORATORIO>/<FECHA DEL INFORME>/<archivo>.pdf

Antes era `<PLANTA>/<FECHA DE MUESTREO>/<TIPO DE SERVICIO>/<LABORATORIO>/<archivo>.pdf` (y, los que dejaba el informe propio
al generarse, `<PLANTA>/<FECHA>/<archivo>.pdf`). Ya no hay carpeta de «Cromatografia» / «Linea de proceso» y la fecha es la
del INFORME. De donde sale la fecha de cada PDF:
  1. la `fecha_informe` que Report guarda para ese N° de informe (el N° se reconoce por el nombre del archivo);
  2. si Report no la tiene, la fecha de la carpeta donde estaba (la de muestreo): se avisa para revisarla.
El laboratorio sale de la carpeta (el formato de 4 niveles era siempre el informe propio: AgroFresh).

Por cada PDF: lo copia al destino, verifica que quedo y recien entonces borra el original. Si el destino ya existe NO lo
pisa (conflicto, se avisa). Lo que ya esta en el orden nuevo y `informes_papelera/` no se tocan. Mira primero y deja la
lista en `logs/`; `--aplicar` mueve.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\reordenar_informes_storage.py            # solo mira
    .venv\\Scripts\\python.exe scripts\\reordenar_informes_storage.py --aplicar  # reordena
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
_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _es_fecha(texto: str) -> bool:
    return bool(_FECHA.match(texto)) or texto == "Sin fecha"


def formato(clave: str) -> str:
    """`nuevo` (planta/lab/fecha/archivo), `antiguo6` (planta/fecha/analisis/lab/archivo), `antiguo4` (planta/fecha/archivo)
    u `otro` (no se reconoce: no se toca)."""
    partes = clave.split("/")
    if partes[0] != "informes":
        return "otro"
    if len(partes) == 5 and _es_fecha(partes[3]) and not _es_fecha(partes[2]):
        return "nuevo"
    if len(partes) == 6 and _es_fecha(partes[2]):
        return "antiguo6"
    if len(partes) == 4 and _es_fecha(partes[2]):
        return "antiguo4"
    return "otro"


def destino(clave: str, fecha_informe: str | None) -> str | None:
    """Clave nueva de un PDF en el orden viejo, o None si ya esta bien o no se reconoce."""
    partes = clave.split("/")
    f = formato(clave)
    if f == "antiguo6":
        _, planta, fecha, _analisis, lab, archivo = partes
    elif f == "antiguo4":
        _, planta, fecha, archivo = partes
        lab = "AgroFresh"
    else:
        return None
    return "/".join(["informes", planta, lab, fecha_informe or fecha, archivo])


def plan(
    claves: list[str], fechas: dict[str, str]
) -> tuple[list[tuple[str, str, bool]], list[tuple[str, str]], list[str]]:
    """([(origen, destino, con_fecha_de_report)], conflictos [(origen, destino)], sin_reconocer). `fechas` = {N° de informe en minusculas: ISO}."""
    existentes = set(claves)
    mover: list[tuple[str, str, bool]] = []
    conflictos: list[tuple[str, str]] = []
    otros: list[str] = []
    usados: set[str] = set()
    for clave in sorted(claves):
        if clave.endswith("/") or not clave.lower().endswith(".pdf"):
            continue
        if formato(clave) in ("nuevo",):
            continue
        if formato(clave) == "otro":
            otros.append(clave)
            continue
        nombre = clave.rsplit("/", 1)[-1].rsplit(".", 1)[0].strip().casefold()
        hallada = next(
            (f for n, f in sorted(fechas.items(), key=lambda kv: (-len(kv[0]), kv[0]))
             if nombre == n or re.search(rf"(?<![0-9a-z]){re.escape(n)}(?![0-9a-z])", nombre)),
            None,
        )
        nueva = destino(clave, hallada)
        if nueva is None:
            continue
        if nueva in existentes or nueva in usados:
            conflictos.append((clave, nueva))
            continue
        usados.add(nueva)
        mover.append((clave, nueva, hallada is not None))
    return mover, conflictos, otros


def _fechas_de_report() -> dict[str, str]:
    from app.db import conexion, cursor_dict

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT btrim(nro_solicitud) AS n, max(fecha_informe) AS f FROM solicitud"
            " WHERE nro_solicitud IS NOT NULL AND btrim(nro_solicitud) <> '' AND fecha_informe IS NOT NULL"
            " GROUP BY btrim(nro_solicitud)"
        )
        return {str(f["n"]).casefold(): f["f"].isoformat() for f in cur.fetchall()}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Reordenar de verdad. Sin esto solo muestra.")
    args = ap.parse_args(argv)

    from app import r2

    if not r2.disponible():
        print("R2 no esta configurado en este equipo.")
        return 1
    claves = r2.listar_keys(RAIZ)
    mover, conflictos, otros = plan(claves, _fechas_de_report())
    con_fecha = sum(1 for m in mover if m[2])
    print(f"\ninformes/: {len(claves)} archivos")
    print(f"  A reordenar:                                  {len(mover)}")
    print(f"    con la fecha del informe (Report):          {con_fecha}")
    print(f"    sin fecha en Report (queda la de muestreo): {len(mover) - con_fecha}")
    print(f"  Con conflicto (el destino ya existe):         {len(conflictos)}")
    print(f"  Rutas que no se reconocen (no se tocan):      {len(otros)}")
    for o, d, _ in mover[:8]:
        print(f"    {o}\n      -> {d}")
    for c, _ in conflictos[:10]:
        print(f"    conflicto: {c}")
    for c in otros[:10]:
        print(f"    no reconocida: {c}")

    logs = _BACKEND / "logs"
    logs.mkdir(exist_ok=True)
    marca = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    lista = logs / f"reordenar_informes_{marca}.csv"
    with open(lista, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["origen", "destino", "fecha_de_report"])
        w.writerows((o, d, "si" if f else "no") for o, d, f in mover)
    print(f"\nLista completa: {lista}")

    if not mover and not conflictos:
        print("\nNada que reordenar.")
        return 0
    if not args.aplicar:
        print("\nSolo miré. Si está bien, repite con --aplicar.")
        return 0

    # Conflicto: si el destino es EXACTAMENTE el mismo PDF, el original sobra (una corrida cortada deja copias); si
    # es distinto, no se toca ninguno y se avisa.
    iguales = 0
    for origen, nueva in conflictos:
        try:
            a, b = r2.descargar(origen), r2.descargar(nueva)
            if a is not None and a == b:
                r2.eliminar(origen)
                iguales += 1
            else:
                print(f"  {origen}: el destino ya existe y es DISTINTO; no se toca ninguno, revísalos a mano.")
        except Exception as exc:  # noqa: BLE001
            print(f"  No se pudo revisar {origen}: {exc}")
    if conflictos:
        print(f"\n{iguales} de {len(conflictos)} conflictos eran copias idénticas: se borró el original repetido.")

    hechos = 0
    for origen, nueva, _ in mover:
        try:
            datos = r2.descargar(origen)
            if datos is None:
                print(f"  {origen}: ya no existe, se salta.")
                continue
            r2.subir(nueva, datos, "application/pdf")
            if r2.descargar(nueva) != datos:
                raise RuntimeError("la copia no coincide")
            r2.eliminar(origen)
            hechos += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  No se pudo mover {origen}: {exc}")
    print(f"\n{hechos} de {len(mover)} archivos reordenados.")
    return 0 if hechos == len(mover) else 2


if __name__ == "__main__":
    raise SystemExit(main())
