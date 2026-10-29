import importlib.util
import os

_spec = importlib.util.spec_from_file_location("unir", os.path.join(os.path.dirname(__file__), "..", "scripts", "unir_carpetas_auditoria.py"))
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def test_junta_la_variante_mal_escrita_y_no_pisa_lo_que_ya_existe():
    claves = ["Agrofresh/PLANTA A/x.pdf", "Agrofresh/PLANTA A/y.pdf", "AgroFresh/PLANTA A/y.pdf", "AgroFresh/PLANTA B/z.pdf", "Quiteca/PLANTA A/q.pdf"]
    mover, conflictos = mod.plan(claves)
    assert mover == [("Agrofresh/PLANTA A/x.pdf", "AgroFresh/PLANTA A/x.pdf")]
    assert conflictos == ["Agrofresh/PLANTA A/y.pdf"]


def test_otros_laboratorios_y_la_forma_correcta_no_se_tocan():
    assert mod.plan(["AgroFresh/a.pdf", "Quiteca/b.pdf", "suelto.pdf"]) == ([], [])
