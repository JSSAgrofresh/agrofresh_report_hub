"""
El script que llena el catálogo de analitos y enlaza lo ya cargado.

Escribe sobre datos reales -4838 filas en el servidor del laboratorio-, así
que lo que importa acá no es que enlace, sino que NO haga de más: que no
invente límites, que no toque otro laboratorio, y que el caso borde de dos
resultados del mismo analito en una solicitud no lo haga fallar entero.

Necesita Postgres con el esquema aplicado. Sin base se salta entero.
"""
from __future__ import annotations

import os
import sys

import pytest

_RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _RAIZ)
sys.path.insert(0, os.path.join(_RAIZ, "scripts"))

from tests.utiles_bd import hay_base  # noqa: E402

pytestmark = pytest.mark.skipif(
    not hay_base("analito"), reason="sin Postgres con el esquema aplicado"
)

import sembrar_catalogo_analitos as sembrar  # noqa: E402

from app.db import conexion, cursor_dict  # noqa: E402

CLIENTE = "ZZ-SEMBRAR"
# A propósito NO en mayúsculas: así lo guarda la base de verdad ("Agrofresh"),
# mientras que la configuración de la app dice "AGROFRESH". Compararlos exacto
# dejó 9069 filas sin enlazar en el servidor del laboratorio.
LAB = "Agrofresh"


def _limpiar(cur) -> None:
    cur.execute(
        "DELETE FROM resultado WHERE solicitud_id IN ("
        " SELECT s.id FROM solicitud s JOIN planta p ON p.id = s.planta_id"
        " JOIN cliente c ON c.id = p.cliente_id WHERE c.nombre = %s)",
        (CLIENTE,),
    )
    cur.execute(
        "DELETE FROM producto_aplicado WHERE solicitud_id IN ("
        " SELECT s.id FROM solicitud s JOIN planta p ON p.id = s.planta_id"
        " JOIN cliente c ON c.id = p.cliente_id WHERE c.nombre = %s)",
        (CLIENTE,),
    )
    cur.execute(
        "DELETE FROM solicitud WHERE planta_id IN ("
        " SELECT p.id FROM planta p JOIN cliente c ON c.id = p.cliente_id WHERE c.nombre = %s)",
        (CLIENTE,),
    )
    cur.execute(
        "DELETE FROM planta WHERE cliente_id IN (SELECT id FROM cliente WHERE nombre = %s)",
        (CLIENTE,),
    )
    cur.execute("DELETE FROM cliente WHERE nombre = %s", (CLIENTE,))
    cur.execute("DELETE FROM analito WHERE codigo IN ('FDL', 'PYR', 'ZZQ') AND laboratorio = %s", (LAB,))


@pytest.fixture
def datos_sueltos():
    """Una solicitud con resultados sueltos, como quedan cuando se cargan sin
    catálogo. Incluye un código que la app no conoce y un duplicado."""
    with conexion() as conn, cursor_dict(conn) as cur:
        _limpiar(cur)
        cur.execute("INSERT INTO cliente (nombre) VALUES (%s) RETURNING id", (CLIENTE,))
        cliente_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO planta (cliente_id, nombre) VALUES (%s, 'ZZ-P') RETURNING id",
            (cliente_id,),
        )
        planta_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO solicitud (planta_id, nro_solicitud, laboratorio)"
            " VALUES (%s, 'ZZ-S1', %s) RETURNING id",
            (planta_id, LAB),
        )
        solicitud_id = cur.fetchone()["id"]
        for codigo, valor in [("FDL", 1.0), ("PYR", 2.0), ("ZZQ", 3.0), ("FDL", 9.9)]:
            cur.execute(
                "INSERT INTO resultado (solicitud_id, analito_raw, valor_num) VALUES (%s, %s, %s)",
                (solicitud_id, codigo, valor),
            )
    yield solicitud_id
    with conexion() as conn, cursor_dict(conn) as cur:
        _limpiar(cur)


def _correr(aplicar: bool, monkeypatch) -> None:
    argv = ["sembrar_catalogo_analitos.py"] + (["--aplicar"] if aplicar else [])
    monkeypatch.setattr(sys, "argv", argv)
    sembrar.main()


def _resultados(solicitud_id: int) -> list[dict]:
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT r.analito_raw, r.valor_num, a.codigo, a.nombre, a.unidad,"
            "       a.limite_min, a.limite_central, a.limite_max"
            "  FROM resultado r LEFT JOIN analito a ON a.id = r.analito_id"
            " WHERE r.solicitud_id = %s ORDER BY r.id",
            (solicitud_id,),
        )
        return cur.fetchall()


def test_sin_aplicar_no_escribe_nada(datos_sueltos, monkeypatch, capsys):
    """La vista previa corre sobre la base de producción: tiene que mirar."""
    _correr(aplicar=False, monkeypatch=monkeypatch)

    assert all(r["codigo"] is None for r in _resultados(datos_sueltos))
    assert "vista previa" in capsys.readouterr().out


def test_crea_los_analitos_con_el_nombre_que_ya_usa_la_app(datos_sueltos, monkeypatch):
    """El nombre no se inventa: sale de la misma configuración que llena el
    formulario de solicitudes."""
    _correr(aplicar=True, monkeypatch=monkeypatch)

    por_codigo = {r["codigo"]: r for r in _resultados(datos_sueltos) if r["codigo"]}
    assert por_codigo["FDL"]["nombre"] == "Fludioxonil"
    assert por_codigo["PYR"]["nombre"] == "Pirimetanil"
    assert por_codigo["FDL"]["unidad"] == "ppm"


def test_no_inventa_limites_residuales(datos_sueltos, monkeypatch):
    """Lo más importante del script. Un límite es una decisión regulatoria:
    poner uno inventado haría que un informe diga «cumple» sin fundamento."""
    _correr(aplicar=True, monkeypatch=monkeypatch)

    for fila in _resultados(datos_sueltos):
        if fila["codigo"]:
            assert fila["limite_min"] is None
            assert fila["limite_central"] is None
            assert fila["limite_max"] is None


def test_enlaza_los_resultados_sin_recargar_nada(datos_sueltos, monkeypatch):
    _correr(aplicar=True, monkeypatch=monkeypatch)

    enlazados = [r for r in _resultados(datos_sueltos) if r["codigo"]]
    assert {r["codigo"] for r in enlazados} == {"FDL", "PYR"}
    assert all(r["analito_raw"] is None for r in enlazados)


def test_un_codigo_desconocido_se_deja_quieto(datos_sueltos, monkeypatch, capsys):
    """ZZQ no está en la configuración de la app, así que no hay de dónde
    sacar su nombre. Antes que inventarlo, se avisa y se deja suelto."""
    _correr(aplicar=True, monkeypatch=monkeypatch)

    sueltos = [r for r in _resultados(datos_sueltos) if r["analito_raw"] == "ZZQ"]
    assert len(sueltos) == 1
    assert "ZZQ" in capsys.readouterr().out


def test_el_duplicado_no_hace_fallar_el_resto(datos_sueltos, monkeypatch):
    """Dos resultados de FDL en la misma solicitud: la tabla solo admite uno.
    Se enlaza el primero y el otro queda suelto, sin reventar el UPDATE
    entero -que dejaría las 4838 filas sin enlazar-."""
    _correr(aplicar=True, monkeypatch=monkeypatch)

    filas = _resultados(datos_sueltos)
    fdl_enlazados = [r for r in filas if r["codigo"] == "FDL"]
    fdl_sueltos = [r for r in filas if r["analito_raw"] == "FDL"]
    assert len(fdl_enlazados) == 1
    assert len(fdl_sueltos) == 1
    # y el resto se enlazó igual
    assert any(r["codigo"] == "PYR" for r in filas)


def test_correrlo_dos_veces_no_duplica_ni_pisa(datos_sueltos, monkeypatch):
    _correr(aplicar=True, monkeypatch=monkeypatch)
    primera = _resultados(datos_sueltos)

    _correr(aplicar=True, monkeypatch=monkeypatch)

    assert _resultados(datos_sueltos) == primera
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT count(*) AS n FROM analito WHERE codigo = 'FDL' AND laboratorio = %s", (LAB,)
        )
        assert cur.fetchone()["n"] == 1


def test_el_laboratorio_calza_aunque_cambien_las_mayusculas(datos_sueltos, monkeypatch):
    """El bug que esto arregla. La base dice "Agrofresh" y la configuración
    dice "AGROFRESH": es el mismo laboratorio escrito por dos subsistemas
    distintos, no dos laboratorios."""
    _correr(aplicar=True, monkeypatch=monkeypatch)

    enlazados = [r for r in _resultados(datos_sueltos) if r["codigo"]]
    assert {r["codigo"] for r in enlazados} == {"FDL", "PYR"}


def test_el_analito_se_crea_como_lo_escribe_la_base(datos_sueltos, monkeypatch):
    """Se crea con "Agrofresh", no con "AGROFRESH": si se normalizara, el
    listado de Report mostraría este laboratorio distinto al resto y el
    enlace quedaría dependiendo de una traducción en cada consulta."""
    _correr(aplicar=True, monkeypatch=monkeypatch)

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT laboratorio FROM analito WHERE codigo = 'FDL' AND laboratorio = %s", (LAB,))
        assert cur.fetchone() is not None


def test_no_toca_los_analitos_que_ya_existian(datos_sueltos, monkeypatch):
    """Si alguien ya cargó FDL con su límite a mano, el script no puede
    pisárselo: ON CONFLICT DO NOTHING, no DO UPDATE."""
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "INSERT INTO analito (codigo, nombre, laboratorio, unidad, activo, limite_max)"
            " VALUES ('FDL', 'Nombre puesto a mano', %s, 'ppm', true, 5.0)",
            (LAB,),
        )

    _correr(aplicar=True, monkeypatch=monkeypatch)

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT nombre, limite_max FROM analito WHERE codigo = 'FDL' AND laboratorio = %s",
            (LAB,),
        )
        fila = cur.fetchone()
    assert fila["nombre"] == "Nombre puesto a mano"
    assert float(fila["limite_max"]) == 5.0
