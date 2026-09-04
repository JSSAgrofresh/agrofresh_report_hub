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
from app.db import conexion, cursor_dict  # noqa: E402


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
    monkeypatch.setattr(correo, "enviar", lambda *a, **k: llamadas.append(a))
    return llamadas


# --- CASO 3: solicitud no enviada -> editar funciona -----------------------


def test_una_solicitud_no_enviada_se_puede_editar(limpio):
    creada = tm.crear_solicitud(_cuerpo())
    assert creada.enviada is False

    editada = tm.editar_solicitud(creada.archivo, _cuerpo(especie="Manzanas"))

    assert editada.especie == "Manzanas"
    assert editada.enviada is False


# --- CASO 4: editar conserva el mismo folio/archivo, no crea duplicado -----


def test_editar_conserva_el_mismo_folio_y_archivo(limpio):
    creada = tm.crear_solicitud(_cuerpo())

    editada = tm.editar_solicitud(creada.archivo, _cuerpo(especie="Manzanas", variedad="Fuji"))

    assert editada.archivo == creada.archivo
    assert editada.numero_solicitud == creada.numero_solicitud
    assert editada.fecha_solicitud == creada.fecha_solicitud
    assert editada.creado_en == creada.creado_en

    # Y no aparece una segunda solicitud en el listado.
    todas = tm.listar_solicitudes()
    assert len([s for s in todas if s.numero_solicitud == creada.numero_solicitud]) == 1


def test_editar_actualiza_los_analitos_y_dosis(limpio):
    creada = tm.crear_solicitud(_cuerpo())

    editada = tm.editar_solicitud(
        creada.archivo,
        _cuerpo(
            analitos_solicitados=["FDL", "TEBU"],
            campos_laboratorio={
                "Fludioxonil (ppm)": "30",
                "Tebuconazol (ppm)": "8",
                "Tipo Aplicación": "Actimist",
            },
        ),
    )

    assert editada.analitos_solicitados == ["FDL", "TEBU"]
    assert editada.campos_laboratorio["Fludioxonil (ppm)"] == "30"
    assert editada.campos_laboratorio["Tebuconazol (ppm)"] == "8"

    # Lo escrito queda de verdad en el archivo, no solo en la respuesta.
    releida = tm.obtener_solicitud(creada.archivo)
    assert releida.analitos_solicitados == ["FDL", "TEBU"]
    assert releida.campos_laboratorio["Tebuconazol (ppm)"] == "8"


# --- CASO 5/6: solicitud enviada -> editar deja de estar disponible --------


def test_una_solicitud_enviada_no_se_puede_editar(limpio, enviar_simulado):
    creada = tm.crear_solicitud(_cuerpo())
    tm.enviar_solicitud_por_correo(creada.archivo, tm.EnvioSolicitudIn(destinatario="destino@example.com"))

    with pytest.raises(HTTPException) as e:
        tm.editar_solicitud(creada.archivo, _cuerpo(especie="Otra cosa"))
    assert e.value.status_code == 409

    # Y lo que había quedó intacto: el rechazo no alcanzó a escribir nada.
    releida = tm.obtener_solicitud(creada.archivo)
    assert releida.especie == "Cerezas"


# --- CASO 7: solicitud enviada -> no se puede reenviar ----------------------


def test_una_solicitud_enviada_no_se_puede_reenviar(limpio, enviar_simulado):
    creada = tm.crear_solicitud(_cuerpo())
    tm.enviar_solicitud_por_correo(creada.archivo, tm.EnvioSolicitudIn(destinatario="destino@example.com"))
    assert len(enviar_simulado) == 1

    with pytest.raises(HTTPException) as e:
        tm.enviar_solicitud_por_correo(creada.archivo, tm.EnvioSolicitudIn(destinatario="otro@example.com"))
    assert e.value.status_code == 409

    # No se disparó un segundo correo.
    assert len(enviar_simulado) == 1


def test_enviar_marca_la_solicitud_como_enviada(limpio, enviar_simulado):
    creada = tm.crear_solicitud(_cuerpo())
    assert creada.enviada is False

    tm.enviar_solicitud_por_correo(creada.archivo, tm.EnvioSolicitudIn(destinatario="destino@example.com"))

    releida = tm.obtener_solicitud(creada.archivo)
    assert releida.enviada is True
    assert releida.enviado_en is not None


def test_editar_una_solicitud_que_no_existe_avisa(limpio):
    with pytest.raises(HTTPException) as e:
        tm.editar_solicitud("no-existe.xlsx", _cuerpo())
    assert e.value.status_code == 404
