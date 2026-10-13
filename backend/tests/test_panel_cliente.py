"""Cifras del Panel general de un cliente: solo de SU planta, sacadas de la sesión y no de lo que pida el navegador."""
from contextlib import contextmanager
from datetime import date

from app import reportes
from app.auth import Usuario


class _Cursor:
    def __init__(self):
        self.consultas: list[tuple[str, dict]] = []
        self._ultima = ""

    def execute(self, sql, params=None):
        self.consultas.append((sql, dict(params or {})))
        self._ultima = sql

    def fetchone(self):
        if "count(DISTINCT COALESCE(a.codigo" in self._ultima:
            return {"mediciones": 40, "analitos": 5}
        if "AS recientes" in self._ultima:
            return {"informes": 12, "recientes": 3, "especies": 2}
        if "LIMIT 1" in self._ultima:
            return {"nro_solicitud": "2026-1885-PC", "referencia": "OT-QUI0025", "laboratorio": "Quiteca",
                    "especie": "Cereza", "variedad": "Lapins", "fecha": date(2026, 10, 8)}
        return None

    def fetchall(self):
        if "GROUP BY 1\n" in self._ultima and "to_char" in self._ultima:
            return [{"mes": "2026-10", "n": 4}]
        if "s.especie" in self._ultima:
            return [{"nombre": "Cereza", "n": 9}]
        return [{"nombre": "Fludioxonil", "n": 7}]

    def rollback(self):
        pass


def _llamar(monkeypatch, usuario):
    cur = _Cursor()

    @contextmanager
    def conexion(escribir=True):
        yield object()

    @contextmanager
    def cursor_dict(_conn):
        yield cur

    monkeypatch.setattr(reportes, "conexion", conexion)
    monkeypatch.setattr(reportes, "cursor_dict", cursor_dict)
    return reportes.panel_cliente(usuario), cur


def _cliente(planta=None):
    return Usuario(id="1", email="x@dole.cl", nombre="Dole", tipoAcceso="cliente",
                   clienteNombre="DOLE CHILE S.A.", plantaNombre=planta)


def test_las_cifras_salen_de_sus_datos(monkeypatch):
    r, _ = _llamar(monkeypatch, _cliente("DOLE PLANTA CODEGUA"))
    assert (r["informes"], r["ultimos_30_dias"], r["especies"]) == (12, 3, 2)
    assert (r["mediciones"], r["analitos"]) == (40, 5)
    assert r["ultimo"]["informe"] == "2026-1885-PC" and r["ultimo"]["fecha"] == "2026-10-08"
    assert len(r["por_mes"]) == 12 and r["por_mes"][-1]["dia"] == f"{date.today():%Y-%m}"
    assert r["por_especie"] == [{"nombre": "Cereza", "n": 9}]
    assert r["por_analito"] == [{"nombre": "Fludioxonil", "n": 7}]


def test_toda_consulta_lleva_el_filtro_de_su_planta(monkeypatch):
    _, cur = _llamar(monkeypatch, _cliente("DOLE PLANTA CODEGUA"))
    assert cur.consultas
    for sql, params in cur.consultas:
        assert "= %(planta)s" in sql and "= %(cliente)s" in sql
        assert params["planta"] == "DOLE PLANTA CODEGUA" and params["cliente"] == "DOLE CHILE S.A."


def test_los_meses_van_del_mas_antiguo_al_actual():
    assert reportes._meses_recientes(date(2026, 2, 10), 4) == ["2025-11", "2025-12", "2026-01", "2026-02"]
