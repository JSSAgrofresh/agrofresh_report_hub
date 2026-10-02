"""
Auditoría interna contra Postgres real (se salta sola si no hay base): el
ciclo completo subir PDF -> panel -> concretada, con R2 simulado en memoria.
"""
import pytest
from fastapi.testclient import TestClient

from app import r2_auditoria as r2a
from app.auth import Usuario, usuario_actual
from app.db import conexion, cursor_dict
from app.main import app
from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not (hay_base("solicitud_archivo") and hay_base("informe_auditoria")),
    reason="sin Postgres con las migraciones 0020 y 0044",
)

cliente = TestClient(app)
ARCHIVO_OT = "TEST-AUDINT/OT-9001.xlsx"
NRO_INFORME = "TEST-AUDINT-0001"
PDF = b"%PDF-1.4 prueba"


@pytest.fixture
def entorno(monkeypatch):
    bucket: dict[str, bytes] = {}
    monkeypatch.setattr(r2a, "disponible", lambda: True)
    monkeypatch.setattr(r2a, "subir", lambda k, d, c="application/pdf": bucket.__setitem__(k, d))
    monkeypatch.setattr(r2a, "descargar", lambda k: bucket.get(k))
    monkeypatch.setattr(r2a, "existe", lambda k: k in bucket)
    monkeypatch.setattr(r2a, "eliminar", lambda k: bucket.pop(k, None))

    monkeypatch.setattr(r2a, "copiar", lambda o, d: bucket.__setitem__(d, bucket[o]))
    monkeypatch.setattr(r2a, "listar_recursivo", lambda p: [k for k in bucket if k.startswith(p)])

    def listar_nivel(ruta):
        prefijo = f"{ruta}/" if ruta else ""
        carpetas, archivos = set(), []
        for k, d in bucket.items():
            if not k.startswith(prefijo):
                continue
            resto = k[len(prefijo):]
            if "/" in resto:
                carpetas.add(resto.split("/")[0])
            else:
                archivos.append({"key": k, "nombre": resto, "tamano_bytes": len(d), "modificado": "2026-09-29T00:00:00"})
        return sorted(carpetas), archivos

    monkeypatch.setattr(r2a, "listar_nivel", listar_nivel)
    app.dependency_overrides[usuario_actual] = lambda: Usuario(
        id="1", email="jorge@agrofresh.com", nombre="Jorge", tipoAcceso="admin_general"
    )
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM informe_auditoria WHERE laboratorio = 'TestLab'")
        cur.execute("DELETE FROM solicitud_archivo WHERE archivo = %s", (ARCHIVO_OT,))
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud = %s", (NRO_INFORME,))
        cur.execute(
            "INSERT INTO solicitud_archivo (archivo, numero_solicitud, laboratorio, sold_to, ship_to, creado_en, datos)"
            " VALUES (%s, 'OT-9001', 'TestLab', 'Cliente T', 'Planta T', '2026-09-28T10:00:00',"
            " '{\"variedad\": \"Bing\", \"campos_laboratorio\": {\"Tipo Aplicación\": \"Actimist\"},"
            " \"analitos_solicitados\": [\"FDL\", \"PYR\"]}')",
            (ARCHIVO_OT,),
        )
    yield bucket
    app.dependency_overrides.clear()
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM informe_auditoria WHERE laboratorio = 'TestLab'")
        cur.execute("DELETE FROM solicitud_archivo WHERE archivo = %s", (ARCHIVO_OT,))
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud = %s", (NRO_INFORME,))


def _subir(**extra):
    datos = {"laboratorio": "TestLab", "ship_to": "Planta T", "sold_to": "Cliente T",
             "nro_informe": NRO_INFORME, "archivo_solicitud": ARCHIVO_OT, **extra}
    return cliente.post("/api/auditoria-interna/informes", data=datos,
                        files={"archivo": ("informe 1.pdf", PDF, "application/pdf")})


def _mi_fila():
    filas = cliente.get("/api/auditoria-interna/solicitudes").json()
    return next(f for f in filas if f["archivo"] == ARCHIVO_OT)


def test_ciclo_completo(entorno):
    # Antes de subir: emitida, sin informe, y es candidata para Converter.
    assert _mi_fila()["informe"] is None and not _mi_fila()["concretada"]
    abiertas = cliente.get("/api/auditoria-interna/solicitudes-abiertas").json()
    assert any(a["archivo"] == ARCHIVO_OT for a in abiertas)

    r = _subir(fecha_envio="2026-09-29T09:15")
    assert r.status_code == 200, r.text
    assert r.json()["ruta"] == "TestLab/Planta T/informe 1.pdf"
    assert entorno["TestLab/Planta T/informe 1.pdf"] == PDF

    # Con PDF pero sin resultados en Report todavía: NO concretada.
    fila = _mi_fila()
    assert fila["informe"]["fecha_envio"] is not None and fila["informe"]["cargado_en"]
    assert not fila["en_report"] and not fila["concretada"]
    assert not any(a["archivo"] == ARCHIVO_OT
                   for a in cliente.get("/api/auditoria-interna/solicitudes-abiertas").json())

    # Aparecen los resultados en Report: ahora sí.
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("INSERT INTO solicitud (nro_solicitud, laboratorio) VALUES (%s, 'TestLab')", (NRO_INFORME,))
    assert _mi_fila()["concretada"]

    # La carpeta se creó sola y el listado la muestra.
    raiz = cliente.get("/api/auditoria-interna/carpetas").json()
    assert [c["nombre"] for c in raiz["carpetas"]] == ["TestLab"]  # solo la que tiene un informe
    ship = cliente.get("/api/auditoria-interna/carpetas", params={"ruta": "TestLab/Planta T"}).json()
    assert ship["archivos"][0]["numero_solicitud"] == "OT-9001"
    assert ship["archivos"][0]["nro_informe"] == NRO_INFORME
    pdf = cliente.get(f"/api/auditoria-interna/informes/{fila['informe']['id']}/pdf")
    assert pdf.content == PDF and pdf.headers["content-type"] == "application/pdf"


def test_fecha_de_envio_se_edita_y_se_puede_vaciar(entorno):
    _subir()
    informe_id = _mi_fila()["informe"]["id"]
    assert _mi_fila()["informe"]["fecha_envio"] is None  # puede quedar vacía
    r = cliente.patch(f"/api/auditoria-interna/informes/{informe_id}/fecha-envio",
                      json={"fecha_envio": "2026-09-30T08:00"})
    assert r.status_code == 200 and r.json()["fecha_envio"]
    r = cliente.patch(f"/api/auditoria-interna/informes/{informe_id}/fecha-envio", json={"fecha_envio": None})
    assert r.json()["fecha_envio"] is None


def test_subir_el_mismo_informe_reemplaza_no_duplica(entorno):
    _subir()
    _subir(ship_to="Otra Planta")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT r2_key FROM informe_auditoria WHERE laboratorio = 'TestLab'")
        filas = cur.fetchall()
    assert [f["r2_key"] for f in filas] == ["TestLab/Otra Planta/informe 1.pdf"]
    assert list(entorno) == ["TestLab/Otra Planta/informe 1.pdf"]  # el PDF viejo se fue


def test_mismo_nombre_en_la_carpeta_no_pisa_otro_informe(entorno):
    _subir(nro_informe="TEST-AUDINT-0001")
    _subir(nro_informe="TEST-AUDINT-0002", archivo_solicitud="")
    assert sorted(entorno) == ["TestLab/Planta T/informe 1 (2).pdf", "TestLab/Planta T/informe 1.pdf"]


def test_amarrar_a_una_ot_que_no_existe_da_400(entorno):
    assert _subir(archivo_solicitud="no-existe.xlsx").status_code == 400
    assert entorno == {}


def test_borrar_carpeta_borra_lo_de_adentro_y_su_registro(entorno):
    _subir()
    assert cliente.delete("/api/auditoria-interna/carpetas/carpeta", params={"ruta": "TestLab"}).json() == {"eliminados": 1}
    assert entorno == {}
    assert _mi_fila()["informe"] is None  # vuelve a estar pendiente


def test_renombrar_actualiza_el_registro(entorno):
    _subir()
    r = cliente.post("/api/auditoria-interna/carpetas/renombrar",
                     json={"ruta": "TestLab/Planta T/informe 1.pdf", "nuevo_nombre": "Informe final"})
    assert r.json()["ruta"] == "TestLab/Planta T/Informe final.pdf"
    assert list(entorno) == ["TestLab/Planta T/Informe final.pdf"]
    assert _mi_fila()["informe"]["ruta"] == "TestLab/Planta T/Informe final.pdf"


def test_la_lista_trae_tipo_de_servicio_variedad_y_analitos(entorno):
    fila = _mi_fila()
    assert fila["tipo_servicio"] == "Actimist"
    assert fila["variedad"] == "Bing"
    assert fila["analitos"] == ["FDL", "PYR"]


def test_una_solicitud_sin_esos_datos_no_rompe_la_lista(entorno):
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("UPDATE solicitud_archivo SET datos = '{}' WHERE archivo = %s", (ARCHIVO_OT,))
    fila = _mi_fila()
    assert fila["tipo_servicio"] is None and fila["variedad"] is None and fila["analitos"] == []


def test_las_solicitudes_de_agrofresh_tambien_se_ven(entorno):
    """El informe propio (Converter, laboratorio Agrofresh) se audita igual que
    los de Quiteca: su solicitud sale en el panel y en las candidatas de Converter."""
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("UPDATE solicitud_archivo SET laboratorio = 'AGROFRESH' WHERE archivo = %s", (ARCHIVO_OT,))
    assert _mi_fila()["laboratorio"] == "AGROFRESH"
    abiertas = cliente.get("/api/auditoria-interna/solicitudes-abiertas").json()
    assert any(a["archivo"] == ARCHIVO_OT for a in abiertas)
