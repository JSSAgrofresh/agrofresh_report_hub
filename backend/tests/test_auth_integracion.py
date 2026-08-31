"""
Autenticación de punta a punta, contra una base de datos real.

Las otras pruebas revisan piezas: que un hash no se pueda deshacer, que
`alcance_de_datos` no ceda, que ningún endpoint conteste sin sesión. Esta
revisa que todo eso ENSAMBLADO haga lo que promete — que es donde suelen
aparecer los agujeros: cada parte correcta, y la unión filtrando.

Necesita Postgres con el esquema aplicado. Sin base, se salta entera: en el
computador de alguien que solo está tocando el frontend no tiene por qué
haber una. En el servidor y en CI sí, y ahí corre.

    cd backend
    python -m pytest tests/test_auth_integracion.py -v
"""
import pytest
from fastapi.testclient import TestClient

from app import seguridad
from app.main import app
from tests.utiles_bd import hay_base

CLAVE = "clave larga de prueba"


pytestmark = pytest.mark.skipif(
    not hay_base("usuario"), reason="sin Postgres con el esquema aplicado"
)


@pytest.fixture(scope="module")
def datos():
    """Dos clientes con una solicitud cada uno, y tres cuentas.

    Se arma y se deshace en la misma transacción para no dejar rastro en la
    base sobre la que corre — que perfectamente puede ser la de desarrollo.
    """
    from app.db import conexion, cursor_dict

    creados = {"usuarios": [], "clientes": []}
    with conexion() as conn, cursor_dict(conn) as cur:
        for nombre, planta, folio in (
            ("ZZ-TEST DOLE", "ZZ-TEST Dole Codegua", "ZZ-TEST-1"),
            ("ZZ-TEST AGRICOM", "ZZ-TEST Agricom Rancagua", "ZZ-TEST-2"),
        ):
            cur.execute("INSERT INTO cliente (nombre) VALUES (%s) RETURNING id", (nombre,))
            cid = cur.fetchone()["id"]
            creados["clientes"].append(cid)
            cur.execute(
                "INSERT INTO planta (cliente_id, nombre) VALUES (%s, %s) RETURNING id", (cid, planta)
            )
            pid = cur.fetchone()["id"]
            cur.execute(
                "INSERT INTO solicitud (planta_id, nro_solicitud, vigente, fecha_entrada) "
                "VALUES (%s, %s, TRUE, CURRENT_DATE)",
                (pid, folio),
            )
        for email, tipo, cli in (
            ("zz-test-admin@agrofresh.com", "admin_general", None),
            ("zz-test-dole@dole.cl", "cliente", "ZZ-TEST DOLE"),
        ):
            cur.execute(
                "INSERT INTO usuario (email, nombre, tipo_acceso, cliente_nombre, password_hash) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (email, email, tipo, cli, seguridad.hashear_password(CLAVE)),
            )
            creados["usuarios"].append(cur.fetchone()["id"])

    yield creados

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM usuario WHERE email LIKE 'zz-test-%'")
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud LIKE 'ZZ-TEST-%'")
        cur.execute("DELETE FROM planta WHERE nombre LIKE 'ZZ-TEST %'")
        cur.execute("DELETE FROM cliente WHERE nombre LIKE 'ZZ-TEST %'")


@pytest.fixture(scope="module")
def cliente_http():
    return TestClient(app)


def _entrar(c, email, clave=CLAVE):
    r = c.post("/api/auth/login", json={"email": email, "password": clave})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def dole(cliente_http, datos):
    return _entrar(cliente_http, "zz-test-dole@dole.cl")


@pytest.fixture
def admin(cliente_http, datos):
    return _entrar(cliente_http, "zz-test-admin@agrofresh.com")


class TestLogin:
    def test_la_contrasena_correcta_entra(self, cliente_http, datos):
        assert "Authorization" in _entrar(cliente_http, "zz-test-admin@agrofresh.com")

    def test_la_contrasena_incorrecta_no_entra(self, cliente_http, datos):
        r = cliente_http.post(
            "/api/auth/login", json={"email": "zz-test-admin@agrofresh.com", "password": "no es"}
        )
        assert r.status_code == 401

    def test_una_cuenta_inexistente_da_el_mismo_error(self, cliente_http, datos):
        """Si el mensaje fuera distinto, este endpoint serviría para averiguar
        quién tiene cuenta en el sistema."""
        mala = cliente_http.post(
            "/api/auth/login", json={"email": "zz-test-admin@agrofresh.com", "password": "no es"}
        )
        inexistente = cliente_http.post(
            "/api/auth/login", json={"email": "zz-test-nadie@x.cl", "password": CLAVE}
        )
        assert mala.status_code == inexistente.status_code == 401
        assert mala.json()["detail"] == inexistente.json()["detail"]


class TestFugaEntreClientes:
    """El ataque real: una cuenta de cliente pidiendo los datos de otro."""

    def test_no_ve_al_otro_cliente_aunque_lo_pida(self, cliente_http, dole):
        r = cliente_http.get("/api/reportes/datos?cliente=ZZ-TEST%20AGRICOM", headers=dole)
        assert r.status_code == 200
        assert {f.get("cliente") for f in r.json()["filas"]} <= {"ZZ-TEST DOLE"}

    def test_el_excel_tampoco(self, cliente_http, dole):
        """Pantalla y descarga tienen que acotarse igual: exportar era otra
        puerta al mismo dato."""
        r = cliente_http.get("/api/reportes/datos/excel?cliente=ZZ-TEST%20AGRICOM", headers=dole)
        assert r.status_code == 200
        assert b"ZZ-TEST AGRICOM" not in r.content

    def test_el_resumen_solo_cuenta_lo_suyo(self, cliente_http, dole):
        """El panel mostraba el total de solicitudes de TODOS los clientes."""
        assert cliente_http.get("/api/reportes/resumen", headers=dole).json()["total_solicitudes"] == 1

    def test_no_puede_listar_los_clientes_de_agrofresh(self, cliente_http, dole):
        assert cliente_http.get("/api/reportes/clientes", headers=dole).status_code == 403

    def test_el_admin_si_ve_a_todos(self, cliente_http, admin):
        vistos = {f.get("cliente") for f in cliente_http.get("/api/reportes/datos", headers=admin).json()["filas"]}
        assert {"ZZ-TEST DOLE", "ZZ-TEST AGRICOM"} <= vistos

    @pytest.mark.parametrize("ruta", [
        "/api/usuarios",
        "/api/toma-muestras/config/analitos",
        "/api/laboratorios/analisis",
        "/api/homogenizar/campos",
        "/api/listados/exportar",
        "/api/emitir/cromatografia/config-informe",
        "/api/ingest/auditoria-staging",
    ])
    def test_una_cuenta_de_cliente_no_toca_nada_mas(self, cliente_http, dole, ruta):
        assert cliente_http.get(ruta, headers=dole).status_code == 403


class TestCicloDeVida:
    def test_logout_mata_el_token_en_el_servidor(self, cliente_http, datos):
        """Borrarlo solo del navegador dejaría vivo el token: una copia
        seguiría sirviendo."""
        h = _entrar(cliente_http, "zz-test-admin@agrofresh.com")
        assert cliente_http.get("/api/auth/yo", headers=h).status_code == 200
        cliente_http.post("/api/auth/logout", headers=h)
        assert cliente_http.get("/api/auth/yo", headers=h).status_code == 401

    def test_cambiar_permisos_expulsa_la_sesion_vieja(self, cliente_http, admin, datos):
        """Quitarle un acceso a alguien no puede tardar una semana en surtir
        efecto, que es lo que pasaría con un token firmado."""
        r = cliente_http.post("/api/usuarios", headers=admin, json={
            "email": "zz-test-temp@agrofresh.com", "nombre": "Temp", "tipoAcceso": "muestreador",
        })
        assert r.status_code == 200
        creado = r.json()
        h = _entrar(cliente_http, "zz-test-temp@agrofresh.com", creado["passwordTemporal"])
        assert cliente_http.get("/api/auth/yo", headers=h).status_code == 200

        cliente_http.put(f"/api/usuarios/{creado['usuario']['id']}", headers=admin, json={
            "email": "zz-test-temp@agrofresh.com", "nombre": "Temp",
            "tipoAcceso": "cliente", "clienteNombre": "ZZ-TEST DOLE",
        })
        assert cliente_http.get("/api/auth/yo", headers=h).status_code == 401

    def test_la_cuenta_nueva_nace_obligada_a_cambiar_la_clave(self, cliente_http, admin, datos):
        r = cliente_http.post("/api/usuarios", headers=admin, json={
            "email": "zz-test-nueva@agrofresh.com", "nombre": "Nueva", "tipoAcceso": "muestreador",
        })
        creado = r.json()
        assert creado["usuario"]["debeCambiarPassword"] is True
        assert len(creado["passwordTemporal"]) >= seguridad.LARGO_MINIMO_PASSWORD

        h = _entrar(cliente_http, "zz-test-nueva@agrofresh.com", creado["passwordTemporal"])
        assert cliente_http.post("/api/auth/cambiar-password", headers=h, json={
            "password_actual": "no es la actual", "password_nueva": "otra clave larga",
        }).status_code == 400

        cambio = cliente_http.post("/api/auth/cambiar-password", headers=h, json={
            "password_actual": creado["passwordTemporal"], "password_nueva": "mi clave definitiva",
        })
        assert cambio.status_code == 200
        assert cambio.json()["debeCambiarPassword"] is False
        # Quien cambió su clave no queda expulsado por hacerlo bien.
        assert cliente_http.get("/api/auth/yo", headers=h).status_code == 200
        # Y la temporal deja de servir de inmediato.
        assert cliente_http.post("/api/auth/login", json={
            "email": "zz-test-nueva@agrofresh.com", "password": creado["passwordTemporal"],
        }).status_code == 401

    def test_un_cliente_no_puede_crearse_una_cuenta_de_admin(self, cliente_http, dole):
        assert cliente_http.post("/api/usuarios", headers=dole, json={
            "email": "zz-test-colado@x.cl", "nombre": "Colado", "tipoAcceso": "admin_general",
        }).status_code == 403


class TestLaBaseNoGuardaSecretos:
    def test_ninguna_contrasena_queda_en_la_tabla(self, cliente_http, datos):
        from app.db import conexion, cursor_dict
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT password_hash FROM usuario WHERE email LIKE 'zz-test-%'")
            todos = " ".join(f["password_hash"] or "" for f in cur.fetchall())
        assert CLAVE not in todos

    def test_ningun_token_queda_en_la_tabla(self, cliente_http, datos):
        """Se guarda la huella. Una copia de la base no deja hacerse pasar
        por nadie."""
        from app.db import conexion, cursor_dict
        r = cliente_http.post(
            "/api/auth/login", json={"email": "zz-test-admin@agrofresh.com", "password": CLAVE}
        )
        token = r.json()["token"]
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT token_hash FROM sesion")
            assert token not in " ".join(f["token_hash"] for f in cur.fetchall())
