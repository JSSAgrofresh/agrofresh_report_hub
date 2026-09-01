"""
Dice en qué estado está el catálogo de analitos y qué le falta.

El catálogo (tabla `analito`) es lo que le da a cada ingrediente activo su
nombre, su unidad y sus LÍMITES RESIDUALES. Sin él, Report igual dibuja los
puntos -los saca de `analito_raw`, el código crudo que venía en el archivo-
pero no tiene contra qué compararlos: no hay línea de límite y el porcentaje
de cumplimiento queda en "—".

La carga NUNCA crea analitos: solo los busca. Si un código no está, guarda el
texto en `analito_raw` y sigue. Así que el catálogo se llena a mano, desde
Report → Gestionar analitos → + Nuevo analito.

Esto no modifica nada. Solo mira y reporta.

Uso:
    cd backend
    python scripts/revisar_catalogo_analitos.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402


def main() -> None:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT count(*) AS n FROM analito")
        en_catalogo = cur.fetchone()["n"]

        cur.execute("SELECT count(*) AS n FROM analito WHERE limite_max IS NOT NULL")
        con_limite = cur.fetchone()["n"]

        cur.execute(
            "SELECT count(*) FILTER (WHERE analito_id IS NOT NULL) AS enlazados,"
            "       count(*) FILTER (WHERE analito_id IS NULL)     AS sueltos"
            "  FROM resultado"
        )
        resultados = cur.fetchone()

        # Los códigos que aparecen en los datos pero no están en el catálogo:
        # esta es la lista de lo que hay que crear.
        cur.execute(
            """
            SELECT r.analito_raw AS codigo, count(*) AS veces
              FROM resultado r
             WHERE r.analito_id IS NULL AND r.analito_raw IS NOT NULL
             GROUP BY r.analito_raw
             ORDER BY count(*) DESC
            """
        )
        faltantes = cur.fetchall()

    print(f"\n   {en_catalogo:>6}  analito(s) en el catálogo")
    print(f"   {con_limite:>6}  de ellos con límite residual configurado")
    print(f"   {resultados['enlazados']:>6}  resultado(s) enlazados a un analito del catálogo")
    print(f"   {resultados['sueltos']:>6}  resultado(s) sin enlazar (quedaron en analito_raw)\n")

    if en_catalogo == 0:
        print("   El catálogo está VACÍO. Report dibuja los puntos igual, pero sin")
        print("   límites contra qué compararlos: por eso Cumplimiento sale en «—».\n")

    if not faltantes:
        print("   No hay códigos sueltos en los datos.\n")
        return

    print("   Códigos que aparecen en los datos y NO están en el catálogo.")
    print("   Estos son los que hay que crear en Report → Gestionar analitos:\n")
    for fila in faltantes:
        print(f"      {fila['codigo']:<14} {fila['veces']:>6} resultado(s)")
    print(
        f"\n   Al crearlos, los {resultados['sueltos']} resultado(s) sueltos NO se enlazan solos:"
        "\n   hay que volver a cargar esos archivos en Ingest para que queden unidos.\n"
    )


if __name__ == "__main__":
    main()
