"""
El backend no puede caerse porque falte la base de zonas horarias.

Pasó de verdad: en Windows `zoneinfo` no trae las zonas -las saca del paquete
`tzdata`, que en Linux viene del sistema operativo-, y un ZoneInfo a nivel de
módulo tumbó el arranque entero con un ZoneInfoNotFoundError. Un dato de
fecha en un listado no justifica dejar el sistema abajo.

No necesita Postgres.
"""
from __future__ import annotations

import os
import sys
from zoneinfo import ZoneInfoNotFoundError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import emitir  # noqa: E402


def _sin_base_de_zonas(monkeypatch):
    """Deja el módulo como un Windows recién instalado, sin tzdata."""
    def revienta(_clave):
        raise ZoneInfoNotFoundError("No time zone found with key America/Santiago")

    monkeypatch.setattr(emitir, "ZoneInfo", revienta)


def test_sin_tzdata_no_revienta_el_arranque(monkeypatch, caplog):
    _sin_base_de_zonas(monkeypatch)

    assert emitir._zona_laboratorio() is None
    assert "tzdata" in caplog.text, "tiene que quedar dicho por qué, no fallar en silencio"


def test_sin_tzdata_la_recepcion_sigue_teniendo_fecha_y_hora(monkeypatch):
    """El respaldo es la hora local del equipo. En el servidor del laboratorio
    esa hora ES la de Rancagua, así que el dato sigue siendo correcto."""
    monkeypatch.setattr(emitir, "ZONA_LABORATORIO", None)

    fecha, hora = emitir._partir_recepcion("2026-09-01T23:30:00+00:00")

    assert fecha and hora
    assert len(fecha) == 10 and len(hora) == 5


def test_con_tzdata_convierte_a_hora_de_chile(monkeypatch):
    """Lo que de verdad importa: 23:30 UTC es todavía el día 1 en Rancagua.
    Sin convertir, esa muestra aparecería recibida al día siguiente."""
    monkeypatch.setattr(emitir, "ZONA_LABORATORIO", emitir._zona_laboratorio())

    fecha, hora = emitir._partir_recepcion("2026-09-01T23:30:00+00:00")

    assert fecha == "2026-09-01"
    assert hora == "19:30"


def test_un_instante_ilegible_no_inventa_una_fecha(monkeypatch):
    """Antes que mostrar una recepción equivocada, mejor no mostrar ninguna."""
    assert emitir._partir_recepcion("no es una fecha") == (None, None)
    assert emitir._partir_recepcion(None) == (None, None)
    assert emitir._partir_recepcion("") == (None, None)
