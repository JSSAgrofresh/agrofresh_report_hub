"""Ingreso de informes contra Postgres real (se salta sola si no hay base): un informe = un incidente."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import correo_informes as ci
from app.auth import Usuario, usuario_actual
from app.db import conexion, cursor_dict
from app.main import app
from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not (hay_base("correo_informe") and hay_base("solicitud_archivo")),
    reason="sin Postgres con las migraciones 0020, 0064, 0065 y 0066",
)

BUZON = "test-correo-informes@prueba.cl"
UTC = timezone.utc
AHORA = datetime.now(UTC)


def _fila(nro: str, ot: str, estado: str, para: list[str], sha: str, hallazgos=None) -> dict:
    return {
        "pdf_nombre": f"{nro}.pdf", "pdf_sha256": sha, "laboratorio": "Quiteca", "soportado": True, "nro_informe": nro,
        "ot": ot, "sold_to": "CLIENTE", "ship_to": "PLANTA", "especie": "cereza", "fecha_muestreo": None,
        "archivo_solicitud": None, "estado": estado, "ya_cargado": False, "esperado": {"to": ["lista@cliente.cl"]},
        "hallazgos": hallazgos or ([] if estado == "ok" else [{"nivel": "rojo", "codigo": "destinatarios_de_mas", "texto": "salió a otro"}]),
        "para": para, "cc": [], "bcc": [],
    }


@pytest.fixture
def datos():
    """1912: salió mal y un reenvío llegó bien · 1914: salió mal dos veces · 1913: bien."""
    base = AHORA - timedelta(days=5)
    envios = [
        ("TEST-1912-PC", "OT-TEST0051", "rojo", ["otro@agrovic.cl"], base),
        ("TEST-1912-PC", "OT-TEST0051", "ok", ["lista@cliente.cl"], base + timedelta(days=4)),
        ("TEST-1914-PC", "OT-TEST0053", "rojo", ["marcelo@elmoral.cl"], base),
        ("TEST-1914-PC", "OT-TEST0053", "rojo", ["patricio@unifrutti.com"], base + timedelta(days=4)),
        ("TEST-1913-PC", "OT-TEST0052", "ok", ["lista@cliente.cl"], base + timedelta(days=1)),
    ]
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM correo_informe WHERE buzon = %s", (BUZON,))
        for i, (nro, ot, estado, para, llegada) in enumerate(envios):
            correo = {"asunto": f"Informe {nro}", "remitente": "informes@quiteca.cl", "llegada_en": llegada, "enviado_en": llegada}
            ci.guardar_fila(cur, BUZON, f"<test-{i}@x>", correo, _fila(nro, ot, estado, para, f"sha{i}"), None)
    yield
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM correo_informe WHERE buzon = %s", (BUZON,))


@pytest.fixture
def principal():
    app.dependency_overrides[usuario_actual] = lambda: Usuario(
        id="1", email="jorge.sandoval@agrofresh.com", nombre="Jorge", tipoAcceso="admin_general")
    yield TestClient(app)
    app.dependency_overrides.clear()


def _mios(r):
    return [i for i in r.json()["informes"] if (i["nro_informe"] or "").startswith("TEST-")]


def test_la_lista_trae_una_fila_por_informe_con_su_numero_de_envios(datos, principal):
    r = principal.get("/api/correo-informes?decision=pendiente")
    assert r.status_code == 200
    filas = {i["nro_informe"]: i for i in _mios(r)}
    assert set(filas) == {"TEST-1912-PC", "TEST-1913-PC", "TEST-1914-PC"}          # 5 correos, 3 informes
    assert filas["TEST-1914-PC"]["envios"] == 2 and filas["TEST-1914-PC"]["estado"] == "rojo"
    assert filas["TEST-1912-PC"]["estado"] == "ok" and filas["TEST-1912-PC"]["tuvo_incidente"] is True
    assert filas["TEST-1913-PC"]["tuvo_incidente"] is False and filas["TEST-1913-PC"]["envios"] == 1
    assert all(i["es_ultima_copia"] for i in filas.values())


def test_el_filtro_seguimiento_trae_los_dos_incidentes_aunque_uno_ya_se_corrigio(datos, principal):
    """El 1912 salió mal y se corrigió: sigue siendo un incidente y tiene que aparecer, una sola vez."""
    r = principal.get("/api/correo-informes?estado=rojo")
    assert sorted(i["nro_informe"] for i in _mios(r)) == ["TEST-1912-PC", "TEST-1914-PC"]
    assert r.json()["conteos"]["rojo"] >= 2


def test_con_la_casilla_de_envios_anteriores_salen_todas_las_copias(datos, principal):
    r = principal.get("/api/correo-informes?copias=true&decision=pendiente")
    mias = _mios(r)
    assert len(mias) == 5
    assert sum(1 for i in mias if not i["es_ultima_copia"]) == 2


def test_el_detalle_trae_el_historial_de_envios_del_informe(datos, principal):
    fila = next(i for i in _mios(principal.get("/api/correo-informes")) if i["nro_informe"] == "TEST-1914-PC")
    d = principal.get(f"/api/correo-informes/{fila['id']}").json()
    assert [e["para"] for e in d["historial"]] == [["marcelo@elmoral.cl"], ["patricio@unifrutti.com"]]
    assert d["historial"][-1]["id"] == fila["id"] and d["propios"]


def test_el_panel_cuenta_incidentes_por_informe(datos, principal):
    k = principal.get("/api/correo-informes/panel?dias=60").json()["kpis"]
    # En esta base pueden existir otros datos: los míos suman al menos 2 incidentes, 1 abierto.
    assert k["incidentes"] >= 2 and k["incidentes_abiertos"] >= 1 and k["incidentes_cerrados"] >= 1


def test_informar_al_laboratorio_vale_para_todo_el_informe_y_no_borra_el_incidente(datos, principal):
    copia_vieja = next(i for i in _mios(principal.get("/api/correo-informes?copias=true")) if i["nro_informe"] == "TEST-1914-PC" and not i["es_ultima_copia"])
    r = principal.post(f"/api/correo-informes/{copia_vieja['id']}/informado", json={"nota": "Avisé a Quiteca por correo"})
    assert r.status_code == 200
    fila = next(i for i in _mios(principal.get("/api/correo-informes")) if i["nro_informe"] == "TEST-1914-PC")
    assert fila["informado"] is True and fila["estado"] == "rojo"            # la última copia hereda el «ya se informó»
    sin = next(i for i in _mios(principal.get("/api/correo-informes")) if i["nro_informe"] == "TEST-1912-PC")
    assert sin["informado"] is False


def test_resolver_cierra_y_rechazar_pide_motivo(datos, principal):
    fila = next(i for i in _mios(principal.get("/api/correo-informes")) if i["nro_informe"] == "TEST-1914-PC")
    assert principal.post(f"/api/correo-informes/{fila['id']}/rechazar", json={"nota": " "}).status_code == 400
    assert principal.post(f"/api/correo-informes/{fila['id']}/resolver", json={"nota": "Quiteca reenvió bien"}).status_code == 200
    d = principal.get(f"/api/correo-informes/{fila['id']}").json()
    assert d["resuelto_en"] and d["nota_incidente"] == "Quiteca reenvió bien"
    assert principal.post(f"/api/correo-informes/{fila['id']}/rechazar", json={"nota": "duplicado"}).status_code == 200
    assert principal.get(f"/api/correo-informes/{fila['id']}").json()["decision"] == "rechazado"
    assert principal.post(f"/api/correo-informes/{fila['id']}/volver-a-pendiente").status_code == 200
    assert principal.get(f"/api/correo-informes/{fila['id']}").json()["decision"] == "pendiente"
