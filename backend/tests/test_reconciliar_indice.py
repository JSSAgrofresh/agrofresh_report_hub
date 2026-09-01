"""
Borrar una solicitud desde la consola de Cloudflare deja el índice sucio.

Desde que el listado lee la tabla y no R2, un archivo borrado por fuera sigue
apareciendo en pantalla: al abrir su ficha da 404 y nadie entiende por qué.
El script de reconciliación es lo que repara eso, y esto verifica que borre
exactamente las que sobran — ni una más.

Necesita Postgres con el esquema aplicado. Sin base se salta entero.
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))

from tests.utiles_bd import hay_base  # noqa: E402

pytestmark = pytest.mark.skipif(
    not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado"
)

import reconciliar_indice  # noqa: E402

from app import indice_solicitudes as indice  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

PREFIJO = "ZZ-RECONCILIAR-"


def _solicitud(numero: str, sold_to: str = "ZZ-TEST") -> dict:
    return {
        "numero_solicitud": numero,
        "laboratorio": "AGROFRESH",
        "solicitante": "J",
        "sold_to": sold_to,
        "especie": "Cerezas",
        "fecha_solicitud": "2026-09-01",
        "analitos_solicitados": ["FDL"],
    }


@pytest.fixture
def tres_indexadas():
    """Tres solicitudes en el índice. Después del test no queda ninguna."""
    nombres = [f"{PREFIJO}{n}.xlsx" for n in (1, 2, 3)]
    with conexion() as conn, cursor_dict(conn) as cur:
        for nombre in nombres:
            cur.execute("DELETE FROM solicitud_archivo WHERE archivo = %s", (nombre,))
            indice.guardar(cur, nombre, _solicitud(os.path.splitext(nombre)[0]))
    yield nombres
    with conexion() as conn, cursor_dict(conn) as cur:
        for nombre in nombres:
            cur.execute("DELETE FROM solicitud_archivo WHERE archivo = %s", (nombre,))


def _mis_filas(nombres: list[str]) -> set[str]:
    indexadas = dict(indice.listar())
    return {n for n in nombres if n in indexadas}


def _fingir_r2(monkeypatch, presentes: list[str]) -> None:
    """R2 con exactamente estos archivos, en el layout nuevo por cliente."""
    monkeypatch.setattr(reconciliar_indice.r2, "disponible", lambda: True)
    monkeypatch.setattr(
        reconciliar_indice.r2,
        "listar_keys",
        lambda prefijo: [f"solicitudes/zz-test/{n}" for n in presentes],
    )


def test_sin_aplicar_no_borra_nada(tres_indexadas, monkeypatch, capsys):
    """La vista previa tiene que ser inofensiva: es lo primero que se corre,
    y sobre una base de producción."""
    _fingir_r2(monkeypatch, [tres_indexadas[0]])
    monkeypatch.setattr(sys, "argv", ["reconciliar_indice.py"])

    reconciliar_indice.main()

    assert _mis_filas(tres_indexadas) == set(tres_indexadas)
    assert "vista previa" in capsys.readouterr().out


def test_borra_solo_las_que_ya_no_estan_en_r2(tres_indexadas, monkeypatch):
    primera, segunda, tercera = tres_indexadas
    _fingir_r2(monkeypatch, [segunda])
    monkeypatch.setattr(sys, "argv", ["reconciliar_indice.py", "--aplicar"])

    reconciliar_indice.main()

    assert _mis_filas(tres_indexadas) == {segunda}


def test_no_borra_nada_cuando_estan_todas(tres_indexadas, monkeypatch, capsys):
    """El caso normal. Correr el script de nuevo no debe ir sacando filas."""
    _fingir_r2(monkeypatch, tres_indexadas)
    monkeypatch.setattr(sys, "argv", ["reconciliar_indice.py", "--aplicar"])

    reconciliar_indice.main()

    assert _mis_filas(tres_indexadas) == set(tres_indexadas)
    assert "al día" in capsys.readouterr().out


def test_el_layout_viejo_plano_tambien_cuenta_como_presente(tres_indexadas, monkeypatch):
    """Conviven dos formas de guardar en R2: la vieja plana y la nueva por
    cliente. Comparar la clave entera borraría todas las del layout viejo."""
    monkeypatch.setattr(reconciliar_indice.r2, "disponible", lambda: True)
    monkeypatch.setattr(
        reconciliar_indice.r2,
        "listar_keys",
        lambda prefijo: [f"solicitudes/{n}" for n in tres_indexadas],
    )
    monkeypatch.setattr(sys, "argv", ["reconciliar_indice.py", "--aplicar"])

    reconciliar_indice.main()

    assert _mis_filas(tres_indexadas) == set(tres_indexadas)


def test_avisa_cuando_la_fantasma_tenia_muestra_cruzada(tres_indexadas, monkeypatch, capsys):
    """Un cruce se hizo con el tubo en la mano. Si una cruzada está por
    borrarse, casi siempre es que se borró el archivo equivocado."""
    primera = tres_indexadas[0]
    indice.cruzar(primera, "ZZ-VIAL-RECONCILIAR")
    _fingir_r2(monkeypatch, tres_indexadas[1:])
    monkeypatch.setattr(sys, "argv", ["reconciliar_indice.py"])

    reconciliar_indice.main()

    salida = capsys.readouterr().out
    assert "OJO" in salida
    assert "ZZ-VIAL-RECONCILIAR" in salida
