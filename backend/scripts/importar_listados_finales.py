"""
Importa el maestro "Listados_finales.xlsx" (Sold To, Ship To, Especie-Variedad)
como valores ESTÁNDAR de Listados.

El archivo trae tres hojas, cada una independiente -no vienen pareadas entre
sí, a diferencia del pivote que lee `POST /listados/importar-maestro`-:

    SOLD TO           SOLD TO NUMBER | SOLD TO NAME
    SHIP TO           SHIP TO NUMBER | SHIP TO NAME
    ESPECIE-VARIEDAD  CROP           | Variedad

- Sold To se crea/activa en `cliente`, con el número como `codigo_sap`.
- Ship To no trae con qué Sold To va (la hoja no los pareja), así que se crea
  bajo el cliente placeholder "SIN SOLD TO ASIGNADO" -mismo criterio que ya
  usa `importar_maestro` en listados.py para este caso-, con el número como
  `codigo_sap`. Hay que revincularlos a mano desde Listados → Ship To → Editar
  una vez importados.
- Especie y Variedad se crean como valor ESTÁNDAR en `valor_lista` (o se
  promueve un crudo ya existente con ese mismo nombre, para no duplicar).

Para Sold To/Ship To, "ya existe" se compara sin distinguir mayúsculas NI
espacios dobles/de más -"FRUSAN PLANTA LO HERRERA" y "FRUSAN PLANTA  LO
HERRERA" (con doble espacio) son la misma sucursal, no dos-. La comparación
por SQL exacto (`ON CONFLICT`) no alcanza para esto, así que se hace en
Python contra lo ya cargado, tanto al contar como al escribir.

Nada de esto borra ni desactiva lo que ya existe: solo agrega lo que falta y
reactiva lo que estaba inactivo con el mismo nombre. Es idempotente: volver a
correrlo con el mismo archivo no duplica nada.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\importar_listados_finales.py "C:\\ruta\\Listados_finales.xlsx"            # solo mirar
    .venv\\Scripts\\python.exe scripts\\importar_listados_finales.py "C:\\ruta\\Listados_finales.xlsx" --aplicar  # escribir
"""
from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from openpyxl import load_workbook  # noqa: E402

from app.db import conexion, cursor_dict  # noqa: E402
from app.listados import _buscar_o_crear_estandar, clave_normalizada, normalizar_texto_general  # noqa: E402

PLACEHOLDER_SIN_SOLD_TO = "SIN SOLD TO ASIGNADO"


def _clave_simple(valor: str) -> str:
    """Sin mayúsculas ni espacios de más -pero sin tocar acentos ni
    puntuación, a diferencia de `clave_normalizada`-: Sold To/Ship To se
    guardan tal cual los entrega SAP, así que la comparación tiene que ser
    la mínima necesaria para no crear un duplicado por un espacio doble."""
    return re.sub(r"\s+", " ", (valor or "").strip()).lower()


def _leer_hoja(ruta: str, nombre_hoja: str, columnas: tuple[str, ...]) -> list[tuple[str, ...]]:
    wb = load_workbook(ruta, read_only=True, data_only=True)
    try:
        if nombre_hoja not in wb.sheetnames:
            raise SystemExit(f"El archivo no tiene una hoja '{nombre_hoja}'. Hojas encontradas: {wb.sheetnames}")
        ws = wb[nombre_hoja]
        filas = list(ws.iter_rows(values_only=True))
    finally:
        wb.close()
    if not filas:
        return []
    encabezado = [clave_normalizada(str(c or "")) for c in filas[0]]
    indices = []
    for col in columnas:
        clave = clave_normalizada(col)
        if clave not in encabezado:
            raise SystemExit(f"La hoja '{nombre_hoja}' no tiene la columna '{col}'. Encabezado: {filas[0]}")
        indices.append(encabezado.index(clave))
    salida = []
    for fila in filas[1:]:
        valores = tuple(str(fila[i]).strip() if fila[i] is not None else "" for i in indices)
        if any(valores):
            salida.append(valores)
    return salida


def _upsert_cliente(cur, nombre: str, numero: str | None) -> int:
    """Busca por clave simple (sin distinguir mayúsculas/espacios de más);
    si existe, activa y completa el código si faltaba -sin pisar el nombre
    ya guardado-. Si no, lo crea tal cual viene en el archivo."""
    cur.execute("SELECT id, codigo_sap FROM cliente WHERE lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = %s", (_clave_simple(nombre),))
    fila = cur.fetchone()
    if fila:
        if numero and not fila["codigo_sap"]:
            cur.execute("UPDATE cliente SET activo = true, codigo_sap = %s WHERE id = %s", (numero, fila["id"]))
        else:
            cur.execute("UPDATE cliente SET activo = true WHERE id = %s", (fila["id"],))
        return fila["id"]
    cur.execute("INSERT INTO cliente (nombre, codigo_sap, activo) VALUES (%s, %s, true) RETURNING id", (nombre, numero or None))
    return cur.fetchone()["id"]


def _upsert_planta(cur, cliente_id: int, nombre: str, numero: str | None) -> int:
    cur.execute(
        "SELECT id, codigo_sap FROM planta WHERE cliente_id = %s "
        "AND lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = %s",
        (cliente_id, _clave_simple(nombre)),
    )
    fila = cur.fetchone()
    if fila:
        if numero and not fila["codigo_sap"]:
            cur.execute("UPDATE planta SET activo = true, codigo_sap = %s WHERE id = %s", (numero, fila["id"]))
        else:
            cur.execute("UPDATE planta SET activo = true WHERE id = %s", (fila["id"],))
        return fila["id"]
    cur.execute(
        "INSERT INTO planta (cliente_id, nombre, codigo_sap, activo) VALUES (%s, %s, %s, true) RETURNING id",
        (cliente_id, nombre, numero or None),
    )
    return cur.fetchone()["id"]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("archivo", help="Ruta al Listados_finales.xlsx")
    p.add_argument("--aplicar", action="store_true", help="Escribir de verdad. Sin esto solo muestra.")
    args = p.parse_args()

    sold_to = _leer_hoja(args.archivo, "SOLD TO", ("SOLD TO NUMBER", "SOLD TO NAME"))
    ship_to = _leer_hoja(args.archivo, "SHIP TO", ("SHIP TO NUMBER", "SHIP TO NAME"))
    especie_variedad = _leer_hoja(args.archivo, "ESPECIE-VARIEDAD", ("CROP", "Variedad"))

    print(f"\nLeídas {len(sold_to)} fila(s) de Sold To, {len(ship_to)} de Ship To, "
          f"{len(especie_variedad)} de Especie-Variedad.\n")

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT nombre FROM cliente")
        clientes_existentes = {_clave_simple(f["nombre"]) for f in cur.fetchall()}
        cur.execute("SELECT nombre FROM planta")
        plantas_existentes = {_clave_simple(f["nombre"]) for f in cur.fetchall()}
        cur.execute("SELECT valor_normalizado AS clave FROM valor_lista WHERE tipo = 'especie'")
        especies_existentes = {f["clave"] for f in cur.fetchall()}
        cur.execute("SELECT valor_normalizado AS clave FROM valor_lista WHERE tipo = 'variedad'")
        variedades_existentes = {f["clave"] for f in cur.fetchall()}

    nuevos_clientes = [(num, nom) for num, nom in sold_to if nom and _clave_simple(nom) not in clientes_existentes]
    nuevas_plantas = [(num, nom) for num, nom in ship_to if nom and _clave_simple(nom) not in plantas_existentes]
    especies_del_archivo = {normalizar_texto_general(c) for c, _v in especie_variedad if c}
    nuevas_especies = sorted(e for e in especies_del_archivo if clave_normalizada(e) not in especies_existentes)
    nuevas_variedades = [
        (c, v) for c, v in especie_variedad
        if c and v and clave_normalizada(v) not in variedades_existentes
    ]

    print(f"Sold To: {len(nuevos_clientes)} cliente(s) nuevo(s) de {len(sold_to)}.")
    print(f"Ship To: {len(nuevas_plantas)} sucursal(es) nueva(s) de {len(ship_to)} "
          f"(quedan bajo '{PLACEHOLDER_SIN_SOLD_TO}' hasta que las revincules a mano).")
    print(f"Especie: {len(nuevas_especies)} especie(s) nueva(s).")
    print(f"Variedad: {len(nuevas_variedades)} variedad(es) nueva(s) de {len(especie_variedad)}.\n")

    if not args.aplicar:
        print("Modo mirar (sin --aplicar): no se escribió nada.\n")
        if nuevos_clientes[:10]:
            print("Ejemplos de Sold To a crear:", ", ".join(n for _c, n in nuevos_clientes[:10]))
        if nuevas_plantas[:10]:
            print("Ejemplos de Ship To a crear:", ", ".join(n for _c, n in nuevas_plantas[:10]))
        if nuevas_especies[:10]:
            print("Especies a crear:", ", ".join(nuevas_especies[:10]))
        return

    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        creados_cliente = 0
        for numero, nombre in sold_to:
            if not nombre:
                continue
            _upsert_cliente(cur, nombre, numero or None)
            creados_cliente += 1

        placeholder_id = _upsert_cliente(cur, PLACEHOLDER_SIN_SOLD_TO, None)

        creados_planta = 0
        for numero, nombre in ship_to:
            if not nombre:
                continue
            _upsert_planta(cur, placeholder_id, nombre, numero or None)
            creados_planta += 1

        especies_id: dict[str, int] = {}
        for crop in sorted(especies_del_archivo):
            especies_id[clave_normalizada(crop)] = _buscar_o_crear_estandar(cur, "especie", crop, None)

        creadas_variedad = 0
        for crop, variedad in especie_variedad:
            if not crop or not variedad:
                continue
            especie_id = especies_id.get(clave_normalizada(normalizar_texto_general(crop)))
            if especie_id is None:
                especie_id = _buscar_o_crear_estandar(cur, "especie", crop, None)
                especies_id[clave_normalizada(normalizar_texto_general(crop))] = especie_id
            _buscar_o_crear_estandar(cur, "variedad", variedad, especie_id)
            creadas_variedad += 1

    print(f"Listo: {creados_cliente} Sold To procesados, {creados_planta} Ship To procesados "
          f"(bajo '{PLACEHOLDER_SIN_SOLD_TO}'), {len(especies_id)} especie(s), "
          f"{creadas_variedad} variedad(es) procesadas.\n")


if __name__ == "__main__":
    main()
