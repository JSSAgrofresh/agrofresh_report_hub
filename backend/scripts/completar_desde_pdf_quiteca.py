"""
Completa los informes de Quiteca que ya están cargados leyendo SU PDF guardado.

Les suele faltar el N° de muestra («Identificación de la Muestra N° 85930»), la
hora de muestreo y las fechas de análisis e informe. Los PDF están en el
sistema (Auditoría / Storage → Informes), así que no hace falta volver a
subirlos por Converter: este script los lee y completa SOLO lo que está vacío
(nunca pisa un dato que ya tiene valor).

Primero mira y muestra qué haría; escribe solo con --aplicar. Antes de aplicar
deja un respaldo de lo que había en logs/.

Requiere las migraciones 0053 (codigo_muestra) y 0056 (hora_recepcion) y pypdf instalado.

Uso:
    .venv\\Scripts\\python.exe scripts\\completar_desde_pdf_quiteca.py
    .venv\\Scripts\\python.exe scripts\\completar_desde_pdf_quiteca.py --aplicar
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

from app import r2  # noqa: E402
from app import r2_auditoria as r2a  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.ficha_informe import _buscar_pdf  # noqa: E402
from app.informe_lectura import texto_de_pdf  # noqa: E402
from app.ingest import columna_solicitud_existe  # noqa: E402
from app.quiteca_pdf import leer_quiteca  # noqa: E402

_CAMPOS = ("codigo_muestra", "hora_muestreo", "fecha_recepcion", "hora_recepcion", "fecha_analisis", "fecha_informe")


def _vacio(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Escribir de verdad. Sin esto solo muestra.")
    args = ap.parse_args(argv)

    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        if not columna_solicitud_existe(cur, "codigo_muestra"):
            print("\nFalta la migración 0053 (columna codigo_muestra). Córrela y vuelve a intentar.\n")
            return 1
        if not columna_solicitud_existe(cur, "hora_recepcion"):
            print("\nFalta la migración 0056 (columna hora_recepcion). Córrela y vuelve a intentar.\n")
            return 1
        cur.execute(
            """
            SELECT s.*, COALESCE(c.nombre, s.sold_to_raw) AS cliente, COALESCE(p.nombre, s.ship_to_raw) AS planta
              FROM solicitud s
              LEFT JOIN planta p ON p.id = s.planta_id
              LEFT JOIN cliente c ON c.id = p.cliente_id
             WHERE s.vigente AND lower(btrim(s.laboratorio)) = 'quiteca'
               AND (s.codigo_muestra IS NULL OR s.hora_muestreo IS NULL OR btrim(s.hora_muestreo) = ''
                    OR s.fecha_analisis IS NULL OR s.fecha_informe IS NULL
                    OR s.fecha_recepcion IS NULL OR s.hora_recepcion IS NULL OR btrim(s.hora_recepcion) = '')
             ORDER BY s.id
            """
        )
        sols = cur.fetchall()
        print(f"\n{len(sols)} informes de Quiteca con algo vacío.\n")

        cambios: list[tuple[dict, dict]] = []
        sin_pdf: list[str] = []
        sin_dato: dict[str, list[str]] = {c: [] for c in _CAMPOS}
        for sol in sols:
            nro = sol["nro_solicitud"]
            pdf = _buscar_pdf(cur, sol)
            if pdf is None:
                sin_pdf.append(nro)
                continue
            try:
                datos = r2a.descargar(pdf["clave"]) if pdf["origen"] == "auditoria" else r2.descargar(pdf["clave"])
                leido = leer_quiteca(texto_de_pdf(datos)) if datos else {}
            except Exception as exc:  # un PDF dañado no frena a los demás
                print(f"  {nro}: no se pudo leer el PDF ({exc})")
                continue
            nuevo = {c: leido.get(c) for c in _CAMPOS if _vacio(sol.get(c)) and leido.get(c) is not None}
            for c in _CAMPOS:
                if _vacio(sol.get(c)) and leido.get(c) is None:
                    sin_dato[c].append(nro)
            if nuevo:
                cambios.append((sol, nuevo))
                print(f"  {nro}: " + ", ".join(f"{k}={v}" for k, v in nuevo.items()))

        print(f"\nSe completarían {len(cambios)} informes.")
        if sin_pdf:
            print(f"Sin PDF guardado ({len(sin_pdf)}): {', '.join(sin_pdf)}")
        for c, nros in sin_dato.items():
            if nros:
                print(f"El PDF no trae «{c}» ({len(nros)}): {', '.join(nros)}")

        if not args.aplicar:
            print("\nNo se escribió nada. Para aplicar: agrega --aplicar\n")
            return 0

        logs = _BACKEND / "logs"
        logs.mkdir(exist_ok=True)
        respaldo = logs / f"completar_quiteca_{datetime.now():%Y%m%d_%H%M%S}.json"
        respaldo.write_text(
            json.dumps(
                [{"id": s["id"], "nro_solicitud": s["nro_solicitud"], **{c: str(s.get(c)) for c in _CAMPOS}} for s, _ in cambios],
                ensure_ascii=False, indent=2,
            ),
            encoding="utf-8",
        )
        for sol, nuevo in cambios:
            # `nuevo` solo trae campos que estaban vacíos: nunca pisa un dato.
            sets = ", ".join(f"{c} = %s" for c in nuevo)
            cur.execute(f"UPDATE solicitud SET {sets} WHERE id = %s", (*nuevo.values(), sol["id"]))
        print(f"\nListo: {len(cambios)} informes completados. Respaldo: {respaldo}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
