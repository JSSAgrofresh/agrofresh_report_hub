"""
Crea las cuentas de cliente de la bienvenida a clientes, desde las listas de distribución de «Resultado a clientes».

Cada correo de cliente (los de AgroFresh no) es UNA cuenta, con sus accesos (Sold To, planta y especie) como lista en
`usuario.plantas_asignadas`. Una fila de la lista sin especie ve todas las especies de esa planta. La cuenta nace con
Report y Storage y una contraseña temporal que su dueño cambia al entrar. Un correo que ya tiene cuenta se salta: nunca se
pisa ni se duplica. Los textos que no son un correo (dos pegados, sin @…) se listan y no crean cuenta.

Como los demás scripts que escriben en la base, primero MIRA y solo aplica con --aplicar. Al aplicar entrega un Excel
con el correo, la clave temporal y el tipo de cada cuenta (en `logs/`, NO se sube al repositorio: es sensible, bórralo al
terminar). Las claves solo existen ahí.

Uso (ya dentro de backend, después de subir la lista corregida en Administración General → Listas de distribución):
    .venv\\Scripts\\python.exe scripts\\crear_clientes.py
    .venv\\Scripts\\python.exe scripts\\crear_clientes.py --aplicar
    .venv\\Scripts\\python.exe scripts\\crear_clientes.py --solo a@x.cl,b@y.cl --aplicar     (un piloto de pocas cuentas)
    .venv\\Scripts\\python.exe scripts\\crear_clientes.py --sin-storage --aplicar
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from psycopg2.extras import Json  # noqa: E402

from app import config_store, seguridad  # noqa: E402
from app.accesos_clientes import accesos_por_correo, tipo_de_cuenta  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.listas_distribucion import ARCHIVO_CONTACTOS  # noqa: E402
from app.usuarios import UsuarioIn, _validar  # noqa: E402

SERVICIOS = {"linea": [""], "actimist": ["actimist"], "ecofog": ["ecofog"], "ryd": ["ryd"], "todas": ["", "actimist", "ecofog", "ryd"]}
NOMBRE_TIPO = {1: "Una planta y una especie", 2: "Una planta y varias especies", 3: "Varias plantas"}


def nombre_desde_correo(correo: str) -> str:
    import re

    local = correo.split("@")[0]
    return " ".join(p.capitalize() for p in re.split(r"[._\-\s]+", local) if p) or correo


def planificar(
    accesos: dict[str, list[dict]], existentes: set[str], solo: set[str], con_storage: bool
) -> tuple[list[UsuarioIn], list[str]]:
    """(cuentas a crear ya validadas como lo hace Usuarios, correos que se saltan por tener cuenta o no estar en --solo)."""
    existentes = {c.casefold() for c in existentes}
    solo = {c.strip().casefold() for c in solo if c.strip()}
    crear: list[UsuarioIn] = []
    saltados: list[str] = []
    for correo, lista in accesos.items():
        if correo in existentes or (solo and correo not in solo):
            saltados.append(correo)
            continue
        cuenta = UsuarioIn(
            email=correo, nombre=nombre_desde_correo(correo), tipoAcceso="cliente",
            modulos=["reports", "storage"] if con_storage else ["reports"], reportes=["laboratorio"],
            plantasAsignadas=lista,
        )
        _validar(cuenta)  # las mismas reglas de la pantalla de Usuarios
        crear.append(cuenta)
    return crear, saltados


def escribir_excel(ruta: str, filas: list[dict]) -> None:
    import openpyxl
    from openpyxl.styles import Font

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Cuentas"
    ws.append(["Correo", "Clave temporal", "Tipo", "Plantas", "Accesos"])
    for f in filas:
        ws.append([f["correo"], f["clave"], f["tipo"], f["plantas"], f["accesos"]])
    for c in ws[1]:
        c.font = Font(bold=True)
    for col, ancho in zip("ABCDE", (40, 18, 30, 9, 9)):
        ws.column_dimensions[col].width = ancho
    wb.save(ruta)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--servicio", choices=sorted(SERVICIOS), default="linea", help="Qué listas leer (por defecto, Línea de proceso).")
    p.add_argument("--solo", default="", help="Crear solo estos correos (separados por coma): para un piloto.")
    p.add_argument("--sin-storage", action="store_true", help="Cuentas solo con Report (sin Storage).")
    p.add_argument("--aplicar", action="store_true", help="Escribir en la base. Sin esto solo muestra lo que haría.")
    args = p.parse_args()

    accesos, invalidos = accesos_por_correo(config_store.leer(ARCHIVO_CONTACTOS, []), SERVICIOS[args.servicio])
    if not accesos:
        raise SystemExit("En esas listas de distribución no figura ningún correo de cliente.")

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT email FROM usuario")
        crear, saltados = planificar(
            accesos, {f["email"] for f in cur.fetchall()}, set(args.solo.split(",")), not args.sin_storage
        )
        por_tipo = {t: sum(1 for c in crear if tipo_de_cuenta(c.plantasAsignadas or []) == t) for t in (1, 2, 3)}
        print(f"\nCorreos de cliente en las listas: {len(accesos)}. Se crearían {len(crear)} cuentas:")
        for t in (1, 2, 3):
            print(f"  Tipo {t} ({NOMBRE_TIPO[t]}): {por_tipo[t]}")
        if saltados:
            print(f"\nSe saltan {len(saltados)} (ya tienen cuenta o no están en --solo).")
        if invalidos:
            print(f"\n{len(invalidos)} textos de la lista NO son un correo y no crean cuenta (corrígelos en la lista):")
            for t in invalidos:
                print(f"  · {t!r}")
        if not args.aplicar:
            print("\nNo se escribió nada. Revisa y, para crearlas, agrega --aplicar")
            return
        if not crear:
            print("\nNo hay nada que crear.")
            return

        filas = []
        for c in crear:
            temporal = seguridad.password_temporal()
            cur.execute(
                """
                INSERT INTO usuario
                    (email, nombre, tipo_acceso, area, cliente_nombre, planta_nombre, modulos, reportes,
                     plantas_asignadas, password_hash, debe_cambiar)
                VALUES (%s, %s, 'cliente', %s, %s, %s, %s, %s, %s, %s, TRUE)
                """,
                (c.email, c.nombre, c.area, c.clienteNombre, c.plantaNombre, c.modulos, c.reportes,
                 Json(c.plantasAsignadas or []), seguridad.hashear_password(temporal)),
            )
            lista = c.plantasAsignadas or []
            t = tipo_de_cuenta(lista)
            filas.append({
                "correo": c.email, "clave": temporal, "tipo": f"Tipo {t}: {NOMBRE_TIPO[t]}",
                "plantas": len({(a["clienteNombre"], a.get("plantaNombre")) for a in lista}), "accesos": len(lista),
            })

    carpeta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, f"claves_clientes_{datetime.now():%Y%m%d_%H%M%S}.xlsx")
    escribir_excel(ruta, filas)
    print(f"\nCreadas {len(filas)} cuentas. Las claves temporales están SOLO en este Excel (sensible: no lo subas ni lo compartas, bórralo al terminar):\n  {ruta}")


if __name__ == "__main__":
    main()
