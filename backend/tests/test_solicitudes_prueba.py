"""
Solicitudes de prueba.

Las solicitudes de prueba llevan su propia serie de folios, `OTP-<prefijo>NNNN`
(OTP-DIAG0001, OTP-QTC0001…), un correlativo por laboratorio que parte en 1: solo
las crea una cuenta, no mueven ni gastan el contador real, no avisan a nadie, no
llegan al Ingreso al laboratorio y su correo sale con "(PRUEBA)".

Necesita Postgres con el esquema aplicado; sin base se salta entera.
"""
import pytest

from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado"
)

from fastapi import HTTPException  # noqa: E402

from app import config, config_store, correo, emitir, indice_solicitudes, toma_muestras as tm  # noqa: E402
from app.auth import Usuario  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

DUENO = Usuario(id="1", email="Dueno@AgroFresh.cl", nombre="Dueño", tipoAcceso="admin_general")
OTRO_ADMIN = Usuario(id="2", email="otra@agrofresh.cl", nombre="Otra", tipoAcceso="admin_general")

LABS = [
    {"id": 1, "codigo": "AGROFRESH", "nombre": "AgroFresh", "prefijo_solicitud": "AGF", "activo": True, "orden": 1},
    {"id": 2, "codigo": "QUITECA", "nombre": "Quiteca", "prefijo_solicitud": "QTC", "activo": True, "orden": 2},
    {"id": 3, "codigo": "DIAGNOFRUIT", "nombre": "Diagnofruit", "prefijo_solicitud": "DIAG", "activo": True, "orden": 3},
]


@pytest.fixture
def entorno(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(config, "SOLICITUDES_PRUEBA_EMAIL", "dueno@agrofresh.cl")
    monkeypatch.setattr("app.r2.disponible", lambda: False)
    leer_original = tm._leer_config
    monkeypatch.setattr(
        tm, "_leer_config",
        lambda archivo, defecto=None: [dict(l) for l in LABS] if archivo == "laboratorios.json"
        else leer_original(archivo, defecto),
    )
    avisos: list[dict] = []
    monkeypatch.setattr(tm, "notificar", lambda **kw: avisos.append(kw))

    def borrar():
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM solicitud_archivo")
            cur.execute("DELETE FROM folio_solicitud_laboratorio")

    borrar()
    # QUITECA ya tiene dos solicitudes reales (3 y 4): las pruebas no las afectan.
    for n in (3, 4):
        folio = f"OT-QTC{n:04d}"
        indice_solicitudes.anotar(f"{folio}.xlsx", {
            "numero_solicitud": folio, "laboratorio": "QUITECA", "sold_to": "ZZ",
            "fecha_solicitud": "2026-09-20", "creado_en": f"2026-09-20T10:0{n}:00+00:00",
        })
    yield avisos
    borrar()


def _cuerpo(laboratorio="QUITECA") -> tm.SolicitudIn:
    return tm.SolicitudIn(
        laboratorio=laboratorio, solicitante="J", sold_to="ZZ-TEST", generado_por="J",
        analitos_solicitados=["FDL"], campos_laboratorio={},
    )


def test_solo_la_cuenta_autorizada_puede_crear_pruebas(entorno):
    assert tm.estado_solicitudes_prueba(OTRO_ADMIN) == {"permitido": False}
    assert tm.estado_solicitudes_prueba(DUENO) == {"permitido": True}
    with pytest.raises(HTTPException) as e:
        tm.crear_solicitud_prueba(_cuerpo(), OTRO_ADMIN)
    assert e.value.status_code == 403


def test_las_pruebas_llevan_su_propia_serie_por_laboratorio(entorno):
    p1 = tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    p2 = tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    assert (p1.numero_solicitud, p2.numero_solicitud) == ("OTP-QTC0001", "OTP-QTC0002")
    assert p1.es_prueba and p2.es_prueba
    # Cada laboratorio parte en 1, también los que ya tienen solicitudes reales o ninguna.
    assert tm.crear_solicitud_prueba(_cuerpo("DIAGNOFRUIT"), DUENO).numero_solicitud == "OTP-DIAG0001"
    assert tm.crear_solicitud_prueba(_cuerpo("AGROFRESH"), DUENO).numero_solicitud == "OTP-AGF0001"
    assert tm.crear_solicitud_prueba(_cuerpo("DIAGNOFRUIT"), DUENO).numero_solicitud == "OTP-DIAG0002"


def test_sin_limite_de_folios(entorno):
    """Ya no hay «hueco»: se pueden crear más pruebas que solicitudes reales."""
    numeros = [tm.crear_solicitud_prueba(_cuerpo(), DUENO).numero_solicitud for _ in range(8)]
    assert numeros[-1] == "OTP-QTC0008"


def test_no_mueve_el_contador_real_ni_avisa(entorno):
    avisos = entorno
    tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    assert avisos == []
    real = tm.crear_solicitud(_cuerpo(), DUENO)
    assert real.numero_solicitud == "OT-QTC0005"
    assert not real.es_prueba
    assert len(avisos) == 1


def test_muchas_pruebas_no_adelantan_el_contador_real(entorno):
    """Las pruebas llegan a OTP-QTC0009, más que el folio real más alto (4): el
    siguiente real igual es el 5, no el 10."""
    for _ in range(9):
        tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    assert tm.crear_solicitud(_cuerpo(), DUENO).numero_solicitud == "OT-QTC0005"


def test_editar_una_prueba_no_le_quita_la_marca(entorno):
    prueba = tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    editada = tm.editar_solicitud(prueba.archivo, _cuerpo(), DUENO)
    assert editada.es_prueba
    assert indice_solicitudes.buscar(prueba.archivo)["es_prueba"] is True


def test_no_llega_al_ingreso_del_laboratorio(entorno, monkeypatch):
    monkeypatch.setattr(emitir, "LABORATORIO_SOLICITUDES", "QUITECA")
    prueba = tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    archivos = {s.archivo for s in emitir.listar_solicitudes()}
    assert prueba.archivo not in archivos
    assert "OT-QTC0003.xlsx" in archivos


def test_el_asunto_del_correo_dice_prueba(entorno, monkeypatch):
    prueba = tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    config_store.escribir("contactos_laboratorio.json", [{
        "email": "recepcion@quiteca.cl", "laboratorio": "QUITECA",
        "tipo": "solicitud", "activo": True, "orden": 1,
    }])
    asuntos: list[str] = []

    def _falso_enviar(destinatario, asunto, *a, **k):
        asuntos.append(asunto)
        return correo.ResultadoEnvio(to=[destinatario], cc=[], bcc=[], mensaje_id="x")

    monkeypatch.setattr(tm.correo, "enviar", _falso_enviar)
    tm.enviar_solicitud_por_correo(prueba.archivo, tm.EnvioSolicitudIn(), usuario=DUENO)
    assert asuntos and asuntos[0].startswith("(PRUEBA) ")
