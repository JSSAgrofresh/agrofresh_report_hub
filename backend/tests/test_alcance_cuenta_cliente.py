"""
Qué puede tocar una cuenta de cliente, endpoint por endpoint.

Una cuenta de cliente entra a ver SUS resultados. El resto del sistema —cargar
datos, editar catálogos, las solicitudes, el padrón de cuentas— no es suyo.

Esto recorre la aplicación REAL con una sesión de cliente de verdad y exige un
403 en todo lo que no esté en la lista de abajo. Abrir algo sin querer —un
router nuevo puesto en el grupo equivocado, un `dependencies` que se olvida—
hace fallar esto, que es exactamente para lo que existe.

Necesita Postgres con el esquema aplicado.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not hay_base("usuario"), reason="sin Postgres con el esquema aplicado"
)

CLAVE = "ZZ-clave-de-prueba-larga"

# Lo que una cuenta de cliente SÍ puede pedir, y por qué. Todo lo demás le
# responde 403.
#
# Los prefijos con "*" cubren un grupo entero.
PERMITIDOS = (
    # Su reporte. Adentro, cada consulta se acota a su propio cliente: eso lo
    # cubre test_alcance_datos.py, no esto.
    "/api/reportes*",
    # Los desplegables de Especie y Variedad de ese reporte. Son nombres de
    # fruta -"Cerezas", "Bing"-: no hay nada de ningún cliente en ellos, y sin
    # esto los filtros de su propio reporte salen vacíos.
    "GET /api/listados/{tipo}",
    # Su propia sesión.
    "/api/auth*",
    # Abierta para cualquiera, con o sin sesión: solo dice si el sistema está
    # vivo. No cuenta nada de nadie.
    "GET /api/salud",
)


def _permitido(metodo: str, camino: str) -> bool:
    for regla in PERMITIDOS:
        if " " in regla:
            m, patron = regla.split(" ", 1)
            if m == metodo and camino == patron:
                return True
        elif camino.startswith(regla.rstrip("*")):
            return True
    return False


def _rutas():
    """Del esquema OpenAPI y no de `app.routes`: esta versión de FastAPI
    envuelve lo que entra por `include_router`, así que `app.routes` no las
    enumera y una prueba escrita sobre esa lista pasaría sin revisar nada."""
    for camino, metodos in app.openapi()["paths"].items():
        if not camino.startswith("/api"):
            continue
        for metodo in metodos:
            if metodo.upper() not in {"HEAD", "OPTIONS"}:
                yield metodo.upper(), camino


TODAS = sorted(set(_rutas()))
CERRADAS = [(m, c) for m, c in TODAS if not _permitido(m, c)]


@pytest.fixture(scope="module")
def cuenta_cliente():
    """Una cuenta de cliente de verdad, creada y deshecha acá mismo."""
    from app import seguridad
    from app.db import conexion, cursor_dict

    email = "zz-alcance-cliente@zz-test.cl"
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM usuario WHERE email = %s", (email,))
        cur.execute("DELETE FROM cliente WHERE nombre = %s", ("ZZ-ALCANCE",))
        cur.execute("INSERT INTO cliente (nombre) VALUES ('ZZ-ALCANCE')")
        cur.execute(
            "INSERT INTO usuario (email, nombre, tipo_acceso, cliente_nombre, password_hash)"
            " VALUES (%s, 'ZZ Cliente', 'cliente', 'ZZ-ALCANCE', %s)",
            (email, seguridad.hashear_password(CLAVE)),
        )
    yield email
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "DELETE FROM sesion WHERE usuario_id IN (SELECT id FROM usuario WHERE email = %s)",
            (email,),
        )
        cur.execute("DELETE FROM usuario WHERE email = %s", (email,))
        cur.execute("DELETE FROM cliente WHERE nombre = 'ZZ-ALCANCE'")


@pytest.fixture(scope="module")
def sesion(cuenta_cliente):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": cuenta_cliente, "password": CLAVE})
    assert r.status_code == 200, r.text
    return c, {"Authorization": f"Bearer {r.json()['token']}"}


def test_hay_endpoints_que_revisar():
    """Si la introspección deja de encontrar rutas, el resto pasaría sin
    probar nada."""
    assert len(CERRADAS) > 50, f"solo se encontraron {len(CERRADAS)} rutas cerradas"


@pytest.mark.parametrize("metodo,camino", CERRADAS)
def test_una_cuenta_de_cliente_no_entra_a_lo_que_no_es_suyo(metodo, camino, sesion):
    c, cabeceras = sesion
    url = camino.replace("{", "").replace("}", "")
    r = c.request(metodo, url, json={}, headers=cabeceras)
    assert r.status_code == 403, (
        f"{metodo} {camino} contestó {r.status_code} a una cuenta de cliente. "
        "Si tiene que estar abierto, agrégalo a PERMITIDOS con su motivo."
    )


def test_el_cliente_sí_puede_leer_especies_y_variedades(sesion):
    """El caso que motivó esto: los desplegables de su propio reporte salían
    vacíos porque el listado le respondía 403."""
    c, cabeceras = sesion

    for tipo in ("especie", "variedad"):
        r = c.get(f"/api/listados/{tipo}", headers=cabeceras)
        assert r.status_code == 200, f"{tipo}: {r.status_code} {r.text[:120]}"
        assert isinstance(r.json(), list)


def test_pero_no_puede_tocarlos(sesion):
    """Leer no es escribir: sigue sin poder crear, editar ni borrar valores."""
    c, cabeceras = sesion

    assert c.post("/api/listados/especie", json={"valor": "ZZ"}, headers=cabeceras).status_code == 403
    assert c.put("/api/listados/especie/1", json={"valor": "ZZ"}, headers=cabeceras).status_code == 403
    assert c.delete("/api/listados/especie/1", headers=cabeceras).status_code == 403


def test_ni_exportar_el_maestro_completo(sesion):
    """El export trae los listados enteros en un Excel: es una salida de datos
    y no tiene por qué estar del lado del cliente."""
    c, cabeceras = sesion

    assert c.get("/api/listados/exportar", headers=cabeceras).status_code == 403
