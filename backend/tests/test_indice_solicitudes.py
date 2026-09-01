"""
El índice de solicitudes y el folio correlativo.

Lo que se prueba acá es lo que reemplaza a "bajar todos los Excel de R2 en
cada request": que el índice devuelva exactamente lo mismo que devolvía el
parser, que reindexar no duplique, y que dos personas creando una solicitud
al mismo tiempo no puedan recibir el mismo folio.

Necesita Postgres con el esquema aplicado. Sin base se salta entera.
"""
import threading

import pytest

pytestmark = pytest.mark.skipif(
    not __import__("tests.utiles_bd", fromlist=["hay_base"]).hay_base("solicitud_archivo"),
    reason="sin Postgres con el esquema aplicado",
)

from app import indice_solicitudes as indice  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

PREFIJO = "ZZ-TEST-"


def solicitud(folio: str, **extra) -> dict:
    base = {
        "numero_solicitud": folio,
        "laboratorio": "AGROFRESH",
        "sold_to": "ZZ-TEST Agricom",
        "ship_to": "ZZ-TEST Planta",
        "especie": "Arándano",
        "variedad": "Duke",
        "fecha_solicitud": "2026-08-31",
        "fecha_muestreo": "2026-08-31",
        "creado_en": "2026-08-31T10:00:00",
        "solicitante": "Jorge",
        "generado_por": "Jorge",
        "campos_laboratorio": {"FDL ppm": "1"},
        "analitos_solicitados": ["FDL"],
    }
    base.update(extra)
    return base


@pytest.fixture(autouse=True)
def limpiar():
    yield
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo WHERE archivo LIKE %s", (f"{PREFIJO}%",))


def guardar(archivo: str, datos: dict) -> None:
    with conexion() as conn, cursor_dict(conn) as cur:
        indice.guardar(cur, archivo, datos)


class TestGuardarYLeer:
    def test_lo_guardado_vuelve_identico(self):
        """El índice reemplaza al parser: si perdiera un campo por el camino,
        el listado mostraría solicitudes incompletas sin que nadie lo note.

        Suma `codigo_muestra` y `recepcion_en`, que no vienen del archivo: se
        asignan después, al recibir la muestra, y por eso son columnas y no
        parte del documento.
        """
        datos = solicitud("ZZ-TEST-1")
        guardar(f"{PREFIJO}1.xlsx", datos)
        recuperada = indice.buscar(f"{PREFIJO}1.xlsx")
        assert recuperada == {**datos, "codigo_muestra": None, "recepcion_en": None}

    def test_conserva_lo_anidado(self):
        """`campos_laboratorio` y `analitos_solicitados` son lo que usa Emitir
        informe para cruzar con el GC."""
        guardar(f"{PREFIJO}2.xlsx", solicitud("ZZ-TEST-2"))
        recuperada = indice.buscar(f"{PREFIJO}2.xlsx")
        assert recuperada["campos_laboratorio"] == {"FDL ppm": "1"}
        assert recuperada["analitos_solicitados"] == ["FDL"]

    def test_un_archivo_desconocido_da_none(self):
        assert indice.buscar(f"{PREFIJO}no-existe.xlsx") is None

    def test_reindexar_actualiza_en_vez_de_duplicar(self):
        """El script de indexación se puede correr las veces que haga falta."""
        for i in range(4):
            guardar(f"{PREFIJO}3.xlsx", solicitud("ZZ-TEST-3", especie=f"Especie {i}"))
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT count(*) AS n FROM solicitud_archivo WHERE archivo = %s", (f"{PREFIJO}3.xlsx",))
            assert cur.fetchone()["n"] == 1
        assert indice.buscar(f"{PREFIJO}3.xlsx")["especie"] == "Especie 3"

    @pytest.mark.parametrize("vacia", ["", "   ", None])
    def test_una_solicitud_sin_fecha_se_indexa_igual(self, vacia):
        """Hay solicitudes viejas sin fecha de muestreo. Si el índice las
        rechazara, desaparecerían del listado."""
        guardar(f"{PREFIJO}4.xlsx", solicitud("ZZ-TEST-4", fecha_muestreo=vacia, fecha_solicitud=vacia))
        assert indice.buscar(f"{PREFIJO}4.xlsx") is not None


class TestListar:
    def test_filtra_por_laboratorio(self):
        guardar(f"{PREFIJO}5.xlsx", solicitud("ZZ-TEST-5", laboratorio="ZZ-TEST-LAB-A"))
        guardar(f"{PREFIJO}6.xlsx", solicitud("ZZ-TEST-6", laboratorio="ZZ-TEST-LAB-B"))
        assert [a for a, _ in indice.listar("ZZ-TEST-LAB-A")] == [f"{PREFIJO}5.xlsx"]

    def test_ordena_por_lo_mas_reciente(self):
        """El orden sale de la base, con índice: ordenar 10 cuesta lo mismo
        que ordenar 10.000."""
        guardar(f"{PREFIJO}7.xlsx", solicitud("ZZ-TEST-7", creado_en="2020-01-01T00:00:00"))
        guardar(f"{PREFIJO}8.xlsx", solicitud("ZZ-TEST-8", creado_en="2030-01-01T00:00:00"))
        archivos = [a for a, _ in indice.listar() if a.startswith(PREFIJO)]
        assert archivos.index(f"{PREFIJO}8.xlsx") < archivos.index(f"{PREFIJO}7.xlsx")


class TestFolio:
    """El folio salía de listar R2 y sumar uno al mayor. Dos personas creando
    una solicitud en el mismo momento leían el mismo máximo y recibían EL
    MISMO FOLIO. Una SEQUENCE no puede hacer eso."""

    def test_dos_pedidos_seguidos_dan_numeros_distintos(self):
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT nextval('folio_solicitud') AS n")
            primero = cur.fetchone()["n"]
            cur.execute("SELECT nextval('folio_solicitud') AS n")
            assert cur.fetchone()["n"] == primero + 1

    def test_ocho_a_la_vez_dan_ocho_distintos(self):
        """Conexiones de verdad, en paralelo — que es la situación que
        producía folios repetidos."""
        obtenidos: list[int] = []
        candado = threading.Lock()

        def pedir():
            with conexion() as conn, cursor_dict(conn) as cur:
                cur.execute("SELECT nextval('folio_solicitud') AS n")
                with candado:
                    obtenidos.append(cur.fetchone()["n"])

        hilos = [threading.Thread(target=pedir) for _ in range(8)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        assert len(set(obtenidos)) == 8, f"se repitieron folios: {sorted(obtenidos)}"
