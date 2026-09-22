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
