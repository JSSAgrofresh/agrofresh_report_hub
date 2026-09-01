"""
El sistema tiene que funcionar entre actualizar el código y correr la migración.

Actualizar son dos pasos separados y en ese orden: primero `git pull` y
reiniciar, después `python scripts/migrar.py 0020`. En medio, la tabla del
índice todavía no existe.

La primera versión de esto no lo contemplaba: en esa ventana, abrir Toma de
muestras daba error 500 y crear una solicitud fallaba. La red de seguridad
cubría "el índice está vacío" pero no "el índice no existe".

Estas pruebas no necesitan base de datos: usan una conexión que se comporta
como un Postgres al que le falta la tabla, que es exactamente la situación.
"""
import psycopg2.errors
import pytest

from app import emitir
from app import indice_solicitudes as indice


@pytest.fixture
def sin_tabla(monkeypatch):
    """Cualquier consulta responde "no existe la tabla", como haría Postgres
    con la migración sin correr."""

    class CursorFalso:
        def execute(self, *_a, **_k):
            raise psycopg2.errors.UndefinedTable('relation "solicitud_archivo" does not exist')

    class ContextoFalso:
        def __enter__(self):
            return CursorFalso() if self.es_cursor else object()

        def __exit__(self, *_):
            return False

        def __init__(self, es_cursor):
            self.es_cursor = es_cursor

    monkeypatch.setattr(indice, "conexion", lambda *a, **k: ContextoFalso(False))
    monkeypatch.setattr(indice, "cursor_dict", lambda _c: ContextoFalso(True))


def test_esta_poblado_dice_que_no(sin_tabla):
    """De acá cuelga todo: si en vez de False levantara la excepción, los
    listados quedarían en 500."""
    assert indice.esta_poblado() is False


def test_anotar_no_falla(sin_tabla):
    """Crear una solicitud no puede fallar por un índice que aún no está: el
    archivo ya quedó guardado, y la fila la pone el script después."""
    indice.anotar("OT-0001.xlsx", {"numero_solicitud": "OT-0001"})


def test_olvidar_no_falla(sin_tabla):
    indice.olvidar_archivo("OT-0001.xlsx")


def test_otros_errores_de_base_si_salen_a_la_luz(monkeypatch):
    """Solo se tapa "no existe la tabla". Un problema de verdad -la base
    caída, una columna que falta- tiene que verse, no quedar escondido
    detrás de una lectura silenciosa de los archivos."""

    def explotar(*_a, **_k):
        raise psycopg2.OperationalError("conexión rechazada")

    monkeypatch.setattr(indice, "conexion", explotar)
    with pytest.raises(psycopg2.OperationalError):
        indice.esta_poblado()


# ── La misma ventana, ahora con la columna `incluir_analista` (0022) ──
#
# Pasó de verdad: con el código nuevo y la migración sin correr, generar el
# informe respondía 500 con "no existe la columna «incluir_analista»". El
# usuario ve "No se pudieron generar los informes PDF" y no tiene cómo saber
# que le falta un comando.


FILA_SIN_COLUMNA = {
    "analizado_por_nombre": "Ana Lab",
    "analizado_por_cargo": "Analista de Laboratorio",
    "aprobado_por_nombre": "Marcela Jefa",
    "aprobado_por_cargo": "Jefe(a) Laboratorio de Cromatografía",
}


@pytest.fixture
def sin_columna(monkeypatch):
    """Postgres responde "no existe la columna" a la consulta que la pide, y
    contesta normal a la que no. Es exactamente la 0022 sin correr."""
    intentos = []

    class CursorFalso:
        def execute(self, sql, _params=None):
            intentos.append(sql)
            if "incluir_analista" in sql:
                raise psycopg2.errors.UndefinedColumn(
                    'column "incluir_analista" does not exist'
                )

        def fetchone(self):
            return dict(FILA_SIN_COLUMNA)

    class ContextoFalso:
        def __init__(self, es_cursor):
            self.es_cursor = es_cursor

        def __enter__(self):
            return CursorFalso() if self.es_cursor else object()

        def __exit__(self, *_):
            return False

    monkeypatch.setattr(emitir, "conexion", lambda *a, **k: ContextoFalso(False))
    monkeypatch.setattr(emitir, "cursor_dict", lambda _c: ContextoFalso(True))
    return intentos


def test_leer_la_config_sin_la_columna_no_falla(sin_columna):
    """Y el informe sale como salía antes: con las dos firmas."""
    config = emitir.leer_config_informe()

    assert config["aprobado_por_nombre"] == "Marcela Jefa"
    assert config["incluir_analista"] is True


def test_reintenta_en_una_conexion_nueva(sin_columna):
    """Postgres aborta la transacción al fallar la consulta: reintentar en el
    mismo cursor daría InFailedSqlTransaction. Tienen que ser dos consultas,
    y la segunda sin la columna."""
    emitir.leer_config_informe()

    assert len(sin_columna) == 2
    assert "incluir_analista" in sin_columna[0]
    assert "incluir_analista" not in sin_columna[1]


def test_guardar_la_config_sin_la_columna_conserva_las_firmas(sin_columna):
    """Lo que el usuario acaba de escribir no se puede perder solo porque
    falte una columna que ni siquiera está editando."""
    guardada = emitir.guardar_config_informe(
        emitir.InformeConfigOut(**FILA_SIN_COLUMNA, incluir_analista=False)
    )

    assert guardada.aprobado_por_nombre == "Marcela Jefa"
    assert guardada.incluir_analista is True


def test_una_columna_que_falta_de_verdad_si_sale_a_la_luz(monkeypatch):
    """Solo se tapa `incluir_analista`. Si faltara otra, es un problema real
    y tiene que verse."""

    class CursorFalso:
        def execute(self, *_a, **_k):
            raise psycopg2.errors.UndefinedColumn('column "aprobado_por_cargo" does not exist')

        def fetchone(self):
            return {}

    class ContextoFalso:
        def __init__(self, es_cursor):
            self.es_cursor = es_cursor

        def __enter__(self):
            return CursorFalso() if self.es_cursor else object()

        def __exit__(self, *_):
            return False

    monkeypatch.setattr(emitir, "conexion", lambda *a, **k: ContextoFalso(False))
    monkeypatch.setattr(emitir, "cursor_dict", lambda _c: ContextoFalso(True))

    with pytest.raises(psycopg2.errors.UndefinedColumn):
        emitir.leer_config_informe()
