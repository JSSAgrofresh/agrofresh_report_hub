"""El reordenamiento de Storage → Informes al orden planta / laboratorio / fecha del informe."""
import importlib.util
import os

_RUTA = os.path.join(os.path.dirname(__file__), "..", "scripts", "reordenar_informes_storage.py")
_spec = importlib.util.spec_from_file_location("reordenar_informes_storage", _RUTA)
sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sc)


def test_reconoce_los_ordenes():
    assert sc.formato("informes/P/Quiteca/Informes/2026-10-02/a.pdf") == "nuevo"
    assert sc.formato("informes/P/Quiteca/Solicitudes/2026-10-02/OT-QUI1.pdf") == "nuevo"
    assert sc.formato("informes/P/Quiteca/2026-10-02/a.pdf") == "intermedio"
    assert sc.formato("informes/P/2026-09-30/Actimist/Quiteca/a.pdf") == "antiguo6"
    assert sc.formato("informes/P/2026-09-30/AGF2026-1.pdf") == "antiguo4"
    assert sc.formato("informes/suelto.pdf") == "otro"


def test_quita_el_tipo_de_servicio_y_usa_la_fecha_del_informe():
    mover, conflictos, otros = sc.plan(
        ["informes/P/2026-09-30/Línea de proceso/Quiteca/2026-1885-PC.pdf"], {"2026-1885-pc": "2026-10-02"}
    )
    assert mover == [("informes/P/2026-09-30/Línea de proceso/Quiteca/2026-1885-PC.pdf", "informes/P/Quiteca/Informes/2026-10-02/2026-1885-PC.pdf", True)]
    assert conflictos == [] and otros == []


def test_sin_fecha_en_report_queda_la_de_la_carpeta_y_se_avisa():
    mover, _, _ = sc.plan(["informes/P/2026-09-30/Actimist/ALS/496563.pdf"], {})
    assert mover == [("informes/P/2026-09-30/Actimist/ALS/496563.pdf", "informes/P/ALS/Informes/2026-09-30/496563.pdf", False)]


def test_el_formato_de_cuatro_niveles_es_agrofresh():
    mover, _, _ = sc.plan(["informes/P/2026-09-30/AGF2026-5.pdf"], {"agf2026-5": "2026-10-01"})
    assert mover[0][1] == "informes/P/AgroFresh/Informes/2026-10-01/AGF2026-5.pdf"


def test_no_pisa_un_destino_que_ya_existe_ni_toca_lo_nuevo():
    claves = ["informes/P/Quiteca/Informes/2026-10-02/a.pdf", "informes/P/2026-10-02/Actimist/Quiteca/a.pdf"]
    mover, conflictos, _ = sc.plan(claves, {})
    assert mover == [] and conflictos == [("informes/P/2026-10-02/Actimist/Quiteca/a.pdf", "informes/P/Quiteca/Informes/2026-10-02/a.pdf")]


def test_el_n_de_informe_no_calza_por_parecido():
    mover, _, _ = sc.plan(["informes/P/2026-09-30/X/Quiteca/2026-18851-PC.pdf"], {"2026-1885-pc": "2026-10-02"})
    assert mover[0][1].endswith("/Quiteca/Informes/2026-09-30/2026-18851-PC.pdf")


def test_el_orden_intermedio_solo_suma_la_subcarpeta_informes():
    mover, _, _ = sc.plan(["informes/P/Quiteca/2026-10-02/a.pdf"], {"a": "2026-12-31"})
    assert [m[:2] for m in mover] == [("informes/P/Quiteca/2026-10-02/a.pdf", "informes/P/Quiteca/Informes/2026-10-02/a.pdf")]
