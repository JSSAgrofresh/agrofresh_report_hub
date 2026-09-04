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
"""
from app.auth import Usuario
from app.toma_muestras import _es_propia, _exigir_acceso, _normalizar_correo
from fastapi import HTTPException
import pytest


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
