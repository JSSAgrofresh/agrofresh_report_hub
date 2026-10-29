"""
SOLO LECTURA: cuantos informes hay en la base y cuantos de ellos muestra Report hoy, por tipo de servicio.

Report solo muestra los servicios que el administrador principal enciende en Administracion General -> Funciones
(de fabrica, solo Linea de proceso). Si Report muestra menos informes que «Solicitudes e informes», esta tabla dice
exactamente cuales son los que estan apagados. No cambia nada.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\contar_informes_report.py
"""
from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

NOMBRES = {"": "Línea de proceso", "actimist": "Actimist", "ecofog": "Ecofog", "ryd": "RYD"}


def main() -> int:
    from app import funciones
    from app.db import conexion, cursor_dict

    if not funciones.columna_servicio_existe():
        print("Falta la migración 0055 (solicitud.servicio): Report no filtra nada por servicio.")
        return 1
    visibles = set(funciones.valores_visibles_en_report())
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """SELECT COALESCE(servicio, '') AS servicio, count(*) AS solicitudes,
                      count(DISTINCT nro_solicitud) FILTER (WHERE nro_solicitud IS NOT NULL AND btrim(nro_solicitud) <> '') AS informes
                 FROM solicitud GROUP BY 1 ORDER BY 1"""
        )
        filas = cur.fetchall()
    print("\nInformes en la base, por tipo de servicio\n")
    print(f"  {'Servicio':<20}{'Informes':>9}{'Filas':>8}   Report")
    total = visto = 0
    for f in filas:
        encendido = f["servicio"] in visibles
        total += f["solicitudes"]
        visto += f["solicitudes"] if encendido else 0
        print(f"  {NOMBRES.get(f['servicio'], f['servicio'] or '(sin servicio)'):<20}{f['informes']:>9}{f['solicitudes']:>8}   {'SE MUESTRA' if encendido else 'OCULTO'}")
    print(f"\n  Filas que Report muestra hoy: {visto} de {total}")
    apagados = [NOMBRES.get(f["servicio"], f["servicio"]) for f in filas if f["servicio"] not in visibles]
    if apagados:
        print(f"  Apagados: {', '.join(apagados)}. Se encienden en Administración General → Funciones (con la clave del administrador principal).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
