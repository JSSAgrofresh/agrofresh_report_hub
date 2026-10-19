"""El script que crea comerciales desde las listas de distribución (scripts/crear_comerciales.py): lo que decide."""
import importlib.util
import os

_ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", "crear_comerciales.py")
_spec = importlib.util.spec_from_file_location("crear_comerciales", _ruta)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def _interno(sold, ship, email, cargo="Comercial", servicio=None, orden=0):
    c = {"tipo": "resultado_interno", "sold_to": sold, "ship_to": ship, "email": email, "cargo": cargo, "activo": True, "orden": orden}
    if servicio:
        c["servicio"] = servicio
    return c


CONTACTOS = [
    _interno("DOLE", "DOLE LONTUE", "RTraverso@agrofresh.com"),
    _interno("DOLE", "DOLE CODEGUA", "rtraverso@agrofresh.com"),
    _interno("VERFRUT", "VERFRUT RAPEL", "rtraverso@agrofresh.com"),
    _interno("VERFRUT", "VERFRUT RAPEL", "msuarez@agrofresh.com"),
    _interno("DOLE", "DOLE LONTUE", "tecnico@agrofresh.com", cargo="Técnico"),
    _interno("DOLE", "DOLE LONTUE", "admin@agrofresh.com", cargo="Admin"),
    _interno("MACE", "MACE PLANTA", "ryd.comercial@agrofresh.com", servicio="ryd"),
]


def test_solo_salen_los_comerciales_de_cada_planta_y_sin_repetir_correo():
    c = mod.comerciales_en_listas(CONTACTOS, [""])
    assert list(c) == ["msuarez@agrofresh.com", "rtraverso@agrofresh.com"]  # técnico, admin y RYD no
    assert c["rtraverso@agrofresh.com"] == [
        {"clienteNombre": "DOLE", "plantaNombre": "DOLE CODEGUA"},
        {"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE"},
        {"clienteNombre": "VERFRUT", "plantaNombre": "VERFRUT RAPEL"},
    ]


def test_otras_listas_solo_si_se_piden():
    assert "ryd.comercial@agrofresh.com" not in mod.comerciales_en_listas(CONTACTOS, [""])
    assert "ryd.comercial@agrofresh.com" in mod.comerciales_en_listas(CONTACTOS, ["", "ryd"])


def test_no_duplica_ni_pisa_cuentas_y_respeta_las_exclusiones():
    c = mod.comerciales_en_listas(CONTACTOS, [""])
    crear, saltados = mod.planificar(c, {"MSuarez@agrofresh.com"}, set())
    assert [x[0] for x in crear] == ["rtraverso@agrofresh.com"] and saltados == ["msuarez@agrofresh.com"]
    crear, saltados = mod.planificar(c, set(), {"RTraverso@agrofresh.com"})
    assert [x[0] for x in crear] == ["msuarez@agrofresh.com"] and saltados == ["rtraverso@agrofresh.com"]


def test_el_nombre_sale_del_correo():
    assert mod.nombre_desde_correo("carla.caceres@agrofresh.com") == "Carla Caceres"
    assert mod.nombre_desde_correo("rtraverso@agrofresh.com") == "Rtraverso"
