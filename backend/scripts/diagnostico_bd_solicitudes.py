"""
¿Por qué la descarga de la BD sale con columnas vacías?

Solo LEE. La descarga completa muestreador, tipo de muestra, emails, etc. desde la
solicitud de Toma de muestras que originó cada resultado, y las une por el N° de
OT. Este script dice cuántas filas de la base logran ese enlace y, si no lo
logran, qué traen en su lugar.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\diagnostico_bd_solicitudes.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402


def main() -> None:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT count(*) AS n FROM solicitud WHERE vigente")
        total = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solicitud WHERE vigente AND coalesce(trim(referencia), '') <> ''")
        con_ref = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solicitud WHERE vigente AND nro_solicitud ~* '^OT-'")
        informe_es_ot = cur.fetchone()["n"]
        print(f"Solicitudes vigentes en la base ............ {total}")
        print(f"  con «referencia» (N° Solicitud) escrita ... {con_ref}")
        print(f"  con N° Informe que parece un OT (OT-...) .. {informe_es_ot}")

        try:
            cur.execute("SELECT count(*) AS n FROM solicitud_archivo")
        except Exception as e:  # tabla del índice ausente
            print(f"\nNo existe la tabla del índice de solicitudes (0020): {e}")
            return
        print(f"Solicitudes en el índice de Toma de muestras  {cur.fetchone()['n']}")

        cur.execute(
            """
            SELECT count(*) AS n FROM solicitud s
            WHERE s.vigente AND EXISTS (
                SELECT 1 FROM solicitud_archivo a
                WHERE upper(a.numero_solicitud) = upper(s.referencia)
                   OR upper(a.numero_solicitud) = upper(s.nro_solicitud))
            """
        )
        enlazadas = cur.fetchone()["n"]
        print(f"\nFilas que SÍ se enlazan con su solicitud ... {enlazadas} de {total}")

        cur.execute(
            """
            SELECT s.nro_solicitud AS informe, s.referencia, s.laboratorio, s.fecha_muestreo
            FROM solicitud s
            WHERE s.vigente AND NOT EXISTS (
                SELECT 1 FROM solicitud_archivo a
                WHERE upper(a.numero_solicitud) = upper(s.referencia)
                   OR upper(a.numero_solicitud) = upper(s.nro_solicitud))
            ORDER BY s.id DESC LIMIT 12
            """
        )
        print("\nEjemplos de filas SIN enlace (lo que traen en informe / referencia):")
        for f in cur.fetchall():
            print(f"  informe={f['informe']!s:<22} referencia={f['referencia']!s:<16} {f['laboratorio']!s:<12} {f['fecha_muestreo']}")

        cur.execute("SELECT numero_solicitud FROM solicitud_archivo ORDER BY creado_en DESC NULLS LAST LIMIT 8")
        print("\nÚltimos N° de solicitud del índice (así deberían verse en «referencia»):")
        for f in cur.fetchall():
            print(f"  {f['numero_solicitud']}")


if __name__ == "__main__":
    main()
