"""Cuentas de tipo «comercial»: solo lectura y solo sus plantas (ver app/auth.py, reportes._filtro_alcance,
informes_cliente.carpetas_permitidas y permisos_funciones.normalizar_cuenta)."""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import informes_cliente, permisos_funciones as pf, postventa, reportes, usuarios
from app.auth import Usuario, solo_escribiente, solo_interno, usuario_actual
from app.informes_storage import carpeta_planta
from app.main import app


def _com(plantas=None, modulos=("reports", "storage")):
    return Usuario(
        id="9", email="com@agrofresh.com", nombre="Com", tipoAcceso="comercial", modulos=list(modulos),
        reportes=["laboratorio"], plantasAsignadas=plantas,
    )


PLANTAS = [
    {"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE"},
    {"clienteNombre": "VERFRUT", "plantaNombre": None},
]


def test_el_comercial_solo_puede_llevar_los_modulos_que_ya_se_acotan_a_sus_plantas():
    area, mods, reps = pf.normalizar_cuenta(
        "comercial", "cromatografia", ["reports", "converter", "auditoria_interna", "storage", "toma_muestras", "toma_reanalisis", "agrofresh_lab"], ["postventa"],
    )
    assert area is None and mods == ["reports", "storage", "auditoria_interna", "toma_muestras"] and reps == ["postventa"]
    _, mods, reps = pf.normalizar_cuenta("comercial", None, ["storage"], None)
    assert mods == ["storage"] and reps == []


def test_un_comercial_sin_nada_que_ver_se_rechaza():
    with pytest.raises(HTTPException) as e:
        pf.normalizar_cuenta("comercial", None, ["converter"], None)
    assert e.value.status_code == 400


def test_un_comercial_no_recibe_funciones_sueltas():
    assert not pf.tiene(_com(modulos=["reports", *pf.FUNCIONES]), pf.TOMA_REANALISIS)


def test_el_filtro_de_report_deja_solo_sus_plantas():
    filtro, params = reportes._filtro_alcance(_com(PLANTAS), None, None)
    assert "OR" in filtro
    assert params["com_c0"] == "dole" and params["com_p0"] == "dole lontue"
    assert params["com_c1"] == "verfrut" and "com_p1" not in params  # sin planta = todo ese Sold To


def test_el_filtro_de_report_sin_plantas_no_deja_pasar_nada():
    filtro, _ = reportes._filtro_alcance(_com([]), None, None)
    assert "FALSE" in filtro
    filtro, _ = reportes._filtro_alcance(_com(None), None, None)
    assert "FALSE" in filtro


def test_lo_que_pida_el_navegador_solo_acota_mas_nunca_amplia():
    filtro, params = reportes._filtro_alcance(_com(PLANTAS), "AGRICOM", None)
    assert params["cliente"] == "AGRICOM" and "com_c0" in params  # sigue dentro de sus plantas


def test_cierra_las_puertas_internas_y_la_escritura():
    c = _com(PLANTAS)
    for guardia in (solo_interno, solo_escribiente):
        with pytest.raises(HTTPException) as e:
            guardia(c)
        assert e.value.status_code == 403


def test_la_api_interna_le_responde_403():
    app.dependency_overrides[usuario_actual] = lambda: _com(PLANTAS)
    try:
        cli = TestClient(app)
        assert cli.get("/api/usuarios").status_code == 403
        assert cli.get("/api/reportes/clientes").status_code == 403
        assert cli.post("/api/toma-muestras/solicitudes", json={}).status_code == 403
        assert cli.get("/api/auditoria-interna/solicitudes").status_code == 403
    finally:
        app.dependency_overrides.pop(usuario_actual, None)


def test_storage_solo_las_carpetas_de_sus_plantas(monkeypatch):
    monkeypatch.setattr(informes_cliente, "_plantas_del_cliente", lambda sold_to: ["VERFRUT RAPEL", "VERFRUT SAN FERNANDO"] if sold_to == "VERFRUT" else [])
    carpetas = informes_cliente.carpetas_permitidas(_com(PLANTAS))
    assert carpetas == {
        carpeta_planta("DOLE LONTUE", "DOLE").casefold(),
        carpeta_planta("VERFRUT RAPEL", "VERFRUT").casefold(),
        carpeta_planta("VERFRUT SAN FERNANDO", "VERFRUT").casefold(),
    }
    assert informes_cliente.carpetas_permitidas(_com([])) == set()
    with pytest.raises(HTTPException):
        informes_cliente._exigir_alcance([carpeta_planta("OTRA PLANTA", "OTRO")], _com(PLANTAS))


def _cuenta(tipo, plantas):
    return usuarios.UsuarioIn(email="a@b.cl", nombre="A", tipoAcceso=tipo, modulos=["reports"], plantasAsignadas=plantas)


def test_crear_un_comercial_exige_plantas_y_las_deja_limpias():
    with pytest.raises(HTTPException) as e:
        usuarios._validar(_cuenta("comercial", []))
    assert e.value.status_code == 400
    c = _cuenta("comercial", [*PLANTAS, {"clienteNombre": " dole ", "plantaNombre": "dole lontue"}, {"clienteNombre": "", "plantaNombre": "X"}])
    usuarios._validar(c)
    assert c.plantasAsignadas == PLANTAS  # sin repetidas ni vacías
    otra = _cuenta("analista", PLANTAS)
    usuarios._validar(otra)
    assert otra.plantasAsignadas is None  # solo el comercial lleva plantas


# ── Toma de muestras → Solicitudes e informes y Panel de control interno (solo lectura, solo sus plantas) ──

from app import auditoria_interna, entrega_indicadores, toma_muestras  # noqa: E402
from app.auth import interno_o_comercial_acotado, planta_permitida  # noqa: E402


def test_planta_permitida_compara_sin_mayusculas_ni_espacios_y_sin_plantas_nunca():
    c = _com(PLANTAS)
    assert planta_permitida(c, " dole ", "dole  lontue")
    assert not planta_permitida(c, "DOLE", "DOLE CODEGUA")  # otra planta del mismo Sold To
    assert planta_permitida(c, "VERFRUT", "CUALQUIERA")  # sin planta asignada = todo ese Sold To
    assert not planta_permitida(c, "AGRICOM", "DOLE LONTUE")
    assert not planta_permitida(_com([]), "DOLE", "DOLE LONTUE")
    muestreador = Usuario(id="3", email="m@x.cl", nombre="M", tipoAcceso="muestreador")
    assert planta_permitida(muestreador, "CUALQUIERA", None)  # los demás tipos no los decide esta función


def test_una_solicitud_es_visible_solo_si_es_de_sus_plantas():
    c = _com(PLANTAS)
    assert toma_muestras._es_propia(c, {"sold_to": "DOLE", "ship_to": "DOLE LONTUE"})
    assert not toma_muestras._es_propia(c, {"sold_to": "DOLE", "ship_to": "DOLE CODEGUA"})
    assert not toma_muestras._es_propia(c, {"sold_to": "OTRO", "ship_to": None})


def test_el_listado_de_solicitudes_le_trae_solo_las_suyas(monkeypatch):
    base = {"laboratorio": "AGROFRESH", "creado_en": "2026-10-01T10:00:00", "fecha_solicitud": "2026-10-01", "solicitante": "S", "generado_por": "G"}
    monkeypatch.setattr(
        toma_muestras, "leer_todas_las_solicitudes",
        lambda *a, **k: [
            ("a.xlsx", {**base, "numero_solicitud": "OT-1", "sold_to": "DOLE", "ship_to": "DOLE LONTUE"}),
            ("b.xlsx", {**base, "numero_solicitud": "OT-2", "sold_to": "DOLE", "ship_to": "DOLE CODEGUA"}),
            ("c.xlsx", {**base, "numero_solicitud": "OT-3", "sold_to": "VERFRUT", "ship_to": "VERFRUT RAPEL"}),
            ("d.xlsx", {**base, "numero_solicitud": "OT-4", "sold_to": "AGRICOM", "ship_to": "AGRICOM 1"}),
        ],
    )
    monkeypatch.setattr(toma_muestras, "_leer_config", lambda *a, **k: [])
    app.dependency_overrides[usuario_actual] = lambda: _com(PLANTAS)
    try:
        r = TestClient(app).get("/api/toma-muestras/solicitudes")
        assert r.status_code == 200, r.text
        assert sorted(x["numero_solicitud"] for x in r.json()) == ["OT-1", "OT-3"]
    finally:
        app.dependency_overrides.pop(usuario_actual, None)


def test_solo_puede_pedir_las_rutas_de_lectura_de_la_lista_blanca():
    app.dependency_overrides[usuario_actual] = lambda: _com(PLANTAS)
    try:
        cli = TestClient(app)
        cerradas = [
            ("post", "/api/toma-muestras/solicitudes", {}),
            ("put", "/api/toma-muestras/solicitudes/a.xlsx", {}),
            ("delete", "/api/toma-muestras/solicitudes/a.xlsx", None),
            ("post", "/api/toma-muestras/solicitudes/a.xlsx/enviar", {}),
            ("post", "/api/toma-muestras/solicitudes/json-zip", {}),
            ("post", "/api/toma-muestras/solicitudes/excel-zip", {}),
            ("get", "/api/toma-muestras/solicitudes/a.xlsx", None),
            ("get", "/api/toma-muestras/config/campos", None),
            ("get", "/api/toma-muestras/solicitudes/a.xlsx/destinatarios", None),
            ("post", "/api/toma-muestras/solicitudes/a.xlsx/quitar-informe", {}),
            ("post", "/api/auditoria-interna/informes", None),
            ("put", "/api/auditoria-interna/plazos", {}),
            ("patch", "/api/auditoria-interna/informes/1/fecha-envio", {}),
            ("post", "/api/envio-cliente/marcar", {}),
            ("get", "/api/reportes/clientes", None),
        ]
        for metodo, ruta, cuerpo in cerradas:
            r = getattr(cli, metodo)(ruta, **({"json": cuerpo} if cuerpo is not None else {}))
            assert r.status_code == 403, (metodo, ruta, r.status_code)
    finally:
        app.dependency_overrides.pop(usuario_actual, None)


def test_el_cliente_sigue_sin_poder_abrir_estos_routers():
    cliente = Usuario(id="5", email="c@x.cl", nombre="C", tipoAcceso="cliente", clienteNombre="DOLE")
    app.dependency_overrides[usuario_actual] = lambda: cliente
    try:
        cli = TestClient(app)
        for ruta in ("/api/toma-muestras/solicitudes", "/api/toma-muestras/solicitudes-informes", "/api/auditoria-interna/solicitudes", "/api/auditoria-interna/hitos"):
            assert cli.get(ruta).status_code == 403, ruta
    finally:
        app.dependency_overrides.pop(usuario_actual, None)


class _Cursor:
    def __init__(self, filas):
        self.filas = filas

    def execute(self, *a, **k):
        pass

    def fetchall(self):
        return list(self.filas)

    def fetchone(self):
        return self.filas[0] if self.filas else None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _falsa_base(monkeypatch, modulo, filas):
    import contextlib

    @contextlib.contextmanager
    def conexion(*a, **k):
        yield object()

    monkeypatch.setattr(modulo, "conexion", conexion)
    monkeypatch.setattr(modulo, "cursor_dict", lambda conn: _Cursor(filas))


def _fila_auditoria(archivo, sold, ship):
    return {
        "archivo": archivo, "numero_solicitud": "OT-" + archivo, "laboratorio": "QUITECA", "sold_to": sold, "ship_to": ship,
        "especie": "Cereza", "fecha_solicitud": None, "fecha_muestreo": None, "creado_en": "2026-10-01T10:00:00",
        "tipo_servicio": None, "variedad": None, "analitos": [], "informe_id": None, "nro_informe": None,
        "nombre_archivo": None, "r2_key": None, "fecha_envio": None, "subido_en": None, "report_nro": None,
        "report_cargado_en": None, "en_report": False,
    }


def test_el_panel_de_control_le_muestra_solo_las_solicitudes_de_sus_plantas(monkeypatch):
    filas = [_fila_auditoria("1", "DOLE", "DOLE LONTUE"), _fila_auditoria("2", "DOLE", "DOLE CODEGUA"), _fila_auditoria("3", "VERFRUT", "X")]
    _falsa_base(monkeypatch, auditoria_interna, filas)
    monkeypatch.setattr(auditoria_interna, "_fechas_envio_manuales", lambda: {})
    monkeypatch.setattr(auditoria_interna, "_catalogos_de_analisis", lambda: ([], []))
    vistas = auditoria_interna.listar_solicitudes(_com(PLANTAS))
    assert sorted(v["archivo"] for v in vistas) == ["1", "3"]
    todo = auditoria_interna.listar_solicitudes(Usuario(id="1", email="a@x.cl", nombre="A", tipoAcceso="admin_general"))
    assert len(todo) == 3


def test_un_informe_de_otra_planta_o_sin_solicitud_no_se_baja(monkeypatch):
    monkeypatch.setattr(auditoria_interna, "_exigir_r2", lambda: None)
    for fila in (
        {"r2_key": "k", "nombre_archivo": "a.pdf", "sold_to": "OTRO", "ship_to": "X"},
        {"r2_key": "k", "nombre_archivo": "a.pdf", "sold_to": None, "ship_to": None},
    ):
        _falsa_base(monkeypatch, auditoria_interna, [fila])
        with pytest.raises(HTTPException) as e:
            auditoria_interna.descargar_informe(1, _com(PLANTAS))
        assert e.value.status_code == 404


# ── Informes Accu-Tab (Post Venta) del comercial ────────────────────────

def _carga(carpeta, cliente, planta):
    return {"carpeta": carpeta, "cliente": cliente, "planta": planta, "tiene_pdf": True}


CARGAS = [
    _carga("a", "DOLE", "DOLE LONTUE"),
    _carga("b", "DOLE", "DOLE CODEGUA"),
    _carga("c", "VERFRUT", None),
    _carga("d", "AGRICOM", "AGRICOM RENGO"),
]


def test_un_comercial_solo_ve_los_informes_accutab_de_sus_plantas(monkeypatch):
    monkeypatch.setattr(postventa, "listar_registros", lambda: CARGAS)
    vistos = [r["carpeta"] for r in postventa._informes_de(_com(PLANTAS), None, None)]
    assert vistos == ["a", "c"]  # DOLE LONTUE y todo VERFRUT; nada de DOLE CODEGUA ni de AGRICOM


def test_lo_que_pida_por_parametro_solo_acota_mas_en_accutab(monkeypatch):
    monkeypatch.setattr(postventa, "listar_registros", lambda: CARGAS)
    assert postventa._informes_de(_com(PLANTAS), "AGRICOM", None) == []
    assert [r["carpeta"] for r in postventa._informes_de(_com(PLANTAS), "VERFRUT", None)] == ["c"]


def test_un_comercial_sin_plantas_no_ve_ningun_informe_accutab(monkeypatch):
    monkeypatch.setattr(postventa, "listar_registros", lambda: CARGAS)
    assert postventa._informes_de(_com([]), None, None) == []
    assert postventa._informes_de(_com(None), None, None) == []


def test_el_pdf_accutab_de_otra_planta_da_404(monkeypatch):
    monkeypatch.setattr(postventa, "listar_registros", lambda: CARGAS)
    with pytest.raises(HTTPException) as e:
        postventa.pdf_del_cliente("d", _com(PLANTAS))
    assert e.value.status_code == 404


def test_el_personal_interno_sigue_viendo_todo_en_accutab(monkeypatch):
    monkeypatch.setattr(postventa, "listar_registros", lambda: CARGAS)
    interno = Usuario(id="1", email="a@agrofresh.com", nombre="A", tipoAcceso="admin_general")
    assert len(postventa._informes_de(interno, None, None)) == 4


def test_el_comercial_puede_llevar_postventa_junto_al_report():
    _, mods, reps = pf.normalizar_cuenta("comercial", None, ["reports"], ["laboratorio", "postventa"])
    assert mods == ["reports"] and reps == ["laboratorio", "postventa"]


# ── Comercial con «todas las plantas» (marca opcional, sin migración) ──────────────────────────────────────────────

def _todas(modulos=("reports", "storage", "todas_las_plantas")):
    return _com(None, modulos)


def test_la_marca_se_guarda_solo_en_un_comercial_y_no_cuenta_como_modulo():
    _, mods, _ = pf.normalizar_cuenta("comercial", None, ["storage", "todas_las_plantas"], None)
    assert mods == ["storage", "todas_las_plantas"]
    with pytest.raises(HTTPException):  # sola no abre nada: sigue pidiendo algún módulo
        pf.normalizar_cuenta("comercial", None, ["todas_las_plantas"], None)
    _, mods, _ = pf.normalizar_cuenta("comercial", None, ["storage"], None)
    assert "todas_las_plantas" not in mods  # sin pedirla no se agrega
    _, mods, _ = pf.normalizar_cuenta("analista", "cromatografia", ["reports", "todas_las_plantas"], None)
    assert "todas_las_plantas" not in mods  # en otro tipo de cuenta no existe


def test_un_comercial_con_la_marca_puede_crearse_sin_lista_de_plantas():
    c = usuarios.UsuarioIn(email="a@b.cl", nombre="A", tipoAcceso="comercial", modulos=["reports", "todas_las_plantas"], plantasAsignadas=[])
    usuarios._validar(c)  # no lanza
    with pytest.raises(HTTPException) as e:
        usuarios._validar(_cuenta("comercial", []))  # sin marca y sin plantas, como siempre
    assert e.value.status_code == 400


def test_el_comercial_con_la_marca_ve_todas_las_plantas_y_sin_ella_sigue_acotado():
    from app.auth import con_lista_de_accesos, planta_permitida, ve_todas_las_plantas
    t = _todas()
    assert ve_todas_las_plantas(t) and not con_lista_de_accesos(t)
    assert planta_permitida(t, "CUALQUIER SOLD TO", "CUALQUIER PLANTA")
    sin = _com(None)
    assert not ve_todas_las_plantas(sin) and con_lista_de_accesos(sin)
    assert not planta_permitida(sin, "CUALQUIER SOLD TO", "CUALQUIER PLANTA")
    # la marca puesta en un cliente no hace nada
    cli = Usuario(id="1", email="c@x.cl", nombre="C", tipoAcceso="cliente", modulos=["todas_las_plantas"], clienteNombre="DOLE")
    assert not ve_todas_las_plantas(cli)


def test_el_filtro_de_report_del_comercial_con_la_marca_no_acota_por_plantas():
    filtro, params = reportes._filtro_alcance(_todas(), None, None)
    assert "com_c0" not in params and "FALSE" not in filtro
    # lo que pida el navegador solo acota más, igual que para el personal interno
    filtro, params = reportes._filtro_alcance(_todas(), "DOLE", None)
    assert params["cliente"] == "DOLE"
    # sin la marca y sin plantas, nada (como siempre)
    assert "FALSE" in reportes._filtro_alcance(_com([]), None, None)[0]


def test_las_carpetas_de_informes_del_comercial_con_la_marca_se_abren_todas():
    informes_cliente._exigir_alcance([carpeta_planta("OTRA PLANTA", "OTRO")], _todas())  # no lanza
    with pytest.raises(HTTPException):
        informes_cliente._exigir_alcance([carpeta_planta("OTRA PLANTA", "OTRO")], _com(None))
