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
