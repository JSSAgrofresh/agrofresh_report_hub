"""
Ecofog es una copia de Actimist con su propio listado y su propia lista.

Se protege: se reconoce por su Tipo Aplicación, tiene sus tablas, ve solo sus
contactos (ni los de Línea de proceso ni los de Actimist) y su correo sigue la
misma regla de Actimist (Jorge + Report Hub, referentes en Para).
"""
import pytest

from app import toma_muestras as tm
from app.servicios import (
    ACTIMIST,
    ECOFOG,
    PARA_SIN_LISTA_ECOFOG,
    PERMANENTES_ECOFOG,
    clave_servicio,
    es_del_servicio,
    servicio_de_datos,
    tablas,
)

DOLE, LONTUE = "DOLE CHILE SA", "PLANTA LONTUE"


def _c(id_, email, tipo, **extra):
    return {
        "id": id_, "laboratorio": "AGROFRESH", "nombre": email, "email": email, "tipo": tipo,
        "sold_to": DOLE, "ship_to": LONTUE, "especie": "", "activo": True, "orden": id_, **extra,
    }


LINEA = [_c(1, "cliente@dole.cl", "resultado_cliente")]
ACT = [_c(10, "actimist@dole.cl", "resultado_cliente", servicio="actimist")]
ECO = [_c(20, "ecofog@dole.cl", "resultado_cliente", servicio="ecofog")]


def _datos(tipo, **extra):
    return {"sold_to": DOLE, "ship_to": LONTUE, "especie": "Manzana",
            "campos_laboratorio": {"Tipo Aplicación": tipo}, **extra}


@pytest.fixture
def contactos(monkeypatch):
    actual = {"lista": LINEA + ACT + ECO}
    monkeypatch.setattr(tm, "_leer_config", lambda nombre, defecto: actual["lista"])
    return actual


def _minus(lista):
    return [e.lower() for e in lista]


@pytest.mark.parametrize("valor,esperado", [
    ("Ecofog", ECOFOG), ("ECOFOG ", ECOFOG), ("ecofog", ECOFOG), ("Actimist", ACTIMIST), ("RYD", ""),
])
def test_clave_servicio(valor, esperado):
    assert clave_servicio(valor) == esperado


def test_servicio_de_datos_y_tablas():
    assert servicio_de_datos(_datos("Ecofog")) == ECOFOG
    assert tablas("Ecofog") == ("cliente_ecofog", "planta_ecofog")
    assert tablas("Actimist") == ("cliente_actimist", "planta_actimist")
    assert tablas("") == ("cliente", "planta")


def test_cada_servicio_ve_solo_sus_contactos():
    todos = LINEA + ACT + ECO
    assert not es_del_servicio(ECO[0], "actimist") and not es_del_servicio(ECO[0], "")
    for servicio, esperado in (("ecofog", "ecofog@dole.cl"), ("actimist", "actimist@dole.cl"), ("", "cliente@dole.cl")):
        correos = {c["email"] for c in tm._contactos_resultado(DOLE, LONTUE, "Manzana", todos, servicio=servicio)}
        assert correos == {esperado}


def test_solicitud_ecofog_sin_lista_va_a_jorge_report_hub_y_referentes(contactos):
    contactos["lista"] = LINEA + ACT
    r = tm.contactos_de_solicitud_de("QUITECA", _datos("Ecofog"))
    assert _minus(r["to"]) == _minus(PARA_SIN_LISTA_ECOFOG + PERMANENTES_ECOFOG)
    assert r["cc"] == [] and r["bcc"] == []


def test_solicitud_ecofog_de_prueba_no_lleva_referentes(contactos):
    r = tm.contactos_de_solicitud_de("ALS", _datos("Ecofog", es_prueba=True))
    assert _minus(r["to"]) == _minus(PARA_SIN_LISTA_ECOFOG)


def test_resultados_ecofog_usan_su_lista(contactos):
    r = tm.destinatarios_resultado_por_tipo("", LONTUE, DOLE, "Manzana", servicio="ecofog")
    assert "ecofog@dole.cl" in _minus(r["to"]) and "actimist@dole.cl" not in _minus(r["to"])
    assert set(_minus(PERMANENTES_ECOFOG)) <= set(_minus(r["cc"] + r["to"] + r["bcc"]))


def test_ecofog_se_agrega_a_los_tipos_de_aplicacion_ya_guardados(monkeypatch):
    guardado = [{"id": 1, "nombre": "Actimist", "activo": True, "orden": 1},
                {"id": 2, "nombre": "Línea de proceso", "activo": True, "orden": 2},
                {"id": 3, "nombre": "RYD", "activo": True, "orden": 3}]
    escrito = {}
    monkeypatch.setattr(tm, "_leer_config", lambda nombre, defecto: list(guardado))
    monkeypatch.setattr(tm, "_escribir_config", lambda nombre, items: escrito.update(items=items))
    nombres = [t.nombre for t in tm._listar_tipos()]
    assert nombres == ["Actimist", "Línea de proceso", "RYD", "Ecofog"]
    assert [i["id"] for i in escrito["items"]] == [1, 2, 3, 4]      # no pisa ids
    assert len({n.casefold() for n in nombres}) == 4
