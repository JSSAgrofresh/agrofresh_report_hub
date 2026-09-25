"""/ingest/confirmar -lo que usa el Converter- inserta en la base.

Antes dejaba TODO en pendiente_revision como una "copia de trabajo" que ya no
se podía promover desde ninguna pantalla, y se negaba a cargar (409) mientras
quedara una sola fila ahí: un informe del Converter nunca llegaba al Report.
"""
import uuid

import pytest

from app.auth import Usuario
from app.db import conexion, cursor_dict
from app.ingest import CargaRequest, confirmar
from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(not hay_base("pendiente_revision"), reason="Sin base de datos")

USUARIO = Usuario(id="t", email="prueba@agrofresh.cl", nombre="Prueba", tipoAcceso="admin_general")


@pytest.fixture
def catalogo():
    """Un cliente y una planta propios de la prueba, borrados al terminar."""
    marca = uuid.uuid4().hex[:8].upper()
    cliente, planta = f"CLIENTE PRUEBA {marca}", f"PLANTA PRUEBA {marca}"
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("INSERT INTO cliente (nombre, activo) VALUES (%s, true) RETURNING id", (cliente,))
        cliente_id = cur.fetchone()["id"]
        cur.execute("INSERT INTO planta (cliente_id, nombre, activo) VALUES (%s, %s, true)", (cliente_id, planta))
    yield marca, cliente, planta
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud LIKE %s", (f"%{marca}%",))
        cur.execute("DELETE FROM pendiente_revision WHERE fila->>'Informe' LIKE %s", (f"%{marca}%",))
        cur.execute("DELETE FROM notificacion WHERE resumen LIKE %s", ("%Prueba cargó%",))
        cur.execute("DELETE FROM planta WHERE cliente_id = %s", (cliente_id,))
        cur.execute("DELETE FROM cliente WHERE id = %s", (cliente_id,))


def _fila(informe: str, sold_to: str, ship_to: str) -> dict:
    # Mismas columnas que arma filaCruda() en converter.html.
    return {
        "Informe": informe,
        "Laboratorio": "Quiteca",
        "Fecha de muestreo": "2026-09-20",
        "SOLD TO": sold_to,
        "SHIP TO": ship_to,
        "FDL ppm": "0,52",
    }


def test_inserta_lo_que_calza_y_deja_pendiente_lo_que_no(catalogo):
    marca, cliente, planta = catalogo
    bueno, malo = f"CONV-{marca}-1", f"CONV-{marca}-2"
    r = confirmar(
        CargaRequest(
            filas=[_fila(bueno, cliente, planta), _fila(malo, cliente, "PLANTA QUE NO EXISTE")], origen="converter"
        ),
        USUARIO,
    )
    assert r["resumen"]["solicitudes_nuevas"] == 1
    assert r["resumen"]["pendientes_revision"] == 1

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT s.ship_to_raw, s.planta_id, s.origen, "
            "(SELECT count(*) FROM resultado r WHERE r.solicitud_id = s.id) AS resultados "
            "FROM solicitud s WHERE nro_solicitud = %s",
            (bueno,),
        )
        s = cur.fetchone()
        cur.execute("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", (malo,))
        assert cur.fetchone()["n"] == 0
    assert s["ship_to_raw"] == planta and s["planta_id"] is not None
    assert s["origen"] == "converter" and s["resultados"] == 1


def test_una_fila_pendiente_ya_no_bloquea_la_siguiente_carga(catalogo):
    marca, cliente, planta = catalogo
    confirmar(CargaRequest(filas=[_fila(f"CONV-{marca}-3", cliente, "NO EXISTE")], origen="converter"), USUARIO)
    r = confirmar(CargaRequest(filas=[_fila(f"CONV-{marca}-4", cliente, planta)], origen="converter"), USUARIO)
    assert r["resumen"]["solicitudes_nuevas"] == 1
