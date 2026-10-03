"""
¿Por qué «Solicitudes e informes» y Report no dan el mismo número de informes?

Report cuenta INFORMES (filas de `solicitud`, una por N° de informe con
resultados). Solicitudes e informes cuenta SOLICITUDES (OT) que tienen informe.
Este script cruza las dos cosas y dice qué explica la diferencia:

  A. OT con PDF de informe pero sin resultados en Report («Sin Report»).
  B. Un mismo N° de informe asociado a más de una OT.
  C. Informes en Report que no están asociados a ninguna OT.
  D. OT de un laboratorio cuyo informe está en Report con otro laboratorio.

Solo LEE la base: no cambia nada.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\cruce_informes.py                 # todos los laboratorios
    .venv\\Scripts\\python.exe scripts\\cruce_informes.py --lab Quiteca   # uno
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.db import conexion, cursor_dict  # noqa: E402
from app.informes_solicitud import (  # noqa: E402
    _SQL_AUDITORIA, _SQL_INFORMES_EN_REPORT, _SQL_REPORT, _filas, asociar,
)


def _norm(t) -> str:
    return str(t or "").strip().upper()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lab", default="", help="Solo este laboratorio (Quiteca, Agrofresh, ALS…)")
    args = ap.parse_args(argv)
    lab = _norm(args.lab)

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT archivo, numero_solicitud, laboratorio FROM solicitud_archivo ORDER BY numero_solicitud")
        solicitudes = cur.fetchall()
        auditoria = _filas(cur, _SQL_AUDITORIA)
        report = _filas(cur, _SQL_REPORT)
        en_report = {f["nro"] for f in _filas(cur, _SQL_INFORMES_EN_REPORT)}
        cur.execute("SELECT id, nro_solicitud, referencia, laboratorio FROM solicitud ORDER BY nro_solicitud")
        informes_report = cur.fetchall()

    lab_de_ot = {s["archivo"]: s for s in solicitudes}
    asociados = asociar([(s["archivo"], s["numero_solicitud"]) for s in solicitudes], auditoria, report, en_report)

    def del_lab(lab_texto) -> bool:
        return not lab or _norm(lab_texto) == lab

    # Lo que cuenta cada pantalla
    con_informe = {a: i for a, i in asociados.items() if del_lab(lab_de_ot[a]["laboratorio"])}
    informes_en_report = [f for f in informes_report if del_lab(f["laboratorio"])]
    print(f"\nLaboratorio: {args.lab or 'todos'}")
    print(f"  Solicitudes e informes → OT con informe : {len(con_informe)}")
    print(f"  Report                 → informes        : {len(informes_en_report)}")

    # A. Con PDF pero sin resultados en Report
    a = [(lab_de_ot[x]["numero_solicitud"], i["nro_informe"]) for x, i in con_informe.items() if not i["en_report"]]
    print(f"\nA. OT con informe pero SIN resultados en Report: {len(a)}")
    for ot, nro in a:
        print(f"   {ot}  →  informe {nro}  (revisa Ingesta de Datos → Filas pendientes)")

    # B. Un N° de informe en más de una OT
    por_numero: dict[str, list[str]] = defaultdict(list)
    for x, i in con_informe.items():
        for n in i["numeros"]:
            por_numero[_norm(n)].append(lab_de_ot[x]["numero_solicitud"])
    b = {n: ots for n, ots in por_numero.items() if len(ots) > 1}
    print(f"\nB. Un mismo N° de informe asociado a más de una OT: {len(b)}")
    for n, ots in b.items():
        print(f"   informe {n}  →  {', '.join(ots)}")

    # C. Informes en Report sin OT
    asociados_nros = {_norm(n) for i in asociados.values() for n in i["numeros"]}
    c = [f for f in informes_en_report if _norm(f["nro_solicitud"]) not in asociados_nros]
    print(f"\nC. Informes en Report que no están asociados a ninguna OT: {len(c)}")
    for f in c:
        ref = f"referencia «{f['referencia']}»" if _norm(f["referencia"]) else "sin OT"
        print(f"   {f['nro_solicitud']}  ({f['laboratorio']}, {ref})")

    # D. Laboratorio distinto entre la OT y su informe en Report
    lab_informe = {_norm(f["nro_solicitud"]): f["laboratorio"] for f in informes_report}
    d = []
    for x, i in con_informe.items():
        for n in i["numeros"]:
            l_inf = lab_informe.get(_norm(n))
            if l_inf and _norm(l_inf) != _norm(lab_de_ot[x]["laboratorio"]):
                d.append((lab_de_ot[x]["numero_solicitud"], lab_de_ot[x]["laboratorio"], n, l_inf))
    print(f"\nD. OT de un laboratorio con informe de otro: {len(d)}")
    for ot, l_ot, n, l_inf in d:
        print(f"   {ot} ({l_ot})  →  informe {n} ({l_inf})")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
