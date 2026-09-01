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

from fastapi import HTTPException  # noqa: E402

from app import config, emitir, indice_solicitudes as indice, toma_muestras as tm  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402


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
    yield tm.crear_solicitud(cuerpo), tm.crear_solicitud(cuerpo)
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
