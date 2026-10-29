import importlib.util
import os

from app.ficha_informe import elegir_clave

_RUTA = os.path.join(os.path.dirname(__file__), "..", "scripts", "completar_solicitudes_storage.py")
_spec = importlib.util.spec_from_file_location("completar_solicitudes_storage", _RUTA)
sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sc)

INF = "informes/P/Quiteca/Informes/2026-10-02/2026-1893-PC.pdf"


def test_la_solicitud_va_junto_a_su_informe():
    crear, sin, ya = sc.plan([{"nro": "2026-1893-PC", "ot": "OT-QUI0030", "carpeta": "P"}], {"P": [INF]}, elegir_clave)
    assert crear == [("OT-QUI0030", "informes/P/Quiteca/Solicitudes/2026-10-02/OT-QUI0030.pdf")]
    assert sin == [] and ya == []


def test_no_repite_la_que_ya_esta_ni_inventa_sin_informe():
    dest = "informes/P/Quiteca/Solicitudes/2026-10-02/OT-QUI0030.pdf"
    crear, _, ya = sc.plan([{"nro": "2026-1893-PC", "ot": "OT-QUI0030", "carpeta": "P"}], {"P": [INF, dest]}, elegir_clave)
    assert crear == [] and ya == ["OT-QUI0030"]
    crear, sin, _ = sc.plan([{"nro": "7777", "ot": "OT-X", "carpeta": "P"}], {"P": [INF]}, elegir_clave)
    assert crear == [] and sin == ["7777"]
