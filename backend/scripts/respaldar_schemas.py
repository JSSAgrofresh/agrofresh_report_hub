"""
Archiva en R2 los schemas de respaldo que deja Data Core y los borra de
Postgres.

Cada promoción renombra `lab` a `lab_backup_<fecha>` y nunca lo borra, así que
Postgres acumula copias completas de la base. Este script se lleva las más
viejas a R2 y libera el espacio, dejando siempre las últimas para poder
volver atrás rápido sin ir a buscarlas afuera.

El orden importa y es lo que hace seguro correr esto sin mirar: primero se
arma el archivo, se sube, y se verifica que quedó en R2 con el tamaño
correcto. Recién ahí se borra de Postgres. Si algo falla en el camino, el
schema se queda donde está y se reintenta al día siguiente.

`lab` (producción) y `lab_staging` (copia de trabajo en curso) nunca se tocan.

Cada schema se guarda como un ZIP con un CSV por tabla más un manifiesto
`_manifiesto.json` con las filas y columnas de cada una. No se usa pg_dump
para no depender de que el binario esté instalado y en el PATH del servidor.

Uso:
    cd backend
    python scripts/respaldar_schemas.py                 # solo mostrar qué haría
    python scripts/respaldar_schemas.py --aplicar       # archivar y borrar
    python scripts/respaldar_schemas.py --conservar 3 --aplicar

Para la tarea programada de Windows (una vez al día), el comando es el mismo
con --aplicar. Devuelve código 0 si todo salió bien y 1 si algo falló, para
que el Programador de tareas lo marque como error.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import r2  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

CARPETA_R2 = "respaldos_bd"

# Bitácora de corridas: cuántas van, cuándo fue la última y qué archivó. Sin
# esto, una tarea programada que corre de madrugada es una caja negra —no hay
# forma de saber si sigue funcionando o si dejó de correr hace semanas.
ARCHIVO_BITACORA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".respaldos_estado.json")

# Schemas que nunca se archivan: el de producción y el área de trabajo.
PROTEGIDOS = {"lab", "lab_staging"}


def _leer_bitacora() -> dict:
    try:
        with open(ARCHIVO_BITACORA, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"corridas": 0, "archivados_total": 0, "ultima": None, "ultimo_error": None}


def _guardar_bitacora(estado: dict) -> None:
    try:
        with open(ARCHIVO_BITACORA, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False, indent=2)
    except OSError:
        # No poder escribir la bitácora no es motivo para fallar el respaldo.
        pass


def _hace_cuanto(iso: str | None) -> str:
    if not iso:
        return "nunca"
    try:
        transcurrido = datetime.now(timezone.utc) - datetime.fromisoformat(iso)
    except ValueError:
        return iso
    segundos = int(transcurrido.total_seconds())
    if segundos < 60:
        return f"hace {segundos} s"
    if segundos < 3600:
        return f"hace {segundos // 60} min"
    if segundos < 86400:
        return f"hace {segundos // 3600} h"
    return f"hace {segundos // 86400} d"


def _tamano(n: float) -> str:
    for unidad in ("B", "KB", "MB", "GB"):
        if n < 1024 or unidad == "GB":
            return f"{n:.0f} {unidad}" if unidad == "B" else f"{n:.1f} {unidad}"
        n /= 1024
    return f"{n:.1f} GB"


def _schemas_respaldo(cur) -> list[dict]:
    cur.execute(
        """
        SELECT n.nspname AS schema,
               COALESCE(sum(pg_total_relation_size(c.oid)), 0) AS bytes
        FROM pg_namespace n
        LEFT JOIN pg_class c ON c.relnamespace = n.oid
        WHERE n.nspname LIKE 'lab\\_backup\\_%'
        GROUP BY 1 ORDER BY 1 DESC
        """
    )
    return [f for f in cur.fetchall() if f["schema"] not in PROTEGIDOS]


def _armar_zip(cur, schema: str) -> tuple[bytes, dict]:
    """Todas las tablas del schema como un ZIP de CSVs, más un manifiesto.

    El CSV se elige por ser legible sin herramientas y por comprimir bien;
    el manifiesto permite verificar de un vistazo que el archivo trae lo que
    debía traer, sin descomprimirlo entero.
    """
    cur.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = %s ORDER BY tablename",
        (schema,),
    )
    tablas = [f["tablename"] for f in cur.fetchall()]

    manifiesto = {
        "schema": schema,
        "archivado_en": datetime.now(timezone.utc).isoformat(),
        "tablas": {},
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for tabla in tablas:
            # El nombre viene de pg_tables, no de una entrada externa.
            cur.execute(f'SELECT * FROM "{schema}"."{tabla}"')
            columnas = [d[0] for d in cur.description]
            filas = cur.fetchall()
            salida = io.StringIO()
            escritor = csv.writer(salida, lineterminator="\n")
            escritor.writerow(columnas)
            for fila in filas:
                escritor.writerow(["" if fila[c] is None else str(fila[c]) for c in columnas])
            z.writestr(f"{tabla}.csv", salida.getvalue())
            manifiesto["tablas"][tabla] = {"filas": len(filas), "columnas": columnas}
        z.writestr("_manifiesto.json", json.dumps(manifiesto, ensure_ascii=False, indent=2))
    return buffer.getvalue(), manifiesto


def _ya_esta_en_r2(key: str, tamano: int) -> bool:
    """Un archivo del mismo tamaño ya subido: no hace falta rehacerlo."""
    try:
        existentes = r2.listar_keys(f"{CARPETA_R2}/")
    except Exception:
        return False
    if key not in existentes:
        return False
    datos = r2.descargar(key)
    return datos is not None and len(datos) == tamano


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--conservar", type=int, default=2, help="Respaldos recientes a dejar en Postgres (default 2).")
    p.add_argument("--aplicar", action="store_true", help="Archivar y borrar. Sin esto solo muestra.")
    args = p.parse_args()
    if args.conservar < 0:
        print("--conservar no puede ser negativo.", file=sys.stderr)
        return 1

    bitacora = _leer_bitacora()
    print(
        f"Corrida N.° {bitacora['corridas'] + 1} · última {_hace_cuanto(bitacora.get('ultima'))}"
        f" · {bitacora.get('archivados_total', 0)} respaldo(s) archivados hasta ahora"
    )
    if bitacora.get("ultimo_error"):
        print(f"  La corrida anterior terminó con error: {bitacora['ultimo_error']}")

    if args.aplicar and not r2.disponible():
        print("R2 no está configurado: sin destino donde archivar, no se borra nada.", file=sys.stderr)
        return 1

    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        respaldos = _schemas_respaldo(cur)
        if not respaldos:
            print("No hay schemas de respaldo. Nada que hacer.")
            return 0

        conservar = respaldos[: args.conservar]
        archivar = respaldos[args.conservar:]

        print(f"\n{len(respaldos)} respaldo(s) en Postgres, {_tamano(sum(r['bytes'] for r in respaldos))} en total.")
        if conservar:
            print(f"\nSe quedan en Postgres los {len(conservar)} más recientes:")
            for r_ in conservar:
                print(f"   {r_['schema']:<32}{_tamano(r_['bytes']):>10}")
        if not archivar:
            print("\nNinguno sobra para archivar.")
            return 0

        print(f"\n{'Se archivarían' if not args.aplicar else 'Se archivan'} {len(archivar)} en R2 ({CARPETA_R2}/):")
        for r_ in archivar:
            print(f"   {r_['schema']:<32}{_tamano(r_['bytes']):>10}")

        if not args.aplicar:
            print("\nVista previa. Agrega --aplicar para archivar y borrar.")
            return 0

        errores = 0
        for r_ in archivar:
            schema = r_["schema"]
            key = f"{CARPETA_R2}/{schema}.zip"
            try:
                print(f"\n{schema}")
                datos, manifiesto = _armar_zip(cur, schema)
                filas = sum(t["filas"] for t in manifiesto["tablas"].values())
                print(f"   empaquetado: {len(manifiesto['tablas'])} tabla(s), {filas:,} fila(s), {_tamano(len(datos))}".replace(",", "."))

                r2.subir(key, datos, "application/zip")
                # Se vuelve a leer desde R2: subir sin error no garantiza que
                # el archivo haya quedado completo, y de eso depende que sea
                # seguro borrar el schema.
                if not _ya_esta_en_r2(key, len(datos)):
                    raise RuntimeError("el archivo subido no se pudo verificar en R2")
                print(f"   subido y verificado: {key}")

                cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
                conn.commit()
                print(f"   borrado de Postgres, {_tamano(r_['bytes'])} liberados")
            except Exception as exc:
                conn.rollback()
                errores += 1
                print(f"   ERROR: {exc}. El schema queda intacto; se reintenta en la próxima corrida.", file=sys.stderr)

        archivados = len(archivar) - errores
        bitacora["corridas"] = bitacora.get("corridas", 0) + 1
        bitacora["archivados_total"] = bitacora.get("archivados_total", 0) + archivados
        bitacora["ultima"] = datetime.now(timezone.utc).isoformat()
        bitacora["ultimo_error"] = f"{errores} schema(s) no se pudieron archivar" if errores else None
        _guardar_bitacora(bitacora)

        if errores:
            print(f"\nTerminó con {errores} error(es).", file=sys.stderr)
            return 1
        print(f"\nListo: {len(archivar)} respaldo(s) archivados en R2 y borrados de Postgres.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
