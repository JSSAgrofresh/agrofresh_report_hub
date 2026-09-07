"""
El bug reportado en la inducción: alguien crea y envía una solicitud, el
sistema dice "enviada" y esa persona nunca ve la copia en su bandeja.

`enviar_solicitud_por_correo` ya pone en Bcc, siempre, el correo guardado en
`email_solicitante` -que `crear_solicitud` fuerza al correo de la sesión que
crea la solicitud cuando es un muestreador, así que no es un dato que se
pueda falsear-. Estas pruebas fijan ese comportamiento (para que nadie lo
rompa sin darse cuenta) y agregan lo que faltaba: que una dirección con
formato inválido no tumbe el envío en silencio, y que cada intento -exitoso
o no- quede registrado para poder auditarlo.

El registro de auditoría (`envio_solicitud_log`) es best-effort: si la base
no está disponible, el envío igual se completa y solo queda un log de
proceso -eso se prueba en `test_direccion_invalida...` y
`test_no_se_puede_reenviar...`, que fallan ANTES de llegar a reindexar y por
eso no necesitan Postgres-. Las pruebas del camino feliz sí lo necesitan:
`enviar_solicitud_por_correo` reindexa la solicitud (marca `enviada=True`)
después de un envío exitoso, y eso pasa por la base sin ser best-effort -se
saltan solas si no hay una, igual que `test_toma_muestras_indice.py`-.
"""
import pytest

from app import config, config_store, correo, toma_muestras as tm
from app.auth import Usuario
from app.solicitud_excel import construir_workbook
from tests.utiles_bd import hay_base

_necesita_base = pytest.mark.skipif(
    not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado"
)


def _usuario(email="ana.perez@agrofresh.com", nombre="Ana Pérez", tipo="admin_area") -> Usuario:
    return Usuario(id="1", email=email, nombre=nombre, tipoAcceso=tipo)


@pytest.fixture
def solicitud_guardada(tmp_path, monkeypatch):
    """Una solicitud OT-0001 de AGROFRESH guardada en disco (layout viejo:
    solicitudes/<LABORATORIO>/<archivo>), sin pasar por el índice en base de
    datos — así la prueba no necesita Postgres."""
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr("app.r2.disponible", lambda: False)

    datos = dict(
        laboratorio="AGROFRESH", solicitante="Jorge Gómez", sold_to="ZZ-TEST Agricom",
        ship_to="ZZ-TEST Planta", especie="Arándano", variedad="Duke",
        generado_por="Jorge Gómez", email_solicitante="jorge.gomez@agrofresh.com",
        tipo_muestra="Fruta", fecha_muestreo="2026-08-31", fecha_solicitud="2026-09-01",
        numero_solicitud="OT-0001", campos_laboratorio={}, analitos_solicitados=[],
        enviada=False,
    )
    analitos_config = tm.ANALITOS_DEFECTO
    wb = construir_workbook(datos, analitos_config)
    carpeta = tmp_path / "solicitudes" / "AGROFRESH"
    carpeta.mkdir(parents=True)
    wb.save(str(carpeta / "OT-0001.xlsx"))

    # Un solo contacto de laboratorio configurado como destinatario de
    # solicitud, para que el envío tenga a quién ir en el "To" además de la
    # copia oculta automática.
    config_store.escribir(
        "contactos_laboratorio.json",
        [{
            "email": "recepcion@quiteca-lab.cl", "laboratorio": "AGROFRESH",
            "tipo": "solicitud", "activo": True, "orden": 1,
        }],
    )
    return "OT-0001.xlsx", datos


@pytest.fixture
def correo_capturado(monkeypatch):
    """Reemplaza correo.enviar por un doble que anota con qué se llamó, sin
    tocar la red ni requerir credenciales de Gmail."""
    llamadas: list[dict] = []

    def _falso_enviar(destinatario, asunto, cuerpo_html, cuerpo_texto=None, adjuntos=None, cc=None, bcc=None):
        to = [d.strip() for d in destinatario.split(",") if d.strip()]
        resultado = correo.ResultadoEnvio(to=to, cc=cc or [], bcc=bcc or [], mensaje_id="msg-123")
        llamadas.append({"to": resultado.to, "cc": resultado.cc, "bcc": resultado.bcc})
        return resultado

    monkeypatch.setattr(tm.correo, "enviar", _falso_enviar)
    return llamadas


@_necesita_base
def test_quien_creo_la_solicitud_recibe_copia_oculta(solicitud_guardada, correo_capturado):
    archivo, _ = solicitud_guardada
    quien_envia = _usuario(email="ana.perez@agrofresh.com")

    resultado = tm.enviar_solicitud_por_correo(archivo, tm.EnvioSolicitudIn(), usuario=quien_envia)

    assert "recepcion@quiteca-lab.cl" in correo_capturado[0]["to"]
    assert correo_capturado[0]["bcc"] == ["jorge.gomez@agrofresh.com"]
    assert "recepcion@quiteca-lab.cl" in resultado["ok"]


@_necesita_base
def test_no_duplica_si_el_creador_ya_esta_en_el_to(solicitud_guardada, correo_capturado):
    archivo, _ = solicitud_guardada
    quien_envia = _usuario()
    body = tm.EnvioSolicitudIn(destinatarios_adicionales=["jorge.gomez@agrofresh.com"])

    tm.enviar_solicitud_por_correo(archivo, body, usuario=quien_envia)

    llamada = correo_capturado[0]
    assert llamada["to"].count("jorge.gomez@agrofresh.com") == 1
    assert llamada["bcc"] == []


@_necesita_base
def test_solicitud_sin_email_solicitante_no_rompe_el_envio(solicitud_guardada, correo_capturado):
    """Solicitudes creadas antes de que el campo existiera, o con el dato
    vacío: no debe romper el envío, simplemente no hay a quién copiar."""
    archivo, datos = solicitud_guardada
    datos["email_solicitante"] = None
    wb = construir_workbook(datos, tm.ANALITOS_DEFECTO)
    ruta = tm._ruta_archivo(archivo)
    wb.save(ruta)

    tm.enviar_solicitud_por_correo(archivo, tm.EnvioSolicitudIn(), usuario=_usuario())

    assert correo_capturado[0]["bcc"] == []


def test_direccion_invalida_en_contactos_no_pasa_silenciosa(solicitud_guardada):
    """Una dirección mal escrita en el mantenedor no debe llegar a Gmail
    disfrazada de válida: correo.enviar debe rechazarla explícitamente."""
    archivo, _ = solicitud_guardada
    config_store.escribir(
        "contactos_laboratorio.json",
        [{
            "email": "no-es-un-correo", "laboratorio": "AGROFRESH",
            "tipo": "solicitud", "activo": True, "orden": 1,
        }],
    )

    # No se reemplaza correo.enviar: se ejerce la validación real de
    # correo.py contra Gmail API (sin llegar a llamarla, porque falla antes).
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        tm.enviar_solicitud_por_correo(archivo, tm.EnvioSolicitudIn(), usuario=_usuario())
    assert "no-es-un-correo" in str(exc.value.detail)


def test_no_se_puede_reenviar_una_solicitud_ya_enviada(solicitud_guardada, correo_capturado):
    archivo, datos = solicitud_guardada
    datos["enviada"] = True
    wb = construir_workbook(datos, tm.ANALITOS_DEFECTO)
    wb.save(tm._ruta_archivo(archivo))

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        tm.enviar_solicitud_por_correo(archivo, tm.EnvioSolicitudIn(), usuario=_usuario())
    assert exc.value.status_code == 409
    assert correo_capturado == []
