"""
SOLO LECTURA: dice POR QUÉ el plan de entregables del sistema suma distinto que el Excel de José.

Toma el mismo Excel que se sube en Administración General → Plan de entregables, lo lee con el MISMO lector del sistema y va
restando, paso a paso, todo lo que se pierde hasta llegar a lo que muestra la tabla:

  1. Lo que dice el Excel (suma de «Propuesta», y de «Original»).
  2. Filas sin cantidad o con una cantidad que no es número.
  3. Filas de un Sold To que NO se encuentra en Listados (ni por código SAP ni por nombre): se descartan al cargar.
  4. Filas repetidas (mismo Sold To, planta, servicio, línea y semana): el sistema cuenta UNA, no la suma.
  5. Filas que quedan guardadas pero la tabla no dibuja: servicio sin fila en el gráfico (p. ej. «Entrega de registros») o
     una semana fuera de W41…W52, W01, W02.
  6. Lo que HAY guardado hoy en la base (`plan_entregable`), por si el último Excel cargado no fue éste.

Deja el resultado en pantalla y un Excel en `logs/` (Resumen, Por cliente, Filas perdidas). No escribe nada en la base.

Uso (en el servidor, en la consola de los .venv):
    .venv\\Scripts\\python.exe scripts\\diagnostico_plan_entregables.py "C:\\ruta\\Entregables_cerezas_26-27-jose.xlsx"
    .venv\\Scripts\\python.exe scripts\\diagnostico_plan_entregables.py archivo.xlsx --salida logs\\plan.xlsx
    .venv\\Scripts\\python.exe scripts\\diagnostico_plan_entregables.py archivo.xlsx --sin-bd   (no mira Listados ni lo guardado)
"""
from __future__ import annotations

import argparse
import difflib
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

SEMANAS_PLAN = ("W41", "W42", "W43", "W44", "W45", "W46", "W47", "W48", "W49", "W50", "W51", "W52", "W01", "W02")
FILAS_DEL_GRAFICO = ("residuales", "fsma", "fito")


def _n(v: Any) -> int:
    return int(v or 0)


def diagnosticar(
    filas: list[dict[str, Any]],
    por_nombre: dict[str, str] | None,
    por_sap: dict[str, str] | None,
    guardado: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Todo el cálculo, sin tocar la base: recibe las filas ya leídas del Excel, los Sold To de Listados (None = no se mira)
    y lo guardado (None = no se mira). Devuelve los pasos y el detalle por cliente."""
    from app import plan_carga as pc
    from app.plan_cruce import normalizar

    total_prop = sum(_n(f.get("propuesta")) for f in filas)
    total_orig = sum(_n(f.get("original")) for f in filas)

    sin_cantidad = [f for f in filas if f.get("sin_cantidad")]
    con_error = [f for f in filas if f.get("error")]
    utiles = [f for f in filas if not f.get("sin_cantidad") and not f.get("error")]

    # 3. Sold To que no están en Listados.
    if por_nombre is None:
        validas = [{**f, "clave": pc.servicio_clave(f["servicio"])} for f in utiles]
        descartadas: list[dict[str, Any]] = []
    else:
        validas, descartadas = pc.clasificar(utiles, por_nombre, por_sap or {})
    desc_filas = {d["fila"] for d in descartadas}
    descartadas_det = []
    nombres_oficiales = list(por_nombre or {})
    for f in utiles:
        if f["fila"] not in desc_filas:
            continue
        cerca = difflib.get_close_matches(normalizar(f["sold_to"]), nombres_oficiales, n=2, cutoff=0.6)
        descartadas_det.append({**f, "parecidos": [(por_nombre or {})[c] for c in cerca]})
    perdido_descartado = sum(_n(f.get("propuesta")) for f in descartadas_det)

    # 4. Filas repetidas: el sistema se queda con la mayor cantidad de cada columna.
    grupos: dict[tuple, list[dict[str, Any]]] = defaultdict(list)
    for v in validas:
        grupos[(v["sold_to"], normalizar(v.get("planta_plan") or ""), v["clave"], v.get("linea"), v.get("semana"))].append(v)
    repetidas = []
    perdido_fusion = 0
    for clave, g in grupos.items():
        if len(g) < 2:
            continue
        suma = sum(_n(x.get("propuesta")) for x in g)
        queda = max(_n(x.get("propuesta")) for x in g)
        perdido_fusion += suma - queda
        repetidas.append({"sold_to": clave[0], "planta": g[0].get("planta_plan"), "servicio": g[0]["servicio"], "linea": clave[3],
                          "semana": clave[4], "filas": [x["fila"] for x in g], "cantidades": [_n(x.get("propuesta")) for x in g],
                          "se_pierde": suma - queda})
    fusionadas, _n_fusion = pc.fusionar_repetidas(validas)
    esperado = sum(_n(f.get("propuesta")) for f in fusionadas)

    # 5. Guardadas pero que la tabla no dibuja.
    no_dibuja = [f for f in fusionadas if f["clave"] not in FILAS_DEL_GRAFICO or (f.get("semana") or "").strip().upper() not in SEMANAS_PLAN]
    perdido_no_dibuja = sum(_n(f.get("propuesta")) for f in no_dibuja)
    en_tabla_esperado = esperado - perdido_no_dibuja

    # Por cliente: esperado (lo que debería quedar guardado) contra lo guardado.
    por_cliente: dict[str, dict[str, Any]] = {}

    def fila_cliente(nombre: str) -> dict[str, Any]:
        return por_cliente.setdefault(nombre, {"sold_to": nombre, "sap": None, "excel": 0, "descartado": 0, "repetidas": 0,
                                               "no_dibuja": 0, "esperado_tabla": 0, "guardado": None, "causa": ""})

    for f in filas:
        c = fila_cliente(str(f["sold_to"]).strip())
        c["sap"] = c["sap"] or f.get("sold_to_sap")
        c["excel"] += _n(f.get("propuesta"))
    for f in descartadas_det:
        fila_cliente(str(f["sold_to"]).strip())["descartado"] += _n(f.get("propuesta"))
    oficial_a_excel: dict[str, str] = {}
    for f in utiles:
        oficial_a_excel[f["sold_to"]] = str(f["sold_to"]).strip()
    for v in validas:
        oficial_a_excel[v["sold_to"]] = next((str(f["sold_to"]).strip() for f in utiles if f["fila"] == v["fila"]), v["sold_to"])
    for r in repetidas:
        fila_cliente(oficial_a_excel.get(r["sold_to"], r["sold_to"]))["repetidas"] += r["se_pierde"]
    for f in no_dibuja:
        fila_cliente(oficial_a_excel.get(f["sold_to"], f["sold_to"]))["no_dibuja"] += _n(f.get("propuesta"))
    for f in fusionadas:
        fila_cliente(oficial_a_excel.get(f["sold_to"], f["sold_to"]))["esperado_tabla"] += _n(f.get("propuesta")) if f not in no_dibuja else 0

    guardado_total = guardado_tabla = None
    if guardado is not None:
        guardado_total = sum(_n(g.get("propuesta")) for g in guardado)
        guardado_tabla = sum(
            _n(g.get("propuesta")) for g in guardado
            if g.get("servicio") in FILAS_DEL_GRAFICO and (g.get("semana") or "").strip().upper() in SEMANAS_PLAN
        )
        por_sold: dict[str, int] = defaultdict(int)
        for g in guardado:
            if g.get("servicio") in FILAS_DEL_GRAFICO and (g.get("semana") or "").strip().upper() in SEMANAS_PLAN:
                por_sold[normalizar(g["sold_to"])] += _n(g.get("propuesta"))
        for nombre, c in por_cliente.items():
            c["guardado"] = por_sold.get(normalizar(nombre), 0)

    for c in por_cliente.values():
        causas = []
        if c["descartado"]:
            causas.append("Sold To no encontrado en Listados")
        if c["repetidas"]:
            causas.append(f"{c['repetidas']} por filas repetidas")
        if c["no_dibuja"]:
            causas.append(f"{c['no_dibuja']} en servicio/semana que la tabla no dibuja")
        if c["guardado"] is not None and c["guardado"] != c["esperado_tabla"] and not c["descartado"]:
            causas.append(f"lo guardado ({c['guardado']}) no es lo que da este Excel ({c['esperado_tabla']}): la carga es de otro Excel")
        c["causa"] = "; ".join(causas)

    return {
        "excel_propuesta": total_prop, "excel_original": total_orig, "filas_leidas": len(filas),
        "sin_cantidad": len(sin_cantidad), "con_error": len(con_error),
        "descartadas": descartadas_det, "perdido_descartado": perdido_descartado,
        "repetidas": repetidas, "perdido_fusion": perdido_fusion,
        "esperado_guardado": esperado, "no_dibuja": no_dibuja, "perdido_no_dibuja": perdido_no_dibuja,
        "esperado_tabla": en_tabla_esperado, "guardado_total": guardado_total, "guardado_tabla": guardado_tabla,
        "por_cliente": sorted(por_cliente.values(), key=lambda c: -(c["excel"] - c["esperado_tabla"])),
        "mira_listados": por_nombre is not None, "mira_guardado": guardado is not None,
    }


def _imprimir(d: dict[str, Any]) -> None:
    f = lambda n: f"{n:,}".replace(",", ".")  # noqa: E731
    print("\n══════ Del Excel de José a la tabla del sistema (columna «Propuesta») ══════\n")
    print(f"  {'Excel de José (suma de Propuesta)':<58}{f(d['excel_propuesta']):>8}   ({f(d['filas_leidas'])} filas)")
    print(f"  {'  filas sin cantidad / con cantidad que no es número':<58}{'0':>8}   ({d['sin_cantidad']} / {d['con_error']}: valen 0, no restan)")
    if d["mira_listados"]:
        print(f"  {'− Sold To que NO están en Listados (se descartan)':<58}{'-' + f(d['perdido_descartado']):>8}   ({len({x['sold_to'] for x in d['descartadas']})} clientes)")
    else:
        print("  (no se miró Listados: --sin-bd)")
    print(f"  {'− filas repetidas (se cuenta una, no la suma)':<58}{'-' + f(d['perdido_fusion']):>8}   ({len(d['repetidas'])} grupos)")
    print(f"  {'= lo que debería quedar guardado':<58}{f(d['esperado_guardado']):>8}")
    print(f"  {'− guardado pero que la tabla no dibuja':<58}{'-' + f(d['perdido_no_dibuja']):>8}   (servicio sin fila en el gráfico o semana fuera de W41…W02)")
    print(f"  {'= lo que la tabla debería mostrar':<58}{f(d['esperado_tabla']):>8}")
    if d["mira_guardado"]:
        print(f"\n  Lo que HAY guardado hoy en la base: {f(d['guardado_total'])} (en la tabla: {f(d['guardado_tabla'])})")
        if d["guardado_tabla"] != d["esperado_tabla"]:
            print(f"  ⚠ Difiere de lo esperado en {f(abs(d['guardado_tabla'] - d['esperado_tabla']))}: lo cargado NO salió de este Excel (o se cargó antes de un cambio).")
        else:
            print("  ✓ Lo guardado coincide con lo que da este Excel.")
    if d["descartadas"]:
        print("\n── Sold To descartados (no están en Listados por código SAP ni por nombre) ──")
        por: dict[str, dict[str, Any]] = {}
        for x in d["descartadas"]:
            p = por.setdefault(x["sold_to"], {"sap": x.get("sold_to_sap"), "n": 0, "filas": 0, "parecidos": x["parecidos"]})
            p["n"] += _n(x.get("propuesta"))
            p["filas"] += 1
        for nombre, p in sorted(por.items(), key=lambda kv: -kv[1]["n"]):
            print(f"  {f(p['n']):>6}  SAP {p['sap'] or '—':<9} {nombre}   ({p['filas']} filas)")
            if p["parecidos"]:
                print(f"          parecido en Listados: {' | '.join(p['parecidos'])}")
        print("  → Arreglo: poner ese código SAP (o el nombre) en Listados y volver a subir el Excel.")
    if d["repetidas"]:
        print("\n── Filas repetidas (en el Excel suman más de lo que el sistema cuenta) ──")
        for r in sorted(d["repetidas"], key=lambda r: -r["se_pierde"])[:15]:
            print(f"  -{r['se_pierde']}  {r['sold_to']} · {r['planta']} · {r['servicio']} L{r['linea']} {r['semana']}: filas {r['filas']} = {r['cantidades']}")
        if len(d["repetidas"]) > 15:
            print(f"  … y {len(d['repetidas']) - 15} más (están en el Excel de `logs/`).")
    print()


def _excel(d: dict[str, Any], ruta: Path) -> None:
    import openpyxl
    from openpyxl.styles import Font

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Resumen"
    ws.append(["Paso", "Análisis", "Detalle"])
    ws.append(["Excel de José (Propuesta)", d["excel_propuesta"], f"{d['filas_leidas']} filas; Original = {d['excel_original']}"])
    ws.append(["Sold To no encontrados en Listados", -d["perdido_descartado"], f"{len({x['sold_to'] for x in d['descartadas']})} clientes"])
    ws.append(["Filas repetidas", -d["perdido_fusion"], f"{len(d['repetidas'])} grupos"])
    ws.append(["Debería quedar guardado", d["esperado_guardado"], ""])
    ws.append(["Guardado que la tabla no dibuja", -d["perdido_no_dibuja"], "servicio sin fila o semana fuera de W41…W02"])
    ws.append(["La tabla debería mostrar", d["esperado_tabla"], ""])
    if d["mira_guardado"]:
        ws.append(["Guardado hoy en la base (en la tabla)", d["guardado_tabla"], f"total guardado {d['guardado_total']}"])
    for c in ws[1]:
        c.font = Font(bold=True)

    ws2 = wb.create_sheet("Por cliente")
    ws2.append(["Sold To (como viene en el Excel)", "Código SAP", "Excel", "No encontrado en Listados", "Repetidas", "Servicio/semana sin dibujar",
                "Debería verse en la tabla", "Guardado hoy", "Causa"])
    for c in d["por_cliente"]:
        ws2.append([c["sold_to"], c["sap"], c["excel"], c["descartado"], c["repetidas"], c["no_dibuja"], c["esperado_tabla"], c["guardado"], c["causa"]])
    for c in ws2[1]:
        c.font = Font(bold=True)

    ws3 = wb.create_sheet("Filas perdidas")
    ws3.append(["Motivo", "Fila del Excel", "Sold To", "Código SAP", "Planta", "Servicio", "Línea", "Semana", "Propuesta", "Nota"])
    for x in d["descartadas"]:
        ws3.append(["Sold To no está en Listados", x["fila"], x["sold_to"], x.get("sold_to_sap"), x.get("planta_plan"), x["servicio"],
                    x.get("linea"), x.get("semana"), _n(x.get("propuesta")), " | ".join(x["parecidos"])])
    for r in d["repetidas"]:
        ws3.append(["Fila repetida", ", ".join(map(str, r["filas"])), r["sold_to"], None, r["planta"], r["servicio"], r["linea"], r["semana"],
                    r["se_pierde"], f"cantidades {r['cantidades']}: se cuenta la mayor"])
    for f in d["no_dibuja"]:
        ws3.append(["La tabla no la dibuja", f["fila"], f["sold_to"], f.get("sold_to_sap"), f.get("planta_plan"), f["servicio"], f.get("linea"),
                    f.get("semana"), _n(f.get("propuesta")), f"servicio «{f['clave']}»"])
    for c in ws3[1]:
        c.font = Font(bold=True)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    wb.save(ruta)


def main() -> int:
    ap = argparse.ArgumentParser(description="Por qué el plan de entregables del sistema suma distinto que el Excel de José (solo lee).")
    ap.add_argument("excel", help="El Excel del plan (el mismo que se sube en Administración General).")
    ap.add_argument("--salida", help="Dónde dejar el Excel con el detalle (por defecto logs/diagnostico_plan_<fecha>.xlsx).")
    ap.add_argument("--sin-bd", action="store_true", help="No mirar Listados ni lo guardado (solo repetidas y semanas).")
    a = ap.parse_args()

    from app import plan_carga as pc

    ruta = Path(a.excel)
    if not ruta.exists():
        print(f"No encuentro el archivo: {ruta}")
        return 1
    filas = pc.leer_excel(ruta.read_bytes())
    if not filas:
        print("El archivo no trae filas con Sold To.")
        return 1

    por_nombre = por_sap = guardado = None
    if not a.sin_bd:
        from app.db import conexion, cursor_dict

        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            por_nombre, por_sap = pc._oficiales(cur)
            try:
                cur.execute("SELECT sold_to, servicio, semana, propuesta, cantidad FROM plan_entregable WHERE temporada = %s", (pc.TEMPORADA,))
                guardado = [{**g, "propuesta": g["propuesta"] if g.get("propuesta") is not None else g.get("cantidad")} for g in cur.fetchall()]
            except Exception as e:  # sin la tabla o sin la 0073: se avisa y se sigue con lo demás
                conn.rollback()
                print(f"(No pude leer lo guardado: {type(e).__name__}. ¿Falta la migración 0073?)")

    d = diagnosticar(filas, por_nombre, por_sap, guardado)
    _imprimir(d)
    salida = Path(a.salida) if a.salida else _BACKEND / "logs" / f"diagnostico_plan_{datetime.now():%Y-%m-%d_%H%M}.xlsx"
    _excel(d, salida)
    print(f"Detalle en: {salida}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
