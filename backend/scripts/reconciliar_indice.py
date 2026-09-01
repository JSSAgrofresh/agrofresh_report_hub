"""
Saca del índice las solicitudes cuyo archivo ya no está en R2.

Desde que existe el índice, el listado del laboratorio ya no lee R2: lee la
tabla `solicitud_archivo`. Eso es lo que lo hizo rápido, pero tiene una
consecuencia — borrar el archivo directamente desde la consola de Cloudflare
no lo saca del listado, porque el índice ni se entera. La solicitud queda de
fantasma: aparece en la tabla, y al pedir su ficha o su PDF da 404.

Borrar desde la app (Solicitudes → eliminar) sí limpia las dos cosas. Este
script es para reparar lo que se borró por fuera.

No toca R2: solo borra filas del índice cuyo archivo ya no existe allá.

Uso:
    cd backend
    python scripts/reconciliar_indice.py            # solo mirar
    python scripts/reconciliar_indice.py --aplicar  # borrar las fantasma
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import indice_solicitudes, r2  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.toma_muestras import _CARPETA_CONFIG  # noqa: E402


def _archivos_en_r2() -> set[str]:
    """Los nombres de archivo que de verdad están en R2.

    Se compara por el último segmento de la clave -el folio- y no por la
    clave entera, porque conviven dos layouts: el viejo plano y el nuevo por
    cliente. Es el mismo criterio que usa la app para bajar una solicitud.
    """
    return {
        key.split("/")[-1]
        for key in r2.listar_keys("solicitudes/")
        if _CARPETA_CONFIG not in key.split("/") and not key.endswith("/")
    }


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--aplicar", action="store_true", help="Borrar de verdad. Sin esto solo muestra.")
    args = p.parse_args()

    if not r2.disponible():
        print("\nR2 no está configurado en este servidor: no hay con qué comparar.\n")
        return

    print("\nLeyendo qué hay en R2…")
    en_r2 = _archivos_en_r2()
    indexadas = indice_solicitudes.listar()

    fantasma = [(nombre, datos) for nombre, datos in indexadas if nombre not in en_r2]

    print(f"\n   {len(en_r2):>6}  archivo(s) en R2")
    print(f"   {len(indexadas):>6}  fila(s) en el índice")
    print(f"   {len(fantasma):>6}  sin archivo — aparecen en el listado pero ya no existen\n")

    if not fantasma:
        print("El índice está al día. No hay nada que reparar.\n")
        return

    for nombre, datos in fantasma:
        numero = datos.get("numero_solicitud") or os.path.splitext(nombre)[0]
        cliente = datos.get("sold_to") or "—"
        muestra = datos.get("codigo_muestra")
        cruce = f"  cruzada con {muestra}" if muestra else ""
        print(f"   {numero:<12} {cliente[:34]:<34}{cruce}")

    # Un cruce se hizo con la muestra física en la mano. Que una solicitud
    # cruzada esté por borrarse casi siempre significa que se borró el
    # archivo equivocado, así que se avisa fuerte antes de perderlo.
    cruzadas = [n for n, d in fantasma if d.get("codigo_muestra")]
    if cruzadas:
        print(
            f"\n   ¡OJO! {len(cruzadas)} de estas ya tenía muestra cruzada. Borrarlas del"
            "\n   índice pierde ese cruce, y el número de muestra queda libre de nuevo."
        )

    if not args.aplicar:
        print("\nEsto fue solo una vista previa. Agrega --aplicar para sacarlas del índice.\n")
        return

    with conexion() as conn, cursor_dict(conn) as cur:
        for nombre, _datos in fantasma:
            indice_solicitudes.olvidar(cur, nombre)
        cur.execute("SELECT count(*) AS total FROM solicitud_archivo")
        total = cur.fetchone()["total"]

    print(f"\nListo: {len(fantasma)} sacada(s) del índice, {total} quedan.\n")


if __name__ == "__main__":
    main()
