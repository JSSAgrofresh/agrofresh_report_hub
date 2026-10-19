"""El script que crea comerciales numerados (scripts/crear_comerciales.py): solo la parte que decide qué crear."""
import importlib.util
import os

_ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", "crear_comerciales.py")
_spec = importlib.util.spec_from_file_location("crear_comerciales", _ruta)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def test_numera_desde_uno():
    assert mod.planificar(set(), 3) == [
        (1, "Comercial 1", "comercial1@agrofresh.com"),
        (2, "Comercial 2", "comercial2@agrofresh.com"),
        (3, "Comercial 3", "comercial3@agrofresh.com"),
    ]


def test_volver_a_correrlo_no_duplica_ni_pisa():
    existentes = {"comercial1@agrofresh.com", "COMERCIAL3@agrofresh.com", "otra@agrofresh.com"}
    assert [c for _, _, c in mod.planificar(existentes, 2)] == ["comercial2@agrofresh.com", "comercial4@agrofresh.com"]
