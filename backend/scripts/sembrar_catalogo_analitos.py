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

# Enlazar una fila suelta es siempre el mismo UPDATE, cambia la tabla.
#
# Se compara sin distinguir mayúsculas: la base guarda el laboratorio como
# "Agrofresh" y la configuración de la app dice "AGROFRESH". Son el mismo
# laboratorio escrito por dos subsistemas distintos, y compararlos exacto
# dejaba 9069 filas sin enlazar por una diferencia de tipeo.
#
# `DISTINCT ON (t.id)` deja una sola candidata por fila: si el catálogo
# tuviera dos analitos que solo difieren en mayúsculas, sin esto el UPDATE
# elegiría uno al azar. Y `row_number` deja una sola fila por (solicitud,
# analito): la tabla tiene una restricción única en ese par, y dos resultados
# del mismo analito en una solicitud harían fallar el UPDATE entero.
_SQL_ENLAZAR = """
    WITH pares AS (
        SELECT DISTINCT ON (t.id)
               t.id, t.solicitud_id, a.id AS analito_id
          FROM {tabla} t
          JOIN solicitud s ON s.id = t.solicitud_id
          JOIN analito   a ON upper(trim(a.codigo)) = upper(trim(t.analito_raw))
                          AND upper(trim(a.laboratorio)) = upper(trim(s.laboratorio))
         WHERE t.analito_id IS NULL
           AND t.analito_raw IS NOT NULL
         ORDER BY t.id, a.id
    ),
    candidatas AS (
        SELECT p.id,
               p.analito_id,
               row_number() OVER (PARTITION BY p.solicitud_id, p.analito_id ORDER BY p.id) AS n
          FROM pares p
         WHERE NOT EXISTS (
                 SELECT 1 FROM {tabla} otra
                  WHERE otra.solicitud_id = p.solicitud_id
                    AND otra.analito_id = p.analito_id
               )
    )
    UPDATE {tabla} t
       SET analito_id = c.analito_id, analito_raw = NULL
      FROM candidatas c
     WHERE t.id = c.id AND c.n = 1
"""

# El laboratorio sale tal como lo escribe la base -no normalizado-, porque el
# analito se crea con esa misma escritura y así el listado de Report lo
# muestra igual que el resto del sistema.
_SQL_SUELTOS = """
    SELECT t.analito_raw AS codigo, s.laboratorio, count(*) AS veces
      FROM {tabla} t
      JOIN solicitud s ON s.id = t.solicitud_id
     WHERE t.analito_id IS NULL AND t.analito_raw IS NOT NULL
     GROUP BY t.analito_raw, s.laboratorio
"""

TABLAS = ("resultado", "producto_aplicado")


def _clave(codigo: str, laboratorio: str) -> tuple[str, str]:
    """Cómo se comparan dos analitos.

    Sin distinguir mayúsculas ni espacios: la base guarda "Agrofresh" y la
    configuración dice "AGROFRESH". Es el mismo laboratorio escrito por dos
    subsistemas distintos, no dos laboratorios.
    """
    return codigo.strip().upper(), laboratorio.strip().upper()


def _catalogo_de_la_app() -> dict[tuple[str, str], dict]:
    """Los analitos tal como los conoce el resto del sistema.

    Es la misma lista que arma el formulario de solicitudes. Si alguien la
    editó desde Laboratorios, esta lee la versión editada.
    """
    configurados = config_store.leer("analitos.json", toma_muestras.ANALITOS_DEFECTO)
    return {
        _clave(a["codigo"], a["laboratorio"]): a
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
        ya_estan = {
            _clave(f["codigo"] or "", f["laboratorio"] or "") for f in cur.fetchall()
        }

        # Se agrupa por la clave normalizada, pero se recuerda cómo lo escribe
        # la base: el analito se crea con ESA escritura, así el listado de
        # Report lo muestra igual que el resto del sistema.
        sueltos: dict[tuple[str, str], int] = {}
        escritura: dict[tuple[str, str], tuple[str, str]] = {}
        for tabla in TABLAS:
            cur.execute(_SQL_SUELTOS.format(tabla=tabla))
            for fila in cur.fetchall():
                clave = _clave(fila["codigo"], fila["laboratorio"] or "")
                sueltos[clave] = sueltos.get(clave, 0) + fila["veces"]
                escritura.setdefault(clave, (fila["codigo"], fila["laboratorio"]))

    if not sueltos:
        print("\nNo hay códigos sueltos: todo lo cargado ya está enlazado al catálogo.\n")
        return

    por_crear = {c: n for c, n in sueltos.items() if c not in ya_estan and c in catalogo_app}
    sin_nombre = {c: n for c, n in sueltos.items() if c not in ya_estan and c not in catalogo_app}
    ya_creados = {c: n for c, n in sueltos.items() if c in ya_estan}

    if por_crear:
        print(f"\nSe van a CREAR {len(por_crear)} analito(s), con el nombre y la unidad")
        print("que ya usa el formulario de solicitudes:\n")
        for clave, veces in sorted(por_crear.items(), key=lambda kv: -kv[1]):
            cfg = catalogo_app[clave]
            codigo, lab = escritura[clave]
            print(f"   {codigo:<10} {cfg['nombre']:<20} {cfg.get('unidad') or '—':<12} {lab:<12} {veces:>6} fila(s)")

    if ya_creados:
        print(f"\nYa están en el catálogo, solo hay que enlazar sus {sum(ya_creados.values())} fila(s):\n")
        for clave, veces in sorted(ya_creados.items(), key=lambda kv: -kv[1]):
            codigo, lab = escritura[clave]
            print(f"   {codigo:<10} {lab:<12} {veces:>6} fila(s)")

    if sin_nombre:
        print(f"\n   NO se pueden crear solos: {len(sin_nombre)} código(s) que no están en la")
        print("   configuración de la app, así que no sé su nombre ni su unidad.")
        print("   Créalos a mano en Report → Gestionar analitos y vuelve a correr esto:\n")
        for clave, veces in sorted(sin_nombre.items(), key=lambda kv: -kv[1]):
            codigo, lab = escritura[clave]
            print(f"   {codigo:<10} {lab:<12} {veces:>6} fila(s)")

    print("\n   Los límites residuales quedan VACÍOS: son una decisión del")
    print("   laboratorio y se cargan en Report → Gestionar analitos.\n")

    if not args.aplicar:
        print("Esto fue solo una vista previa. Agrega --aplicar para crearlos y enlazar.\n")
        return

    with conexion() as conn, cursor_dict(conn) as cur:
        for clave in por_crear:
            cfg = catalogo_app[clave]
            codigo, lab = escritura[clave]
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
