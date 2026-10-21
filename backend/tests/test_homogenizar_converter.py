"""Port de `homogenizar` del Converter: los mismos casos que resuelve solo."""
from app.homogenizar_converter import homogenizar, homogenizar_campos

OPC = {
    "sold_to": ["DOLE CHILE S.A.", "SOCIEDAD AGRICOLA EL PORVENIR"],
    "especie": ["Cerezas", "Manzana"],
    "ship_to": {"DOLE CHILE S.A.": ["DOLE PLANTA SAN FERNANDO", "DOLE LONTUE"]},
    "variedad": {"Cerezas": ["Santina", "Lapins"]},
}


def test_nombre_abreviado_unico():
    assert homogenizar("especie", "cereza", OPC["especie"])["valor"] == "Cerezas"


def test_ya_oficial_no_cambia():
    assert homogenizar("especie", "Cerezas", OPC["especie"])["estado"] == "ok"


def test_sin_tildes_ni_mayusculas_ni_guiones():
    assert homogenizar("variedad", "SANTINA", OPC["variedad"]["Cerezas"])["valor"] == "Santina"
    assert homogenizar("ship_to", "dole-lontue", OPC["ship_to"]["DOLE CHILE S.A."])["valor"] == "DOLE LONTUE"


def test_ship_to_por_ciudad_solo_dentro_de_su_cliente():
    assert homogenizar("ship_to", "SAN FERNANDO", OPC["ship_to"]["DOLE CHILE S.A."], True)["valor"] == "DOLE PLANTA SAN FERNANDO"
    assert homogenizar("ship_to", "SAN FERNANDO", OPC["ship_to"]["DOLE CHILE S.A."], False)["estado"] == "fuera_de_catalogo"


def test_ambiguo_no_se_adivina():
    r = homogenizar("especie", "manzan", ["Manzana", "Manzanas"])
    assert r["estado"] == "fuera_de_catalogo"


def test_campos_en_cadena():
    campos = {"sold_to": "dole chile s.a.", "especie": "cereza", "ship_to": "SAN FERNANDO", "variedad": "santina"}
    final, cambios = homogenizar_campos(campos, OPC)
    assert final == {"sold_to": "DOLE CHILE S.A.", "especie": "Cerezas", "ship_to": "DOLE PLANTA SAN FERNANDO", "variedad": "Santina"}
    assert {c["campo"] for c in cambios} == {"sold_to", "especie", "ship_to", "variedad"}


def test_romper_la_regla_falla():
    final, _ = homogenizar_campos({"sold_to": "OTRO", "especie": "Uva", "ship_to": "x", "variedad": "y"}, OPC)
    assert final["especie"] == "Uva"
