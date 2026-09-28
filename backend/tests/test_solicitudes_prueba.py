"""
Solicitudes de prueba.

Al borrar las pruebas del arranque, el contador de folios no volvió atrás:
las solicitudes reales empezaron en QUITECA 18 y AGF 50. El hueco (1..17 y
1..49) se llena con solicitudes de prueba: solo las crea una cuenta, toman el
folio libre más bajo del hueco sin mover el contador real, no avisan a nadie,
no llegan al Ingreso al laboratorio y su correo sale con "(PRUEBA)".

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
    # Las reales de QUITECA empezaron en el 3: el hueco de prueba es 1..2.
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
    assert tm.estado_solicitudes_prueba(OTRO_ADMIN) == {"permitido": False, "laboratorios": []}
    with pytest.raises(HTTPException) as e:
        tm.crear_solicitud_prueba(_cuerpo(), OTRO_ADMIN)
    assert e.value.status_code == 403


def test_toma_el_folio_libre_mas_bajo_y_se_bloquea_al_llenar_el_hueco(entorno):
    primera = tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    segunda = tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    assert (primera.numero_solicitud, segunda.numero_solicitud) == ("OT-QTC0001", "OT-QTC0002")
    assert primera.es_prueba and segunda.es_prueba

    with pytest.raises(HTTPException) as e:
        tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    assert e.value.status_code == 409

    estado = {l["laboratorio"]: l for l in tm.estado_solicitudes_prueba(DUENO)["laboratorios"]}
    assert estado["QUITECA"] == {"laboratorio": "QUITECA", "limite": 2, "usados": 2, "siguiente": None}


def test_un_laboratorio_sin_solicitudes_reales_no_tiene_hueco(entorno):
    with pytest.raises(HTTPException) as e:
        tm.crear_solicitud_prueba(_cuerpo("AGROFRESH"), DUENO)
    assert e.value.status_code == 409


def test_no_mueve_el_contador_real_ni_avisa(entorno):
    avisos = entorno
    tm.crear_solicitud_prueba(_cuerpo(), DUENO)
    assert avisos == []
    real = tm.crear_solicitud(_cuerpo(), DUENO)
    assert real.numero_solicitud == "OT-QTC0005"
    assert not real.es_prueba
    assert len(avisos) == 1


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
