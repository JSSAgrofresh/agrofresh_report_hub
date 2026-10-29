"""Borrado de las cargas de «Agrofresh Demo» de Post Venta, dejando la mas reciente."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts import borrar_accutab_demo as demo  # noqa: E402


def _r(**kw):
    return {"origen": "email", "equipo": None, "cliente": None, **kw}


def test_reconoce_el_demo_por_cliente_o_por_equipo_sin_importar_mayusculas_ni_guiones():
    assert demo.es_demo(_r(cliente="AGROFRESH_DEMO"))
    assert demo.es_demo(_r(equipo="Agrofresh Demo"))
    assert demo.es_demo(_r(equipo="agrofresh_demo"))
    assert not demo.es_demo(_r(cliente="DOLE", equipo="Ph Orp Equipo 1"))
    assert not demo.es_demo(_r(cliente="AGROFRESH_DEMO_2"))


def test_deja_solo_la_mas_reciente_y_no_toca_a_otros_clientes():
    registros = {
        "2026-08-31_05-57-00": _r(cliente="AGROFRESH_DEMO"),
        "2026-09-02_11-21-00": _r(cliente="AGROFRESH_DEMO"),
        "2026-09-01_09-59-00": _r(equipo="Agrofresh Demo"),
        "2026-09-03_08-00-00": _r(cliente="DOLE", equipo="Equipo 1", origen="manual"),
    }
    sobran, queda = demo.demo_a_borrar(registros)
    assert queda == "2026-09-02_11-21-00"
    assert sobran == ["2026-08-31_05-57-00", "2026-09-01_09-59-00"]
    assert "2026-09-03_08-00-00" not in sobran


def test_con_una_sola_carga_demo_o_ninguna_no_borra_nada():
    assert demo.demo_a_borrar({"2026-09-01_10-00-00": _r(cliente="AGROFRESH_DEMO")}) == ([], "2026-09-01_10-00-00")
    assert demo.demo_a_borrar({"2026-09-01_10-00-00": _r(cliente="DOLE")}) == ([], None)


def test_sin_aplicar_no_borra_y_con_aplicar_borra_todo_menos_la_ultima(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(demo.postventa, "_raiz_accutab", lambda: str(tmp_path))
    borradas: list[str] = []
    monkeypatch.setattr(demo.postventa, "_borrar_carga", borradas.append)
    for carpeta in ("2026-08-31_05-57-00", "2026-09-02_11-21-00"):
        (tmp_path / carpeta).mkdir()
        (tmp_path / carpeta / "registro.json").write_text(json.dumps(_r(cliente="AGROFRESH_DEMO")), encoding="utf-8")

    assert demo.main([]) == 0
    assert borradas == []
    assert "No se borro nada" in capsys.readouterr().out

    monkeypatch.setattr(demo, "_BACKEND", tmp_path / "backend")
    assert demo.main(["--aplicar"]) == 0
    assert borradas == ["2026-08-31_05-57-00"]
