"""
Actimist tiene su propio listado y su propia lista de distribución.

Lo que se protege acá, en orden de importancia:
  1. Línea de proceso queda EXACTAMENTE igual: los contactos sin `servicio`
     son suyos y una solicitud sin Tipo Aplicación, RYD o «Línea de proceso»
     se reparte como siempre (Jorge y Claudia de respaldo, técnicos y
     comerciales de la planta).
  2. Actimist nunca ve contactos de Línea de proceso, aunque la planta se
     llame igual, ni en los niveles de respaldo.
  3. Una solicitud Actimist siempre tiene a quién llegar: Jorge y el Report
     Hub (sin Claudia), más Carlos Jiménez y Cristian Valenzuela si no es de
     prueba.
  4. Guardar la lista de un servicio no toca la del otro.
"""
import io

import openpyxl
import pytest

from app import listado_actimist as la
from app import listas_distribucion as ld
from app import toma_muestras as tm
from app.servicios import (
    ACTIMIST,
    PARA_SIN_LISTA_ACTIMIST,
    PERMANENTES_ACTIMIST,
    clave_servicio,
    servicio_de_datos,
)

DOLE, LONTUE = "DOLE CHILE SA", "PLANTA LONTUE"


def _c(id_, email, tipo, **extra):
    return {
        "id": id_, "laboratorio": "AGROFRESH", "nombre": email, "email": email, "tipo": tipo,
        "sold_to": DOLE, "ship_to": LONTUE, "especie": "", "activo": True, "orden": id_, **extra,
    }


# Línea de proceso: lo de siempre, sin `servicio`.
LINEA = [
    _c(1, "cliente@dole.cl", "resultado_cliente"),
    _c(2, "tecnico@agrofresh.com", "resultado_interno", cargo="Técnico", tipo_copia="bcc"),
    _c(3, "comercial@agrofresh.com", "resultado_interno", cargo="Comercial", tipo_copia="cc"),
    _c(4, "admin@agrofresh.com", "resultado_interno", cargo="Admin", tipo_copia="bcc"),
]
# Un contacto de Actimist en la MISMA planta (mismo nombre).
ACT = [_c(10, "actimist.cliente@dole.cl", "resultado_cliente", servicio="actimist")]


def _datos(tipo=None, **extra):
    datos = {"sold_to": DOLE, "ship_to": LONTUE, "especie": "Manzana", **extra}
    if tipo is not None:
        datos["campos_laboratorio"] = {"Tipo Aplicación": tipo}
    return datos


@pytest.fixture
def contactos(monkeypatch):
    """La configuración que leería la app: Línea de proceso + Actimist."""
    actual = {"lista": LINEA + ACT}
    monkeypatch.setattr(tm, "_leer_config", lambda nombre, defecto: actual["lista"])
    return actual


def _minus(lista):
    return [e.lower() for e in lista]


# ---------------------------------------------------------------------------
# Qué es Actimist
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("valor,esperado", [
    ("Actimist", ACTIMIST), ("ACTIMIST ", ACTIMIST), ("actimist", ACTIMIST),
    ("Línea de proceso", ""), ("RYD", ""), ("", ""), (None, ""), ("otra cosa", ""),
])
def test_clave_servicio(valor, esperado):
    assert clave_servicio(valor) == esperado


def test_servicio_de_datos_lee_el_tipo_aplicacion():
    assert servicio_de_datos(_datos("Actimist")) == ACTIMIST
    assert servicio_de_datos(_datos("Línea de proceso")) == ""
    assert servicio_de_datos(_datos()) == ""                     # sin tipo: Línea de proceso
    assert servicio_de_datos({"campos_laboratorio": None}) == ""


# ---------------------------------------------------------------------------
# 1. Línea de proceso: igual que siempre
# ---------------------------------------------------------------------------

def test_linea_de_proceso_no_ve_los_contactos_de_actimist():
    correos = {c["email"] for c in tm._contactos_resultado(DOLE, LONTUE, "Manzana", LINEA + ACT)}
    assert correos == {c["email"] for c in LINEA}


def test_linea_de_proceso_da_lo_mismo_con_o_sin_actimist_cargado():
    """Agregar contactos de Actimist no cambia nada de Línea de proceso."""
    antes = tm.destinatarios_resultado_por_tipo("", LONTUE, DOLE, "Manzana", LINEA)
    despues = tm.destinatarios_resultado_por_tipo("", LONTUE, DOLE, "Manzana", LINEA + ACT)
    assert antes == despues


@pytest.mark.parametrize("tipo", [None, "Línea de proceso", "RYD"])
def test_solicitud_de_linea_de_proceso_se_reparte_como_siempre(contactos, tipo):
    r = tm.contactos_de_solicitud_de("QUITECA", _datos(tipo))
    assert _minus(r["to"]) == _minus(tm.DESTINATARIOS_SIN_LISTA) + ["admin@agrofresh.com"]
    assert "comercial@agrofresh.com" in r["cc"]
    assert "tecnico@agrofresh.com" in r["bcc"]
    # Los referentes de Actimist no van en Línea de proceso.
    todos = _minus(r["to"] + r["cc"] + r["bcc"])
    assert not any(e.lower() in todos for e in PERMANENTES_ACTIMIST)


# ---------------------------------------------------------------------------
# 2 y 3. Actimist: su lista y sus fijos
# ---------------------------------------------------------------------------

def test_actimist_solo_ve_sus_contactos_aunque_la_planta_se_llame_igual():
    correos = {c["email"] for c in tm._contactos_resultado(DOLE, LONTUE, "Manzana", LINEA + ACT, servicio="actimist")}
    assert correos == {"actimist.cliente@dole.cl"}


def test_actimist_no_cae_en_los_respaldos_de_linea_de_proceso():
    """Un contacto global (sin planta) o «solo Ship To» de Línea de proceso no
    se cuela en Actimist."""
    globales = [
        {**_c(20, "global@x.cl", "resultado_cliente"), "sold_to": "", "ship_to": ""},
        {**_c(21, "solo.ship@x.cl", "resultado_cliente"), "sold_to": ""},
    ]
    assert tm._contactos_resultado(DOLE, LONTUE, "Manzana", globales, servicio="actimist") == []


def test_solicitud_actimist_sin_lista_va_a_jorge_report_hub_y_referentes(contactos):
    contactos["lista"] = LINEA  # Actimist sin ningún contacto todavía
    r = tm.contactos_de_solicitud_de("QUITECA", _datos("Actimist"))
    assert _minus(r["to"]) == _minus(PARA_SIN_LISTA_ACTIMIST + PERMANENTES_ACTIMIST)
    assert r["cc"] == [] and r["bcc"] == []        # nada de técnicos/comerciales de Línea
    assert "cguerrero@agrofresh.com" not in _minus(r["to"])  # Claudia no va en Actimist


def test_solicitud_actimist_de_prueba_no_lleva_referentes(contactos):
    # (Las pruebas de Quiteca tienen su regla propia: solo su portal y Jorge.)
    r = tm.contactos_de_solicitud_de("ALS", _datos("Actimist", es_prueba=True))
    assert _minus(r["to"]) == _minus(PARA_SIN_LISTA_ACTIMIST)


def test_solicitud_actimist_con_lista_del_laboratorio(contactos):
    contactos["lista"] = LINEA + [
        {"id": 30, "laboratorio": "QUITECA", "email": "lab@quiteca.cl", "tipo": "solicitud", "activo": True},
    ]
    r = tm.contactos_de_solicitud_de("QUITECA", _datos("Actimist"))
    assert _minus(r["to"]) == ["lab@quiteca.cl", *_minus(PERMANENTES_ACTIMIST)]
    assert _minus(r["bcc"]) == _minus(PARA_SIN_LISTA_ACTIMIST)   # con lista, Jorge y el Report Hub en CCO
    # Nadie va dos veces.
    todos = _minus(r["to"] + r["cc"] + r["bcc"])
    assert len(todos) == len(set(todos))


def test_resultados_actimist_respaldo_y_referentes_en_copia():
    r = tm.destinatarios_resultado_por_tipo("", LONTUE, DOLE, "Manzana", LINEA, servicio="actimist")
    assert _minus(r["to"]) == _minus(PARA_SIN_LISTA_ACTIMIST)
    assert _minus(r["cc"]) == _minus(PERMANENTES_ACTIMIST)
    assert r["bcc"] == []


def test_pdf_y_json_de_actimist_usan_la_lista_de_actimist(contactos):
    contactos["lista"] = LINEA
    detalle = tm._datos_pdf_con_destinatarios_resultados(_datos("Actimist"))["destinatarios_resultados_detalle"]
    assert _minus(detalle["para"]) == _minus(PARA_SIN_LISTA_ACTIMIST)
    assert _minus(detalle["cc"]) == _minus(PERMANENTES_ACTIMIST)
    # Y la de Línea de proceso no cambió.
    linea = tm._datos_pdf_con_destinatarios_resultados(_datos("Línea de proceso"))["destinatarios_resultados_detalle"]
    assert linea["para"] == ["cliente@dole.cl"]


def test_sin_lista_de_distribucion_por_servicio():
    # Línea de proceso tiene cliente; Actimist no.
    assert tm.solicitud_sin_lista(_datos("Línea de proceso"), LINEA) is False
    assert tm.solicitud_sin_lista(_datos("Actimist"), LINEA) is True
    assert tm.solicitud_sin_lista(_datos("Actimist"), LINEA + ACT) is False


def test_calculador_sin_lista_no_mezcla_servicios():
    calcular = tm._calculador_sin_lista(LINEA)
    assert calcular(_datos("Línea de proceso")) is False
    assert calcular(_datos("Actimist")) is True   # misma planta y especie, otro servicio


# ---------------------------------------------------------------------------
# 4. Listas de distribución: guardar en un servicio no toca el otro
# ---------------------------------------------------------------------------

def _cambio(campo, agregar=(), quitar=()):
    return {"tipo": "campo", "campo": campo, "planta": {"sold_to": DOLE, "ship_to": LONTUE},
            "agregar": list(agregar), "quitar": list(quitar)}


def test_guardar_en_actimist_no_toca_linea_de_proceso():
    nuevos, _ = ld.aplicar(LINEA + ACT, [_cambio("comercial", agregar=["nuevo@agrofresh.com"]),
                                         _cambio("Manzana y Pera", quitar=["actimist.cliente@dole.cl"])],
                           "actimist")
    linea = [c for c in nuevos if not c.get("servicio")]
    assert linea == LINEA                                     # intacta, mismo orden y forma
    act = [c for c in nuevos if c.get("servicio") == "actimist"]
    assert {c["email"] for c in act if c["tipo"] == "resultado_interno"} == {"nuevo@agrofresh.com"}


def test_guardar_en_linea_de_proceso_no_toca_actimist_ni_marca_servicio():
    nuevos, _ = ld.aplicar(LINEA + ACT, [_cambio("tecnico", quitar=["tecnico@agrofresh.com"],
                                                 agregar=["otro@agrofresh.com"])])
    assert [c for c in nuevos if c.get("servicio")] == ACT
    agregado = next(c for c in nuevos if c["email"] == "otro@agrofresh.com")
    assert "servicio" not in agregado                         # Línea de proceso: forma de siempre


def test_estado_de_la_tabla_por_servicio():
    linea = ld.estado_desde_contactos(ld.del_servicio(LINEA + ACT))
    act = ld.estado_desde_contactos(ld.del_servicio(LINEA + ACT, "actimist"))
    fila_linea = next(iter(linea.values()))
    fila_act = next(iter(act.values()))
    assert fila_linea["tecnico"] == ["tecnico@agrofresh.com"]
    assert "actimist.cliente@dole.cl" not in fila_linea["clientes"]["Manzana y Pera"]
    assert fila_act["tecnico"] == [] and fila_act["clientes"]["Manzana y Pera"] == ["actimist.cliente@dole.cl"]


# ---------------------------------------------------------------------------
# Laboratorios → Contactos: editar no borra el servicio
# ---------------------------------------------------------------------------

def test_editar_un_contacto_sin_mandar_servicio_lo_conserva(monkeypatch):
    from fastapi import APIRouter, FastAPI
    from fastapi.testclient import TestClient

    from app import config_store
    from app.laboratorios import Contacto, ContactoIn

    guardado = {"lista": [dict(ACT[0])]}
    monkeypatch.setattr(config_store, "leer", lambda nombre, defecto=None: [dict(x) for x in guardado["lista"]])
    monkeypatch.setattr(config_store, "escribir", lambda nombre, datos: guardado.__setitem__("lista", datos))
    router = APIRouter()
    config_store.crud_router(router, "/contactos", "x.json", Contacto, ContactoIn, [], conservar=("servicio",))
    app = FastAPI()
    app.include_router(router)
    cliente = TestClient(app)

    body = {k: v for k, v in ACT[0].items() if k not in ("id", "servicio")}
    body["nombre"] = "Renombrado"
    assert cliente.put("/contactos/10", json=body).status_code == 200
    assert guardado["lista"][0]["servicio"] == "actimist"
    assert guardado["lista"][0]["nombre"] == "Renombrado"
    # Si la pantalla SÍ lo manda, se respeta (así se puede mover de lista).
    assert cliente.put("/contactos/10", json={**body, "servicio": ""}).status_code == 200
    assert guardado["lista"][0]["servicio"] == ""


# ---------------------------------------------------------------------------
# Carga del listado de Actimist
# ---------------------------------------------------------------------------

def _excel(filas, vacias_arriba=3, hoja="Hoja1"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = hoja
    for _ in range(vacias_arriba):
        ws.append([])
    ws.append(["Sold to Number", "Sold to Name", "Ship to Number", "Ship to Name"])
    for f in filas:
        ws.append(list(f))
    ws.append(["Total general", None, None, None])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_lee_la_dinamica_del_planner():
    filas = la.leer_excel(_excel([
        (423890, "DAVID DEL CURTO SA", 1608658, "UNIFRUTTI REQUINOA LTDA"),
        (447602, "COPEFRUT SA", 0, "Alejandra Briceño"),
        (None, "GREENVIC SPA.", 10005570.0, "GREENVIC MAIPO"),
    ]))
    assert [(f["codigo_sold"], f["sold_to"], f["codigo_ship"], f["ship_to"]) for f in filas] == [
        ("423890", "DAVID DEL CURTO SA", "1608658", "UNIFRUTTI REQUINOA LTDA"),
        ("447602", "COPEFRUT SA", None, "Alejandra Briceño"),
        (None, "GREENVIC SPA.", "10005570", "GREENVIC MAIPO"),
    ]


def test_un_excel_sin_las_columnas_avisa():
    wb = openpyxl.Workbook()
    wb.active.append(["Cliente", "Planta"])
    buf = io.BytesIO()
    wb.save(buf)
    with pytest.raises(ValueError, match="Sold to Number"):
        la.leer_excel(buf.getvalue())


def _fila(n, cs, s, cp, p):
    return {"fila": n, "codigo_sold": cs, "sold_to": s, "codigo_ship": cp, "ship_to": p}


def test_plan_crea_lo_nuevo_y_reconoce_lo_existente():
    filas = [
        _fila(1, "1", "CLIENTE A", "10", "PLANTA A1"),
        _fila(2, "1", "CLIENTE A", "11", "PLANTA A2"),       # mismo Sold To, otra planta
        _fila(3, "2", "cliente  b", "20", "PLANTA B"),        # ya existe por código
        _fila(4, None, "CLIENTE C", "30", "PLANTA C"),        # ya existe por nombre
    ]
    existentes = [{"id": 7, "nombre": "CLIENTE B", "codigo_sap": "2"},
                  {"id": 8, "nombre": "Cliente C", "codigo_sap": None}]
    plan = la.planear(filas, existentes, [{"id": 1, "cliente_id": 7, "nombre": "PLANTA B", "codigo_sap": "20"}])
    assert [c["nombre"] for c in plan["clientes_nuevos"]] == ["CLIENTE A"]
    assert [(p["sold_to"], p["nombre"]) for p in plan["plantas_nuevas"]] == [
        ("CLIENTE A", "PLANTA A1"), ("CLIENTE A", "PLANTA A2"), ("Cliente C", "PLANTA C")]
    assert plan["clientes_existentes"] == 2 and plan["plantas_existentes"] == 1


def test_plan_no_duplica_un_nombre_con_otro_codigo():
    plan = la.planear([_fila(1, "99", "CLIENTE B", "1", "X")], [{"id": 7, "nombre": "CLIENTE B", "codigo_sap": "2"}], [])
    assert plan["clientes_nuevos"] == [] and plan["plantas_nuevas"] == []
    assert plan["avisos"][0]["omitida"] is True


def test_plan_ship_to_cero_se_carga_con_aviso():
    plan = la.planear([_fila(1, "1", "COPEFRUT SA", None, "Alejandra Briceño")], [], [])
    assert plan["plantas_nuevas"][0]["codigo_sap"] is None
    assert plan["avisos"][0]["omitida"] is False


def test_plan_es_idempotente():
    filas = [_fila(1, "1", "A", "10", "PA"), _fila(2, "2", "B", None, "PB")]
    plan = la.planear(filas, [], [])
    clientes = [{"id": i + 1, "nombre": c["nombre"], "codigo_sap": c["codigo_sap"]}
                for i, c in enumerate(plan["clientes_nuevos"])]
    ids = {c["clave"]: i + 1 for i, c in enumerate(plan["clientes_nuevos"])}
    plantas = [{"id": i + 1, "cliente_id": ids[p["cliente_clave"]], "nombre": p["nombre"], "codigo_sap": p["codigo_sap"]}
               for i, p in enumerate(plan["plantas_nuevas"])]
    segunda = la.planear(filas, clientes, plantas)
    assert segunda["clientes_nuevos"] == [] and segunda["plantas_nuevas"] == []


# ---------------------------------------------------------------------------
# Con Postgres: los endpoints del listado de Actimist
# ---------------------------------------------------------------------------

from tests.utiles_bd import hay_base  # noqa: E402

_necesita_actimist = pytest.mark.skipif(not hay_base("cliente_actimist"), reason="sin Postgres con la 0049")


def _contar(cur, tabla):
    cur.execute(f"SELECT count(*) AS n FROM {tabla}")
    return cur.fetchone()["n"]


@_necesita_actimist
def test_importar_actimist_mira_primero_y_no_toca_linea_de_proceso():
    import asyncio

    from starlette.datastructures import UploadFile

    from app import catalogo
    from app.db import conexion, cursor_dict

    contenido = _excel([(990001, "ZZ PRUEBA ACTIMIST SA", 990101, "ZZ PLANTA UNO"),
                        (990001, "ZZ PRUEBA ACTIMIST SA", 990102, "ZZ PLANTA DOS")])

    def importar(aplicar):
        archivo = UploadFile(file=io.BytesIO(contenido), filename="planner.xlsx")
        return asyncio.run(catalogo.importar_actimist(archivo, aplicar))

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        antes = {t: _contar(cur, t) for t in ("cliente", "planta", "cliente_actimist", "planta_actimist")}
    try:
        plan = importar(False)
        assert len(plan["clientes_nuevos"]) == 1 and len(plan["plantas_nuevas"]) == 2
        assert plan["aplicado"] is False
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            assert {t: _contar(cur, t) for t in antes} == antes          # mirar no escribe

        hecho = importar(True)
        assert hecho["creados"] == {"clientes": 1, "plantas": 2}
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            assert _contar(cur, "cliente") == antes["cliente"]            # Línea de proceso intacta
            assert _contar(cur, "planta") == antes["planta"]
            assert _contar(cur, "cliente_actimist") == antes["cliente_actimist"] + 1

        plantas = [p for p in catalogo.listar_plantas_actimist() if p["cliente_nombre"] == "ZZ PRUEBA ACTIMIST SA"]
        assert sorted(p["nombre"] for p in plantas) == ["ZZ PLANTA DOS", "ZZ PLANTA UNO"]
        assert importar(True)["creados"] == {"clientes": 0, "plantas": 0}  # otra vez: nada nuevo
    finally:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM cliente_actimist WHERE nombre = 'ZZ PRUEBA ACTIMIST SA'")


def test_sin_lista_de_linea_de_proceso_no_cambia_con_los_correos_de_actimist():
    """En Línea de proceso, un cliente cuyo único correo es el del Report Hub
    sigue contando como lista (como antes): solo Jorge y Claudia son «propios»."""
    solo_report_hub = [_c(40, "agrofreshreporthub@gmail.com", "resultado_cliente")]
    assert tm.solicitud_sin_lista(_datos("Línea de proceso"), solo_report_hub) is False
    assert tm.solicitud_sin_lista(_datos("Actimist"), [{**solo_report_hub[0], "servicio": "actimist"}]) is True


def test_la_dinamica_deja_el_sold_to_solo_en_su_primera_fila():
    """Las filas sin Sold To son del Sold To de más arriba (así exporta Excel una
    dinámica). Antes se saltaban y entraba un solo Ship To por cliente."""
    filas = la.leer_excel(_excel([
        (423890, "DAVID DEL CURTO SA", 1608658, "UNIFRUTTI REQUINOA LTDA"),
        (None, None, 1861025, "AURORA AUSTRALIS SA"),
        (None, None, 10005580, "UNIFRUTTI LINDEROS"),
        (424064, "SOCIEDAD AGRICOLA EL PORVENIR SA", 424064, "SOCIEDAD AGRICOLA EL PORVENIR SA"),
        (None, None, 10005599, "DAVID DEL CURTO CURICO"),
    ]))
    assert [(f["sold_to"], f["codigo_sold"], f["ship_to"]) for f in filas] == [
        ("DAVID DEL CURTO SA", "423890", "UNIFRUTTI REQUINOA LTDA"),
        ("DAVID DEL CURTO SA", "423890", "AURORA AUSTRALIS SA"),
        ("DAVID DEL CURTO SA", "423890", "UNIFRUTTI LINDEROS"),
        ("SOCIEDAD AGRICOLA EL PORVENIR SA", "424064", "SOCIEDAD AGRICOLA EL PORVENIR SA"),
        ("SOCIEDAD AGRICOLA EL PORVENIR SA", "424064", "DAVID DEL CURTO CURICO"),
    ]
    plan = la.planear(filas, [], [])
    assert len(plan["clientes_nuevos"]) == 2 and len(plan["plantas_nuevas"]) == 5


def test_reimportar_la_dinamica_completa_lo_que_faltaba():
    """Lo cargado con el lector viejo (un Ship To por Sold To) se completa sin duplicar."""
    filas = [_fila(1, "1", "A", "10", "PA1"), _fila(2, "1", "A", "11", "PA2"), _fila(3, "1", "A", "12", "PA3")]
    plan = la.planear(filas, [{"id": 5, "nombre": "A", "codigo_sap": "1"}],
                      [{"id": 1, "cliente_id": 5, "nombre": "PA1", "codigo_sap": "10"}])
    assert plan["clientes_nuevos"] == []
    assert [p["nombre"] for p in plan["plantas_nuevas"]] == ["PA2", "PA3"]
    assert all(p["cliente_clave"] == 5 for p in plan["plantas_nuevas"])
