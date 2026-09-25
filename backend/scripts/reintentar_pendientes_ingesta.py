"""
Vuelve a pasar por la ingesta las filas que quedaron en `pendiente_revision`
y descarta las que siguen sin un Ship To válido.

Para qué: la carga del 23-09-2026 dejó 417 filas fuera de la base, casi todas
por el Ship To. Dos de las causas eran del sistema y ya están corregidas:
  - el Excel trae la ciudad ("SAN FERNANDO") y la planta del cliente se llama
    "DOLE PLANTA SAN FERNANDO" -regla "contiene" del homogenizador-;
  - un "0" de celda vacía se leía como un Ship To -ahora es "sin Ship To"-.
Con eso, reprocesarlas las deja entrar. Las que igual no tienen Ship To válido
(packing de terceros, o una ciudad donde el cliente no tiene planta) se
descartan, por decisión del usuario.

Qué hace, en una sola transacción:
  1. Reprocesa cada fila con la misma lógica de la ingesta (_procesar_filas):
     lo que ahora calza con Listados se inserta en la base.
  2. De lo que sigue sin calzar, descarta SOLO las filas cuyo único problema
     es el Ship To. Si una fila tiene otro problema (ej. una variedad que no
     está en Listados) se deja pendiente y se lista, para decidirla aparte.
  3. Antes de descartar, guarda las filas descartadas en
     logs/pendientes_descartados_<fecha>.json, por si hay que recuperarlas.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\reintentar_pendientes_ingesta.py            # solo mirar
    .venv\\Scripts\\python.exe scripts\\reintentar_pendientes_ingesta.py --aplicar  # hacerlo
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from app import mapeo  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.ingest import _procesar_filas  # noqa: E402

CARPETA_LOGS = os.path.join(os.path.dirname(BACKEND_DIR), "logs")

# Filas pendientes cuyo ÚNICO motivo es el Ship To.
_SOLO_SHIP_TO = """
    jsonb_array_length(motivos) > 0
    AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(motivos) m WHERE m->>'campo' <> 'ship_to_raw'
    )
"""


def _leer_pendientes(cur) -> list[dict]:
    cur.execute("SELECT id, origen, fila, motivos FROM pendiente_revision ORDER BY id")
    return cur.fetchall()


def _etiqueta(fila: dict) -> tuple[str, str]:
    sol = mapeo.mapear_solicitud({str(k).strip(): v for k, v in fila.items()})
    homo = fila.get("__homogenizacion__") or {}
    return (homo.get("sold_to_raw") or sol["sold_to_raw"] or "(sin Sold To)", sol["ship_to_raw"] or "(sin Ship To)")


def _simular(cur, pendientes: list[dict]) -> tuple[list[dict], list[dict]]:
    """(entran, siguen) según la lógica actual, sin escribir nada."""
    entran: list[dict] = []
    siguen: list[dict] = []
    for origen in sorted({p["origen"] for p in pendientes}):
        grupo = [p for p in pendientes if p["origen"] == origen]
        r = _procesar_filas(cur, [p["fila"] for p in grupo], escribir=False, origen=origen)
        for d in r["detalle"]:
            p = grupo[d["fila"] - 2]  # _procesar_filas numera desde la fila 2 (1 = encabezado)
            (siguen if d.get("pendiente_revision") else entran).append({**p, "motivos_nuevos": d.get("motivos", [])})
    return entran, siguen


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Hacerlo de verdad. Sin esto solo muestra.")
    args = ap.parse_args()

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        pendientes = _leer_pendientes(cur)
        if not pendientes:
            print("\nNo hay filas pendientes. Nada que hacer.\n")
            return
        entran, siguen = _simular(cur, pendientes)

    solo_ship_to = [p for p in siguen if all("Ship To" in m for m in p["motivos_nuevos"])]
    otras = [p for p in siguen if p not in solo_ship_to]

    print(f"\nFilas pendientes: {len(pendientes)}")
    print(f"  Entran a la base ahora:              {len(entran)}")
    print(f"  Se descartan (Ship To sin planta):   {len(solo_ship_to)}")
    print(f"  Siguen pendientes (otro problema):   {len(otras)}")

    if solo_ship_to:
        print("\nSe descartarían (Sold To → Ship To, filas):")
        for (sold, ship), n in Counter(_etiqueta(p["fila"]) for p in solo_ship_to).most_common():
            print(f"  {n:4}  {sold}  →  {ship}")
    if otras:
        print("\nQuedan pendientes, hay que decidirlas aparte:")
        for m, n in Counter(m for p in otras for m in p["motivos_nuevos"]).most_common():
            print(f"  {n:4}  {m}")

    if not args.aplicar:
        print("\nNo se cambió nada. Para aplicarlo, repite con --aplicar.\n")
        return

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT COALESCE(max(id), 0) AS maximo FROM pendiente_revision")
        ultimo_id = cur.fetchone()["maximo"]
        pendientes = _leer_pendientes(cur)
        ids = [p["id"] for p in pendientes]

        # Borrar antes de reprocesar: lo que siga sin calzar, _procesar_filas
        # lo vuelve a dejar pendiente con el motivo recalculado (id nuevo).
        cur.execute("DELETE FROM pendiente_revision WHERE id = ANY(%s)", (ids,))
        resumen = {"solicitudes_nuevas": 0, "solicitudes_existentes": 0, "resultados": 0}
        for origen in sorted({p["origen"] for p in pendientes}):
            filas = [p["fila"] for p in pendientes if p["origen"] == origen]
            r = _procesar_filas(cur, filas, escribir=True, origen=origen, acumular_detalle=False)
            for k in resumen:
                resumen[k] += r["resumen"][k]

        cur.execute(
            f"SELECT id, origen, fila, motivos FROM pendiente_revision WHERE id > %s AND {_SOLO_SHIP_TO}",
            (ultimo_id,),
        )
        descartadas = cur.fetchall()
        if descartadas:
            os.makedirs(CARPETA_LOGS, exist_ok=True)
            ruta = os.path.join(CARPETA_LOGS, f"pendientes_descartados_{datetime.now():%Y%m%d_%H%M%S}.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(descartadas, f, ensure_ascii=False, indent=1, default=str)
            cur.execute("DELETE FROM pendiente_revision WHERE id = ANY(%s)", ([d["id"] for d in descartadas],))
            print(f"\nRespaldo de las descartadas: {ruta}")

        cur.execute("SELECT count(*) AS n FROM pendiente_revision")
        quedan = cur.fetchone()["n"]

    print(
        f"\nListo. Solicitudes nuevas: {resumen['solicitudes_nuevas']} · "
        f"ya existían (se completaron): {resumen['solicitudes_existentes']} · "
        f"resultados: {resumen['resultados']} · descartadas: {len(descartadas)} · "
        f"siguen pendientes: {quedan}\n"
    )


if __name__ == "__main__":
    main()
