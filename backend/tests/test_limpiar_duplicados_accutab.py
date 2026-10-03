"""Limpieza de los duplicados que dejo la ingesta de correos AccuTab."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.limpiar_duplicados_accutab import (  # noqa: E402
    base_y_numero, duplicados_locales, duplicados_r2,
)

P = "accutab/mail/"


def test_base_y_numero():
    assert base_y_numero("AGROFRESH_DEMO") == ("AGROFRESH_DEMO", 1)
    assert base_y_numero("AGROFRESH_DEMO (583)") == ("AGROFRESH_DEMO", 583)


def test_r2_deja_la_mas_baja_de_cada_contenido():
    objetos = [
        (P + "AGROFRESH_DEMO/datos.csv", "e1"),
        (P + "AGROFRESH_DEMO (2)/datos.csv", "e2"),   # otro correo
        (P + "AGROFRESH_DEMO (3)/datos.csv", "e1"),   # copia del primero
        (P + "AGROFRESH_DEMO (10)/datos.csv", "e2"),  # copia del segundo
        (P + "AGROFRESH_DEMO (4)/datos.csv", "e2"),
    ]
    assert duplicados_r2(objetos) == ["AGROFRESH_DEMO (3)", "AGROFRESH_DEMO (4)", "AGROFRESH_DEMO (10)"]


def test_r2_no_toca_contenido_distinto_ni_otro_asunto():
    objetos = [
        (P + "EQUIPO A/datos.csv", "e1"),
        (P + "EQUIPO B/datos.csv", "e1"),          # mismo contenido, otro asunto
        (P + "EQUIPO A (2)/datos.csv", "e1"),
        (P + "EQUIPO A (2)/otro.csv", "e9"),       # tiene un archivo de mas
        (P + "VACIA/", ""),
        (P + "VACIA (2)/", ""),
    ]
    assert duplicados_r2(objetos) == []


def test_locales_deja_el_mas_antiguo_y_no_toca_trace():
    filas = [{"ts": 1, "ph": 7.0, "mv": 600}]
    otras = [{"ts": 2, "ph": 7.0, "mv": 600}]
    registros = {
        "2026-10-01_13-45-47": {"origen": "email", "equipo": "AGROFRESH_DEMO", "filas": filas},
        "2026-10-01_13-46-10": {"origen": "email", "equipo": "AGROFRESH_DEMO", "filas": filas},
        "2026-10-01_13-46-11": {"origen": "email", "equipo": "AGROFRESH_DEMO", "filas": otras},
        "2026-10-01_14-00-00": {"origen": "email", "equipo": "AGROFRESH_DEMO", "filas": otras},
        "2026-10-01_15-00-00": {"equipo": "AGROFRESH_DEMO", "filas": filas},  # guardado desde Trace
        "2026-10-01_15-00-01": {"equipo": "AGROFRESH_DEMO", "filas": filas},
    }
    assert duplicados_locales(registros) == ["2026-10-01_13-46-10", "2026-10-01_14-00-00"]
