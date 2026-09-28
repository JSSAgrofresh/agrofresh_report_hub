"""
Quién recibe qué notificación.

Antes lo decidía solo la audiencia y las solicitudes salían para 'todos':
les llegaban a todos los usuarios, clientes incluidos. Ahora cada usuario
recibe los tipos que le configuró el admin (o los de su perfil si nadie le
configuró nada).

La primera parte es lógica pura. La segunda necesita Postgres con la
migración 0039 y se salta sola si no la hay.
"""
import pytest
from fastapi import HTTPException

from app import notificaciones as n
from app.auth import Usuario
from tests.utiles_bd import hay_base


def _u(tipo: str, area: str | None = None, id_: str = "1") -> Usuario:
    return Usuario(id=id_, email=f"{tipo}@x.cl", nombre=tipo, tipoAcceso=tipo, area=area)


# ── Lógica pura ──────────────────────────────────────────────────────────


def test_admin_general_y_cromatografia_reciben_todo():
    assert n.tipos_predeterminados(_u("admin_general")) == n.TIPO_IDS
    assert n.tipos_predeterminados(_u("admin_area", "cromatografia")) == n.TIPO_IDS
    assert n.tipos_predeterminados(_u("analista", "cromatografia")) == n.TIPO_IDS


def test_otros_perfiles_internos_no_reciben_lo_del_laboratorio():
    for u in (_u("gerencia"), _u("admin_area", "postventa"), _u("muestreador")):
        tipos = n.tipos_predeterminados(u)
        assert tipos == ["solicitud", "reanalisis", "anuncio"]
        assert "verificacion" not in tipos


def test_cliente_no_recibe_nada():
    assert n.tipos_predeterminados(_u("cliente")) == []


def test_validar_tipos_ordena_y_quita_duplicados():
    assert n._validar_tipos(["anuncio", "solicitud", "solicitud"]) == ["solicitud", "anuncio"]
    assert n._validar_tipos([]) == []


def test_validar_tipos_rechaza_uno_desconocido():
    with pytest.raises(HTTPException) as e:
        n._validar_tipos(["solicitud", "spam"])
    assert e.value.status_code == 400


# ── Contra la base ───────────────────────────────────────────────────────

con_bd = pytest.mark.skipif(
    not hay_base("notificacion_suscripcion"),
    reason="sin Postgres con la migración 0039 aplicada",
)

MARCA = "[test-suscripcion]"


@pytest.fixture
def escenario():
    """Dos usuarios (admin y analista de cromatografía) y una notificación de cada tipo."""
    from app.db import conexion, cursor_dict

    def borrar(cur):
        cur.execute("DELETE FROM notificacion WHERE titulo LIKE %s", (MARCA + "%",))
        cur.execute("DELETE FROM usuario WHERE email LIKE %s", ("%@test-suscripcion.cl",))

    with conexion() as conn, cursor_dict(conn) as cur:
        borrar(cur)
        ids = {}
        for clave, tipo, area in (("admin", "admin_general", None),
                                  ("analista", "analista", "cromatografia")):
            cur.execute(
                "INSERT INTO usuario (email, nombre, tipo_acceso, area) VALUES (%s, %s, %s, %s) RETURNING id",
                (f"{clave}@test-suscripcion.cl", f"{MARCA} {clave}", tipo, area),
            )
            ids[clave] = cur.fetchone()["id"]
        for tipo in n.TIPO_IDS:
            if tipo == "anuncio":
                # Aviso a mano solo para admin general: el analista no lo ve aunque tenga 'anuncio'.
                cur.execute(
                    "INSERT INTO notificacion (titulo, resumen, categoria, audiencia) "
                    "VALUES (%s, 'r', 'sistema', 'admin_general')",
                    (f"{MARCA} anuncio",),
                )
            else:
                n.insertar_notif(cur, f"{MARCA} {tipo}", "r", "test", metadata={"tipo": tipo})
    usuarios = {
        "admin": Usuario(id=str(ids["admin"]), email="a", nombre="a", tipoAcceso="admin_general"),
        "analista": Usuario(id=str(ids["analista"]), email="b", nombre="b",
                            tipoAcceso="analista", area="cromatografia"),
    }
    yield ids, usuarios
    with conexion() as conn, cursor_dict(conn) as cur:
        borrar(cur)


def _titulos(quien: Usuario) -> set[str]:
    return {x["titulo"].removeprefix(MARCA + " ") for x in n.listar(quien)
            if x["titulo"].startswith(MARCA)}


@con_bd
def test_sin_configurar_recibe_lo_de_su_perfil(escenario):
    _, u = escenario
    assert _titulos(u["admin"]) == set(n.TIPO_IDS)
    # 'anuncio' está en sus tipos, pero ese aviso era solo para admin general.
    assert _titulos(u["analista"]) == set(n.TIPO_IDS) - {"anuncio"}


@con_bd
def test_configurado_recibe_solo_lo_marcado(escenario):
    ids, u = escenario
    admin = u["admin"]
    fila = n.admin_guardar_suscripcion(ids["analista"], n.SuscripcionIn(tipos=["verificacion"]), admin)
    assert fila["personalizado"] is True and fila["tipos"] == ["verificacion"]

    assert _titulos(u["analista"]) == {"verificacion"}
    assert n.no_leidas(u["analista"])["total"] >= 1
    assert n.mis_tipos(u["analista"]) == {"tipos": ["verificacion"]}
    # Al otro usuario no le cambia nada.
    assert _titulos(admin) == set(n.TIPO_IDS)


@con_bd
def test_sin_tipos_no_recibe_nada_y_leer_todas_no_marca_lo_ajeno(escenario):
    ids, u = escenario
    n.admin_guardar_suscripcion(ids["analista"], n.SuscripcionIn(tipos=[]), u["admin"])
    assert _titulos(u["analista"]) == set()
    assert n.mis_tipos(u["analista"]) == {"tipos": []}

    n.marcar_todas(u["analista"])
    from app.db import conexion, cursor_dict
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT count(*) AS c FROM notificacion_leida WHERE usuario_id = %s",
                    (ids["analista"],))
        assert cur.fetchone()["c"] == 0


@con_bd
def test_restablecer_vuelve_a_lo_predeterminado(escenario):
    ids, u = escenario
    n.admin_guardar_suscripcion(ids["analista"], n.SuscripcionIn(tipos=[]), u["admin"])
    fila = n.admin_restablecer_suscripcion(ids["analista"], u["admin"])
    assert fila["personalizado"] is False
    assert fila["tipos"] == n.TIPO_IDS
    assert _titulos(u["analista"]) == set(n.TIPO_IDS) - {"anuncio"}


@con_bd
def test_listado_admin_trae_a_los_usuarios(escenario):
    ids, u = escenario
    datos = n.admin_suscripciones(u["admin"])
    assert [t["id"] for t in datos["tipos"]] == n.TIPO_IDS
    por_id = {x["usuario_id"]: x for x in datos["usuarios"]}
    assert por_id[ids["admin"]]["personalizado"] is False


@con_bd
def test_las_cuentas_cliente_no_se_configuran(escenario):
    from app.db import conexion, cursor_dict
    _, u = escenario
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "INSERT INTO usuario (email, nombre, tipo_acceso) VALUES (%s, %s, 'cliente') RETURNING id",
            ("cliente@test-suscripcion.cl", f"{MARCA} cliente"),
        )
        cliente_id = cur.fetchone()["id"]
    assert cliente_id not in {x["usuario_id"] for x in n.admin_suscripciones(u["admin"])["usuarios"]}
    with pytest.raises(HTTPException) as e:
        n.admin_guardar_suscripcion(cliente_id, n.SuscripcionIn(tipos=["anuncio"]), u["admin"])
    assert e.value.status_code == 400


@con_bd
def test_guardar_para_usuario_inexistente_es_404(escenario):
    _, u = escenario
    with pytest.raises(HTTPException) as e:
        n.admin_guardar_suscripcion(999_999_999, n.SuscripcionIn(tipos=[]), u["admin"])
    assert e.value.status_code == 404
