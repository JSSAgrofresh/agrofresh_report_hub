"""
Crea los analitos que faltan en el catálogo y enlaza los datos ya cargados.

Dos problemas de una vez:

1. El catálogo (tabla `analito`) está vacío o incompleto. Los nombres y
   unidades salen de la MISMA configuración que usa el formulario de
   solicitudes (`analitos.json`, con ANALITOS_DEFECTO de respaldo), así que
   no se inventa nada: si ahí dice "Pirimetanil", acá dice "Pirimetanil".

2. Los resultados ya cargados quedaron con el código suelto en `analito_raw`
   porque al cargarlos el catálogo no los tenía. Enlazarlos es un UPDATE —
   no hace falta volver a subir los archivos a Ingest.

LO QUE ESTO NO HACE: poner límites residuales. Un límite es una decisión
regulatoria (varía por especie y por mercado de destino) y nadie más que el
laboratorio la puede tomar. Los analitos quedan creados y activos, con los
límites vacíos, para llenarlos en Report → Gestionar analitos.

Es idempotente: volver a correrlo no duplica ni pisa nada.

Uso:
    cd backend
    python scripts/sembrar_catalogo_analitos.py            # solo mirar
    python scripts/sembrar_catalogo_analitos.py --aplicar  # crear y enlazar
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config_store, toma_muestras  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

# Enlazar una fila suelta es siempre el mismo UPDATE, cambia la tabla. Se
# actualiza como máximo una fila por (solicitud, analito): la tabla tiene una
# restricción única en ese par, y dos filas sueltas con el mismo código en la
# misma solicitud harían fallar el UPDATE entero.
_SQL_ENLAZAR = """
    WITH candidatas AS (
        SELECT t.id,
               a.id AS analito_id,
               row_number() OVER (PARTITION BY t.solicitud_id, a.id ORDER BY t.id) AS n
          FROM {tabla} t
          JOIN solicitud s ON s.id = t.solicitud_id
          JOIN analito   a ON a.codigo = t.analito_raw AND a.laboratorio = s.laboratorio
         WHERE t.analito_id IS NULL
           AND t.analito_raw IS NOT NULL
           AND NOT EXISTS (
                 SELECT 1 FROM {tabla} otra
                  WHERE otra.solicitud_id = t.solicitud_id
                    AND otra.analito_id = a.id
               )
    )
    UPDATE {tabla} t
       SET analito_id = c.analito_id, analito_raw = NULL
      FROM candidatas c
     WHERE t.id = c.id AND c.n = 1
"""

_SQL_SUELTOS = """
    SELECT t.analito_raw AS codigo, s.laboratorio, count(*) AS veces
      FROM {tabla} t
      JOIN solicitud s ON s.id = t.solicitud_id
     WHERE t.analito_id IS NULL AND t.analito_raw IS NOT NULL
     GROUP BY t.analito_raw, s.laboratorio
"""

TABLAS = ("resultado", "producto_aplicado")


def _catalogo_de_la_app() -> dict[tuple[str, str], dict]:
    """Los analitos tal como los conoce el resto del sistema, por (código, lab).

    Es la misma lista que arma el formulario de solicitudes. Si alguien la
    editó desde Laboratorios, esta lee la versión editada.
    """
    configurados = config_store.leer("analitos.json", toma_muestras.ANALITOS_DEFECTO)
    return {
        (a["codigo"], a["laboratorio"]): a
        for a in configurados
        if a.get("codigo") and a.get("laboratorio")
    }


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--aplicar", action="store_true", help="Escribir de verdad. Sin esto solo muestra.")
    args = p.parse_args()

    catalogo_app = _catalogo_de_la_app()

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT codigo, laboratorio FROM analito")
        ya_estan = {(f["codigo"], f["laboratorio"]) for f in cur.fetchall()}

        sueltos: dict[tuple[str, str], int] = {}
        for tabla in TABLAS:
            cur.execute(_SQL_SUELTOS.format(tabla=tabla))
            for fila in cur.fetchall():
                clave = (fila["codigo"], fila["laboratorio"])
                sueltos[clave] = sueltos.get(clave, 0) + fila["veces"]

    if not sueltos:
        print("\nNo hay códigos sueltos: todo lo cargado ya está enlazado al catálogo.\n")
        return

    por_crear = {c: n for c, n in sueltos.items() if c not in ya_estan and c in catalogo_app}
    sin_nombre = {c: n for c, n in sueltos.items() if c not in ya_estan and c not in catalogo_app}
    ya_creados = {c: n for c, n in sueltos.items() if c in ya_estan}

    if por_crear:
        print(f"\nSe van a CREAR {len(por_crear)} analito(s), con el nombre y la unidad")
        print("que ya usa el formulario de solicitudes:\n")
        for (codigo, lab), veces in sorted(por_crear.items(), key=lambda kv: -kv[1]):
            cfg = catalogo_app[(codigo, lab)]
            print(f"   {codigo:<10} {cfg['nombre']:<20} {cfg.get('unidad') or '—':<12} {lab:<12} {veces:>6} fila(s)")

    if ya_creados:
        print(f"\nYa están en el catálogo, solo hay que enlazar sus {sum(ya_creados.values())} fila(s):\n")
        for (codigo, lab), veces in sorted(ya_creados.items(), key=lambda kv: -kv[1]):
            print(f"   {codigo:<10} {lab:<12} {veces:>6} fila(s)")

    if sin_nombre:
        print(f"\n   NO se pueden crear solos: {len(sin_nombre)} código(s) que no están en la")
        print("   configuración de la app, así que no sé su nombre ni su unidad.")
        print("   Créalos a mano en Report → Gestionar analitos y vuelve a correr esto:\n")
        for (codigo, lab), veces in sorted(sin_nombre.items(), key=lambda kv: -kv[1]):
            print(f"   {codigo:<10} {lab:<12} {veces:>6} fila(s)")

    print("\n   Los límites residuales quedan VACÍOS: son una decisión del")
    print("   laboratorio y se cargan en Report → Gestionar analitos.\n")

    if not args.aplicar:
        print("Esto fue solo una vista previa. Agrega --aplicar para crearlos y enlazar.\n")
        return

    with conexion() as conn, cursor_dict(conn) as cur:
        for (codigo, lab) in por_crear:
            cfg = catalogo_app[(codigo, lab)]
            cur.execute(
                """
                INSERT INTO analito (codigo, nombre, laboratorio, unidad, activo)
                VALUES (%s, %s, %s, %s, true)
                ON CONFLICT (codigo, laboratorio) DO NOTHING
                """,
                (codigo, cfg["nombre"], lab, cfg.get("unidad")),
            )

        enlazadas = {}
        for tabla in TABLAS:
            cur.execute(_SQL_ENLAZAR.format(tabla=tabla))
            enlazadas[tabla] = cur.rowcount

        cur.execute("SELECT count(*) AS n FROM analito")
        total = cur.fetchone()["n"]

    print(f"Listo: {len(por_crear)} analito(s) creado(s), {total} en el catálogo.")
    for tabla, cuantas in enlazadas.items():
        print(f"   {cuantas:>6} fila(s) enlazadas en {tabla}")
    if sin_nombre:
        pendientes = sum(sin_nombre.values())
        print(f"   {pendientes:>6} fila(s) siguen sueltas: les falta su analito en el catálogo")
    print()


if __name__ == "__main__":
    main()
