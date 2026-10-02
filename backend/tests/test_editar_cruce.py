"""Corregir un cruce ya hecho (peso, N° de muestra, foto), sin base real."""
from contextlib import contextmanager

import pytest

from app import indice_solicitudes as ind


class _Cur:
    def __init__(self, respuestas):
        self.respuestas = list(respuestas)
        self.sql: list[tuple[str, tuple]] = []

    def execute(self, sql, params=()):
        self.sql.append((" ".join(sql.split()), params))

    def fetchone(self):
        return self.respuestas.pop(0) if self.respuestas else None


@pytest.fixture
def cursor(monkeypatch):
    def preparar(*respuestas):
        cur = _Cur(respuestas)

        @contextmanager
        def conexion(escribir=True):
            yield object()

        @contextmanager
        def cursor_dict(_conn):
            yield cur

        monkeypatch.setattr(ind, "conexion", conexion)
        monkeypatch.setattr(ind, "cursor_dict", cursor_dict)
        return cur

    return preparar


ANTES = {"codigo_muestra": "AGF0007", "peso_muestra": 10.0, "unidad_peso": "kg", "datos": {"numero_solicitud": "OT-AGF0077"}}


def test_corrige_peso_y_deja_el_antes(cursor):
    cur = cursor(ANTES, None)
    previo = ind.editar_cruce("a.xlsx", " AGF0007 ", 1.0, "kg", "u@x.cl", "U")
    assert previo == {"codigo_muestra": "AGF0007", "peso_muestra": 10.0, "unidad_peso": "kg"}
    update = next(p for s, p in cur.sql if s.startswith("UPDATE solicitud_archivo"))
    assert update == ("AGF0007", 1.0, "kg", "a.xlsx")
    assert not any("cruce_foto" in s for s, _ in cur.sql)
    log = next(p for s, p in cur.sql if "INSERT INTO lab_actividad" in s)
    assert log[0] == "edicion_cruce"
    assert log[10].adapted["antes"]["peso_muestra"] == 10.0 and log[10].adapted["foto_cambiada"] is False


def test_con_foto_nueva_reemplaza_la_activa(cursor):
    cur = cursor(ANTES, None)
    ind.editar_cruce("a.xlsx", "AGF0007", 1.0, "kg", "u@x.cl", "U", foto={"r2_key": "cruces/x.jpg", "content_type": "image/jpeg"})
    sentencias = [s for s, _ in cur.sql]
    assert any(s.startswith("UPDATE cruce_foto SET activa = false") for s in sentencias)
    assert any(s.startswith("INSERT INTO cruce_foto") for s in sentencias)


def test_sin_cruce_no_se_edita(cursor):
    cursor({**ANTES, "codigo_muestra": None})
    with pytest.raises(ind.SinCruce):
        ind.editar_cruce("a.xlsx", "AGF0007", 1.0, "kg", "u@x.cl", "U")


def test_codigo_repetido_en_otra_solicitud(cursor):
    cursor(ANTES, {"archivo": "otra.xlsx"})
    with pytest.raises(ind.MuestraYaUsada):
        ind.editar_cruce("a.xlsx", "AGF0009", 1.0, "kg", "u@x.cl", "U")


def test_solicitud_inexistente(cursor):
    cursor(None)
    with pytest.raises(KeyError):
        ind.editar_cruce("a.xlsx", "AGF0007", 1.0, "kg", "u@x.cl", "U")


def test_codigo_vacio():
    with pytest.raises(ValueError):
        ind.editar_cruce("a.xlsx", "  ", 1.0, "kg", "u@x.cl", "U")
