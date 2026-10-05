"""
Deja un informe asociado a UNA sola OT (la correcta).

Un informe llega a su OT por dos caminos: la «Solicitud (OT)» que se eligió en
Converter (`informe_auditoria`) y el «N° Solicitud: OT-…» que trae el PDF
(`solicitud.referencia` en Report). Si no coinciden, el informe queda en dos
OT (lo detecta `scripts/cruce_informes.py`, caso B). Este script pone la OT
correcta en los dos lados. Volver a subir el PDF por Converter NO arregla
Report: la carga solo completa la referencia si estaba vacía.

Primero mira y muestra el antes y el después; escribe solo con --aplicar.
Deja un respaldo de lo que había en logs/.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\corregir_ot_informe.py --informe 2026-1885-PC --ot OT-QUI0025
    .venv\\Scripts\\python.exe scripts\\corregir_ot_informe.py --informe 2026-1885-PC --ot OT-QUI0025 --aplicar
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

from app.db import conexion, cursor_dict  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--informe", required=True, help="N° de informe del laboratorio, ej. 2026-1885-PC")
    ap.add_argument("--ot", required=True, help="La OT correcta, ej. OT-QUI0025")
    ap.add_argument("--aplicar", action="store_true", help="Escribir de verdad. Sin esto solo muestra.")
    args = ap.parse_args(argv)
    informe, ot = args.informe.strip(), args.ot.strip().upper()

    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT archivo, numero_solicitud, laboratorio, ship_to, especie, fecha_muestreo"
            " FROM solicitud_archivo WHERE upper(btrim(numero_solicitud)) = %s",
            (ot,),
        )
        sol = cur.fetchone()
        if sol is None:
            print(f"\nNo existe la solicitud {ot}. No se cambió nada.\n")
            return 1
        cur.execute(
            "SELECT id, archivo_solicitud, numero_solicitud, laboratorio FROM informe_auditoria"
            " WHERE upper(btrim(nro_informe)) = upper(%s)",
            (informe,),
        )
        auditoria = cur.fetchall()
        cur.execute(
            "SELECT id, nro_solicitud, referencia, laboratorio FROM solicitud"
            " WHERE upper(btrim(nro_solicitud)) = upper(%s)",
            (informe,),
        )
        report = cur.fetchall()

        if not auditoria and not report:
            print(f"\nEl informe {informe} no está ni en Converter ni en Report. No se cambió nada.\n")
            return 1

        print(f"\nInforme {informe}  →  {ot} ({sol['ship_to']} · {sol['especie']} · muestreo {sol['fecha_muestreo']})")
        print("\n  PDF subido por Converter (informe_auditoria):")
        for a in auditoria:
            print(f"    #{a['id']}: OT {a['numero_solicitud'] or '—'} ({a['archivo_solicitud'] or 'sin archivo'})  →  {ot} ({sol['archivo']})")
        if not auditoria:
            print("    (no hay)")
        print("\n  Resultados en Report (solicitud.referencia):")
        for r in report:
            print(f"    #{r['id']}: referencia {r['referencia'] or '—'}  →  {ot}")
        if not report:
            print("    (no hay)")

        if not args.aplicar:
            print("\nNo se cambió nada. Para aplicarlo, repite con --aplicar.\n")
            return 0

        logs = _BACKEND.parent / "logs"
        logs.mkdir(exist_ok=True)
        respaldo = logs / f"corregir_ot_{informe}_{datetime.now():%Y-%m-%d_%H-%M-%S}.json"
        respaldo.write_text(json.dumps({"auditoria": auditoria, "report": report}, default=str, ensure_ascii=False, indent=2), encoding="utf-8")

        cur.execute(
            "UPDATE informe_auditoria SET archivo_solicitud = %s, numero_solicitud = %s"
            " WHERE upper(btrim(nro_informe)) = upper(%s)",
            (sol["archivo"], sol["numero_solicitud"], informe),
        )
        cur.execute(
            "UPDATE solicitud SET referencia = %s WHERE upper(btrim(nro_solicitud)) = upper(%s)",
            (sol["numero_solicitud"], informe),
        )
    print(f"\nListo. Lo que había quedó en {respaldo}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
