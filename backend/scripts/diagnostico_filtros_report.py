"""
Diagnóstico: por qué los filtros Cliente (Sold To) y Sucursal (Ship To) de
Report aparecen vacíos aunque haya solicitudes cargadas.

Report arma esas dos listas con los valores que de verdad vienen en los datos,
no con el catálogo de Listados. El valor que usa es el mismo de la consulta
`/reportes/datos`:

    cliente = COALESCE(cliente.nombre, solicitud.sold_to_raw)
    planta  = COALESCE(planta.nombre,  solicitud.ship_to_raw)

Así que el desplegable solo puede quedar vacío si ambos lados son nulos: la
solicitud no quedó enlazada a una planta y además no conserva el texto crudo
del Excel. Este script dice cuál de los dos falta y en cuántas filas.

Solo lee: no modifica nada.

Uso:
    cd backend && python scripts/diagnostico_filtros_report.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402


def _fmt(n: int, total: int) -> str:
    pct = (n / total * 100) if total else 0
    return f"{n:>7,}  ({pct:5.1f}%)".replace(",", ".")


def main() -> None:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT count(*) AS n FROM solicitud WHERE vigente")
        total = cur.fetchone()["n"]
        print(f"\nSolicitudes vigentes: {total:,}".replace(",", "."))
        if total == 0:
            print("\nNo hay solicitudes cargadas: por eso no hay nada que filtrar.")
            return

        print("\n── Catálogo ────────────────────────────────────────────")
        for tabla in ("cliente", "planta"):
            cur.execute(f"SELECT count(*) AS n FROM {tabla}")
            print(f"  Filas en `{tabla}`: {cur.fetchone()['n']:,}".replace(",", "."))

        print("\n── Cliente (Sold To) ───────────────────────────────────")
        cur.execute(
            """
            SELECT
              count(*) FILTER (WHERE c.nombre IS NOT NULL)                AS por_catalogo,
              count(*) FILTER (WHERE c.nombre IS NULL
                               AND nullif(btrim(s.sold_to_raw), '') IS NOT NULL) AS por_texto_crudo,
              count(*) FILTER (WHERE c.nombre IS NULL
                               AND nullif(btrim(s.sold_to_raw), '') IS NULL)     AS sin_dato,
              count(*) FILTER (WHERE s.planta_id IS NULL)                 AS sin_planta_id
            FROM solicitud s
            LEFT JOIN planta p ON p.id = s.planta_id
            LEFT JOIN cliente c ON c.id = p.cliente_id
            WHERE s.vigente
            """
        )
        f = cur.fetchone()
        print(f"  Resuelto con el catálogo .... {_fmt(f['por_catalogo'], total)}")
        print(f"  Solo texto crudo del Excel .. {_fmt(f['por_texto_crudo'], total)}")
        print(f"  SIN NINGÚN DATO ............. {_fmt(f['sin_dato'], total)}   <-- invisible en el filtro")
        print(f"  (sin planta_id enlazado) .... {_fmt(f['sin_planta_id'], total)}")

        print("\n── Sucursal (Ship To) ──────────────────────────────────")
        cur.execute(
            """
            SELECT
              count(*) FILTER (WHERE p.nombre IS NOT NULL)                AS por_catalogo,
              count(*) FILTER (WHERE p.nombre IS NULL
                               AND nullif(btrim(s.ship_to_raw), '') IS NOT NULL) AS por_texto_crudo,
              count(*) FILTER (WHERE p.nombre IS NULL
                               AND nullif(btrim(s.ship_to_raw), '') IS NULL)     AS sin_dato
            FROM solicitud s
            LEFT JOIN planta p ON p.id = s.planta_id
            WHERE s.vigente
            """
        )
        f = cur.fetchone()
        print(f"  Resuelto con el catálogo .... {_fmt(f['por_catalogo'], total)}")
        print(f"  Solo texto crudo del Excel .. {_fmt(f['por_texto_crudo'], total)}")
        print(f"  SIN NINGÚN DATO ............. {_fmt(f['sin_dato'], total)}   <-- invisible en el filtro")

        print("\n── Lo que vería el filtro hoy ──────────────────────────")
        for etiqueta, expr in (
            ("Cliente", "COALESCE(c.nombre, s.sold_to_raw)"),
            ("Sucursal", "COALESCE(p.nombre, s.ship_to_raw)"),
        ):
            cur.execute(
                f"""
                SELECT {expr} AS valor, count(*) AS n
                FROM solicitud s
                LEFT JOIN planta p ON p.id = s.planta_id
                LEFT JOIN cliente c ON c.id = p.cliente_id
                WHERE s.vigente AND nullif(btrim({expr}), '') IS NOT NULL
                GROUP BY 1 ORDER BY 2 DESC LIMIT 8
                """
            )
            filas = cur.fetchall()
            print(f"\n  {etiqueta}: {len(filas)} valor(es) en el top 8")
            for fila in filas:
                print(f"    {fila['n']:>6,}".replace(",", ".") + f"  {fila['valor']}")
            if not filas:
                print("    (ninguno — el desplegable sale vacío)")

        # Qué pipeline creó estas filas. `emitir_cromatografia` es la subida de
        # resultados del GC; cualquier otro valor viene del ingest de Excel.
        print("\n── Origen de las solicitudes ───────────────────────────")
        cur.execute(
            """
            SELECT COALESCE(origen, '(sin origen)') AS origen, count(*) AS n
            FROM solicitud WHERE vigente GROUP BY 1 ORDER BY 2 DESC LIMIT 10
            """
        )
        for fila in cur.fetchall():
            print(f"    {fila['n']:>7,}".replace(",", ".") + f"  {fila['origen']}")

        # Si el archivo se leyó bien y solo falló el encabezado de Sold To, las
        # demás columnas del mismo Excel sí deberían tener datos. Si están todas
        # vacías, lo que falló es el mapeo completo, no una columna suelta.
        print("\n── Otras columnas del mismo Excel ──────────────────────")
        for col in ("especie", "variedad", "lote", "tipo_servicio", "laboratorio"):
            cur.execute(
                f"SELECT count(*) AS n FROM solicitud "
                f"WHERE vigente AND nullif(btrim({col}::text), '') IS NOT NULL"
            )
            con_dato = cur.fetchone()["n"]
            marca = "" if con_dato else "   <-- tambien vacia"
            print(f"  {col:<16} con dato: {_fmt(con_dato, total)}{marca}")

        print("\n── Muestra de 5 solicitudes ────────────────────────────")
        cur.execute(
            """
            SELECT s.nro_solicitud, s.sold_to_raw, s.ship_to_raw, s.planta_id
            FROM solicitud s WHERE s.vigente ORDER BY s.id DESC LIMIT 5
            """
        )
        for fila in cur.fetchall():
            print(
                f"    {fila['nro_solicitud']:<14} "
                f"sold_to_raw={fila['sold_to_raw']!r:<28} "
                f"ship_to_raw={fila['ship_to_raw']!r:<24} "
                f"planta_id={fila['planta_id']}"
            )
        print()


if __name__ == "__main__":
    main()
