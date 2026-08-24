"""
Repara el maestro de Variedad que quedó a medias al importar el Excel.

La hoja "ESPECIE VARIEDAD" de listados_seed.xlsx NO está pareada fila a fila:
son dos columnas independientes -19 especies en una, ~500 variedades en otra-.
Al importarla, entonces, ninguna variedad queda vinculada a su especie. Como
Ingest busca la variedad SIEMPRE dentro de la especie de la fila (una variedad
vive bajo una especie, ver migración 0013), esas variedades sin especie son
entradas muertas: por más que el nombre esté bien escrito y sí exista en la
lista, la fila igual cae en "Pendientes de revisión".

Este script arregla lo que se puede deducir sin inventar nada:

1. Prefijo de especie en inglés pegado al nombre ("Apples - Cripps Pink",
   "Blueberries Duke", "Pears Packham"): el prefijo dice la especie. Se vincula
   a esa especie y, si ya existe la misma variedad sin el prefijo, se fusiona
   hacia ella en vez de dejar dos entradas para lo mismo.
2. "No Indica Variedad - <Especie>": es un valor real y recurrente del negocio
   -no es basura-, y el sufijo dice a qué especie pertenece.
3. Basura evidente del Excel (#¡Ref!, (En Blanco), "Final 121"): se desactiva.
   No se borra -borrar valores crudos rompe el flujo de homogenización-.

Todo lo que no cae en esos 3 casos se deja intacto y se lista al final, para
resolverlo a mano desde Listados → Homogenizar. Es seguro de repetir.

Uso:
    cd backend && python3 scripts/reparar_variedades.py
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402
from app.ingest import _PREFIJO_VARIEDAD_A_ESPECIE  # noqa: E402
from app.listados import clave_normalizada  # noqa: E402

# Valores que no son una variedad: restos de fórmulas rotas y celdas de relleno
# del Excel. Se comparan por clave normalizada.
BASURA = {clave_normalizada(v) for v in ("#¡Ref!", "#¡REF!", "(En Blanco)", "(en blanco)", "0")}
# "Final 121", "Final 131": numeración interna de una planilla, no variedades.
BASURA_REGEX = re.compile(r"^final \d+$")


def _es_basura(clave: str) -> bool:
    return not clave or clave in BASURA or bool(BASURA_REGEX.match(clave))


def main() -> None:
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT id, valor, valor_normalizado FROM valor_lista WHERE tipo = 'especie'")
        especies = {clave_normalizada(r["valor"]): r["id"] for r in cur.fetchall()}

        # Se toman las que no tienen especie Y también las que ya la tienen pero
        # arrastran un prefijo de especie en el nombre: "Pears Packham" tiene que
        # terminar fusionada en "Packham", no quedarse como el nombre oficial
        # -es el nombre que después se ve en el reporte-.
        cur.execute(
            "SELECT id, valor, valor_normalizado, especie_id FROM valor_lista "
            "WHERE tipo = 'variedad' AND activo AND fusionado_en_id IS NULL "
            "ORDER BY valor"
        )
        candidatas = cur.fetchall()

        def _tiene_prefijo(clave: str) -> bool:
            partes = (clave or "").split(" ")
            return len(partes) >= 2 and partes[0] in _PREFIJO_VARIEDAD_A_ESPECIE

        huerfanas = [
            c
            for c in candidatas
            if c["especie_id"] is None or _tiene_prefijo(c["valor_normalizado"] or clave_normalizada(c["valor"]))
        ]

        vinculadas = fusionadas = desactivadas = 0
        sin_resolver: list[str] = []

        for h in huerfanas:
            clave = h["valor_normalizado"] or clave_normalizada(h["valor"])

            if _es_basura(clave):
                cur.execute("UPDATE valor_lista SET activo = false WHERE id = %s", (h["id"],))
                desactivadas += 1
                continue

            especie_id = None
            clave_limpia = clave

            # Caso 2: "No Indica Variedad - Manzana" / "No Indica Variedad-Cereza".
            if clave.startswith("no indica variedad"):
                resto = clave[len("no indica variedad") :].strip()
                # El Excel escribe algunas especies en plural o en inglés.
                alias_especie = {"limones": "limon", "nectarines": "nectarina", "cereza": "cerezas"}
                resto = alias_especie.get(resto, resto)
                if resto and resto in especies:
                    especie_id = especies[resto]
                    clave_limpia = clave  # el nombre se mantiene tal cual, es un valor real
            else:
                # Caso 1: prefijo de especie en inglés.
                partes = clave.split(" ")
                if len(partes) >= 2:
                    especie_prefijo = _PREFIJO_VARIEDAD_A_ESPECIE.get(partes[0])
                    if especie_prefijo:
                        especie_id = especies.get(clave_normalizada(especie_prefijo))
                        clave_limpia = " ".join(partes[1:])

            if especie_id is None:
                sin_resolver.append(h["valor"])
                continue

            # ¿Ya existe la misma variedad -sin el prefijo- bajo esa especie? Si
            # sí, esta es un duplicado sucio: se fusiona hacia la que ya estaba.
            destino = None
            if clave_limpia != clave:
                cur.execute(
                    "SELECT id FROM valor_lista WHERE tipo = 'variedad' AND especie_id = %s "
                    "AND valor_normalizado = %s AND id <> %s",
                    (especie_id, clave_limpia, h["id"]),
                )
                destino = cur.fetchone()
                if not destino:
                    # El nombre limpio suele existir, pero también sin especie
                    # ("Packham" y "Pears Packham" son las dos huérfanas). Se
                    # adopta primero el limpio hacia esta especie y se usa como
                    # destino, para que el nombre oficial quede sin el prefijo.
                    cur.execute(
                        "SELECT id FROM valor_lista WHERE tipo = 'variedad' AND especie_id IS NULL "
                        "AND valor_normalizado = %s AND activo AND fusionado_en_id IS NULL AND id <> %s",
                        (clave_limpia, h["id"]),
                    )
                    destino = cur.fetchone()
                    if destino:
                        cur.execute(
                            "UPDATE valor_lista SET especie_id = %s WHERE id = %s", (especie_id, destino["id"])
                        )
                        vinculadas += 1

            if destino:
                cur.execute(
                    "UPDATE valor_lista SET especie_id = %s, fusionado_en_id = %s, activo = false WHERE id = %s",
                    (especie_id, destino["id"], h["id"]),
                )
                # Para que la fusión tenga sentido, el destino queda marcado como
                # el valor estándar de ese grupo.
                cur.execute("UPDATE valor_lista SET es_estandar = true WHERE id = %s", (destino["id"],))
                fusionadas += 1
            else:
                cur.execute("UPDATE valor_lista SET especie_id = %s WHERE id = %s", (especie_id, h["id"]))
                vinculadas += 1

    print(f"Variedades vinculadas a su especie: {vinculadas}")
    print(f"Variedades fusionadas hacia la que ya existía sin prefijo: {fusionadas}")
    print(f"Valores basura desactivados: {desactivadas}")
    print(f"Quedan sin especie (resolver a mano en Listados → Homogenizar): {len(sin_resolver)}")
    for v in sin_resolver:
        print(f"  - {v}")


if __name__ == "__main__":
    main()
