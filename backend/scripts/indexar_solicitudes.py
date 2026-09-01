"""
Llena el índice de solicitudes leyendo R2 (o el disco) UNA última vez.

Después de esto, listar solicitudes deja de bajar los Excel: la información
sale de la tabla `solicitud_archivo`. El archivo sigue en R2 y se baja solo
cuando alguien pide ese documento en particular.

También deja la SEQUENCE del folio en su lugar, a partir del número más alto
que ya existe. Desde ahí, el correlativo lo entrega Postgres y no una cuenta
sobre los nombres de archivo — que era lo que hacía que dos personas creando
una solicitud a la vez recibieran el mismo folio.

Es idempotente: volver a correrlo actualiza las filas en vez de duplicarlas.
No borra ni modifica nada en R2.

Uso:
    cd backend
    python scripts/indexar_solicitudes.py            # solo mirar
    python scripts/indexar_solicitudes.py --aplicar  # indexar de verdad
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import indice_solicitudes  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.toma_muestras import _PAT_NUMERO, leer_todas_las_solicitudes  # noqa: E402


def _numero_de(datos: dict, archivo: str) -> int:
    """El correlativo de una solicitud, del campo o del nombre del archivo."""
    for candidato in (str(datos.get("numero_solicitud") or ""), os.path.splitext(archivo)[0]):
        m = _PAT_NUMERO.match(candidato.strip())
        if m:
            return int(m.group(1))
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="Escribir de verdad. Sin esto solo muestra.")
    args = p.parse_args()

    print("\nLeyendo las solicitudes de R2… (esta es la última vez que hace falta)")
    pares = leer_todas_las_solicitudes()
    if not pares:
        print("No se encontró ninguna solicitud. Nada que indexar.")
        return

    mayor = max(_numero_de(datos, nombre) for nombre, datos in pares)
    laboratorios: dict[str, int] = {}
    for _nombre, datos in pares:
        clave = datos.get("laboratorio") or "(sin laboratorio)"
        laboratorios[clave] = laboratorios.get(clave, 0) + 1

    print(f"\n{len(pares)} solicitud(es). Folio más alto: {mayor}.\n")
    for lab, cuantas in sorted(laboratorios.items(), key=lambda p: -p[1]):
        print(f"   {cuantas:>6}  {lab}")

    if not args.aplicar:
        print("\nEsto fue solo una vista previa. Agrega --aplicar para indexarlas.\n")
        return

    with conexion() as conn, cursor_dict(conn) as cur:
        for nombre, datos in pares:
            indice_solicitudes.guardar(cur, nombre, datos)
        # La secuencia queda apuntando al folio más alto que ya existe, así el
        # próximo que entregue es el siguiente y no uno ya usado.
        cur.execute("SELECT setval('folio_solicitud', %s)", (max(mayor, 1),))
        cur.execute("SELECT count(*) AS total FROM solicitud_archivo")
        total = cur.fetchone()["total"]

    print(f"\nListo: {len(pares)} indexada(s), {total} en el índice.")
    print(f"El próximo folio será OT-{mayor + 1:04d}.\n")


if __name__ == "__main__":
    main()
