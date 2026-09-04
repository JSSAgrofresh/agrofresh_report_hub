"""
El cruce entre una solicitud y su muestra.

Antes vivía en la pantalla y se perdía al recargar. El flujo real es otro: la
muestra llega al laboratorio y ahí se cruza, el GC corre en la noche y los
resultados se procesan al día siguiente. Entre medio se cierra el navegador,
así que el cruce tiene que estar guardado.

Necesita Postgres con el esquema aplicado. Sin base se salta entera.
"""
import pytest

from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado"
)

from datetime import datetime  # noqa: E402

from fastapi import HTTPException  # noqa: E402

from app import config, emitir, indice_solicitudes as indice, toma_muestras as tm  # noqa: E402
from app.auth import Usuario  # noqa: E402
from app.emitir import ZONA_LABORATORIO  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

# `crear_solicitud` exige la sesión que la crea, para poder forzar
# `email_solicitante` cuando es un muestreador (ver test_acceso_solicitudes.py).
# Acá no se prueba esa regla, así que basta una cuenta interna cualquiera.
ADMIN = Usuario(id="1", email="admin@agrofresh.com", nombre="Admin", tipoAcceso="admin_general")


@pytest.fixture
def dos_solicitudes(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo")
        cur.execute("SELECT setval('folio_solicitud', 1, false)")
    cuerpo = tm.SolicitudIn(
        laboratorio="AGROFRESH", solicitante="J", sold_to="ZZ-TEST", generado_por="J",
        especie="Cerezas", analitos_solicitados=["FDL"],
    )
    yield tm.crear_solicitud(cuerpo, usuario=ADMIN), tm.crear_solicitud(cuerpo, usuario=ADMIN)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo")


def cruzar(archivo, codigo):
    return tm.cruzar_con_muestra(archivo, tm.CruceIn(codigo_muestra=codigo))


def test_una_solicitud_nueva_no_tiene_muestra(dos_solicitudes):
    primera, _ = dos_solicitudes
    assert primera.codigo_muestra is None


def test_el_cruce_queda_guardado(dos_solicitudes):
    """Se lee de la base y no de la pantalla: es lo que permite cruzar hoy y
    procesar mañana."""
    primera, _ = dos_solicitudes
    assert cruzar(primera.archivo, "ZZ-VIAL-1").codigo_muestra == "ZZ-VIAL-1"
    assert indice.buscar(primera.archivo)["codigo_muestra"] == "ZZ-VIAL-1"


def test_el_listado_distingue_cruzadas_de_pendientes(dos_solicitudes):
    """De eso vive el color de la tabla: blanca sin muestra, verde con ella."""
    primera, segunda = dos_solicitudes
    cruzar(primera.archivo, "ZZ-VIAL-1")
    lista = dict(tm.leer_todas_las_solicitudes())
    assert lista[primera.archivo]["codigo_muestra"] == "ZZ-VIAL-1"
    assert lista[segunda.archivo]["codigo_muestra"] is None


def test_un_vial_no_puede_estar_en_dos_solicitudes(dos_solicitudes):
    """Un vial es un tubo físico. Si estuviera en dos, el resultado del GC no
    sabría a cuál de las dos pertenece."""
    primera, segunda = dos_solicitudes
    cruzar(primera.archivo, "ZZ-VIAL-1")
    with pytest.raises(HTTPException) as e:
        cruzar(segunda.archivo, "ZZ-VIAL-1")
    assert e.value.status_code == 409
    assert primera.archivo in e.value.detail


def test_se_puede_corregir_y_el_numero_liberado_se_reutiliza(dos_solicitudes):
    """Escanear el vial equivocado tiene que poder deshacerse sin dejar el
    número inutilizado para siempre."""
    primera, segunda = dos_solicitudes
    cruzar(primera.archivo, "ZZ-VIAL-1")
    assert cruzar(primera.archivo, "ZZ-VIAL-2").codigo_muestra == "ZZ-VIAL-2"
    assert cruzar(segunda.archivo, "ZZ-VIAL-1").codigo_muestra == "ZZ-VIAL-1"


@pytest.mark.parametrize("vacio", [None, "", "   "])
def test_deshacer_el_cruce(dos_solicitudes, vacio):
    primera, _ = dos_solicitudes
    cruzar(primera.archivo, "ZZ-VIAL-1")
    assert cruzar(primera.archivo, vacio).codigo_muestra is None


def test_una_solicitud_que_no_existe_avisa(dos_solicitudes):
    with pytest.raises(HTTPException) as e:
        cruzar("no-existe.xlsx", "ZZ-VIAL-9")
    assert e.value.status_code == 404


def test_el_listado_del_laboratorio_devuelve_el_cruce(dos_solicitudes, monkeypatch, tmp_path):
    """El PUT puede guardar bien y aun así la pantalla mostrar cero si el
    endpoint de listado omite codigo_muestra al serializar la solicitud."""
    primera, _ = dos_solicitudes
    cruzar(primera.archivo, "GCNPD10065")
    datos = indice.buscar(primera.archivo)
    monkeypatch.setattr(
        emitir,
        "leer_solicitudes_de",
        lambda laboratorio: [(primera.archivo, datos)],
    )
    # Sin carpeta legado: se apunta la raíz a un directorio vacío. Parchar
    # os.path.isdir lo hace global y revienta os.makedirs(exist_ok=True).
    monkeypatch.setattr(emitir, "_carpeta_raiz_storage", lambda: str(tmp_path))

    listado = emitir.listar_solicitudes()

    assert listado[0].codigo_muestra == "GCNPD10065"


def test_la_recepcion_se_llena_sola_con_el_momento_del_cruce(dos_solicitudes, monkeypatch, tmp_path):
    """Nadie escribe la fecha de recepción: la muestra llega, se cruza, y ese
    instante ES la recepción. Antes se elegía a mano al procesar el GC, un día
    después, y quedaba la fecha equivocada o ninguna."""
    primera, _ = dos_solicitudes
    antes = datetime.now(ZONA_LABORATORIO)
    cruzar(primera.archivo, "GCNPD10065")
    despues = datetime.now(ZONA_LABORATORIO)

    datos = indice.buscar(primera.archivo)
    monkeypatch.setattr(emitir, "leer_solicitudes_de", lambda laboratorio: [(primera.archivo, datos)])
    monkeypatch.setattr(emitir, "_carpeta_raiz_storage", lambda: str(tmp_path))
    fila = emitir.listar_solicitudes()[0]

    assert fila.fecha_recepcion in {antes.strftime("%Y-%m-%d"), despues.strftime("%Y-%m-%d")}
    assert fila.hora_recepcion in {antes.strftime("%H:%M"), despues.strftime("%H:%M")}


def test_sin_cruce_no_hay_recepcion(dos_solicitudes, monkeypatch, tmp_path):
    """Una solicitud que todavía no recibe su muestra no debe mostrar una
    fecha de recepción: en la tabla eso se lee como que ya llegó."""
    primera, _ = dos_solicitudes
    datos = indice.buscar(primera.archivo)
    monkeypatch.setattr(emitir, "leer_solicitudes_de", lambda laboratorio: [(primera.archivo, datos)])
    monkeypatch.setattr(emitir, "_carpeta_raiz_storage", lambda: str(tmp_path))
    fila = emitir.listar_solicitudes()[0]

    assert fila.fecha_recepcion is None
    assert fila.hora_recepcion is None


def test_deshacer_el_cruce_borra_la_recepcion(dos_solicitudes, monkeypatch, tmp_path):
    """Quitar la muestra deja la solicitud esperando de nuevo. Si la fecha se
    quedara pegada, diría que se recibió algo que no está."""
    primera, _ = dos_solicitudes
    cruzar(primera.archivo, "GCNPD10065")
    cruzar(primera.archivo, None)

    datos = indice.buscar(primera.archivo)
    monkeypatch.setattr(emitir, "leer_solicitudes_de", lambda laboratorio: [(primera.archivo, datos)])
    monkeypatch.setattr(emitir, "_carpeta_raiz_storage", lambda: str(tmp_path))
    fila = emitir.listar_solicitudes()[0]

    assert fila.codigo_muestra is None
    assert fila.fecha_recepcion is None
