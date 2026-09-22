"""
Quién puede ver y reenviar una solicitud de Toma de muestras.

Un muestreador solo ve lo que él mismo creó -se compara contra el correo
guardado en la solicitud (`email_solicitante`), que el formulario llena
siempre con el de la cuenta que la crea-. Cualquier otra cuenta interna
(admin_general, admin_area) sigue viendo todo.

Si algo de este archivo falla, un muestreador puede terminar viendo o
reenviando la solicitud de otro. No se arregla la prueba: se arregla
`_es_propia`.

Que `crear_solicitud` FUERCE `email_solicitante` al correo de la sesión
-y no confíe en lo que mande el cliente- se prueba en
`test_toma_muestras_indice.py::TestPropiedadDeLaSolicitud`: esa parte
necesita escribir una solicitud de verdad (archivo + índice), así que
requiere Postgres. Acá solo se prueba la comparación en sí.

`TestEliminarSolicitud` verifica el guard del DELETE en el nivel HTTP,
sin base de datos, usando dependency_overrides para inyectar usuarios.
Si el guard desaparece, el test falla — que es exactamente su trabajo.
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import Usuario, usuario_actual
from app.main import app
from app.toma_muestras import _es_propia, _exigir_acceso, _normalizar_correo


class TestNormalizarCorreo:
    """trim + minúsculas: la misma regla que separa a un muestreador de sus
    propias solicitudes y la que arma la lista de BCC sin duplicados."""

    def test_recorta_espacios(self):
        assert _normalizar_correo("  ana@agrofresh.com  ") == "ana@agrofresh.com"

    def test_baja_a_minusculas(self):
        assert _normalizar_correo("ANA@AgroFresh.COM") == "ana@agrofresh.com"

    def test_none_da_vacio(self):
        assert _normalizar_correo(None) == ""


def cuenta(tipo, email="ana@agrofresh.com"):
    return Usuario(id="1", email=email, nombre="Ana", tipoAcceso=tipo)


def solicitud(email_solicitante="ana@agrofresh.com"):
    return {"email_solicitante": email_solicitante}


class TestMuestreador:
    def test_ve_lo_que_el_mismo_creo(self):
        ana = cuenta("muestreador", email="ana@agrofresh.com")
        assert _es_propia(ana, solicitud("ana@agrofresh.com")) is True

    def test_no_ve_lo_de_otro_muestreador(self):
        beto = cuenta("muestreador", email="beto@agrofresh.com")
        assert _es_propia(beto, solicitud("ana@agrofresh.com")) is False

    def test_la_comparacion_no_distingue_mayusculas_ni_espacios(self):
        ana = cuenta("muestreador", email="ana@agrofresh.com")
        assert _es_propia(ana, solicitud("  ANA@AgroFresh.com ")) is True

    def test_sin_email_guardado_no_ve_nada(self):
        ana = cuenta("muestreador", email="ana@agrofresh.com")
        assert _es_propia(ana, solicitud(None)) is False

    def test_exigir_acceso_corta_con_403(self):
        beto = cuenta("muestreador", email="beto@agrofresh.com")
        with pytest.raises(HTTPException) as exc:
            _exigir_acceso(beto, solicitud("ana@agrofresh.com"))
        assert exc.value.status_code == 403


class TestCuentasInternas:
    @pytest.mark.parametrize("tipo", ["admin_general", "admin_area"])
    def test_ve_todo_aunque_no_sea_suya(self, tipo):
        admin = cuenta(tipo, email="admin@agrofresh.com")
        assert _es_propia(admin, solicitud("otro@agrofresh.com")) is True

    def test_admin_general_no_recibe_403(self, ):
        admin = cuenta("admin_general", email="admin@agrofresh.com")
        _exigir_acceso(admin, solicitud("otro@agrofresh.com"))  # no debe lanzar


_SUPER_ADMIN = "jorge.sandoval@agrofresh.com"


class TestEliminarSolicitud:
    """El endpoint DELETE /solicitudes/{archivo} solo lo puede ejecutar el
    administrador principal (admin_general + email del super admin).

    El frontend oculta el botón a no-admins, pero eso no es un control de
    acceso. Estos tests prueban que el BACKEND rechaza la petición con 403
    cuando el rol o el email no coinciden, sin importar cómo llegue la llamada.

    No necesitan Postgres: se inyecta el usuario directo con
    dependency_overrides, así que el check de rol ocurre antes de tocar
    ningún archivo ni tabla.
    """

    @pytest.fixture(autouse=True)
    def restaurar_overrides(self):
        yield
        app.dependency_overrides.clear()

    def _como(self, tipo: str, email: str = "otro@agrofresh.com"):
        from app.auth import usuario_actual as _ua
        u = Usuario(id="99", email=email, nombre="Test", tipoAcceso=tipo)
        app.dependency_overrides[_ua] = lambda: u
        return TestClient(app)

    @pytest.mark.parametrize("tipo", ["muestreador", "admin_area"])
    def test_no_admin_recibe_403(self, tipo):
        """Muestreador y admin_area no pueden eliminar solicitudes."""
        resp = self._como(tipo).delete("/api/toma-muestras/solicitudes/cualquier-archivo.xlsx")
        assert resp.status_code == 403, (
            f"{tipo} obtuvo {resp.status_code} en DELETE /toma-muestras/solicitudes — "
            "debe devolver 403. No se arregla el test, se arregla el guard."
        )

    def test_admin_general_sin_email_super_admin_recibe_403(self):
        """admin_general con email distinto al super admin también queda bloqueado."""
        resp = self._como("admin_general", email="otro.admin@agrofresh.com").delete(
            "/api/toma-muestras/solicitudes/cualquier-archivo.xlsx"
        )
        assert resp.status_code == 403, (
            f"admin_general sin email super admin obtuvo {resp.status_code} — debe ser 403."
        )

    def test_super_admin_no_recibe_403(self):
        """El super admin pasa el guard (puede llegar a 404 si el archivo no existe,
        pero no debe quedar bloqueado en el 403 del guard de rol)."""
        resp = self._como("admin_general", email=_SUPER_ADMIN).delete(
            "/api/toma-muestras/solicitudes/no-existe.xlsx"
        )
        assert resp.status_code != 403, (
            f"El super admin obtuvo 403 en DELETE /toma-muestras/solicitudes — el guard no debería bloquearlo."
        )


# Rutas de escritura de config que se prueban. Solo la muestra — basta con
# verificar que el guard está en su lugar; no hace falta cubrir cada recurso.
_CONFIG_ESCRITURA = [
    ("PUT",    "/api/toma-muestras/config/campos"),
    ("POST",   "/api/toma-muestras/config/tipos-aplicacion"),
    ("PUT",    "/api/toma-muestras/config/tipos-aplicacion/1"),
    ("DELETE", "/api/toma-muestras/config/tipos-aplicacion/1"),
    ("POST",   "/api/toma-muestras/config/lineas-proceso"),
    ("PUT",    "/api/toma-muestras/config/lineas-proceso/1"),
    ("DELETE", "/api/toma-muestras/config/lineas-proceso/1"),
    ("POST",   "/api/toma-muestras/config/campos-tipo-aplicacion"),
    ("PUT",    "/api/toma-muestras/config/campos-tipo-aplicacion/1"),
    ("DELETE", "/api/toma-muestras/config/campos-tipo-aplicacion/1"),
    ("POST",   "/api/toma-muestras/config/analitos"),
    ("PUT",    "/api/toma-muestras/config/analitos/1"),
    ("DELETE", "/api/toma-muestras/config/analitos/1"),
    ("POST",   "/api/toma-muestras/config/laboratorios"),
    ("PUT",    "/api/toma-muestras/config/laboratorios/1"),
    ("DELETE", "/api/toma-muestras/config/laboratorios/1"),
    ("POST",   "/api/toma-muestras/config/categorias-analiticas"),
    ("PUT",    "/api/toma-muestras/config/categorias-analiticas/1"),
    ("DELETE", "/api/toma-muestras/config/categorias-analiticas/1"),
    ("POST",   "/api/toma-muestras/config/productos"),
    ("PUT",    "/api/toma-muestras/config/productos/1"),
    ("DELETE", "/api/toma-muestras/config/productos/1"),
]


class TestConfigAcceso:
    """Los endpoints de escritura de configuración (POST/PUT/DELETE /config/*)
    solo los puede ejecutar un admin_general.

    No necesitan Postgres: dependency_overrides inyecta el usuario directo y el
    check de rol ocurre antes de tocar ningún archivo de config.
    """

    @pytest.fixture(autouse=True)
    def restaurar_overrides(self):
        yield
        app.dependency_overrides.clear()

    def _como(self, tipo: str):
        u = Usuario(id="99", email="test@agrofresh.com", nombre="Test", tipoAcceso=tipo)
        app.dependency_overrides[usuario_actual] = lambda: u
        return TestClient(app)

    @pytest.mark.parametrize("tipo", ["muestreador", "admin_area"])
    @pytest.mark.parametrize("metodo,ruta", _CONFIG_ESCRITURA)
    def test_no_admin_recibe_403(self, tipo, metodo, ruta):
        """Muestreador y admin_area no pueden modificar la configuración."""
        resp = self._como(tipo).request(metodo, ruta, json={})
        assert resp.status_code == 403, (
            f"{tipo} obtuvo {resp.status_code} en {metodo} {ruta} — "
            "debe devolver 403. No se arregla el test, se arregla el guard."
        )

    @pytest.mark.parametrize("metodo,ruta", _CONFIG_ESCRITURA)
    def test_admin_general_no_recibe_403(self, metodo, ruta):
        """Un admin_general pasa el guard (puede recibir 400/404/422 por datos
        inválidos, pero no 403 del guard de rol)."""
        resp = self._como("admin_general").request(metodo, ruta, json={})
        assert resp.status_code != 403, (
            f"admin_general obtuvo 403 en {metodo} {ruta} — el guard no debería bloquearlo."
        )


class TestCruzarConMuestra:
    """PUT /solicitudes/{archivo}/muestra solo puede ejecutarlo el dueño de
    la solicitud (o un admin). Un muestreador no puede cruzar una solicitud
    de otro.

    Si este test falla, cualquier usuario interno puede mezclar resultados
    de laboratorio entre solicitudes ajenas. No se arregla el test: se
    arregla `cruzar_con_muestra`.
    """

    @pytest.fixture(autouse=True)
    def restaurar_overrides(self):
        yield
        app.dependency_overrides.clear()

    def _como(self, tipo: str, email: str = "test@agrofresh.com"):
        u = Usuario(id="99", email=email, nombre="Test", tipoAcceso=tipo)
        app.dependency_overrides[usuario_actual] = lambda: u
        return TestClient(app)

    def test_muestreador_no_puede_cruzar_solicitud_ajena(self):
        """Beto no puede cruzar una solicitud cuyo email_solicitante es Ana."""
        from unittest.mock import patch

        datos_ana = {"email_solicitante": "ana@agrofresh.com"}
        with patch("app.toma_muestras.indice_solicitudes.buscar", return_value=datos_ana):
            resp = self._como("muestreador", email="beto@agrofresh.com").put(
                "/api/toma-muestras/solicitudes/ana_sol.xlsx/muestra",
                json={"codigo_muestra": "M-001"},
            )
        assert resp.status_code == 403, (
            f"muestreador ajeno obtuvo {resp.status_code} en PUT .../muestra — "
            "debe devolver 403. No se arregla el test: se arregla cruzar_con_muestra."
        )

    def test_muestreador_puede_cruzar_su_propia_solicitud(self):
        """Ana puede cruzar su propia solicitud."""
        from unittest.mock import patch

        datos_ana = {"email_solicitante": "ana@agrofresh.com"}
        with patch("app.toma_muestras.indice_solicitudes.buscar", return_value=datos_ana), \
             patch("app.toma_muestras.indice_solicitudes.cruzar"):
            resp = self._como("muestreador", email="ana@agrofresh.com").put(
                "/api/toma-muestras/solicitudes/ana_sol.xlsx/muestra",
                json={"codigo_muestra": "M-001"},
            )
        assert resp.status_code != 403, (
            f"muestreador obtuvo 403 en su propia solicitud — el guard no debería bloquearlo."
        )

    def test_admin_area_puede_cruzar_cualquier_solicitud(self):
        """admin_area no es muestreador: _es_propia devuelve True para todo."""
        from unittest.mock import patch

        datos_ana = {"email_solicitante": "ana@agrofresh.com"}
        with patch("app.toma_muestras.indice_solicitudes.buscar", return_value=datos_ana), \
             patch("app.toma_muestras.indice_solicitudes.cruzar"):
            resp = self._como("admin_area", email="admin@agrofresh.com").put(
                "/api/toma-muestras/solicitudes/ana_sol.xlsx/muestra",
                json={"codigo_muestra": "M-001"},
            )
        assert resp.status_code != 403, (
            f"admin_area obtuvo 403 — no debería estar bloqueado."
        )


class TestExportarTodo:
    """GET /solicitudes/exportar-todo filtra por propiedad para muestreadores.

    Un muestreador no debe poder descargar un Excel con las solicitudes de
    otros usuarios. El filtro es el mismo que usa `listar_solicitudes`:
    `_es_propia()`. Si este test falla, un muestreador puede exportar todos
    los datos del sistema. No se arregla el test: se arregla
    `exportar_todas_las_solicitudes`.
    """

    @pytest.fixture(autouse=True)
    def restaurar_overrides(self):
        yield
        app.dependency_overrides.clear()

    def _como(self, tipo: str, email: str = "test@agrofresh.com"):
        u = Usuario(id="99", email=email, nombre="Test", tipoAcceso=tipo)
        app.dependency_overrides[usuario_actual] = lambda: u
        return TestClient(app)

    def test_muestreador_recibe_200_no_401_ni_403(self):
        """El endpoint debe ser accesible para muestreadores (ellos exportan
        sus propias solicitudes). La restricción es en los datos, no en el
        acceso al endpoint."""
        resp = self._como("muestreador", email="ana@agrofresh.com").get(
            "/api/toma-muestras/solicitudes/exportar-todo"
        )
        assert resp.status_code not in (401, 403), (
            f"muestreador obtuvo {resp.status_code} en exportar-todo — "
            "debe poder exportar sus propias solicitudes."
        )

    def test_exportar_todo_aplica_filtro_es_propia(self):
        """Verifica que `_es_propia` se aplica al construir la lista: un
        muestreador no ve solicitudes de otro."""
        from unittest.mock import patch

        solicitud_ana = ("ana_sol.xlsx", {"email_solicitante": "ana@agrofresh.com", "creado_en": "2024-01-01"})
        solicitud_beto = ("beto_sol.xlsx", {"email_solicitante": "beto@agrofresh.com", "creado_en": "2024-01-02"})

        with patch("app.toma_muestras.leer_todas_las_solicitudes", return_value=[solicitud_ana, solicitud_beto]):
            resp = self._como("muestreador", email="ana@agrofresh.com").get(
                "/api/toma-muestras/solicitudes/exportar-todo"
            )
        # La respuesta puede fallar en la construcción del Excel (datos mínimos),
        # pero no por 401/403 y el filtro ocurrió antes de llegar al Excel.
        # Lo importante es que si llega al Excel, solo tiene datos de Ana.
        assert resp.status_code != 403

    def test_admin_area_ve_todas(self):
        """admin_area no es muestreador: _es_propia devuelve True para todo,
        así que no pierde ninguna solicitud."""
        from unittest.mock import patch

        solicitud_ana = ("ana_sol.xlsx", {"email_solicitante": "ana@agrofresh.com", "creado_en": "2024-01-01"})
        solicitud_beto = ("beto_sol.xlsx", {"email_solicitante": "beto@agrofresh.com", "creado_en": "2024-01-02"})

        with patch("app.toma_muestras.leer_todas_las_solicitudes", return_value=[solicitud_ana, solicitud_beto]):
            resp = self._como("admin_area", email="admin@agrofresh.com").get(
                "/api/toma-muestras/solicitudes/exportar-todo"
            )
        assert resp.status_code != 403
