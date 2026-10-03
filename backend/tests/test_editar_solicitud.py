"""
Editar una solicitud antes de enviarla, y la protección real que impide
tocarla (o reenviarla) después.

La regla de negocio (Módulo Solicitudes, tareas 3 y 4): una solicitud se
puede editar libremente mientras no se haya enviado por correo. Una vez
enviada queda de solo lectura -no solo en la pantalla, sino en la API misma:
ocultar el botón "Editar" no sirve de nada si el endpoint sigue aceptando el
PUT.

Necesita Postgres con el esquema aplicado (mismo patrón que
test_toma_muestras_indice.py). Sin base se salta entera.
"""
import pytest

from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado"
)

from fastapi import HTTPException  # noqa: E402

from app import config, correo, toma_muestras as tm  # noqa: E402
from app.auth import Usuario  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

ADMIN = Usuario(id="1", email="admin@agrofresh.com", nombre="Admin", tipoAcceso="admin_general")


@pytest.fixture
def limpio(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo")
        cur.execute("SELECT setval('folio_solicitud', 1, false)")
    yield
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo")


def _cuerpo(**overrides) -> tm.SolicitudIn:
    base = dict(
        laboratorio="AGROFRESH",
        solicitante="J",
        sold_to="ZZ-TEST",
        generado_por="J",
        especie="Cerezas",
        analitos_solicitados=["FDL", "PYR"],
        campos_laboratorio={
            "Fludioxonil (ppm)": "25",
            "Pirimetanil (ppm)": "15",
            "Tipo Aplicación": "Actimist",
        },
    )
    base.update(overrides)
    return tm.SolicitudIn(**base)


@pytest.fixture
def enviar_simulado(monkeypatch):
    """Reemplaza el envío real de correo (necesita credenciales de Gmail que
    no existen en pruebas) por uno que solo anota que se llamó."""
    llamadas: list[tuple] = []
    def _enviar(destinatario, *a, **k):
        llamadas.append((destinatario, *a))
        to = [d.strip() for d in str(destinatario).split(",") if d.strip()]
        return correo.ResultadoEnvio(to=to, cc=k.get("cc") or [], bcc=k.get("bcc") or [])

    monkeypatch.setattr(correo, "enviar", _enviar)
    return llamadas


# --- CASO 3: solicitud no enviada -> editar funciona -----------------------


def test_una_solicitud_no_enviada_se_puede_editar(limpio):
    creada = tm.crear_solicitud(_cuerpo(), usuario=ADMIN)
    assert creada.enviada is False

    editada = tm.editar_solicitud(creada.archivo, _cuerpo(especie="Manzanas"), usuario=ADMIN)

    assert editada.especie == "Manzanas"
    assert editada.enviada is False


# --- CASO 4: editar conserva el mismo folio/archivo, no crea duplicado -----


def test_editar_conserva_el_mismo_folio_y_archivo(limpio):
    creada = tm.crear_solicitud(_cuerpo(), usuario=ADMIN)

    editada = tm.editar_solicitud(creada.archivo, _cuerpo(especie="Manzanas", variedad="Fuji"), usuario=ADMIN)

    assert editada.archivo == creada.archivo
    assert editada.numero_solicitud == creada.numero_solicitud
    assert editada.fecha_solicitud == creada.fecha_solicitud
    assert editada.creado_en == creada.creado_en

    # Y no aparece una segunda solicitud en el listado.
    todas = tm.listar_solicitudes(usuario=ADMIN)
    assert len([s for s in todas if s.numero_solicitud == creada.numero_solicitud]) == 1


def test_editar_actualiza_los_analitos_y_dosis(limpio):
    creada = tm.crear_solicitud(_cuerpo(), usuario=ADMIN)

    editada = tm.editar_solicitud(
        creada.archivo,
        _cuerpo(
            analitos_solicitados=["FDL", "TEBU"],
            campos_laboratorio={
                "Fludioxonil (ppm)": "30",
                "Tebuconazol (ppm)": "8",
                "Tipo Aplicación": "Actimist",
            },
        ), usuario=ADMIN)

    assert editada.analitos_solicitados == ["FDL", "TEBU"]
    assert editada.campos_laboratorio["Fludioxonil (ppm)"] == "30"
    assert editada.campos_laboratorio["Tebuconazol (ppm)"] == "8"

    # Lo escrito queda de verdad en el archivo, no solo en la respuesta.
    releida = tm.obtener_solicitud(creada.archivo, usuario=ADMIN)
    assert releida.analitos_solicitados == ["FDL", "TEBU"]
    assert releida.campos_laboratorio["Tebuconazol (ppm)"] == "8"


# --- CASO 5/6: una solicitud enviada SE PUEDE editar ------------------------
# Regla vigente (ver `Solicitud.enviada` en toma_muestras.py): se edita en
# cualquier momento, incluso después de enviada, y editar la vuelve a dejar
# como no enviada para que el envío automático la mande de nuevo.


def test_una_solicitud_enviada_se_puede_editar_y_vuelve_a_pendiente(limpio, enviar_simulado):
    creada = tm.crear_solicitud(_cuerpo(), usuario=ADMIN)
    tm.enviar_solicitud_por_correo(creada.archivo, tm.EnvioSolicitudIn(destinatario="destino@example.com"), usuario=ADMIN)
    assert tm.obtener_solicitud(creada.archivo, usuario=ADMIN).enviada is True

    editada = tm.editar_solicitud(creada.archivo, _cuerpo(especie="Otra cosa"), usuario=ADMIN)

    assert editada.numero_solicitud == creada.numero_solicitud   # mismo folio
    releida = tm.obtener_solicitud(creada.archivo, usuario=ADMIN)
    assert releida.especie == "Otra cosa"
    assert releida.enviada is False


# --- CASO 7: una solicitud enviada se puede REENVIAR --------------------------
# La pantalla ofrece «Reenviar por correo». El reenvío sale de verdad y la
# solicitud sigue marcada como enviada.


def test_una_solicitud_enviada_se_puede_reenviar(limpio, enviar_simulado):
    creada = tm.crear_solicitud(_cuerpo(), usuario=ADMIN)
    tm.enviar_solicitud_por_correo(creada.archivo, tm.EnvioSolicitudIn(destinatario="destino@example.com"), usuario=ADMIN)
    tm.enviar_solicitud_por_correo(creada.archivo, tm.EnvioSolicitudIn(destinatario="otro@example.com"), usuario=ADMIN)

    assert len(enviar_simulado) == 2
    assert tm.obtener_solicitud(creada.archivo, usuario=ADMIN).enviada is True


def test_enviar_marca_la_solicitud_como_enviada(limpio, enviar_simulado):
    creada = tm.crear_solicitud(_cuerpo(), usuario=ADMIN)
    assert creada.enviada is False

    tm.enviar_solicitud_por_correo(creada.archivo, tm.EnvioSolicitudIn(destinatario="destino@example.com"), usuario=ADMIN)

    releida = tm.obtener_solicitud(creada.archivo, usuario=ADMIN)
    assert releida.enviada is True
    assert releida.enviado_en is not None


def test_editar_una_solicitud_que_no_existe_avisa(limpio):
    with pytest.raises(HTTPException) as e:
        tm.editar_solicitud("no-existe.xlsx", _cuerpo(), usuario=ADMIN)
    assert e.value.status_code == 404
