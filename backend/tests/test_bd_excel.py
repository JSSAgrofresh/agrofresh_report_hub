"""
Descarga de la BD de resultados (Report → Laboratorio).

Lo que importa aquí: que las columnas se acoten a lo que hay en la descarga
(un laboratorio filtrado no arrastra los analitos de los otros), que el
resultado aparezca donde en Solicitudes iba el ✓, y que un archivo filtrado
avise que no es la base completa.

La primera parte es pura. La segunda necesita Postgres con el esquema y se
salta sola si no lo hay.
"""
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app import bd_excel, config_store
from app.auth import Usuario, usuario_actual
from app.main import app
from app.toma_muestras import ANALITOS_DEFECTO
from tests.utiles_bd import hay_base


def _fila(**kw):
    base = {"nro_informe": "INF-1", "laboratorio": "QUITECA", "resultados": {}, "dosis": {}, "tipo_aplicacion": None}
    base.update(kw)
    return base


def _encabezados(wb):
    ws = wb["BD"]
    return [c.value for c in ws[2]], [c.value for c in ws[1] if c.value]


FUNGICIDA = _fila(
    resultados={"FDL": {"valor": 0.42, "nombre": "Fludioxonil"}, "IMZ": {"valor": 1.5, "nombre": "Imazalil"}},
    dosis={"FDL": 5, "IMZ": 3},
    tipo_aplicacion="Línea de proceso",
)
AGUA_ALS = _fila(
    laboratorio="ALS",
    nro_informe="INF-2",
    resultados={"ECOLI": {"valor": 10, "nombre": "E. Coli"}, "COLT": {"valor": "<1", "nombre": "Coliformes"}},
)


def test_solo_salen_los_grupos_y_analitos_que_tienen_datos():
    wb = bd_excel.construir_workbook_bd([AGUA_ALS], ANALITOS_DEFECTO)
    columnas, bandas = _encabezados(wb)
    assert "E. Coli UFC/100mL" in columnas and "Coliformes Totales UFC/100mL" in columnas
    assert "FDL" not in columnas and "Levaduras UFC/mL" not in columnas
    assert bandas == ["GENERAL", "ALS — MICROBIOLOGÍA AGUA (FSMA)"]


def test_el_resultado_va_donde_en_solicitudes_iba_el_check_y_la_dosis_al_lado():
    wb = bd_excel.construir_workbook_bd([FUNGICIDA], ANALITOS_DEFECTO)
    columnas, _ = _encabezados(wb)
    ws = wb["BD"]
    fila = dict(zip(columnas, [c.value for c in ws[3]]))
    assert fila["FDL"] == 0.42 and fila["FDL Dosis"] == 5
    assert fila["IMZ"] == 1.5
    assert fila["Tipo Aplicación"] == "Línea de proceso"
    assert "✓" not in fila.values()
    # FDL y su dosis quedan pegadas, como en el formato de Solicitudes
    assert columnas.index("FDL Dosis") == columnas.index("FDL") + 1


def test_un_texto_como_menor_que_se_conserva():
    wb = bd_excel.construir_workbook_bd([AGUA_ALS], ANALITOS_DEFECTO)
    columnas, _ = _encabezados(wb)
    fila = dict(zip(columnas, [c.value for c in wb["BD"][3]]))
    assert fila["Coliformes Totales UFC/100mL"] == "<1"


def test_filtrar_por_ingrediente_deja_solo_ese_y_su_dosis():
    wb = bd_excel.construir_workbook_bd([FUNGICIDA], ANALITOS_DEFECTO, {"IMZ"})
    columnas, _ = _encabezados(wb)
    assert "IMZ" in columnas and "IMZ Dosis" in columnas
    assert "FDL" not in columnas and "FDL Dosis" not in columnas


def test_un_analito_sin_columna_en_el_formato_no_se_pierde():
    fila = _fila(resultados={"XYZ": {"valor": 7, "nombre": "Nuevo analito"}})
    wb = bd_excel.construir_workbook_bd([fila], ANALITOS_DEFECTO)
    columnas, bandas = _encabezados(wb)
    assert "Nuevo analito (XYZ)" in columnas
    assert bd_excel.TITULO_OTROS in bandas


def test_sin_resultados_solo_quedan_las_columnas_generales():
    wb = bd_excel.construir_workbook_bd([_fila()], ANALITOS_DEFECTO)
    columnas, bandas = _encabezados(wb)
    assert bandas == ["GENERAL"]
    assert columnas[:2] == ["N° Informe", "N° Solicitud"]


def test_la_hoja_de_aviso_solo_existe_en_una_descarga_filtrada():
    completa = bd_excel.construir_workbook_bd([FUNGICIDA], ANALITOS_DEFECTO)
    assert completa.sheetnames == ["BD"]
    filtrada = bd_excel.construir_workbook_bd([FUNGICIDA], ANALITOS_DEFECTO, nota_filtro="Laboratorio: QUITECA")
    assert filtrada.sheetnames == ["BD", "Filtros aplicados"]
    assert "NO es la base de datos completa" in filtrada["Filtros aplicados"]["A1"].value


# ── Contra Postgres ──────────────────────────────────────────────────────

con_bd = pytest.mark.skipif(not hay_base("producto_aplicado"), reason="sin Postgres con el esquema")


@pytest.fixture
def datos_bd(monkeypatch):
    from app.db import conexion, cursor_dict

    monkeypatch.setattr(config_store, "leer", lambda nombre, defecto: ANALITOS_DEFECTO)
    ids = {}
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("INSERT INTO cliente (nombre) VALUES ('__CLIENTE_BD__') RETURNING id")
        cli = cur.fetchone()["id"]
        cur.execute("INSERT INTO planta (cliente_id, nombre) VALUES (%s, '__PLANTA_BD__') RETURNING id", (cli,))
        pl = cur.fetchone()["id"]
        cur.execute("INSERT INTO analito (codigo, nombre, laboratorio) VALUES ('FDL', 'Fludioxonil', '__LAB_BD__') RETURNING id")
        fdl = cur.fetchone()["id"]
        cur.execute("INSERT INTO analito (codigo, nombre, laboratorio) VALUES ('ECOLI', 'E. Coli', '__LAB_BD__') RETURNING id")
        eco = cur.fetchone()["id"]
        for clave, lab, nro in (("quiteca", "QUITECA", "__INF_Q__"), ("als", "ALS", "__INF_A__")):
            cur.execute(
                "INSERT INTO solicitud (nro_solicitud, laboratorio, fecha_muestreo, especie, planta_id, referencia)"
                " VALUES (%s, %s, '2026-09-01', 'Cereza', %s, %s) RETURNING id",
                (nro, lab, pl, "OT-" + clave),
            )
            ids[clave] = cur.fetchone()["id"]
        cur.execute("INSERT INTO resultado (solicitud_id, analito_id, valor_num) VALUES (%s, %s, 0.42)", (ids["quiteca"], fdl))
        cur.execute("INSERT INTO producto_aplicado (solicitud_id, analito_id, dosis, tipo_aplicacion) VALUES (%s, %s, 5, 'Fogger')", (ids["quiteca"], fdl))
        cur.execute("INSERT INTO resultado (solicitud_id, analito_id, valor_num) VALUES (%s, %s, 10)", (ids["als"], eco))
    yield ids
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud LIKE '\\_\\_INF\\_%'")
        cur.execute("DELETE FROM analito WHERE laboratorio = '__LAB_BD__'")
        cur.execute("DELETE FROM planta WHERE nombre = '__PLANTA_BD__'")
        cur.execute("DELETE FROM cliente WHERE nombre = '__CLIENTE_BD__'")


@pytest.fixture
def cliente_http():
    quien = Usuario(id="2", email="a@x.cl", nombre="A", tipoAcceso="analista", area="cromatografia")
    app.dependency_overrides[usuario_actual] = lambda: quien
    yield TestClient(app)
    app.dependency_overrides.pop(usuario_actual, None)


def _hoja(resp):
    wb = load_workbook(io.BytesIO(resp.content))
    ws = wb["BD"]
    return wb, [c.value for c in ws[2]], [[c.value for c in fila] for fila in ws.iter_rows(min_row=3)]


@con_bd
def test_descarga_completa_trae_todo_y_no_avisa(datos_bd, cliente_http):
    r = cliente_http.post("/api/reportes/bd/excel", json={})
    assert r.status_code == 200 and "completa" in r.headers["content-disposition"]
    wb, columnas, filas = _hoja(r)
    assert wb.sheetnames == ["BD"]
    informes = {f[columnas.index("N° Informe")] for f in filas}
    assert {"__INF_Q__", "__INF_A__"} <= informes
    assert "FDL" in columnas and "E. Coli UFC/100mL" in columnas


@con_bd
def test_descarga_filtrada_solo_trae_lo_pedido_y_avisa(datos_bd, cliente_http):
    r = cliente_http.post(
        "/api/reportes/bd/excel",
        json={"solicitud_ids": [datos_bd["als"]], "descripcion_filtros": "Laboratorio: ALS"},
    )
    assert "filtrada" in r.headers["content-disposition"]
    wb, columnas, filas = _hoja(r)
    assert [f[columnas.index("N° Informe")] for f in filas] == ["__INF_A__"]
    assert "E. Coli UFC/100mL" in columnas and "FDL" not in columnas  # las columnas de QUITECA no vienen
    assert wb.sheetnames == ["BD", "Filtros aplicados"]
    assert wb["Filtros aplicados"]["A2"].value == "Laboratorio: ALS"


@con_bd
def test_trae_resultado_y_dosis_de_la_base(datos_bd, cliente_http):
    r = cliente_http.post("/api/reportes/bd/excel", json={"solicitud_ids": [datos_bd["quiteca"]]})
    _, columnas, filas = _hoja(r)
    fila = dict(zip(columnas, filas[0]))
    assert float(fila["FDL"]) == pytest.approx(0.42)
    assert float(fila["FDL Dosis"]) == 5
    assert fila["Tipo Aplicación"] == "Fogger"
    assert fila["N° Solicitud"] == "OT-quiteca"


@con_bd
def test_una_lista_vacia_no_baja_todo(datos_bd, cliente_http):
    # Un filtro que no deja nada NO puede terminar descargando la base entera.
    r = cliente_http.post("/api/reportes/bd/excel", json={"solicitud_ids": []})
    _, _, filas = _hoja(r)
    assert filas == []


def test_un_texto_de_filtro_no_puede_ser_una_formula():
    from app.reportes import _texto_seguro_excel

    assert _texto_seguro_excel("=HYPERLINK(\"x\")").startswith("'")
    assert _texto_seguro_excel("Laboratorio: ALS") == "Laboratorio: ALS"
    assert _texto_seguro_excel("  ") is None


def test_cliente_no_puede_usar_la_descarga():
    quien = Usuario(id="9", email="c@x.cl", nombre="C", tipoAcceso="cliente", area="postventa", clienteNombre="X")
    app.dependency_overrides[usuario_actual] = lambda: quien
    try:
        assert TestClient(app).post("/api/reportes/bd/excel", json={}).status_code == 403
    finally:
        app.dependency_overrides.pop(usuario_actual, None)


def _banda_fungicidas(filas):
    _, bandas = _encabezados(bd_excel.construir_workbook_bd(filas, ANALITOS_DEFECTO))
    return next(b for b in bandas if "FUNGICIDAS" in b)


def test_la_banda_de_fungicidas_nombra_solo_el_laboratorio_que_hay():
    quiteca = _fila(laboratorio="QUITECA", resultados={"FDL": {"valor": 1, "nombre": "F"}})
    agro = _fila(laboratorio="Agrofresh", resultados={"IMZ": {"valor": 2, "nombre": "I"}})
    assert _banda_fungicidas([quiteca]) == "QUITECA — ANÁLISIS DE RESIDUOS DE FUNGICIDAS"
    assert _banda_fungicidas([agro]) == "AGROFRESH — ANÁLISIS DE RESIDUOS DE FUNGICIDAS"
    assert _banda_fungicidas([quiteca, agro]) == "QUITECA / AGROFRESH — ANÁLISIS DE RESIDUOS DE FUNGICIDAS"


def test_un_laboratorio_sin_resultados_de_fungicidas_no_entra_en_la_banda():
    quiteca = _fila(laboratorio="QUITECA", resultados={"FDL": {"valor": 1, "nombre": "F"}})
    agua_agro = _fila(laboratorio="AGROFRESH", resultados={"ECOLI": {"valor": 3, "nombre": "E"}})
    assert _banda_fungicidas([quiteca, agua_agro]) == "QUITECA — ANÁLISIS DE RESIDUOS DE FUNGICIDAS"


def test_laboratorio_combinado_o_desconocido_usa_el_rotulo_de_los_dos():
    combinada = _fila(laboratorio="Quiteca / AgroFresh", resultados={"FDL": {"valor": 1, "nombre": "F"}})
    otra = _fila(laboratorio="???", resultados={"FDL": {"valor": 1, "nombre": "F"}})
    assert _banda_fungicidas([combinada]) == "QUITECA / AGROFRESH — ANÁLISIS DE RESIDUOS DE FUNGICIDAS"
    assert _banda_fungicidas([otra]) == "QUITECA / AGROFRESH — ANÁLISIS DE RESIDUOS DE FUNGICIDAS"
