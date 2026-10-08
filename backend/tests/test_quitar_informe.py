"""
Quitar el informe de una solicitud (Solicitudes e informes): borra TODO lo que trajo el informe
(registro de Report con sus resultados y productos, filas pendientes, registro y PDF de Auditoría) para
poder volver a subirlo. Solo el administrador principal, con su contraseña revisada en el servidor.

Necesita Postgres con el esquema aplicado: sin base se salta.
"""
import pytest
from fastapi import HTTPException

from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado")

from app import auth, confirmar_clave, informes_solicitud as isol  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

ARCHIVO = "OT-ZZQUI9001 prueba.xlsx"
OT = "OT-ZZQUI9001"
OTRA = "OT-ZZQUI9002"
INFORME = "ZZ-2026-9001-PC"
OTRO_INFORME = "ZZ-2026-9002-PC"


def _usuario(email="jorge.sandoval@agrofresh.com", tipo="admin_general") -> auth.Usuario:
    return auth.Usuario(id="1", email=email, nombre="Jorge", tipoAcceso=tipo, area=None, modulos=None)


@pytest.fixture
def datos():
    """La OT con su informe (PDF en Auditoría + Report con resultados y un pendiente) y otra OT que no se debe tocar."""
    with conexion() as conn, cursor_dict(conn) as cur:
        for a, ot in ((ARCHIVO, OT), ("OT-ZZQUI9002 prueba.xlsx", OTRA)):
            cur.execute(
                "INSERT INTO solicitud_archivo (archivo, numero_solicitud, laboratorio, sold_to, ship_to, datos)"
                " VALUES (%s, %s, 'QUITECA', 'EXPORTADORA ERFRUT LTDA', 'FRIGORIFICO CHIMBARONGO', '{}'::jsonb)"
                " ON CONFLICT (archivo) DO NOTHING", (a, ot))
        for nro, ot, key in ((INFORME, OT, "zz/quiteca/uno.pdf"), (OTRO_INFORME, OTRA, "zz/quiteca/dos.pdf")):
            cur.execute(
                "INSERT INTO informe_auditoria (archivo_solicitud, numero_solicitud, nro_informe, laboratorio, nombre_archivo, r2_key)"
                " VALUES (%s, %s, %s, 'Quiteca', %s, %s)",
                (ARCHIVO if ot == OT else "OT-ZZQUI9002 prueba.xlsx", ot, nro, key.rsplit("/", 1)[1], key))
            cur.execute("INSERT INTO solicitud (nro_solicitud, laboratorio, referencia, sold_to_raw, ship_to_raw)"
                        " VALUES (%s, 'Quiteca', %s, 'EXPORTADORA ERFRUT LTDA', 'FRIGORIFICO CHIMBARONGO') RETURNING id", (nro, ot))
            sid = cur.fetchone()["id"]
            cur.execute("INSERT INTO resultado (solicitud_id, analito_raw, valor_num) VALUES (%s, 'DPA', 1.88)", (sid,))
            cur.execute("INSERT INTO producto_aplicado (solicitud_id, analito_raw, tipo_aplicacion) VALUES (%s, 'DPA', 'Ecofog')", (sid,))
        cur.execute("INSERT INTO pendiente_revision (origen, fila, motivos) VALUES ('converter', %s::jsonb, '[]'::jsonb)",
                    ('{"Informe": "%s", "Ship To": "X"}' % INFORME,))
    yield
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud WHERE nro_solicitud LIKE 'ZZ-2026-%'")
        cur.execute("DELETE FROM informe_auditoria WHERE nro_informe LIKE 'ZZ-2026-%'")
        cur.execute("DELETE FROM pendiente_revision WHERE fila::text LIKE '%ZZ-2026-%'")
        cur.execute("DELETE FROM solicitud_archivo WHERE archivo LIKE 'OT-ZZQUI%'")


def _contar(sql, *p):
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(sql, p)
        return cur.fetchone()["n"]


def test_borra_lo_que_trajo_el_informe_y_deja_lo_demas(datos):
    with conexion() as conn, cursor_dict(conn) as cur:
        r = isol.quitar_informe_de_solicitud(cur, ARCHIVO)
    assert r["numeros"] == [INFORME] and r["solicitudes_report"] == 1 and r["resultados"] == 1
    assert r["productos"] == 1 and r["pendientes"] == 1 and r["pdf_auditoria"] == ["zz/quiteca/uno.pdf"]
    assert _contar("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", INFORME) == 0
    assert _contar("SELECT count(*) AS n FROM resultado r JOIN solicitud s ON s.id = r.solicitud_id WHERE s.nro_solicitud = %s", INFORME) == 0
    assert _contar("SELECT count(*) AS n FROM informe_auditoria WHERE nro_informe = %s", INFORME) == 0
    assert _contar("SELECT count(*) AS n FROM pendiente_revision WHERE fila::text LIKE %s", "%" + INFORME + "%") == 0
    # la solicitud de Toma de muestras y el informe de OTRA solicitud no se tocan
    assert _contar("SELECT count(*) AS n FROM solicitud_archivo WHERE archivo = %s", ARCHIVO) == 1
    assert _contar("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", OTRO_INFORME) == 1
    assert _contar("SELECT count(*) AS n FROM informe_auditoria WHERE nro_informe = %s", OTRO_INFORME) == 1


def test_una_solicitud_sin_informe_da_404_y_no_toca_nada(datos):
    with conexion() as conn, cursor_dict(conn) as cur:
        isol.quitar_informe_de_solicitud(cur, ARCHIVO)
        with pytest.raises(HTTPException) as e:
            isol.quitar_informe_de_solicitud(cur, ARCHIVO)
    assert e.value.status_code == 404
    with conexion() as conn, cursor_dict(conn) as cur:
        with pytest.raises(HTTPException) as e:
            isol.quitar_informe_de_solicitud(cur, "no-existe.xlsx")
    assert e.value.status_code == 404


def test_solo_el_principal_y_con_su_clave_en_el_servidor(datos, monkeypatch):
    monkeypatch.setattr(confirmar_clave, "clave_correcta", lambda usuario, password: password == "buena")
    body = lambda p: isol.QuitarInformeIn(password=p)  # noqa: E731
    with pytest.raises(HTTPException) as e:
        isol.quitar_informe(ARCHIVO, body("buena"), usuario=_usuario(email="otra.persona@agrofresh.com"))
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        isol.quitar_informe(ARCHIVO, body("mala"), usuario=_usuario())
    assert e.value.status_code == 403            # 403 y no 401: un 401 cierra la sesión
    with pytest.raises(HTTPException) as e:
        isol.quitar_informe(ARCHIVO, body(None), usuario=_usuario())
    assert e.value.status_code == 403
    assert _contar("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", INFORME) == 1   # nada se borró


def test_borra_tambien_los_pdf_y_un_pdf_que_falla_no_deshace_lo_borrado(datos, monkeypatch):
    monkeypatch.setattr(confirmar_clave, "clave_correcta", lambda usuario, password: True)
    borrados = []
    monkeypatch.setattr(isol.r2a, "disponible", lambda: True)
    monkeypatch.setattr(isol.r2a, "eliminar", lambda k: borrados.append(("auditoria", k)))
    monkeypatch.setattr(isol.r2, "disponible", lambda: True)
    monkeypatch.setattr(isol.r2, "listar_keys", lambda prefijo: [
        f"{prefijo}2026-10-02/Ecofog/Quiteca/{INFORME} Erfrut.pdf", f"{prefijo}2026-10-02/Ecofog/Quiteca/{OTRO_INFORME}.pdf"])

    def _falla(k):
        raise RuntimeError("R2 caído")
    monkeypatch.setattr(isol.r2, "eliminar", _falla)
    r = isol.quitar_informe(ARCHIVO, isol.QuitarInformeIn(password="x"), usuario=_usuario())
    assert borrados == [("auditoria", "zz/quiteca/uno.pdf")]
    assert r["pdf_borrados"] == 1 and r["pdf_no_borrados"] == 1          # la copia de Storage falló: se avisa
    assert r["resultados"] == 1 and r["estado"] == "quitado"
    assert _contar("SELECT count(*) AS n FROM solicitud WHERE nro_solicitud = %s", INFORME) == 0   # la base sí quedó limpia
