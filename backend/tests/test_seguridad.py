"""
Contrasenas y tokens.

Sin base de datos a propósito: lo que se prueba acá es la criptografía, y
tiene que poder correrse en cualquier parte, rápido y siempre.
"""
import pytest

from app import seguridad


class TestPassword:
    def test_la_correcta_entra(self):
        assert seguridad.verificar_password("una frase larga", seguridad.hashear_password("una frase larga"))

    def test_la_incorrecta_no_entra(self):
        assert not seguridad.verificar_password("otra frase larga", seguridad.hashear_password("una frase larga"))

    def test_no_guarda_la_contrasena(self):
        """Si la contrasena apareciera dentro del hash, robar la base sería
        robar las contrasenas."""
        assert "una frase larga" not in seguridad.hashear_password("una frase larga")

    def test_misma_contrasena_hashes_distintos(self):
        """Cada hash lleva su propia sal: dos personas con la misma clave no
        quedan con el mismo hash, así que romper una no delata a la otra."""
        a = seguridad.hashear_password("misma clave 123")
        b = seguridad.hashear_password("misma clave 123")
        assert a != b
        assert seguridad.verificar_password("misma clave 123", a)
        assert seguridad.verificar_password("misma clave 123", b)

    @pytest.mark.parametrize("guardado", [None, "", "basura", "scrypt9$1$1$1$AA$AA", "$$$$$"])
    def test_hash_invalido_no_deja_entrar(self, guardado):
        """Una cuenta sin contrasena asignada, o con un hash corrupto, no
        puede entrar — y falla como contrasena mala, sin reventar."""
        assert seguridad.verificar_password("lo que sea largo", guardado) is False

    def test_password_vacia_no_entra(self):
        assert not seguridad.verificar_password("", seguridad.hashear_password("una frase larga"))

    def test_rechaza_contrasenas_cortas(self):
        with pytest.raises(seguridad.PasswordInvalida):
            seguridad.hashear_password("corta")

    def test_temporal_es_valida_y_distinta_cada_vez(self):
        una, otra = seguridad.password_temporal(), seguridad.password_temporal()
        assert una != otra
        seguridad.validar_password(una)  # no levanta


class TestToken:
    def test_cada_token_es_distinto(self):
        assert seguridad.nuevo_token() != seguridad.nuevo_token()

    def test_la_huella_no_devuelve_el_token(self):
        """La base guarda la huella. Si de ella se pudiera sacar el token,
        una copia de la base dejaría entrar como cualquiera."""
        token = seguridad.nuevo_token()
        assert token not in seguridad.huella_token(token)

    def test_la_huella_es_estable(self):
        token = seguridad.nuevo_token()
        assert seguridad.huella_token(token) == seguridad.huella_token(token)

    def test_tokens_distintos_huellas_distintas(self):
        assert seguridad.huella_token(seguridad.nuevo_token()) != seguridad.huella_token(seguridad.nuevo_token())
