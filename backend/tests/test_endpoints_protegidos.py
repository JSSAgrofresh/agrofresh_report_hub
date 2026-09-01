"""
Que la API esté cerrada, de verdad.

Antes de la autenticación, los 131 endpoints respondían a cualquiera que
supiera su URL: `curl` sin credenciales bastaba para leer los resultados de
todos los clientes o para borrar solicitudes.

Estas pruebas recorren la aplicación REAL, endpoint por endpoint, y exigen
que ninguno conteste sin sesión. Un router nuevo que alguien agregue sin
protección hace fallar esto, que es exactamente para lo que existe.

No tocan la base: un 401 se decide antes de abrir ninguna conexión.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.utiles_bd import hay_base

cliente = TestClient(app)


# Rechazar un token INVENTADO obliga a ir a buscarlo a la tabla `usuario`;
# rechazar la FALTA de token, no. Por eso la primera prueba necesita Postgres
# con el esquema aplicado y la segunda corre en cualquier parte — y la que de
# verdad cierra la puerta es la segunda.
necesita_base = pytest.mark.skipif(
    not hay_base("usuario"), reason="sin Postgres con el esquema aplicado"
)

# Lo único que puede responder sin sesión, y por qué.
ABIERTOS = {
    ("POST", "/api/auth/login"),   # es donde se consigue la sesión
    ("POST", "/api/auth/logout"),  # cerrar sesión sin token es un no-op inofensivo
    ("GET", "/api/salud"),         # lo consulta el monitoreo, no dice nada de nadie
}

# Las rutas se leen del esquema OpenAPI y no de `app.routes`: esta versión de
# FastAPI envuelve lo que entra por `include_router`, así que `app.routes` no
# las enumera y una prueba escrita sobre esa lista pasaría sin revisar nada.
#
# Las rutas con {parametro} se prueban con un valor cualquiera: el 401 tiene
# que salir antes de que al endpoint le importe si ese valor existe.
def _rutas():
    for camino, metodos in app.openapi()["paths"].items():
        if not camino.startswith("/api"):
            continue
        for metodo in metodos:
            if metodo.upper() not in {"HEAD", "OPTIONS"}:
                yield metodo.upper(), camino


TODAS = sorted(set(_rutas()))


def test_hay_endpoints_que_revisar():
    """Si la introspección deja de encontrar rutas, el resto de este archivo
    pasaría sin probar nada."""
    assert len(TODAS) > 50, f"solo se encontraron {len(TODAS)} rutas; ¿cambió cómo se registran?"


@pytest.mark.parametrize("metodo,camino", TODAS)
def test_ningun_endpoint_responde_sin_sesion(metodo, camino):
    if (metodo, camino) in ABIERTOS:
        return
    url = camino.replace("{", "").replace("}", "")
    respuesta = cliente.request(metodo, url, json={})
    assert respuesta.status_code == 401, (
        f"{metodo} {camino} contestó {respuesta.status_code} sin sesión. "
        "Todo router nuevo va en main.py dentro de CON_SESION o SOLO_AGROFRESH."
    )


@necesita_base
@pytest.mark.parametrize("metodo,camino", TODAS)
def test_ningun_endpoint_acepta_un_token_inventado(metodo, camino):
    if (metodo, camino) in ABIERTOS:
        return
    url = camino.replace("{", "").replace("}", "")
    respuesta = cliente.request(metodo, url, json={}, headers={"Authorization": "Bearer inventado"})
    assert respuesta.status_code == 401, f"{metodo} {camino} aceptó un token inventado."


def test_salud_sigue_abierta():
    """El monitoreo tiene que poder preguntar si el sistema está vivo sin
    credenciales."""
    assert cliente.get("/api/salud").status_code == 200
