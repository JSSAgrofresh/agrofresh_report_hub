"""
La frontera que separa a un cliente de otro.

Antes, `/api/reportes/datos` recibía `?cliente=` del navegador y le creía:
una cuenta de Dole editaba ese parámetro en la barra de direcciones y veía
los resultados de Agricom.

Si algo de este archivo falla, hay una fuga de datos entre clientes. No se
arregla la prueba: se arregla `alcance_de_datos`.
"""
import pytest

from app.auth import Usuario, alcance_de_datos


def cuenta(tipo, cliente=None, planta=None):
    return Usuario(id="1", email="x@y.cl", nombre="X", tipoAcceso=tipo,
                   clienteNombre=cliente, plantaNombre=planta)


class TestCuentaDeCliente:
    def test_ignora_el_cliente_que_pide_el_navegador(self):
        dole = cuenta("cliente", cliente="DOLE CHILE S.A.")
        assert alcance_de_datos(dole, "AGRICOM S.A.", None) == ("DOLE CHILE S.A.", None)

    def test_sin_parametro_ve_lo_suyo(self):
        dole = cuenta("cliente", cliente="DOLE CHILE S.A.")
        assert alcance_de_datos(dole, None, None) == ("DOLE CHILE S.A.", None)

    def test_acotada_a_una_sucursal_no_ve_las_otras(self):
        """Una cuenta creada por Ship To ve solo su planta, aunque pida otra
        del mismo cliente."""
        codegua = cuenta("cliente", cliente="DOLE CHILE S.A.", planta="Dole Codegua")
        assert alcance_de_datos(codegua, "DOLE CHILE S.A.", "Dole Molina") == ("DOLE CHILE S.A.", "Dole Codegua")

    def test_no_puede_ampliarse_borrando_su_sucursal(self):
        """Mandar planta vacía no la sube de "una sucursal" a "todo el
        cliente": el alcance sale de su fila, no de lo que pida."""
        codegua = cuenta("cliente", cliente="DOLE CHILE S.A.", planta="Dole Codegua")
        assert alcance_de_datos(codegua, None, None) == ("DOLE CHILE S.A.", "Dole Codegua")

    @pytest.mark.parametrize("pedido", ["", "  ", "AGRICOM S.A.", "%", "' OR 1=1 --", None])
    def test_nada_de_lo_que_mande_cambia_su_alcance(self, pedido):
        dole = cuenta("cliente", cliente="DOLE CHILE S.A.")
        assert alcance_de_datos(dole, pedido, pedido) == ("DOLE CHILE S.A.", None)


class TestCuentaDeAgroFresh:
    """Para la gente de AgroFresh el parámetro sigue siendo un filtro normal:
    su trabajo es justamente mirar a todos los clientes."""

    @pytest.mark.parametrize("tipo", ["admin_general", "admin_area", "muestreador"])
    def test_el_filtro_pedido_se_respeta(self, tipo):
        assert alcance_de_datos(cuenta(tipo), "AGRICOM S.A.", "Planta 1") == ("AGRICOM S.A.", "Planta 1")

    @pytest.mark.parametrize("tipo", ["admin_general", "admin_area", "muestreador"])
    def test_sin_filtro_ve_todo(self, tipo):
        assert alcance_de_datos(cuenta(tipo), None, None) == (None, None)


def test_todo_tipo_de_acceso_esta_cubierto():
    """Si mañana se agrega un tipo de cuenta nuevo, esta prueba falla y
    obliga a decidir explícitamente qué ve — en vez de que herede "lo ve
    todo" por omisión, que es como se filtran los datos sin que nadie lo
    note."""
    from app.auth import TIPOS_ACCESO
    cubiertos = {"cliente", "admin_general", "admin_area", "muestreador"}
    assert set(TIPOS_ACCESO) == cubiertos
