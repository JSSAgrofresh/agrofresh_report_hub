"""Importador y auditoría de contactos de resultados (Excel maestro):
comercial → CC, técnico → CCO (bcc), admin → CCO; plantas sin correos de
cliente se cargan igual; sincronizar rehace solo los internos."""
from scripts import auditar_contactos_resultado as aud
from scripts import importar_contactos_resultado as imp

ADMIN = "jorge.sandoval@agrofresh.com;cguerrero@agrofresh.com;agrofreshreporthub@gmail.com"


class _Hoja:
    max_row = 10

    def __init__(self, filas):
        self._filas = filas

    def iter_rows(self, min_row=2, max_row=None, values_only=True):
        return iter(self._filas)


def _fila(n, ship, comercial, tecnico, kiwi=None, manzana=None, vigente="SI"):
    f = [None] * 20
    f[0], f[2], f[4], f[6] = n, vigente, "CLIENTE SA", ship
    f[7], f[8], f[9], f[10], f[11] = ADMIN, comercial, tecnico, manzana, kiwi
    return tuple(f)


def _por_cargo(contactos):
    return {c["cargo"] + ":" + c["email"]: c["tipo_copia"] for c in contactos if c["tipo"] == "resultado_interno"}


def test_comercial_cc_tecnico_y_admin_bcc():
    g = {"sold_to": "A", "ship_to": "B", "comercial": ["com@agrofresh.com"],
         "tecnico": ["tec@agrofresh.com"], "admin": ["jorge.sandoval@agrofresh.com"]}
    internos, _ = imp.contactos_internos(g, "", 1)
    assert _por_cargo(internos) == {
        "Comercial:com@agrofresh.com": "cc",
        "Técnico:tec@agrofresh.com": "bcc",
        "Admin:jorge.sandoval@agrofresh.com": "bcc",
    }


def test_nadie_va_dos_veces_si_esta_en_dos_roles():
    g = {"sold_to": "A", "ship_to": "B", "comercial": ["x@agrofresh.com"], "tecnico": ["X@agrofresh.com"], "admin": []}
    internos, _ = imp.contactos_internos(g, "", 1)
    assert [c["tipo_copia"] for c in internos] == ["cc"]


def test_planta_sin_correos_de_cliente_se_carga_con_sus_internos():
    ws = _Hoja([_fila(1, "PLANTA SIN LISTA", "com@agrofresh.com", "tec@agrofresh.com")])
    grupos = imp.construir_grupos(ws)
    assert len(grupos) == 1 and grupos[0]["clientes"] == [] and grupos[0]["tecnico"] == ["tec@agrofresh.com"]


def test_sincronizar_cambia_tecnico_de_cc_a_bcc_y_no_toca_clientes_ni_otras_plantas():
    grupos = [{"sold_to": "A", "ship_to": "B", "especie": "", "clientes": ["cli@x.cl"],
               "comercial": ["com@agrofresh.com"], "tecnico": ["tec@agrofresh.com"], "admin": []}]
    existentes = [
        {"id": 1, "tipo": "resultado_cliente", "sold_to": "A", "ship_to": "B", "especie": "Kiwi", "email": "cli@x.cl",
         "tipo_copia": "cc", "activo": True, "laboratorio": "AGROFRESH", "cargo": "", "nombre": "cli@x.cl", "orden": 1},
        {"id": 2, "tipo": "resultado_interno", "sold_to": "A", "ship_to": "B", "especie": "", "email": "tec@agrofresh.com",
         "tipo_copia": "cc", "cargo": "Técnico", "activo": True, "laboratorio": "AGROFRESH", "nombre": "t", "orden": 2},
        {"id": 3, "tipo": "resultado_interno", "sold_to": "OTRA", "ship_to": "PLANTA", "especie": "", "email": "z@agrofresh.com",
         "tipo_copia": "cc", "cargo": "Comercial", "activo": True, "laboratorio": "AGROFRESH", "nombre": "z", "orden": 1},
    ]
    nuevo, r = imp.sincronizar_internos(existentes, grupos)
    assert r == {"plantas": 1, "quitados": 1, "creados": 4}
    assert any(c["id"] == 1 for c in nuevo) and any(c["id"] == 3 for c in nuevo)  # cliente y otra planta intactos
    tec = [c for c in nuevo if c["email"] == "tec@agrofresh.com"]
    assert {c["especie"] for c in tec} == {"", "Kiwi"}  # también en la especie con correos de cliente
    assert all(c["tipo_copia"] == "bcc" for c in tec)


def _fila_excel(**kw):
    base = {"sold_to": "A", "ship_to": "B", "clientes": [], "comercial": ["com@agrofresh.com"],
            "tecnico": ["tec@agrofresh.com"], "admin": [], "pendiente_andres": False}
    return {**base, **kw}


def _contacto(email, copia, cargo):
    return {"tipo": "resultado_interno", "sold_to": "A", "ship_to": "B", "email": email,
            "tipo_copia": copia, "cargo": cargo, "activo": True}


def test_auditoria_detecta_tecnico_en_cc_faltante_y_planta_sin_contactos():
    ok = [_contacto("com@agrofresh.com", "cc", "Comercial"), _contacto("tec@agrofresh.com", "bcc", "Técnico")]
    assert aud.auditar_planta(_fila_excel(), ok) == []
    en_cc = [_contacto("com@agrofresh.com", "cc", "Comercial"), _contacto("tec@agrofresh.com", "cc", "Técnico")]
    assert any(p.startswith("TÉCNICO EN CC") for p in aud.auditar_planta(_fila_excel(), en_cc))
    falta = [_contacto("com@agrofresh.com", "cc", "Comercial")]
    assert any(p.startswith("TÉCNICO FALTA") for p in aud.auditar_planta(_fila_excel(), falta))
    assert aud.auditar_planta(_fila_excel(), []) == ["SIN CONTACTOS EN EL SISTEMA para esta planta"]
