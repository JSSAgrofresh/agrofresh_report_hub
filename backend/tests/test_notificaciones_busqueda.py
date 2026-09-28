"""
Buscador de la bandeja de notificaciones.

Funciona como el de un correo: cada palabra tiene que estar en alguna parte
de la notificación (título, resumen, cuerpo, quién la generó o sus datos),
sin importar mayúsculas ni tildes, y busca en TODAS las notificaciones que
el usuario puede ver, no solo en las 60 que muestra la bandeja.

La primera parte es lógica pura; la segunda necesita Postgres con la 0039.
"""
import pytest

from app import notificaciones as n
from app.auth import Usuario
from tests.utiles_bd import hay_base


def test_sin_texto_no_filtra():
    assert n.filtro_busqueda(None) == ("", [])
    assert n.filtro_busqueda("   ") == ("", [])


def test_una_condicion_por_palabra_sin_tildes_ni_mayusculas():
    sql, valores = n.filtro_busqueda("  Verificación  ÑUÑOA ")
    assert sql.count("LIKE") == 2
    assert valores == ["%verificacion%", "%nunoa%"]


def test_los_comodines_se_buscan_literales():
    """Quien escribe «50%» busca eso, no «50 seguido de cualquier cosa»."""
    _, valores = n.filtro_busqueda("50% a_b")
    assert valores == ["%50\\%%", "%a\\_b%"]


def test_se_limita_la_cantidad_de_palabras():
    sql, valores = n.filtro_busqueda(" ".join(f"p{i}" for i in range(30)))
    assert len(valores) == 8


# ── Contra la base ───────────────────────────────────────────────────────

MARCA = "[test-busqueda]"

con_bd = pytest.mark.skipif(
    not hay_base("notificacion_suscripcion"),
    reason="sin Postgres con la migración 0039 aplicada",
)


@pytest.fixture
def admin():
    from app.db import conexion, cursor_dict

    def borrar(cur):
        cur.execute("DELETE FROM notificacion WHERE titulo LIKE %s", (MARCA + "%",))
        cur.execute("DELETE FROM usuario WHERE email LIKE %s", ("%@test-busqueda.cl",))

    with conexion() as conn, cursor_dict(conn) as cur:
        borrar(cur)
        cur.execute(
            "INSERT INTO usuario (email, nombre, tipo_acceso) VALUES (%s, %s, 'admin_general') RETURNING id",
            ("admin@test-busqueda.cl", f"{MARCA} admin"),
        )
        uid = cur.fetchone()["id"]
        n.insertar_notif(cur, f"{MARCA} Nueva solicitud OT-2026-0457", "Cliente Frutícola Ñuble, 3 muestras",
                         "Paz Salazar", metadata={"tipo": "solicitud"})
        n.insertar_notif(cur, f"{MARCA} Verificación diaria registrada", "Día 24/09/2026",
                         "Romina Garrido", metadata={"tipo": "verificacion", "fecha": "2026-09-24"})
        # Las dos de arriba son de hace un mes; encima, 70 más nuevas: la de la
        # OT queda fuera de las 60 que muestra la bandeja.
        cur.execute("UPDATE notificacion SET creado_en = now() - interval '30 days' WHERE titulo LIKE %s",
                    (MARCA + "%",))
        for i in range(70):
            n.insertar_notif(cur, f"{MARCA} relleno {i}", "r", "test", metadata={"tipo": "solicitud"})
    yield Usuario(id=str(uid), email="admin@test-busqueda.cl", nombre="a", tipoAcceso="admin_general")
    with conexion() as conn, cursor_dict(conn) as cur:
        borrar(cur)


def _titulos(quien, q):
    return [x["titulo"].removeprefix(MARCA + " ") for x in n.listar(q=q, quien=quien)
            if x["titulo"].startswith(MARCA)]


@con_bd
def test_encuentra_una_notificacion_vieja_que_no_esta_en_la_bandeja(admin):
    assert "Nueva solicitud OT-2026-0457" not in _titulos(admin, None)
    assert _titulos(admin, "0457") == ["Nueva solicitud OT-2026-0457"]


@con_bd
def test_sin_tildes_ni_mayusculas_y_por_quien_la_genero(admin):
    assert _titulos(admin, "fruticola nuble") == ["Nueva solicitud OT-2026-0457"]
    assert _titulos(admin, "romina") == ["Verificación diaria registrada"]
    assert _titulos(admin, "VERIFICACIÓN garrido") == ["Verificación diaria registrada"]


@con_bd
def test_todas_las_palabras_tienen_que_estar(admin):
    assert _titulos(admin, "paz 0457") == ["Nueva solicitud OT-2026-0457"]
    assert _titulos(admin, "paz romina") == []


@con_bd
def test_busca_en_los_datos_pero_no_en_los_nombres_de_las_claves(admin):
    assert _titulos(admin, "2026-09-24") == ["Verificación diaria registrada"]
    # «fecha» es el nombre de una clave de la metadata, no un dato.
    assert "Verificación diaria registrada" not in _titulos(admin, "fecha")
