"""Historial de cargas: cada carga se registra y se puede deshacer exacta.

Pedido del usuario: poder borrar un informe de prueba desde Ingesta de Datos,
sin consola, para cargar el mismo informe las veces que haga falta.
"""
import uuid

import psycopg2.errors
import pytest

from app import ingest
from app.auth import Usuario
from app.db import conexion, cursor_dict
from app.ingest import CargaRequest, confirmar, deshacer_carga, listar_cargas
from tests.utiles_bd import hay_base

USUARIO = Usuario(id="t", email="prueba@agrofresh.cl", nombre="Prueba Cargas", tipoAcceso="admin_general")

con_base = pytest.mark.skipif(not hay_base("carga_datos"), reason="Sin base o sin la migración 0042")


@pytest.fixture
def catalogo():
    marca = uuid.uuid4().hex[:8].upper()
    cliente, planta = f"CLIENTE CARGAS {marca}", f"PLANTA CARGAS {marca}"
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("INSERT INTO cliente (nombre, activo) VALUES (%s, true) RETURNING id", (cliente,))
        cliente_id = cur.fetchone()["id"]
        cur.execute("INSERT INTO planta (cliente_id, nombre, activo) VALUES (%s, %s, true)", (cliente_id, planta))
    yield marca, cliente, planta
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud LIKE %s", (f"%{marca}%",))
        cur.execute("DELETE FROM pendiente_revision WHERE fila->>'Informe' LIKE %s", (f"%{marca}%",))
        cur.execute("DELETE FROM carga_datos WHERE archivo LIKE %s", (f"%{marca}%",))
        cur.execute("DELETE FROM notificacion WHERE creado_por = %s", (USUARIO.nombre,))
        cur.execute("DELETE FROM planta WHERE cliente_id = %s", (cliente_id,))
        cur.execute("DELETE FROM cliente WHERE id = %s", (cliente_id,))


def _fila(informe: str, sold_to: str, ship_to: str, **resultados) -> dict:
    return {"Informe": informe, "Laboratorio": "Quiteca", "Fecha de muestreo": "2026-09-20",
            "SOLD TO": sold_to, "SHIP TO": ship_to, **(resultados or {"FDL ppm": "0,52"})}


def _cargar(marca: str, filas: list[dict]) -> int:
    r = confirmar(CargaRequest(filas=filas, origen="converter", archivo=f"informe-{marca}.pdf"), USUARIO)
    return r["carga_id"]


def _carga(carga_id: int) -> dict:
    return next(c for c in listar_cargas(200)["cargas"] if c["id"] == carga_id)


def _cuenta(sql: str, *args) -> int:
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(sql, args)
        return cur.fetchone()["n"]


@con_base
def test_la_carga_queda_registrada_con_lo_que_trajo(catalogo):
    marca, cliente, planta = catalogo
    carga_id = _cargar(marca, [_fila(f"A-{marca}", cliente, planta), _fila(f"B-{marca}", cliente, "NO EXISTE")])
    c = _carga(carga_id)
    assert (c["origen"], c["archivo"], c["filas"]) == ("converter", f"informe-{marca}.pdf", 2)
    assert (c["solicitudes"], c["resultados"], c["pendientes"]) == (1, 1, 1)
    assert c["creado_por"] == "Prueba Cargas" and c["deshecha_en"] is None


@con_base
def test_deshacer_borra_solo_esa_carga(catalogo):
    marca, cliente, planta = catalogo
    otra = _cargar(marca, [_fila(f"OTRA-{marca}", cliente, planta)])
    carga_id = _cargar(marca, [_fila(f"A-{marca}", cliente, planta), _fila(f"B-{marca}", cliente, "NO EXISTE")])

    r = deshacer_carga(carga_id, USUARIO)
    assert (r["solicitudes"], r["resultados"], r["pendientes"]) == (1, 1, 1)
    assert _cuenta("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", f"A-{marca}") == 0
    assert _cuenta("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", f"OTRA-{marca}") == 1
    assert _carga(carga_id)["deshecha_en"] is not None
    assert _carga(otra)["solicitudes"] == 1

    # Deshecha una vez, no se puede de nuevo.
    with pytest.raises(ingest.HTTPException) as e:
        deshacer_carga(carga_id, USUARIO)
    assert e.value.status_code == 409


@con_base
def test_lo_que_entra_al_reintentar_sigue_siendo_de_su_carga(catalogo):
    marca, cliente, planta = catalogo
    carga_id = _cargar(marca, [_fila(f"A-{marca}", cliente, "NO EXISTE")])
    assert _carga(carga_id)["pendientes"] == 1
    # Se corrige Listados: la planta ahora existe.
    with conexion(escribir=True) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "INSERT INTO planta (cliente_id, nombre, activo) SELECT id, 'NO EXISTE', true FROM cliente WHERE nombre = %s",
            (cliente,),
        )
        cur.execute("SELECT id FROM pendiente_revision WHERE carga_id = %s", (carga_id,))
        ids = [p["id"] for p in cur.fetchall()]
        ingest._procesar_pendientes_en_chunks(cur, {"converter": ids}, saltar_catalogo=False)
    c = _carga(carga_id)
    assert (c["solicitudes"], c["pendientes"]) == (1, 0)
    deshacer_carga(carga_id, USUARIO)
    assert _cuenta("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", f"A-{marca}") == 0


@con_base
def test_no_deshace_si_otra_carga_agrego_resultados_a_sus_informes(catalogo):
    marca, cliente, planta = catalogo
    primera = _cargar(marca, [_fila(f"A-{marca}", cliente, planta, **{"FDL ppm": "0,5"})])
    segunda = _cargar(marca, [_fila(f"A-{marca}", cliente, planta, **{"IMZ ppm": "1,2"})])

    with pytest.raises(ingest.HTTPException) as e:
        deshacer_carga(primera, USUARIO)
    assert e.value.status_code == 409 and f"A-{marca}" in e.value.detail

    # La segunda solo agregó un resultado: deshacerla lo quita y deja el informe.
    r = deshacer_carga(segunda, USUARIO)
    assert (r["solicitudes"], r["resultados"]) == (0, 1)
    deshacer_carga(primera, USUARIO)
    assert _cuenta("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", f"A-{marca}") == 0


def test_sin_la_migracion_se_carga_igual_sin_registrar():
    """Entre actualizar el código y correr la 0042, cargar no puede fallar."""

    class Cursor:
        def execute(self, sql, *_a):
            self.sql = sql

        def fetchone(self):
            assert "to_regclass" in self.sql, "no debería intentar escribir en carga_datos"
            return {"hay": False}

    assert ingest.crear_carga(Cursor(), "converter", "x.pdf", 1, "alguien") is None


def test_sin_la_migracion_el_historial_dice_que_no_esta(monkeypatch):
    class Cursor:
        def execute(self, sql, *_a):
            if "to_regclass" not in sql:
                raise psycopg2.errors.UndefinedTable("no debería consultar carga_datos")

        def fetchone(self):
            return {"hay": False}

    class Ctx:
        def __init__(self, valor):
            self.valor = valor

        def __enter__(self):
            return self.valor

        def __exit__(self, *_):
            return False

    monkeypatch.setattr(ingest, "conexion", lambda *a, **k: Ctx(object()))
    monkeypatch.setattr(ingest, "cursor_dict", lambda _c: Ctx(Cursor()))
    assert listar_cargas(30) == {"disponible": False, "cargas": []}
