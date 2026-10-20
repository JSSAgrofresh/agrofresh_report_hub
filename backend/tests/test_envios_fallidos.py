"""Widget «Envíos que fallaron» del Panel de inicio: solo para el administrador general, y una fuente caída no tumba al resto."""
import contextlib
from datetime import datetime, timezone

from app import dashboard
from app.auth import Usuario


class _Cursor:
    def __init__(self, filas):
        self.filas = filas

    def execute(self, *a, **k):
        pass

    def fetchall(self):
        return list(self.filas)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _fila(dia, ref, error="Error SMTP al enviar correo: Connection unexpectedly closed"):
    return {"creado_en": datetime(2026, 10, dia, 12, 0, tzinfo=timezone.utc), "referencia": ref, "laboratorio": "QUITECA",
            "usuario_nombre": "Jorge", "error": error}


def _base(monkeypatch, filas_por_llamada):
    llamadas = iter(filas_por_llamada)

    @contextlib.contextmanager
    def conexion(*a, **k):
        yield object()

    def cursor(conn):
        valor = next(llamadas)
        if isinstance(valor, Exception):
            raise valor
        return _Cursor(valor)

    monkeypatch.setattr(dashboard, "conexion", conexion)
    monkeypatch.setattr(dashboard, "cursor_dict", cursor)


def test_junta_solicitudes_e_informes_con_el_mas_reciente_primero(monkeypatch):
    _base(monkeypatch, [[_fila(20, "OT-QUI0056")], [_fila(21, "Informe 2026-1885-PC")]])
    r = dashboard.envios_fallidos()
    assert [x["referencia"] for x in r] == ["Informe 2026-1885-PC", "OT-QUI0056"]
    assert [x["tipo"] for x in r] == ["Informe", "Solicitud"]
    assert r[1]["enviado_por"] == "Jorge" and r[1]["laboratorio"] == "QUITECA"


def test_el_error_se_recorta_y_sin_detalle_dice_sin_detalle(monkeypatch):
    _base(monkeypatch, [[_fila(20, "OT-1", "x" * 500), _fila(19, "OT-2", None)], []])
    r = dashboard.envios_fallidos()
    assert len(r[0]["error"]) == 200
    assert r[1]["error"] == "Sin detalle"


def test_una_fuente_caida_no_tumba_a_la_otra(monkeypatch):
    _base(monkeypatch, [RuntimeError("no existe la relación"), [_fila(21, "Informe X")]])
    assert [x["referencia"] for x in dashboard.envios_fallidos()] == ["Informe X"]


def test_solo_el_administrador_general_los_recibe(monkeypatch):
    _base(monkeypatch, [[_fila(20, "OT-1")], []])
    admin = Usuario(id="1", email="a@agrofresh.com", nombre="A", tipoAcceso="admin_general")
    assert len(dashboard.envios_fallidos_para(admin)) == 1
    for tipo in ("admin_area", "gerencia", "analista", "muestreador", "comercial", "cliente"):
        otro = Usuario(id="2", email="b@agrofresh.com", nombre="B", tipoAcceso=tipo)
        assert dashboard.envios_fallidos_para(otro) == []
