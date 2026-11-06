"""
Análisis de integridad de datos (solicitudes contra informes de los laboratorios), pensado para correr cada noche.

Hace lo mismo que el botón «Analizar ahora» de Administración General → Integridad de datos: compara cada solicitud enviada con su
informe, relee los PDF de AgroFresh, Quiteca y Diagnofruit y guarda el resultado (migración 0075) para verlo en la pantalla y emitir el
informe de errores por laboratorio. SOLO LEE: no cambia solicitudes ni informes.

Uso (desde la carpeta backend):
    .venv\\Scripts\\python.exe scripts\\integridad_nocturna.py            # con lectura de PDF (lo normal de noche)
    .venv\\Scripts\\python.exe scripts\\integridad_nocturna.py --sin-pdf   # rápido: solo lo guardado en Report
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import integridad_api as api  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sin-pdf", action="store_true", help="No relee los PDF (más rápido)")
    args = ap.parse_args(argv)

    analisis_id, ya = api._iniciar(not args.sin_pdf, "nocturno", "tarea programada")
    if ya:
        print(f"Ya hay un análisis en curso (n.º {analisis_id}): no se abre otro.")
        return 0
    print(f"Análisis n.º {analisis_id} en marcha…")
    api.ejecutar(analisis_id, not args.sin_pdf)
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT estado, error, resumen FROM integridad_analisis WHERE id = %s", (analisis_id,))
        fila = cur.fetchone()
    if not fila or fila["estado"] != "listo":
        print(f"El análisis falló: {(fila or {}).get('error')}")
        return 1
    r = fila["resumen"]
    print(f"Listo. Solicitudes enviadas: {r['solicitudes_enviadas']} · con informe: {r['con_informe']} · sin informe: {r['sin_informe']} · "
          f"informes con errores: {r['informes_con_problema']} de {r['informes_revisados']} · graves: {r['hallazgos_altos']} · a revisar: {r['hallazgos_medios']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
