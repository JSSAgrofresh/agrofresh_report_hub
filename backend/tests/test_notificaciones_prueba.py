"""
Botón «Probar notificación»: la prueba la ve SOLO quien la mandó.

La primera parte es lógica pura; la segunda necesita Postgres con la 0039.
"""
import pytest

from app import notificaciones as n
from app.auth import Usuario
from tests.utiles_bd import hay_base


def test_el_filtro_deja_pasar_pruebas_solo_a_su_dueno():
    sql, params = n.filtro_visibles(["anuncio"], ["todos"], 7)
    assert "metadata->>'prueba' IS NULL" in sql
    assert params[-1] == "7"
    # Sin usuario nunca coincide con una prueba (queda en blanco, no en un id).
    assert n.filtro_visibles(["anuncio"], ["todos"])[1][-1] == ""


def test_el_filtro_mira_los_tipos_de_cuenta_elegidos_en_el_aviso():
    sql, params = n.filtro_visibles(["anuncio"], ["todos"], 7, "muestreador")
    assert "tipos_destino" in sql
    assert params == [["anuncio"], "muestreador", ["todos"], "7"]


def test_los_clientes_no_son_un_destino_posible():
    assert "cliente" not in n.TIPOS_DESTINO


def test_valida_los_tipos_de_destino():
    from fastapi import HTTPException

    def entrada(tipos):
        return n.NotificacionIn(titulo="t", resumen="r", categoria="sistema", tipos_destino=tipos)

    assert n._validar_destino(entrada(None)) is None
    assert n._validar_destino(entrada(["analista", "gerencia"])) == '{"tipos_destino": ["gerencia", "analista"]}'
    for malo in (["cliente"], []):
        with pytest.raises(HTTPException):
            n._validar_destino(entrada(malo))


MARCA = "[test-prueba]"

con_bd = pytest.mark.skipif(
    not hay_base("notificacion_suscripcion"),
    reason="sin Postgres con la migración 0039 aplicada",
)


@pytest.fixture
def dos_admin():
    from app.db import conexion, cursor_dict

    def borrar(cur):
        cur.execute("DELETE FROM notificacion WHERE titulo LIKE %s", (MARCA + "%",))
        cur.execute("DELETE FROM usuario WHERE email LIKE %s", ("%@test-prueba.cl",))

    ids = []
    with conexion() as conn, cursor_dict(conn) as cur:
        borrar(cur)
        for i in (1, 2):
            cur.execute(
                "INSERT INTO usuario (email, nombre, tipo_acceso) VALUES (%s, %s, 'admin_general') RETURNING id",
                (f"a{i}@test-prueba.cl", f"{MARCA} admin {i}"),
            )
            ids.append(cur.fetchone()["id"])
    yield [Usuario(id=str(u), email=f"a{i}@test-prueba.cl", nombre=f"{MARCA} admin {i}",
                   tipoAcceso="admin_general") for i, u in enumerate(ids, 1)]
    with conexion() as conn, cursor_dict(conn) as cur:
        borrar(cur)


def _entrada(titulo):
    return n.NotificacionIn(titulo=f"{MARCA} {titulo}", resumen="r", cuerpo="c", categoria="actualizacion")


@con_bd
def test_la_prueba_la_ve_solo_quien_la_mando(dos_admin):
    a, b = dos_admin
    n.probar(_entrada("hola"), quien=a)
    assert any(x["titulo"].startswith(MARCA) for x in n.listar(quien=a))
    assert not any(x["titulo"].startswith(MARCA) for x in n.listar(quien=b))
    # Tampoco aparece en la lista de avisos del administrador.
    assert not any(x["titulo"].startswith(MARCA) for x in n.admin_listar())


@con_bd
def test_cada_prueba_reemplaza_a_la_anterior(dos_admin):
    a, _ = dos_admin
    n.probar(_entrada("uno"), quien=a)
    n.probar(_entrada("dos"), quien=a)
    mias = [x["titulo"] for x in n.listar(quien=a) if x["titulo"].startswith(MARCA)]
    assert mias == [f"{MARCA} dos"]


@con_bd
def test_el_aviso_solo_lo_ven_los_tipos_elegidos(dos_admin):
    from app.db import conexion, cursor_dict

    a, _ = dos_admin
    n.crear(
        n.NotificacionIn(titulo=f"{MARCA} solo analistas", resumen="r", categoria="sistema",
                         tipos_destino=["analista"]),
        quien=a,
    )
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        where, params = n.filtro_visibles(["anuncio"], ["todos"], int(a.id), "muestreador")
        cur.execute(f"SELECT 1 FROM notificacion n WHERE {where} AND n.titulo LIKE %s", (*params, MARCA + "%"))
        assert cur.fetchone() is None
        where, params = n.filtro_visibles(["anuncio"], ["todos"], int(a.id), "analista")
        cur.execute(f"SELECT 1 FROM notificacion n WHERE {where} AND n.titulo LIKE %s", (*params, MARCA + "%"))
        assert cur.fetchone() is not None
