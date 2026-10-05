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


# Filas de informes de Converter que no entraron a Report (Sold To / Ship To que
# no calzó con Listados): quedan en Ingesta de Datos → Filas pendientes.
_SQL_PENDIENTES = (
    "SELECT DISTINCT fila->>'Informe' AS informe, fila->>'Laboratorio' AS laboratorio"
    " FROM pendiente_revision WHERE origen = 'converter'"
)


def _norm(t) -> str:
    return str(t or "").strip().upper()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lab", default="", help="Solo este laboratorio (Quiteca, Agrofresh, ALS…)")
    args = ap.parse_args(argv)
    lab = _norm(args.lab)

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT archivo, numero_solicitud, laboratorio, ship_to, especie, fecha_muestreo"
            " FROM solicitud_archivo ORDER BY numero_solicitud"
        )
        solicitudes = cur.fetchall()
        auditoria = _filas(cur, _SQL_AUDITORIA)
        report = _filas(cur, _SQL_REPORT)
        en_report = {f["nro"] for f in _filas(cur, _SQL_INFORMES_EN_REPORT)}
        cur.execute(
            "SELECT s.id, s.nro_solicitud, s.referencia, s.laboratorio, s.especie, s.fecha_muestreo,"
            " COALESCE(p.nombre, s.ship_to_raw) AS planta"
            " FROM solicitud s LEFT JOIN planta p ON p.id = s.planta_id ORDER BY s.nro_solicitud"
        )
        informes_report = cur.fetchall()
        pendientes = _filas(cur, _SQL_PENDIENTES)

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
    ot_por_numero = {s["numero_solicitud"]: s for s in solicitudes}
    info_report = {_norm(f["nro_solicitud"]): f for f in informes_report}
    for n, ots in b.items():
        inf = info_report.get(n)
        print(f"\n   informe {n}  →  {', '.join(ots)}")
        if inf:
            print(f"      el informe es de: {inf.get('planta') or '¿?'} · {inf.get('especie') or '¿?'} · muestreo {inf.get('fecha_muestreo') or '¿?'}")
        for ot in ots:
            fuentes = []
            if inf and _norm(inf.get("referencia")) == _norm(ot):
                fuentes.append("lo dice el PDF")
            if any(_norm(a.get("nro_informe")) == n and (
                    a.get("archivo_solicitud") == ot_por_numero.get(ot, {}).get("archivo")
                    or _norm(a.get("numero_solicitud")) == _norm(ot)) for a in auditoria):
                fuentes.append("elegida en Converter")
            sol = ot_por_numero.get(ot, {})
            calza = inf is not None and _norm(sol.get("ship_to")) == _norm(inf.get("planta")) and _norm(sol.get("especie")) == _norm(inf.get("especie")) and str(sol.get("fecha_muestreo") or "") == str(inf.get("fecha_muestreo") or "")
            print(f"      {ot}: {sol.get('ship_to') or '¿?'} · {sol.get('especie') or '¿?'} · muestreo {sol.get('fecha_muestreo') or '¿?'}"
                  f"  [{' + '.join(fuentes) or 'otra vía'}]{'  ✓ CALZA' if calza else ''}")

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

    # E. Verificación de CADA informe: su OT tiene que estar confirmada por el
    #    PDF (el «N° Solicitud: OT-…» que queda como referencia en Report) y
    #    calzar en planta, especie y fecha de muestreo con la OT.
    ots_de: dict[str, list[str]] = defaultdict(list)
    for x, i in asociados.items():
        for n in i["numeros"]:
            ots_de[_norm(n)].append(lab_de_ot[x]["numero_solicitud"])
    revisar = []
    ok = 0
    print("\nE. Verificación informe por informe:")
    for f in sorted(informes_en_report, key=lambda f: _norm(f["nro_solicitud"])):
        n = _norm(f["nro_solicitud"])
        ots = ots_de.get(n, [])
        sol = ot_por_numero.get(ots[0], {}) if len(ots) == 1 else {}
        motivos = []
        if not ots:
            motivos.append("sin OT")
        elif len(ots) > 1:
            motivos.append("en varias OT")
        else:
            if _norm(f.get("referencia")) != _norm(ots[0]):
                motivos.append("el PDF no confirma la OT" if not _norm(f.get("referencia")) else f"el PDF dice {f.get('referencia')}")
            for campo_ot, campo_inf, nombre in (("ship_to", "planta", "planta"), ("especie", "especie", "especie")):
                if _norm(sol.get(campo_ot)) != _norm(f.get(campo_inf)):
                    motivos.append(f"{nombre} distinta")
            if str(sol.get("fecha_muestreo") or "") != str(f.get("fecha_muestreo") or ""):
                motivos.append("fecha de muestreo distinta")
        estado = "✓ OK     " if not motivos else "⚠ REVISAR"
        if motivos:
            revisar.append(n)
        else:
            ok += 1
        print(f"   {estado}  {f['nro_solicitud']:<16} → {', '.join(ots) or '—':<12}  {f.get('planta') or '¿?'} · "
              f"{f.get('especie') or '¿?'} · {f.get('fecha_muestreo') or '¿?'}" + (f"   ({'; '.join(motivos)})" if motivos else ""))
    print(f"   → {ok} confirmados, {len(revisar)} para revisar")

    # F. PDFs subidos por Converter: compara con los archivos que tienes.
    #    Subir dos veces el MISMO informe no duplica: queda uno (se reemplaza).
    pdfs = [a for a in auditoria if del_lab(a.get("laboratorio"))]
    en_report_nros = {_norm(f["nro_solicitud"]) for f in informes_report}
    print(f"\nF. PDFs guardados por Converter: {len(pdfs)} (uno por N° de informe)")
    for a in sorted(pdfs, key=lambda a: _norm(a.get("nro_informe"))):
        marca = "" if _norm(a.get("nro_informe")) in en_report_nros else "   ← sin resultados en Report"
        print(f"   {a.get('nro_informe') or '(sin N°)':<16} {a.get('nombre_archivo')}{marca}")
    pend = [p for p in pendientes if del_lab(p.get("laboratorio"))]
    print(f"\n   Informes con filas en Ingesta → Filas pendientes: {len(pend)}")
    for p_ in pend:
        print(f"   {p_.get('informe') or '(sin N°)'}  ({p_.get('laboratorio')})")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
