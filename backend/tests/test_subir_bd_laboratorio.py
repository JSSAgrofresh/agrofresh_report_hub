"""
«Subir a la base de datos» (Ingreso al laboratorio) tiene que guardar la
solicitud y buscar sus analitos con el laboratorio tal como está en la base:
`Agrofresh`. El catálogo de analitos solo tiene `Agrofresh` y `Quiteca`; con
otro nombre el analito no se encuentra y el resultado queda sin enlazar
(`analito_raw`) o cae en el catálogo de otro laboratorio.

No necesita Postgres: el cursor es simulado y solo anota lo que se le pide.
"""
from __future__ import annotations

import os
import sys
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import emitir  # noqa: E402


class _CursorFalso:
    def __init__(self):
        self.consultas: list[tuple[str, tuple]] = []
        self._ultima = ""

    def execute(self, sql, params=()):
        self._ultima = " ".join(sql.split())
        self.consultas.append((self._ultima, tuple(params)))

    def fetchone(self):
        q = self._ultima
        if "FROM solicitud WHERE referencia" in q:
            return None                      # todavía no se había subido
        if "FROM cliente" in q:
            return {"id": 1}
        if "FROM planta" in q:
            return {"id": 2}
        if "RETURNING siguiente" in q:
            return {"siguiente": 2}
        if "INSERT INTO solicitud" in q:
            return {"id": 10}
        if "FROM analito" in q:
            return {"id": 99}
        return None


def _subir(monkeypatch) -> _CursorFalso:
    cur = _CursorFalso()

    @contextmanager
    def conexion(escribir=False):
        yield object()

    @contextmanager
    def cursor_dict(_conn):
        yield cur

    monkeypatch.setattr(emitir, "conexion", conexion)
    monkeypatch.setattr(emitir, "cursor_dict", cursor_dict)
    fila = emitir.FilaCruceIn(
        campos={
            "N° Solicitud": "OT-AGF0050",
            "Sold To (Nombre)": "SOCIEDAD AGRICOLA EL PORVENIR SA",
            "Ship To (Nombre)": "EL PORVENIR (VERFRUT) PLANTA RAPEL",
            "Fecha Muestreo": "24-09-2026",
        },
        analitos_solicitados=["FDL", "IMZ"],
        resultados_por_codigo={"FDL": 1.47, "IMZ": 1.32},
        codigo_vial="GCNPD1",
    )
    emitir.subir_bd([fila])
    return cur


def test_busca_los_analitos_bajo_el_laboratorio_de_la_base(monkeypatch):
    cur = _subir(monkeypatch)

    busquedas = [p for q, p in cur.consultas if "FROM analito" in q]
    assert busquedas == [("FDL", "Agrofresh"), ("IMZ", "Agrofresh")]


def test_la_solicitud_se_guarda_con_ese_mismo_laboratorio(monkeypatch):
    cur = _subir(monkeypatch)

    insert = next((q, p) for q, p in cur.consultas if q.startswith("INSERT INTO solicitud"))
    columnas = [c.strip() for c in insert[0].split("(", 1)[1].split(")", 1)[0].split(",")]
    assert insert[1][columnas.index("laboratorio")] == "Agrofresh"
