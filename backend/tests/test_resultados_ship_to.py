"""
Resultado a clientes: configuración por Ship To, con copias internas que
salen en CC o en BCC según lo que se eligió para cada una.

No toca disco ni R2: `_leer_config` (alias de `config_store.leer`) se
reemplaza por una lista en memoria, que es lo único que estas funciones
necesitan para decidir a quién le toca qué.
"""
from app import toma_muestras as tm


LAB = "QUITECA"


def contactos(monkeypatch, items):
    monkeypatch.setattr(tm, "_leer_config", lambda archivo, defecto=None: items)


def contacto(tipo, email, ship_to="", tipo_copia="cc", activo=True, orden=0, laboratorio=LAB, nombre=""):
    return {
        "laboratorio": laboratorio,
        "tipo": tipo,
        "email": email,
        "nombre": nombre,
        "ship_to": ship_to,
        "tipo_copia": tipo_copia,
        "activo": activo,
        "orden": orden,
    }


class TestPorShipTo:
    def test_cada_ship_to_tiene_su_propia_configuracion(self, monkeypatch):
        contactos(
            monkeypatch,
            [
                contacto("resultado_cliente", "cliente-a@dole.cl", ship_to="Ship To A"),
                contacto("resultado_cliente", "cliente-b@dole.cl", ship_to="Ship To B"),
            ],
        )
        assert tm.contactos_de_resultados(LAB, "Ship To A") == ["cliente-a@dole.cl"]
        assert tm.contactos_de_resultados(LAB, "Ship To B") == ["cliente-b@dole.cl"]

    def test_ship_to_sin_configuracion_propia_usa_la_global(self, monkeypatch):
        """La configuración previa a separar por Ship To (ship_to vacío) se
        conserva como respaldo: no se pierde nada de lo ya cargado."""
        contactos(
            monkeypatch,
            [
                contacto("resultado_cliente", "global@dole.cl", ship_to=""),
                contacto("resultado_cliente", "solo-a@dole.cl", ship_to="Ship To A"),
            ],
        )
        assert tm.contactos_de_resultados(LAB, "Ship To A") == ["solo-a@dole.cl"]
        assert tm.contactos_de_resultados(LAB, "Ship To Sin Configurar") == ["global@dole.cl"]

    def test_no_mezcla_ship_tos_distintos(self, monkeypatch):
        contactos(
            monkeypatch,
            [
                contacto("resultado_cliente", "a@dole.cl", ship_to="Ship To A"),
                contacto("resultado_cliente", "b@dole.cl", ship_to="Ship To B"),
            ],
        )
        assert "b@dole.cl" not in tm.contactos_de_resultados(LAB, "Ship To A")


class TestCcYBcc:
    def test_copia_interna_cc_sale_en_cc(self, monkeypatch):
        contactos(monkeypatch, [contacto("resultado_interno", "cc@agrofresh.com", ship_to="A", tipo_copia="cc")])
        destinos = tm.destinatarios_resultado_por_tipo(LAB, "A")
        assert destinos["cc"] == ["cc@agrofresh.com"]
        assert destinos["bcc"] == []

    def test_copia_interna_bcc_sale_en_bcc(self, monkeypatch):
        contactos(monkeypatch, [contacto("resultado_interno", "oculta@agrofresh.com", ship_to="A", tipo_copia="bcc")])
        destinos = tm.destinatarios_resultado_por_tipo(LAB, "A")
        assert destinos["bcc"] == ["oculta@agrofresh.com"]
        assert destinos["cc"] == []

    def test_destinatario_cliente_siempre_va_en_to(self, monkeypatch):
        contactos(monkeypatch, [contacto("resultado_cliente", "cliente@dole.cl", ship_to="A")])
        destinos = tm.destinatarios_resultado_por_tipo(LAB, "A")
        assert destinos["to"] == ["cliente@dole.cl"]

    def test_mezcla_de_cc_y_bcc_en_el_mismo_ship_to(self, monkeypatch):
        contactos(
            monkeypatch,
            [
                contacto("resultado_cliente", "cliente@dole.cl", ship_to="A"),
                contacto("resultado_interno", "cc@agrofresh.com", ship_to="A", tipo_copia="cc"),
                contacto("resultado_interno", "oculta@agrofresh.com", ship_to="A", tipo_copia="bcc"),
            ],
        )
        destinos = tm.destinatarios_resultado_por_tipo(LAB, "A")
        assert destinos == {
            "to": ["cliente@dole.cl"],
            "cc": ["cc@agrofresh.com"],
            "bcc": ["oculta@agrofresh.com"],
        }

    def test_contacto_inactivo_no_sale_en_ninguna_lista(self, monkeypatch):
        contactos(monkeypatch, [contacto("resultado_interno", "baja@agrofresh.com", ship_to="A", tipo_copia="cc", activo=False)])
        destinos = tm.destinatarios_resultado_por_tipo(LAB, "A")
        assert destinos["cc"] == []


class TestEndpointSoloLectura:
    """`resultados_de_ship_to` es lo que Nueva solicitud consulta para
    mostrar, de solo lectura, la configuración vigente de un Ship To antes de
    guardar -tiene que traer el mismo contenido que ve Laboratorios."""

    def test_trae_nombre_correo_tipo_y_tipo_copia(self, monkeypatch):
        contactos(
            monkeypatch,
            [
                contacto("resultado_cliente", "cliente@dole.cl", ship_to="A", nombre="Cliente 1", orden=1),
                contacto("resultado_interno", "oculta@agrofresh.com", ship_to="A", tipo_copia="bcc", nombre="Jorge", orden=2),
            ],
        )
        salida = tm.resultados_de_ship_to(LAB, "A")
        assert [c.model_dump() for c in salida] == [
            {"nombre": "Cliente 1", "email": "cliente@dole.cl", "tipo": "resultado_cliente", "tipo_copia": "cc"},
            {"nombre": "Jorge", "email": "oculta@agrofresh.com", "tipo": "resultado_interno", "tipo_copia": "bcc"},
        ]

    def test_ship_to_sin_configurar_devuelve_vacio_o_la_global(self, monkeypatch):
        contactos(monkeypatch, [contacto("resultado_cliente", "a@dole.cl", ship_to="Ship To A")])
        assert tm.resultados_de_ship_to(LAB, "Ship To Sin Configurar") == []

    def test_no_incluye_contactos_de_otro_ship_to(self, monkeypatch):
        contactos(
            monkeypatch,
            [
                contacto("resultado_cliente", "a@dole.cl", ship_to="A"),
                contacto("resultado_cliente", "b@dole.cl", ship_to="B"),
            ],
        )
        correos = [c.email for c in tm.resultados_de_ship_to(LAB, "A")]
        assert correos == ["a@dole.cl"]
