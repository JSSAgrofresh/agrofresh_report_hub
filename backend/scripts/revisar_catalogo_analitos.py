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

        # Se separan dos cosas que se ven iguales pero no lo son: un código
        # que el catálogo no tiene, y uno que sí tiene pero cuya fila quedó
        # suelta igual (dos resultados del mismo analito en una solicitud: la
        # tabla solo admite uno, así que el segundo se queda sin enlazar).
        cur.execute(
            """
            SELECT r.analito_raw AS codigo,
                   s.laboratorio,
                   count(*) AS veces,
                   EXISTS (
                     SELECT 1 FROM analito a
                      WHERE a.codigo = r.analito_raw AND a.laboratorio = s.laboratorio
                   ) AS en_catalogo
              FROM resultado r
              JOIN solicitud s ON s.id = r.solicitud_id
             WHERE r.analito_id IS NULL AND r.analito_raw IS NOT NULL
             GROUP BY r.analito_raw, s.laboratorio
             ORDER BY count(*) DESC
            """
        )
        sueltos = cur.fetchall()

    faltantes = [f for f in sueltos if not f["en_catalogo"]]
    duplicados = [f for f in sueltos if f["en_catalogo"]]

    print(f"\n   {en_catalogo:>6}  analito(s) en el catálogo")
    print(f"   {con_limite:>6}  de ellos con límite residual configurado")
    print(f"   {resultados['enlazados']:>6}  resultado(s) enlazados a un analito del catálogo")
    print(f"   {resultados['sueltos']:>6}  resultado(s) sin enlazar (quedaron en analito_raw)\n")

    if en_catalogo == 0:
        print("   El catálogo está VACÍO. Report dibuja los puntos igual, pero sin")
        print("   límites contra qué compararlos: por eso Cumplimiento sale en «—».\n")

    if not sueltos:
        print("   No hay códigos sueltos en los datos.\n")
        return

    if faltantes:
        print("   Códigos que aparecen en los datos y NO están en el catálogo:\n")
        for fila in faltantes:
            print(f"      {fila['codigo']:<14} {fila['laboratorio']:<12} {fila['veces']:>6} resultado(s)")
        print(
            "\n   Para crearlos y enlazar sus datos de una vez:"
            "\n      python scripts/sembrar_catalogo_analitos.py\n"
        )

    if duplicados:
        total = sum(f["veces"] for f in duplicados)
        print(f"   Otros {total} resultado(s) tienen su analito en el catálogo pero quedaron")
        print("   sueltos igual: son un segundo resultado del mismo analito en la misma")
        print("   solicitud, y la tabla solo admite uno. Hay que revisarlos a mano.\n")
        for fila in duplicados:
            print(f"      {fila['codigo']:<14} {fila['laboratorio']:<12} {fila['veces']:>6} resultado(s)")
        print()


if __name__ == "__main__":
    main()
