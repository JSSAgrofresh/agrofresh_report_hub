"""Cuentas de cliente con varios accesos (Sold To, Ship To y especie): lo que ve cada una y nada más.

Los tres tipos de cuenta de la bienvenida a clientes: (1) una planta y una especie, (2) una planta y varias especies,
(3) varias plantas y varias especies. La lista vive en `usuario.plantas_asignadas` (una fila por especie) y la aplican
`reportes._filtro_alcance`, `informes_cliente.carpetas_permitidas` y `postventa._informes_de`."""
import pytest
from fastapi import HTTPException

from app import informes_cliente, postventa, reportes, usuarios
from app.auth import Usuario, accesos_de_cuenta, con_lista_de_accesos, planta_permitida
from app.informes_storage import carpeta_planta


def _cli(accesos=None, cliente="DOLE", planta="DOLE LONTUE"):
    return Usuario(
        id="5", email="c@dole.com", nombre="C", tipoAcceso="cliente", modulos=["reports", "storage"],
        reportes=["laboratorio"], clienteNombre=cliente, plantaNombre=planta, plantasAsignadas=accesos,
    )


TIPO1 = [{"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE", "especie": "Cerezas"}]
TIPO2 = [
    {"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE", "especie": "Cerezas"},
    {"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE", "especie": "Manzana"},
]
TIPO3 = [
    *TIPO2,
    {"clienteNombre": "VERFRUT", "plantaNombre": "VERFRUT RAPEL", "especie": "Cerezas"},
    {"clienteNombre": "VERFRUT", "plantaNombre": "VERFRUT RAPEL", "especie": "Kiwi"},
]


def test_sin_lista_el_cliente_sigue_acotado_por_su_cliente_y_sucursal_de_siempre():
    c = _cli(None)
    assert not con_lista_de_accesos(c)
    sql, params = reportes._filtro_alcance(c, "AGRICOM", None)  # lo que pida el navegador se descarta
    assert params["cliente"] == "DOLE" and params["planta"] == "DOLE LONTUE"
    assert "com_c0" not in params and "especie" not in sql


def test_tipo_1_una_planta_y_una_especie():
    sql, params = reportes._filtro_alcance(_cli(TIPO1), None, None)
    assert params["com_c0"] == "DOLE" and params["com_p0"] == "DOLE LONTUE" and params["com_e0"] == "Cerezas"
    assert "s.especie" in sql and "cliente" not in params  # manda la lista, no el cliente suelto


def test_tipo_2_una_planta_y_varias_especies_son_alternativas_de_la_misma_planta():
    sql, params = reportes._filtro_alcance(_cli(TIPO2), None, None)
    assert [params[f"com_e{i}"] for i in range(2)] == ["Cerezas", "Manzana"]
    assert params["com_p0"] == params["com_p1"] == "DOLE LONTUE" and " OR " in sql


def test_tipo_3_varias_plantas_y_varias_especies():
    _, params = reportes._filtro_alcance(_cli(TIPO3), None, None)
    assert {(params[f"com_c{i}"], params[f"com_p{i}"], params[f"com_e{i}"]) for i in range(4)} == {
        ("DOLE", "DOLE LONTUE", "Cerezas"), ("DOLE", "DOLE LONTUE", "Manzana"),
        ("VERFRUT", "VERFRUT RAPEL", "Cerezas"), ("VERFRUT", "VERFRUT RAPEL", "Kiwi"),
    }


def test_un_acceso_sin_especie_deja_ver_todas_las_de_la_planta():
    sql, params = reportes._filtro_alcance(_cli([{"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE"}]), None, None)
    assert "com_e0" not in params and "s.especie" not in sql


def test_lo_que_pida_el_navegador_no_amplia_el_alcance_de_un_cliente_con_lista():
    _, params = reportes._filtro_alcance(_cli(TIPO1), "AGRICOM", "OTRA PLANTA")
    assert "AGRICOM" not in params.values() and "OTRA PLANTA" not in params.values()


def test_los_datos_simulados_o_la_lista_vacia_nunca_muestran_todo():
    c = _cli([{"clienteNombre": "", "plantaNombre": "X"}])  # sin entradas válidas = como si no hubiera lista
    assert not con_lista_de_accesos(c)
    assert accesos_de_cuenta(c) == []


def test_storage_solo_abre_la_carpeta_si_el_acceso_es_a_toda_la_planta(monkeypatch):
    monkeypatch.setattr(informes_cliente, "_plantas_del_cliente", lambda s: [])
    # Con especie: las carpetas no se separan por especie, así que no se abren.
    assert informes_cliente.carpetas_permitidas(_cli(TIPO3)) == set()
    mixto = [*TIPO1, {"clienteNombre": "VERFRUT", "plantaNombre": "VERFRUT RAPEL"}]
    assert informes_cliente.carpetas_permitidas(_cli(mixto)) == {carpeta_planta("VERFRUT RAPEL", "VERFRUT").casefold()}
    with pytest.raises(HTTPException):
        informes_cliente._exigir_alcance([carpeta_planta("DOLE LONTUE", "DOLE")], _cli(TIPO1))


CARGAS = [
    {"carpeta": "a", "cliente": "DOLE", "planta": "DOLE LONTUE", "tiene_pdf": True},
    {"carpeta": "b", "cliente": "DOLE", "planta": "DOLE CODEGUA", "tiene_pdf": True},
    {"carpeta": "c", "cliente": "VERFRUT", "planta": "VERFRUT RAPEL", "tiene_pdf": True},
]


def test_accutab_solo_de_las_plantas_de_su_lista(monkeypatch):
    monkeypatch.setattr(postventa, "listar_registros", lambda: CARGAS)
    assert [r["carpeta"] for r in postventa._informes_de(_cli(TIPO3), None, None)] == ["a", "c"]
    # Un cliente no elige: lo que pida por parámetro se descarta y manda su lista.
    assert [r["carpeta"] for r in postventa._informes_de(_cli(TIPO3), "DOLE", "DOLE CODEGUA")] == ["a", "c"]
    # Sin lista, como siempre: su cliente y sucursal.
    assert [r["carpeta"] for r in postventa._informes_de(_cli(None, "DOLE", None), None, None)] == ["a", "b"]


def test_planta_permitida_para_clientes_con_lista():
    assert planta_permitida(_cli(TIPO3), " dole ", "dole lontue")
    assert not planta_permitida(_cli(TIPO3), "DOLE", "DOLE CODEGUA")
    assert planta_permitida(_cli(None), "CUALQUIERA", "OTRA")  # sin lista, no cambia


def _cuenta(accesos, cliente=None):
    return usuarios.UsuarioIn(
        email="a@b.cl", nombre="A", tipoAcceso="cliente", clienteNombre=cliente, modulos=["reports"], plantasAsignadas=accesos
    )


def test_crear_cliente_con_lista_deja_limpia_la_lista_y_el_primer_acceso_en_su_fila():
    c = _cuenta([*TIPO3, {"clienteNombre": " dole ", "plantaNombre": "dole lontue", "especie": "CEREZAS"}, {"clienteNombre": ""}])
    usuarios._validar(c)
    assert c.plantasAsignadas == TIPO3  # sin repetidas (sin importar mayúsculas) ni vacías
    assert (c.clienteNombre, c.plantaNombre) == ("DOLE", "DOLE LONTUE")


def test_cliente_sin_lista_ni_cliente_se_rechaza_y_con_cliente_sigue_igual():
    with pytest.raises(HTTPException) as e:
        usuarios._validar(_cuenta([]))
    assert e.value.status_code == 400
    c = _cuenta(None, "DOLE")
    usuarios._validar(c)
    assert c.plantasAsignadas is None and c.clienteNombre == "DOLE"
