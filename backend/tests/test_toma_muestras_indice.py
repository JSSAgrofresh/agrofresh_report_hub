"""
Crear, listar y borrar solicitudes contra el índice.

`test_indice_solicitudes.py` prueba el índice por dentro. Esto prueba lo que
de verdad importa: que el módulo de Toma de muestras siga haciendo lo mismo
que antes ahora que lee de la base en vez de abrir todos los archivos.

Lo más delicado es la ida y vuelta por el jsonb. Si el índice perdiera un
campo, el listado mostraría solicitudes incompletas y nadie se daría cuenta
hasta que faltara un analito en un informe. Hay una prueba que compara,
campo por campo, lo que devuelve el índice contra lo que devuelve el archivo.

Necesita Postgres con el esquema aplicado. Sin base se salta entera.
"""
import pytest

from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado"
)

from app import config, indice_solicitudes as indice, toma_muestras as tm  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402


@pytest.fixture
def limpio(tmp_path, monkeypatch):
    """Un almacenamiento vacío en disco y un índice vacío. Sin R2: en las
    pruebas no hay credenciales, así que `r2.disponible()` es False y todo
    pasa por el disco temporal."""
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo")
        cur.execute("SELECT setval('folio_solicitud', 1, false)")
    yield
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo")


def cuerpo(**extra):
    datos = dict(
        laboratorio="AGROFRESH", solicitante="Jorge", sold_to="ZZ-TEST Agricom",
        ship_to="ZZ-TEST Planta", especie="Arándano", variedad="Duke",
        generado_por="Jorge", tipo_muestra="Fruta", fecha_muestreo="2026-08-31",
        campos_laboratorio={"FDL ppm": "1"}, analitos_solicitados=["FDL"],
    )
    datos.update(extra)
    return tm.SolicitudIn(**datos)


class TestRedDeSeguridad:
    """Mientras el índice esté vacío -entre actualizar el sistema y correr
    scripts/indexar_solicitudes.py- todo tiene que seguir funcionando como
    antes. Sin esto, actualizar dejaría a todos sin ver sus solicitudes."""

    def test_con_indice_vacio_se_leen_los_archivos(self, limpio):
        assert indice.esta_poblado() is False
        assert tm.leer_todas_las_solicitudes() == []

    def test_con_indice_vacio_el_folio_se_cuenta_sobre_los_archivos(self, limpio):
        assert tm._siguiente_numero() == "OT-0001"


class TestCrear:
    def test_la_solicitud_nueva_queda_indexada_sola(self, limpio):
        """Sin esto habría que correr un script después de cada solicitud."""
        creada = tm.crear_solicitud(cuerpo())
        assert creada.numero_solicitud == "OT-0001"
        assert indice.buscar("OT-0001.xlsx") is not None

    def test_los_folios_siguen_siendo_correlativos(self, limpio):
        folios = [tm.crear_solicitud(cuerpo()).numero_solicitud for _ in range(3)]
        assert folios == ["OT-0001", "OT-0002", "OT-0003"]

    def test_el_indice_dice_lo_mismo_que_el_archivo(self, limpio):
        """La prueba que importa: si el jsonb perdiera un campo por el camino,
        el listado mostraría solicitudes incompletas.

        El índice suma `codigo_muestra` y `recepcion_en`, que no están en el
        archivo: se asignan al recibir la muestra, mucho después de crear la
        solicitud.
        """
        tm.crear_solicitud(cuerpo())
        por_indice = dict(tm.leer_todas_las_solicitudes())["OT-0001.xlsx"]
        por_archivo = dict(tm._leer_todas_desde_archivos())["OT-0001.xlsx"]
        assert por_indice == {**por_archivo, "codigo_muestra": None, "recepcion_en": None}

    def test_conserva_los_analitos_solicitados(self, limpio):
        """Es lo que usa Emitir informe para cruzar con el resultado del GC."""
        tm.crear_solicitud(cuerpo(analitos_solicitados=["FDL", "PYR", "IMZ"]))
        assert indice.buscar("OT-0001.xlsx")["analitos_solicitados"] == ["FDL", "PYR", "IMZ"]


class TestListar:
    def test_listar_no_abre_ningun_archivo(self, limpio, monkeypatch):
        """El punto entero del cambio: el trabajo deja de crecer con la
        cantidad de solicitudes."""
        tm.crear_solicitud(cuerpo())
        llamadas = []
        monkeypatch.setattr(tm, "_leer_todas_desde_archivos", lambda: llamadas.append(1) or [])
        assert len(tm.leer_todas_las_solicitudes()) == 1
        assert llamadas == [], "volvió a abrir los archivos"

    def test_filtra_por_laboratorio(self, limpio):
        tm.crear_solicitud(cuerpo())
        tm.crear_solicitud(cuerpo(laboratorio="QUITECA"))
        assert len(tm.leer_solicitudes_de("AGROFRESH")) == 1
        assert len(tm.leer_solicitudes_de("QUITECA")) == 1
        assert tm.leer_solicitudes_de("NO EXISTE") == []


class TestEliminar:
    def test_borrar_la_saca_del_indice(self, limpio):
        """Si quedara anotada, el listado mostraría una solicitud cuyo archivo
        ya no existe, y abrirla daría 404 sin explicación."""
        tm.crear_solicitud(cuerpo())
        tm.eliminar_solicitud("OT-0001.xlsx")
        assert indice.buscar("OT-0001.xlsx") is None
        assert tm.leer_todas_las_solicitudes() == []


class TestFolioNoSeRepite:
    def test_aunque_la_secuencia_se_reinicie_a_mano(self, limpio):
        """Puede pasar al restaurar un respaldo viejo. Entregar OT-0001 de
        nuevo pisaría la solicitud que ya lo tiene."""
        tm.crear_solicitud(cuerpo())
        tm.crear_solicitud(cuerpo())
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT setval('folio_solicitud', 1, false)")
        assert tm.crear_solicitud(cuerpo()).numero_solicitud == "OT-0003"
