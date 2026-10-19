"""
Crea las cuentas de tipo «comercial» a partir de las listas de distribución.

Cada correo que figura como Comercial en la lista de distribución de Línea de proceso (hoja de contactos de resultados
internos) es una cuenta, y sus plantas son las filas donde aparece. Cada cuenta nace con Report y Storage, solo lectura
y una contraseña temporal que su dueño cambia al entrar. El nombre se saca del correo (se corrige después en
Usuarios → Editar). Un correo que ya tiene cuenta se salta: nunca se pisa ni se duplica.

Como los demás scripts que escriben en la base, primero MIRA y solo aplica con --aplicar. Las contraseñas temporales se
muestran UNA vez, al aplicar: no se guardan en claro en ninguna parte.

Uso (ya dentro de backend, después de la migración 0063):
    .venv\\Scripts\\python.exe scripts\\crear_comerciales.py
    .venv\\Scripts\\python.exe scripts\\crear_comerciales.py --aplicar
    .venv\\Scripts\\python.exe scripts\\crear_comerciales.py --excluir jorge.sandoval@agrofresh.com --aplicar
    .venv\\Scripts\\python.exe scripts\\crear_comerciales.py --servicio todas     (también Actimist, Ecofog y RYD)
"""
from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from psycopg2.extras import Json  # noqa: E402

from app import config_store, seguridad  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.listas_distribucion import ARCHIVO_CONTACTOS, del_servicio, estado_desde_contactos  # noqa: E402

MODULOS = ["reports", "storage"]
REPORTES = ["laboratorio"]
SERVICIOS = {"linea": [""], "actimist": ["actimist"], "ecofog": ["ecofog"], "ryd": ["ryd"], "todas": ["", "actimist", "ecofog", "ryd"]}


def nombre_desde_correo(correo: str) -> str:
    """«carla.caceres@x» → «Carla Caceres»; «rtraverso@x» → «Rtraverso» (se corrige a mano después)."""
    local = correo.split("@")[0]
    return " ".join(p.capitalize() for p in re.split(r"[._\-\s]+", local) if p) or correo


def comerciales_en_listas(contactos: list[dict], servicios: list[str]) -> dict[str, list[dict]]:
    """correo (minúsculas) → plantas [{clienteNombre, plantaNombre}] donde figura como Comercial."""
    salida: dict[str, dict[tuple[str, str], dict]] = {}
    for servicio in servicios:
        for fila in estado_desde_contactos(del_servicio(contactos, servicio)).values():
            if not fila["sold_to"]:
                continue
            for correo in fila["comercial"]:
                clave = correo.strip().casefold()
                if not clave:
                    continue
                plantas = salida.setdefault(clave, {})
                plantas[(fila["sold_to"].casefold(), fila["ship_to"].casefold())] = {
                    "clienteNombre": fila["sold_to"], "plantaNombre": fila["ship_to"] or None,
                }
    return {
        correo: sorted(p.values(), key=lambda x: (x["clienteNombre"].casefold(), str(x["plantaNombre"] or "").casefold()))
        for correo, p in sorted(salida.items())
    }


def planificar(
    comerciales: dict[str, list[dict]], correos_existentes: set[str], excluir: set[str]
) -> tuple[list[tuple[str, str, list[dict]]], list[str]]:
    """((correo, nombre, plantas) a crear, correos que se saltan porque ya tienen cuenta o se excluyeron)."""
    existentes = {c.casefold() for c in correos_existentes}
    fuera = {c.strip().casefold() for c in excluir}
    crear: list[tuple[str, str, list[dict]]] = []
    saltados: list[str] = []
    for correo, plantas in comerciales.items():
        if correo in existentes or correo in fuera:
            saltados.append(correo)
        else:
            crear.append((correo, nombre_desde_correo(correo), plantas))
    return crear, saltados


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--servicio", choices=sorted(SERVICIOS), default="linea", help="Qué listas leer (por defecto, Línea de proceso).")
    p.add_argument("--excluir", default="", help="Correos que NO deben ser cuenta de comercial, separados por coma.")
    p.add_argument("--aplicar", action="store_true", help="Escribir en la base. Sin esto solo muestra lo que haría.")
    args = p.parse_args()

    comerciales = comerciales_en_listas(config_store.leer(ARCHIVO_CONTACTOS, []), SERVICIOS[args.servicio])
    if not comerciales:
        raise SystemExit("En esas listas de distribución no figura ningún correo como Comercial.")

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT email FROM usuario")
        crear, saltados = planificar(
            comerciales, {f["email"] for f in cur.fetchall()}, {c for c in args.excluir.split(",") if c.strip()}
        )

        print(f"\nCorreos con rol Comercial en las listas: {len(comerciales)}. Se crearían {len(crear)} cuentas (Report y Storage, solo lectura):\n")
        for correo, nombre, plantas in crear:
            print(f"  {nombre:<22} {correo:<36} {len(plantas)} {'planta' if len(plantas) == 1 else 'plantas'}")
            for pl in plantas[:3]:
                print(f"      · {pl['clienteNombre']} / {pl['plantaNombre'] or '(todo el Sold To)'}")
            if len(plantas) > 3:
                print(f"      · … y {len(plantas) - 3} más")
        if saltados:
            print(f"\nSe saltan {len(saltados)} (ya tienen cuenta o los excluiste): " + ", ".join(saltados))
        if not args.aplicar:
            print("\nNo se escribió nada. Revisa la lista (si alguien no es comercial, usa --excluir correo) y para crearlas agrega --aplicar")
            return
        if not crear:
            print("\nNo hay nada que crear.")
            return

        creadas = []
        for correo, nombre, plantas in crear:
            temporal = seguridad.password_temporal()
            cur.execute(
                """
                INSERT INTO usuario
                    (email, nombre, tipo_acceso, area, modulos, reportes, plantas_asignadas, password_hash, debe_cambiar)
                VALUES (%s, %s, 'comercial', NULL, %s, %s, %s, %s, TRUE)
                """,
                (correo, nombre, MODULOS, REPORTES, Json(plantas), seguridad.hashear_password(temporal)),
            )
            creadas.append((nombre, correo, temporal))

    print("\nCreadas. Anota las contraseñas ahora: no se vuelven a mostrar (si se pierde una, se reinicia desde Usuarios).\n")
    for nombre, correo, temporal in creadas:
        print(f"  {nombre:<22} {correo:<36} {temporal}")
    print("\nSiguiente paso: Administración → Usuarios → Editar en cada una, para corregirle el nombre y revisar sus plantas.")


if __name__ == "__main__":
    main()
