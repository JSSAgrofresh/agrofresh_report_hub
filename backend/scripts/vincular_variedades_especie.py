"""
Vincula cada Variedad ya existente en la base a la Especie que le
corresponde (migración 0013 agregó `especie_id`, pero los ~509 valores
importados originalmente desde el Excel plano de agosto 2026 no tenían esa
relación). Fuente: tabla CROP/Variedad real (con especie por fila) que
AgroFresh entregó en septiembre 2026 -mucho más confiable que la hoja
"ESPECIE VARIEDAD" original, que traía las dos columnas sueltas-.

Se excluyen a propósito los valores que NO son variedades reales, residuos
de la tabla dinámica de origen: "compuesta", "Total <especie>", "revisar" /
"REVISAR (...)" y las filas "No indica variedad - <especie>" (esa frase sí
es un valor real de negocio, pero se maneja aparte si hace falta, no como
una variedad más).

Comportamiento (idempotente, seguro de re-correr):
  1. Para cada (especie, variedad) de la tabla: crea la especie si no
     existe.
  2. Si ya hay una fila de esa variedad EN ESA especie -especie_id ya
     seteado-, no hace nada (ya está vinculada, corridas anteriores o
     trabajo manual).
  3. Si no, busca una fila "huérfana" (variedad sin especie_id todavía,
     texto equivalente) y le completa la especie -preserva es_estandar,
     fusionado_en_id y activo tal cual estaban, por eso no se pierden
     homogenizaciones ya hechas-. Si el mismo texto ya se usó para vincular
     otra especie en esta corrida (caso real: "June Gold" en Durazno Y en
     Manzana), no reutiliza esa fila: cae al paso 4.
  4. Si no hay huérfana disponible, crea una fila nueva.

Al final, cualquier variedad ya asignada a un estándar (fusionado_en_id) que
haya quedado sin especie hereda la especie de su estándar. Lo que sobre sin
poder vincularse -texto que no aparece en la tabla de origen- se imprime al
final para revisión manual (se puede corregir desde Listados: Editar valor).

Uso:
    cd backend && python3 scripts/vincular_variedades_especie.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import conexion, cursor_dict  # noqa: E402
from app.listados import clave_normalizada, normalizar_texto_general  # noqa: E402

# (Especie, [Variedades...]) tal como está en la tabla CROP/Variedad real de
# AgroFresh -ya sin los residuos de tabla dinámica ("compuesta", "Total X",
# "revisar", "No indica variedad - X")-.
ESPECIE_VARIEDADES: list[tuple[str, list[str]]] = [
    ("Arándano", [
        "Blue Ribbon", "Brightwell", "Brigitta", "Cargo", "Duke", "Emerald",
        "Legacy", "Draper", "IQF", "Nice Blue",
    ]),
    ("Cerezas", [
        "Bing", "Kordia", "Regina", "Sentennial", "Skeena", "Sweet Heart",
        "Dark Sweet", "Final 12,1", "Final 13,1", "Lapins", "Rainer", "Staccato",
    ]),
    ("Ciruela", [
        "African Delight", "Angeleno", "Angelino Black", "Autumn Pride", "Black Kat",
        "Candy", "Candy Extreme", "Candy Pixie", "Candy Red", "Candy Stripe",
        "Constanza", "Constanza black", "Crimson Dawn", "Crimson Fall", "Crimson Vat",
        "D'Agen", "D'1", "Dapple Dandy", "Dapple Delight", "Emerald", "Emerald Candy",
        "Emerald Dream", "Emerald King", "Emerald Sweet", "Emerald Swin", "Flavorich",
        "Fortune", "Giant Phoenix", "Honey Punch", "Joanna Red", "Laetitia",
        "Larry Anne", "Larry Blue", "Late Candy", "Late Princess", "Leticia", "Lobita",
        "Larry Ann", "Long Anne", "Mary Diamond", "My Heart Red", "Owen T", "Pink",
        "Pink Delight", "Black Aura", "Sweet Mary", "Yummy Giant", "Purple Honey",
        "Red Gold", "Red Granade", "Red Heart", "Red Lyon", "Red Phoenix",
        "Red Phoenix Giant", "Red plums", "RR1", "Santa Rosa", "September Yummy",
        "Sugar Plum", "Summer Breeze", "Sunset Delight", "Suplum",
        "Suplum Thirtysix", "Sweet Garnet", "Sweet Light", "Sweet Pekeetah",
        "Sweet Pixies", "Sweet Sunset", "Tulare Giant", "Honey",
    ]),
    ("Clementina", ["Clemenluz", "Clementina", "Clemenule", "Murcott", "Oro Grande", "Oronule"]),
    ("Durazno", [
        "August Pride", "Beauty sweet", "Cakemoon", "Elegant Lady", "Fairtime",
        "Flat Star", "June Gold", "O Henry", "P princess", "Royal Glory",
        "September Snow", "September Sun", "Snow Beaut", "Spring Beauty",
        "Super Peach 100", "Yellow Flesh", "Zee Lady",
    ]),
    ("Granada", ["Wonderful"]),
    ("Kiwi", ["Hayward"]),
    ("Limón", ["Benjamin", "Benjamin Andes", "Eureka", "Eureka Frost", "Fino", "Fino 49", "Genova", "Messina"]),
    ("Mandarina", ["Murcott", "Tango", "W. Murcott"]),
    ("Manzana", [
        "Modi", "Royal Gala", "Brookfield", "Cripps Pink", "Buckeye", "Fuji",
        "Fuji Raku Raku", "Gala", "Gala Premium", "Gala Tenroy", "Galaxy",
        "Granny Smith", "Red Chief", "Red Delicious", "Bella Union", "Early Red One",
        "Elstar", "Evelina", "Evercrips", "Eyelina", "Galaval", "Honey", "Honny Crips",
        "Jeromine", "Jonagold", "June Gold", "Kanzi", "Pacific Gala", "Pink Lady",
        "Pomme Rouge", "Red Delicius", "Red Spur", "Rossy Globe", "Rosy Glow",
        "Royal Gakka", "Royal Gala Tenroy", "Scarlet", "Scarlet Surprise",
        "Sweet Gala", "Ultra Red Sale",
    ]),
    ("Naranja", ["Atiwood", "Cara Cara", "Fisher", "Fukumoto", "Lane Late", "Navel", "Newhall", "Parent Washington"]),
    ("Nectarina", [
        "August", "A. Queen", "Andes", "Andesnecdos", "Andesneccuatro", "Andesneccinco",
        "Andesnecseis", "Arctic Mist", "Arctic Snow", "Arctic Fire", "Arctic Queen",
        "Arctic Red", "August Bright", "August Fire", "August Pearl", "August Red",
        "August Snow", "Big Pearl", "Blanco", "Bright Pearl", "Café Delice",
        "Cake Delice", "Early Royal", "Clariss", "Elegant Lady", "Fire Pearl",
        "Giant Bright", "Giant Pearl", "Grand Bright", "Honey Diva", "Just Sweet",
        "Kinolea", "Luciana", "Majestic Pearl", "NE-289", "NE-252", "Necta Jewel",
        "Nectar Crest", "Nectarelse", "Nectar Perfecta", "Nectarperle", "Nectawejel",
        "Pearlicious Vl", "Red Diamond", "Red Pearl", "Red Roy", "Ruby Diamond",
        "Ruby Pearl", "September bright", "Snow D", "Summer B", "Summer Bright",
        "Summer Lady", "Sunrise", "Super August", "Super Queen", "Sweet Giant",
        "Sweet Pearl", "Sweet Queen", "Sweet Red 20", "Sweet September", "Tifany",
        "Venus", "White Angel", "White flesh", "Yellow flesh",
    ]),
    ("Palta", ["Hass"]),
    ("Pera", [
        "Abate Fetel", "Autumn bartlett", "Beunne Bose", "Beurre Bosc", "BEURRE D'ANJOU",
        "Celine", "Coscia", "D'anjou", "Ercolini", "Flamingo", "Forelle", "Golden Bosc",
        "Packham's triumph", "Summer Bartlett", "Vermont Beauty", "Winter Nelly",
    ]),
    ("Uva", [
        "Allison", "Arra", "Arra 15", "Autumncrisp", "Cotton Candy", "Crimson",
        "Sweet Globe", "Autumn Crisp", "Timson", "Great Green", "Pristine",
        "Red Globe", "Sable", "Scarlotta", "Sweet Celebration", "THOMPSON", "Timpson",
    ]),
    ("Zarzaparrilla", ["Junnifer", "Rovada"]),
]


def _buscar_o_crear_especie(cur, nombre: str) -> int:
    valor = normalizar_texto_general(nombre)
    clave = clave_normalizada(valor)
    cur.execute("SELECT id FROM valor_lista WHERE tipo = 'especie' AND valor_normalizado = %s", (clave,))
    fila = cur.fetchone()
    if fila:
        return fila["id"]
    cur.execute(
        "INSERT INTO valor_lista (tipo, valor, valor_normalizado, activo) VALUES ('especie', %s, %s, true) RETURNING id",
        (valor, clave),
    )
    return cur.fetchone()["id"]


def main() -> None:
    vinculadas = 0
    nuevas = 0
    huerfanas_consumidas: set[int] = set()

    with conexion() as conn, cursor_dict(conn) as cur:
        for especie_nombre, variedades in ESPECIE_VARIEDADES:
            especie_id = _buscar_o_crear_especie(cur, especie_nombre)
            for variedad_cruda in variedades:
                valor = normalizar_texto_general(variedad_cruda)
                clave = clave_normalizada(valor)

                cur.execute(
                    "SELECT id FROM valor_lista WHERE tipo = 'variedad' AND especie_id = %s AND valor_normalizado = %s",
                    (especie_id, clave),
                )
                if cur.fetchone():
                    continue  # ya vinculada (esta corrida u otra anterior)

                cur.execute(
                    "SELECT id FROM valor_lista WHERE tipo = 'variedad' AND especie_id IS NULL AND valor_normalizado = %s",
                    (clave,),
                )
                huerfana = cur.fetchone()
                if huerfana and huerfana["id"] not in huerfanas_consumidas:
                    cur.execute("UPDATE valor_lista SET especie_id = %s WHERE id = %s", (especie_id, huerfana["id"]))
                    huerfanas_consumidas.add(huerfana["id"])
                    vinculadas += 1
                else:
                    cur.execute(
                        "INSERT INTO valor_lista (tipo, valor, valor_normalizado, activo, especie_id) "
                        "VALUES ('variedad', %s, %s, true, %s)",
                        (valor, clave, especie_id),
                    )
                    nuevas += 1

        # Una variedad ya asignada (fusionado_en_id) a un estándar que a su
        # vez ya quedó vinculado arriba hereda la especie de ese estándar.
        cur.execute(
            "UPDATE valor_lista h SET especie_id = e.especie_id "
            "FROM valor_lista e WHERE h.fusionado_en_id = e.id AND h.especie_id IS NULL AND e.especie_id IS NOT NULL"
        )
        heredadas = cur.rowcount

        cur.execute("SELECT valor FROM valor_lista WHERE tipo = 'variedad' AND especie_id IS NULL ORDER BY valor")
        sin_vincular = [f["valor"] for f in cur.fetchall()]

    print(f"Variedades vinculadas a su especie (filas existentes): {vinculadas}")
    print(f"Variedades nuevas creadas (especie con ese nombre no existía antes): {nuevas}")
    print(f"Variedades que heredaron la especie de su estándar asignado: {heredadas}")
    if sin_vincular:
        print(f"\nQuedaron {len(sin_vincular)} variedades SIN especie -no aparecen en la tabla de origen, revisar a mano desde Listados (Editar valor):")
        for v in sin_vincular:
            print(f"  - {v}")
    else:
        print("\nNo quedó ninguna variedad sin especie.")


if __name__ == "__main__":
    main()
