"""
Permisos por carpeta en Storage.

Lo importante de esta pantalla es lo que NO deja ver, así que las pruebas
miran eso: que una carpeta restringida desaparezca del listado, que no se pueda
bajar un archivo suyo llamando a la API directo, y que mover o borrar una
carpeta no deje su regla huérfana.

Sin base ni request: la lógica de decisión es pura. La parte que escribe en
Postgres necesita la migración 0043 y se salta sola si no está.
"""
import pytest
from fastapi.testclient import TestClient

from app import config
from app import storage_permisos as sp
from app.auth import Usuario, usuario_actual
from app.main import app
from tests.utiles_bd import hay_base


def _u(id_, tipo="analista") -> Usuario:
    return Usuario(id=str(id_), email=f"u{id_}@x.cl", nombre=f"U{id_}", tipoAcceso=tipo, area="cromatografia")


# ── Lógica pura ──────────────────────────────────────────────────────────


def test_carpeta_sin_regla_es_abierta():
    assert sp.puede_ver({}, "Clientes/DOLE", _u(1))


def test_carpeta_restringida_solo_para_los_asignados():
    reglas = {"Clientes": {1}}
    assert sp.puede_ver(reglas, "Clientes", _u(1))
    assert not sp.puede_ver(reglas, "Clientes", _u(2))


def test_las_subcarpetas_y_archivos_heredan_la_regla():
    reglas = {"Clientes": {1}}
    assert sp.puede_ver(reglas, "Clientes/DOLE/2026/informe.pdf", _u(1))
    assert not sp.puede_ver(reglas, "Clientes/DOLE/2026/informe.pdf", _u(2))


def test_la_regla_de_una_carpeta_no_toca_a_sus_hermanas():
    reglas = {"Clientes": {1}}
    assert sp.puede_ver(reglas, "Clientes2", _u(2))
    assert sp.puede_ver(reglas, "Otra", _u(2))


def test_admin_general_y_gerencia_ven_todo():
    reglas = {"Clientes": {1}}
    assert sp.puede_ver(reglas, "Clientes", _u(99, "admin_general"))
    assert sp.puede_ver(reglas, "Clientes", _u(98, "gerencia"))
    assert not sp.puede_ver(reglas, "Clientes", _u(97, "admin_area"))


def test_una_subcarpeta_restringe_mas_que_su_padre():
    reglas = {"Clientes": {1, 2}, "Clientes/DOLE": {1}}
    assert sp.puede_ver(reglas, "Clientes/DOLE", _u(1))
    assert not sp.puede_ver(reglas, "Clientes/DOLE", _u(2))
    assert sp.puede_ver(reglas, "Clientes/Otro", _u(2))


def test_normalizar_quita_barras():
    assert sp.normalizar("/a//b/") == "a/b"
    assert sp.normalizar("") == ""


def test_podar_quita_de_la_subcarpeta_a_quien_no_llega_hasta_ella():
    reglas = {"A": {1}, "A/B": {1, 2}, "A/B/C": {2}}
    podar = sp.reglas_a_podar(reglas)
    assert ("A/B", 2) in podar
    # C queda sin nadie que la alcance: el 2 ya no llega a A
    assert ("A/B/C", 2) in podar


def test_podar_no_toca_reglas_consistentes():
    assert sp.reglas_a_podar({"A": {1, 2}, "A/B": {1}}) == []


# ── Contra la API, con disco temporal y reglas simuladas ────────────────


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    (tmp_path / "Secreta").mkdir()
    (tmp_path / "Secreta" / "plan.txt").write_text("x")
    (tmp_path / "Publica").mkdir()
    (tmp_path / "Publica" / "hola.txt").write_text("x")
    reglas = {"Secreta": {1}}
    monkeypatch.setattr(sp, "cargar_reglas", lambda espacio: {k: set(v) for k, v in reglas.items()})
    llamadas = []
    monkeypatch.setattr(sp, "reubicar", lambda *a: llamadas.append(a))

    quien = {"u": _u(2)}
    app.dependency_overrides[usuario_actual] = lambda: quien["u"]
    cliente = TestClient(app)
    yield cliente, quien, llamadas
    app.dependency_overrides.pop(usuario_actual, None)


def _nombres(resp):
    return sorted(e["nombre"] for e in resp.json()["entradas"])


def test_el_listado_esconde_la_carpeta_restringida(api):
    cliente, quien, _ = api
    assert _nombres(cliente.get("/api/storage/listar")) == ["Publica"]
    quien["u"] = _u(1)
    assert _nombres(cliente.get("/api/storage/listar")) == ["Publica", "Secreta"]


def test_no_se_puede_entrar_ni_bajar_a_mano(api):
    cliente, _, _ = api
    assert cliente.get("/api/storage/listar", params={"ruta": "Secreta"}).status_code == 403
    assert cliente.get("/api/storage/descargar", params={"ruta": "Secreta/plan.txt"}).status_code == 403


def test_no_se_puede_escribir_en_una_carpeta_ajena(api):
    cliente, _, _ = api
    r = cliente.post("/api/storage/carpetas", json={"ruta_padre": "Secreta", "nombre": "x"})
    assert r.status_code == 403
    r = cliente.request("DELETE", "/api/storage/eliminar", params={"ruta": "Secreta/plan.txt"})
    assert r.status_code == 403
    r = cliente.put("/api/storage/mover", json={"ruta": "Publica/hola.txt", "ruta_destino": "Secreta"})
    assert r.status_code == 403


def test_el_asignado_si_entra(api):
    cliente, quien, _ = api
    quien["u"] = _u(1)
    assert cliente.get("/api/storage/listar", params={"ruta": "Secreta"}).status_code == 200
    assert cliente.get("/api/storage/descargar", params={"ruta": "Secreta/plan.txt"}).status_code == 200


def test_gerencia_ve_pero_no_escribe(api):
    cliente, quien, _ = api
    quien["u"] = _u(50, "gerencia")
    assert _nombres(cliente.get("/api/storage/listar")) == ["Publica", "Secreta"]
    r = cliente.post("/api/storage/carpetas", json={"ruta_padre": "", "nombre": "nueva"})
    assert r.status_code == 403


def test_renombrar_y_borrar_carpeta_acompana_su_regla(api):
    cliente, quien, llamadas = api
    quien["u"] = _u(1)
    assert cliente.put("/api/storage/renombrar", json={"ruta": "Secreta", "nombre_nuevo": "Reservada"}).status_code == 200
    assert llamadas[-1] == ("local", "Secreta", "Reservada")
    r = cliente.request("DELETE", "/api/storage/eliminar", params={"ruta": "Publica"})
    assert r.status_code == 200
    assert llamadas[-1] == ("local", "Publica", None)


def test_solo_admin_general_ve_los_permisos(api):
    cliente, _, _ = api
    assert cliente.get("/api/storage/permisos", params={"espacio": "local", "ruta": "Secreta"}).status_code == 403
    assert cliente.put(
        "/api/storage/permisos", json={"espacio": "local", "ruta": "Secreta", "usuario_ids": [2]}
    ).status_code == 403


def test_el_admin_ve_cuantas_cuentas_tiene_cada_carpeta(api):
    cliente, quien, _ = api
    quien["u"] = _u(99, "admin_general")
    entradas = {e["nombre"]: e for e in cliente.get("/api/storage/listar").json()["entradas"]}
    assert entradas["Secreta"]["restringida"] is True
    assert entradas["Secreta"]["n_usuarios"] == 1
    assert entradas["Publica"]["restringida"] is False
    detalle = cliente.get("/api/storage/permisos", params={"espacio": "local", "ruta": "Secreta"}).json()
    assert detalle["usuario_ids"] == [1] and detalle["restringida"] is True


# ── Contra Postgres (migración 0043) ─────────────────────────────────────

con_bd = pytest.mark.skipif(
    not hay_base("storage_permiso"), reason="sin Postgres con la migración 0043 aplicada"
)


@con_bd
def test_guardar_reubicar_y_borrar_contra_la_base():
    from app.db import conexion, cursor_dict

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT id FROM usuario WHERE tipo_acceso <> 'cliente' ORDER BY id LIMIT 2")
        ids = [int(f["id"]) for f in cur.fetchall()]
    if len(ids) < 2:
        pytest.skip("hacen falta dos cuentas internas")
    a, b = ids
    base = "__prueba_permisos__"
    try:
        sp.guardar("local", base, [a, b], "test")
        sp.guardar("local", f"{base}/sub", [a], "test")
        assert sp.cargar_reglas("local")[f"{base}/sub"] == {a}
        # una subcarpeta no puede dar acceso a quien no llega hasta ella
        with pytest.raises(Exception):
            sp.guardar("local", f"{base}/sub", [a, 999999], "test")
        # quitar a `a` del padre lo saca también de la subcarpeta
        sp.guardar("local", base, [b], "test")
        reglas = sp.cargar_reglas("local")
        assert a not in reglas.get(f"{base}/sub", set())
        sp.guardar("local", f"{base}/sub", [b], "test")
        sp.reubicar("local", base, base + "_movida")
        reglas = sp.cargar_reglas("local")
        assert base not in reglas and reglas[base + "_movida"] == {b}
        assert reglas[base + "_movida/sub"] == {b}
        sp.reubicar("local", base + "_movida", None)
        assert base + "_movida" not in sp.cargar_reglas("local")
    finally:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM storage_permiso WHERE ruta LIKE %s", (base + "%",))
