"""
Corrige fechas de informes que ya están en Report.

Dos usos, los dos con el mismo cuidado: primero MIRA y muestra el antes y el después; escribe solo con --aplicar, y deja un
respaldo de lo que había en logs/.

1) Automático — la fecha de entrada que el Converter dejó mal (2001 a 2005):
   al completar un informe propio de AgroFresh con la solicitud, la fecha de recepción llegaba como «2026-10-02» y se leía como
   26-10-2002. Este modo la reconstruye (`diagnostico_informes.fecha_entrada_corregida`) solo si lo reconstruido cae entre el
   muestreo y 60 días después; si no, no la toca.

       .venv\\Scripts\\python.exe scripts\\corregir_fechas_informes.py
       .venv\\Scripts\\python.exe scripts\\corregir_fechas_informes.py --aplicar

2) Manual — una fecha puntual que alguien confirmó que está mal:

       .venv\\Scripts\\python.exe scripts\\corregir_fechas_informes.py --informe 496563 --laboratorio ALS --campo fecha_muestreo --valor 2026-09-30
       (agrega --aplicar para escribirla)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import diagnostico_informes as di  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

CAMPOS = ("fecha_muestreo", "fecha_entrada", "fecha_recepcion", "fecha_analisis", "fecha_informe", "fecha_solicitud")


def _respaldo(nombre: str, filas: list[dict]) -> Path:
    destino = _BACKEND / "logs" / f"{nombre}_{datetime.now():%Y%m%d_%H%M}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(filas, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return destino


def _automatico(aplicar: bool) -> int:
    with conexion(escribir=aplicar) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id, nro_solicitud, laboratorio, fecha_muestreo, fecha_entrada FROM solicitud"
            " WHERE vigente AND fecha_entrada IS NOT NULL AND fecha_entrada < '2024-01-01' ORDER BY id"
        )
        candidatas = cur.fetchall()
        cambios, sin_arreglo = [], []
        for f in candidatas:
            nueva = di.fecha_entrada_corregida(f["fecha_entrada"], f["fecha_muestreo"])
            (cambios if nueva else sin_arreglo).append({**f, "nueva": nueva})
        print(f"\nInformes con fecha de entrada anterior a 2024: {len(candidatas)}  ·  se pueden reconstruir: {len(cambios)}  ·  quedan sin tocar: {len(sin_arreglo)}\n")
        for c in cambios:
            print(f"  {c['nro_solicitud']:<14} {c['laboratorio']:<10} entrada {c['fecha_entrada']:%d-%m-%Y}  ->  {c['nueva']:%d-%m-%Y}   (muestreo {c['fecha_muestreo']:%d-%m-%Y})")
        for c in sin_arreglo:
            print(f"  {c['nro_solicitud']:<14} {c['laboratorio']:<10} entrada {c['fecha_entrada']:%d-%m-%Y}  (no se pudo reconstruir: revisar a mano)")
        if not aplicar:
            print("\nNo se cambió nada. Para escribir los cambios: agrega --aplicar.\n")
            return 0
        if not cambios:
            print("\nNada que corregir.\n")
            return 0
        respaldo = _respaldo("fechas_entrada_antes", cambios)
        for c in cambios:
            cur.execute("UPDATE solicitud SET fecha_entrada = %s WHERE id = %s", (c["nueva"], c["id"]))
    print(f"\nListo: {len(cambios)} fechas de entrada corregidas. Respaldo de lo que había: {respaldo}\n")
    return 0


def _manual(args: argparse.Namespace) -> int:
    if args.campo not in CAMPOS:
        print(f"--campo debe ser uno de: {', '.join(CAMPOS)}")
        return 2
    try:
        valor = date.fromisoformat(args.valor)
    except ValueError:
        print("--valor debe ser una fecha AAAA-MM-DD, por ejemplo 2026-09-30")
        return 2
    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        cur.execute(
            f"SELECT id, nro_solicitud, laboratorio, {args.campo} AS antes FROM solicitud"
            " WHERE vigente AND btrim(nro_solicitud) = %s AND lower(split_part(laboratorio, '(', 1)) LIKE %s",
            (args.informe.strip(), f"%{args.laboratorio.strip().lower()}%"),
        )
        encontradas = cur.fetchall()
        if len(encontradas) != 1:
            print(f"\nSe esperaba UN informe y hay {len(encontradas)}: no se cambió nada. Afina --informe y --laboratorio.\n")
            return 1
        f = encontradas[0]
        antes = f["antes"].strftime("%d-%m-%Y") if f["antes"] else "(vacío)"
        print(f"\n{f['nro_solicitud']} ({f['laboratorio']}): {args.campo}  {antes}  ->  {valor:%d-%m-%Y}")
        if not args.aplicar:
            print("No se cambió nada. Para escribirlo: agrega --aplicar.\n")
            return 0
        respaldo = _respaldo("fecha_informe_antes", [dict(f)])
        cur.execute(f"UPDATE solicitud SET {args.campo} = %s WHERE id = %s", (valor, f["id"]))
    print(f"Listo. Respaldo de lo que había: {respaldo}\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Escribir de verdad. Sin esto solo muestra.")
    ap.add_argument("--informe", default="", help="Manual: N° de informe (ej. 496563)")
    ap.add_argument("--laboratorio", default="", help="Manual: laboratorio (ej. ALS)")
    ap.add_argument("--campo", default="", help="Manual: " + ", ".join(CAMPOS))
    ap.add_argument("--valor", default="", help="Manual: la fecha buena, AAAA-MM-DD")
    args = ap.parse_args(argv)
    if args.informe or args.campo or args.valor:
        if not (args.informe and args.laboratorio and args.campo and args.valor):
            print("El modo manual necesita --informe, --laboratorio, --campo y --valor.")
            return 2
        return _manual(args)
    return _automatico(args.aplicar)


if __name__ == "__main__":
    raise SystemExit(main())
