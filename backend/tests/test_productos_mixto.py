"""
«MIXTO» desde 2 productos en las solicitudes NUEVAS (todo tipo de servicio:
Línea de proceso, Actimist, RYD). Las solicitudes anteriores no se reescriben:
sin la marca `mixto_desde_2` siguen con su regla (MIXTO desde 3), al leerlas,
al editarlas y en su PDF/Excel/JSON.
"""
import pytest

from app import toma_muestras as tm
from tests.test_toma_muestras_indice import ADMIN, cuerpo, limpio  # noqa: F401
from tests.utiles_bd import hay_base

_necesita_base = pytest.mark.skipif(not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado")


# --- La regla ---------------------------------------------------------------

@pytest.mark.parametrize("lista,esperado", [
    (["A"], "A"),
    (["A", "B"], "MIXTO"),
    (["A", "B", "C"], "MIXTO"),
])
def test_con_la_marca_mixto_desde_dos(lista, esperado):
    assert tm.normalizar_productos(None, lista, True) == (esperado, lista)


@pytest.mark.parametrize("lista,esperado", [
    (["A"], "A"),
    (["A", "B"], "A, B"),
    (["A", "B", "C"], "MIXTO"),
])
def test_sin_la_marca_la_regla_de_antes(lista, esperado):
    assert tm.normalizar_productos(None, lista) == (esperado, lista)


# --- Leer una solicitud: manda la marca guardada ------------------------------

def _leida(**datos):
    base = dict(archivo="OT-1.xlsx", laboratorio="ALS", solicitante="X", sold_to="S", generado_por="g",
                numero_solicitud="OT-1", fecha_solicitud="2026-10-01", creado_en="2026-10-01T10:00:00+00:00")
    return tm.Solicitud(**base, **datos)


def test_una_solicitud_vieja_con_dos_productos_se_sigue_viendo_igual():
    vieja = _leida(producto_utilizado="A, B", productos_lista=["A", "B"])
    assert vieja.producto_utilizado == "A, B"


def test_una_solicitud_nueva_con_dos_productos_dice_mixto():
    nueva = _leida(producto_utilizado="MIXTO", productos_lista=["A", "B"], mixto_desde_2=True)
    assert nueva.producto_utilizado == "MIXTO"
    assert nueva.productos_lista == ["A", "B"]


# --- Crear y editar, con la base ---------------------------------------------

@_necesita_base
@pytest.mark.parametrize("tipo", ["Línea de proceso", "Actimist", "RYD"])
def test_crear_con_dos_productos_queda_mixto(limpio, tipo):  # noqa: F811
    creada = tm.crear_solicitud(
        cuerpo(productos_lista=["P1", "P2"], campos_laboratorio={"Tipo Aplicación": tipo}), usuario=ADMIN,
    )
    assert creada.producto_utilizado == "MIXTO"
    assert creada.productos_lista == ["P1", "P2"]
    guardada = tm.obtener_solicitud(creada.archivo, usuario=ADMIN)
    assert guardada.producto_utilizado == "MIXTO" and guardada.mixto_desde_2 is True


@_necesita_base
def test_crear_con_un_producto_lo_muestra(limpio):  # noqa: F811
    creada = tm.crear_solicitud(cuerpo(productos_lista=["P1"]), usuario=ADMIN)
    assert creada.producto_utilizado == "P1"


@_necesita_base
def test_editar_una_solicitud_vieja_conserva_su_regla(limpio):  # noqa: F811
    """Una solicitud creada antes del cambio (sin la marca) con 2 productos
    sigue mostrándolos por su nombre aunque se edite."""
    creada = tm.crear_solicitud(cuerpo(productos_lista=["P1"]), usuario=ADMIN)
    datos = tm._leer_datos_actuales(creada.archivo)
    datos.pop("mixto_desde_2", None)                       # así era una de antes
    tm._regrabar_datos_solicitud(creada.archivo, datos)

    editada = tm.editar_solicitud(creada.archivo, cuerpo(productos_lista=["P1", "P2"]), usuario=ADMIN)
    assert editada.producto_utilizado == "P1, P2"
    assert tm.obtener_solicitud(creada.archivo, usuario=ADMIN).producto_utilizado == "P1, P2"


@_necesita_base
def test_editar_una_solicitud_nueva_mantiene_mixto(limpio):  # noqa: F811
    creada = tm.crear_solicitud(cuerpo(productos_lista=["P1"]), usuario=ADMIN)
    editada = tm.editar_solicitud(creada.archivo, cuerpo(productos_lista=["P1", "P2"]), usuario=ADMIN)
    assert editada.producto_utilizado == "MIXTO"


@_necesita_base
def test_el_json_del_laboratorio_no_lleva_la_marca(limpio):  # noqa: F811
    import json
    creada = tm.crear_solicitud(cuerpo(productos_lista=["P1", "P2"]), usuario=ADMIN)
    salida = json.loads(tm._generar_json_solicitud(tm._leer_datos_actuales(creada.archivo)))
    assert salida["producto_utilizado"] == "MIXTO"
    assert "mixto_desde_2" not in salida
