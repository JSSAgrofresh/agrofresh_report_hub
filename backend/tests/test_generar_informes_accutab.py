import json
import os

from app import config
from scripts import generar_informes_accutab as gen

FILAS = [{"ts": i, "fecha": "2026-10-01", "hora": f"10:{i:02d}", "ph": 7.1, "mv": 650, "temp": 20, "archivo": "a"} for i in range(5)]


def _carga(tmp, marca, **extra):
    d = tmp / "Accutab" / marca
    d.mkdir(parents=True)
    reg = {"cliente": None, "planta": None, "equipo": None, "filas": FILAS, "estadisticas": None, "tiene_pdf": False, **extra}
    (d / "registro.json").write_text(json.dumps(reg), encoding="utf-8")
    return d


def test_sin_demo_salta_las_demo_y_solo_escribe_con_aplicar(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    real = _carga(tmp_path, "2026-10-01_10-00-00", cliente="DOLE")
    demo = _carga(tmp_path, "2026-10-01_10-00-01", equipo="AGROFRESH_DEMO (12)")
    assert gen.procesar(False, sin_demo=True)["generados"] == 1
    assert not (real / "informe.pdf").exists()  # sin --aplicar no escribe
    c = gen.procesar(True, sin_demo=True)
    assert c["generados"] == 1 and c["demo"] == 1
    assert (real / "informe.pdf").read_bytes().startswith(b"%PDF")
    assert json.loads((real / "registro.json").read_text())["tiene_pdf"] is True
    assert not (demo / "informe.pdf").exists()
    assert gen.procesar(True, sin_demo=True)["generados"] == 0  # idempotente


def test_rehacer_vuelve_a_generar_los_del_sistema_pero_no_el_pdf_de_trace(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    correo = _carga(tmp_path, "2026-10-01_10-00-00", cliente="DOLE", origen="email", tiene_pdf=True)
    trace = _carga(tmp_path, "2026-10-01_10-00-01", cliente="DOLE", origen="manual", tiene_pdf=True)
    (correo / "informe.pdf").write_bytes(b"viejo")
    (trace / "informe.pdf").write_bytes(b"de Trace")
    assert gen.procesar(True)["generados"] == 0  # sin --rehacer no los toca
    c = gen.procesar(True, rehacer=True)
    assert c["generados"] == 1 and c["ya_tenian"] == 1
    assert (correo / "informe.pdf").read_bytes().startswith(b"%PDF")
    assert (trace / "informe.pdf").read_bytes() == b"de Trace"


def test_por_defecto_genera_tambien_las_demo_en_la_fecha_en_que_llegaron(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    subidos = []
    monkeypatch.setattr("app.r2.disponible", lambda: True)
    monkeypatch.setattr("app.r2.subir", lambda k, d, ct="": subidos.append(k))
    demo = _carga(tmp_path, "2026-08-28_09-15-00", origen="email", equipo="AGROFRESH_DEMO (12)")
    c = gen.procesar(True)
    assert c["generados"] == 1 and c["demo"] == 0
    assert (demo / "informe.pdf").read_bytes().startswith(b"%PDF")
    # la carpeta lleva la fecha de llegada (la de la carga), no la de hoy
    assert subidos == ["accutab/mail/AGROFRESH_DEMO/2026-08-28/Informe 09-15-00.pdf"]


def test_por_defecto_genera_tambien_las_demo_en_la_fecha_en_que_llegaron(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    subidos = []
    monkeypatch.setattr("app.r2.disponible", lambda: True)
    monkeypatch.setattr("app.r2.subir", lambda k, d, ct="": subidos.append(k))
    demo = _carga(tmp_path, "2026-08-28_09-15-00", origen="email", equipo="AGROFRESH_DEMO (12)")
    c = gen.procesar(True)
    assert c["generados"] == 1 and c["demo"] == 0
    assert (demo / "informe.pdf").read_bytes().startswith(b"%PDF")
    # la carpeta lleva la fecha de llegada (la de la carga), no la de hoy
    assert subidos == ["accutab/mail/AGROFRESH_DEMO/2026-08-28/Informe 09-15-00.pdf"]
