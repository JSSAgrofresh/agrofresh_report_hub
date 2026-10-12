"""«Reporte observado»: solo las cuentas de cliente quedan anotadas, y anotar nunca falla."""
from app import informe_visto
from app.auth import Usuario


def _u(tipo: str) -> Usuario:
    return Usuario(id="1", email="c@dole.cl", nombre="C", tipoAcceso=tipo, clienteNombre="DOLE", plantaNombre=None)


def test_el_personal_interno_no_cuenta_como_cliente(monkeypatch):
    llamadas = []
    monkeypatch.setattr(informe_visto, "conexion", lambda **k: llamadas.append(k))
    for tipo in ("admin_general", "gerencia", "admin_area"):
        informe_visto.registrar(_u(tipo), [1, 2])
    assert llamadas == []


def test_sin_solicitudes_no_toca_la_base(monkeypatch):
    llamadas = []
    monkeypatch.setattr(informe_visto, "conexion", lambda **k: llamadas.append(k))
    informe_visto.registrar(_u("cliente"), [None])
    assert llamadas == []


def test_si_la_base_falla_no_lanza(monkeypatch):
    def rota(**_):
        raise RuntimeError("sin base")

    monkeypatch.setattr(informe_visto, "conexion", rota)
    informe_visto.registrar(_u("cliente"), [1])  # no debe lanzar
