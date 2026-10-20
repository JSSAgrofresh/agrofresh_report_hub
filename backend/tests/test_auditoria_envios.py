"""Auditoría de informes enviados a clientes: junta los envíos reales, los de prueba y los marcados a mano."""
import contextlib
from datetime import datetime, timezone

from app import auditoria_envios


def _envio(i, modo="produccion", exitoso=True, dia=20, **extra):
    base = {
        "id": i, "creado_en": datetime(2026, 10, dia, 12, 0, tzinfo=timezone.utc), "usuario_nombre": "Paz", "usuario_email": "paz@agrofresh.com",
        "modo": modo, "laboratorio": "AGROFRESH", "sold_to": "DOLE", "ship_to": "DOLE LONTUE", "especie": "Cereza", "asunto": "Informe AGF-0075",
        "para": ["cliente@dole.cl"], "enviado_to": ["cliente@dole.cl"], "enviado_cc": [], "enviado_bcc": ["jorge@agrofresh.com"],
        "exitoso": exitoso, "error": None, "archivo_solicitud": "OT-AGF0075.xlsx", "numero_solicitud": "OT-AGF0075",
    }
    return {**base, **extra}


def _manual(archivo="OT-QUI0025.xlsx", dia=19, origen="converter"):
    return {
        "archivo": archivo, "enviado_en": datetime(2026, 10, dia, 9, 0, tzinfo=timezone.utc), "marcado_por": "Jorge", "origen": origen,
        "numero_solicitud": "OT-QUI0025", "laboratorio": "QUITECA", "sold_to": "DOLE", "ship_to": "DOLE CODEGUA", "especie": "Cereza",
    }


def test_un_envio_de_produccion_es_real_y_uno_de_prueba_es_prueba():
    real = auditoria_envios.fila_de_envio(_envio(1))
    prueba = auditoria_envios.fila_de_envio(_envio(2, modo="prueba", para=["cliente@dole.cl"], enviado_to=["paz@agrofresh.com"], enviado_bcc=[]))
    assert real["tipo"] == "real" and real["exitoso"] is True and real["solicitud"] == "OT-AGF0075"
    assert prueba["tipo"] == "prueba"
    # En prueba se pidió a un cliente pero salió a Paz: la auditoría muestra las dos cosas.
    assert prueba["pedido_a"] == ["cliente@dole.cl"] and prueba["enviado_a"] == ["paz@agrofresh.com"]


def test_a_quien_salio_junta_para_cc_y_cco_sin_repetir():
    f = auditoria_envios.fila_de_envio(_envio(1, enviado_to=["A@x.cl"], enviado_cc=["a@x.cl", "b@x.cl"], enviado_bcc=["B@x.cl", "c@x.cl"]))
    assert f["enviado_a"] == ["A@x.cl", "b@x.cl", "c@x.cl"]


def test_un_envio_fallido_conserva_su_error():
    f = auditoria_envios.fila_de_envio(_envio(1, exitoso=False, error="Error SMTP: Connection unexpectedly closed"))
    assert f["exitoso"] is False and "Connection" in f["error"]


def test_lo_marcado_a_mano_no_trae_destinatarios_pero_si_quien_lo_marco():
    f = auditoria_envios.fila_manual(_manual())
    assert f["tipo"] == "manual" and f["enviado_por"] == "Jorge" and f["origen"] == "Converter"
    assert f["pedido_a"] == [] and f["enviado_a"] == [] and f["solicitud"] == "OT-QUI0025"
    assert auditoria_envios.fila_manual(_manual(origen="solicitudes"))["origen"] == "Solicitudes e informes"


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


def _base(monkeypatch, respuestas):
    siguiente = iter(respuestas)

    @contextlib.contextmanager
    def conexion(*a, **k):
        yield object()

    def cursor(conn):
        valor = next(siguiente)
        if isinstance(valor, Exception):
            raise valor
        return _Cursor(valor)

    monkeypatch.setattr(auditoria_envios, "conexion", conexion)
    monkeypatch.setattr(auditoria_envios, "cursor_dict", cursor)


def test_la_lista_mezcla_las_dos_fuentes_con_lo_mas_reciente_primero(monkeypatch):
    _base(monkeypatch, [[_envio(1, dia=18), _envio(2, dia=21)], [_manual(dia=20)]])
    r = auditoria_envios.listar_envios()
    assert [x["tipo"] for x in r] == ["real", "manual", "real"]
    assert [x["fecha"][:10] for x in r] == ["2026-10-21", "2026-10-20", "2026-10-18"]


def test_sin_la_migracion_0054_cae_a_la_consulta_sin_solicitud(monkeypatch):
    sin_solicitud = _envio(1, archivo_solicitud=None, numero_solicitud=None)
    _base(monkeypatch, [RuntimeError("no existe la columna archivo_solicitud"), [sin_solicitud], []])
    r = auditoria_envios.listar_envios()
    assert len(r) == 1 and r[0]["solicitud"] is None


def test_una_fuente_caida_no_tumba_a_la_otra(monkeypatch):
    _base(monkeypatch, [RuntimeError("tabla"), RuntimeError("tabla"), [_manual()]])
    r = auditoria_envios.listar_envios()
    assert [x["tipo"] for x in r] == ["manual"]
