"""
Historial de correcciones del Converter: lo que se guarda, quién lo ve y quién
puede olvidarlo. La parte sin base valida entradas y permisos; la parte con
Postgres recorre el ciclo completo (se salta sola si no hay base).
"""
import pytest
from fastapi.testclient import TestClient

from app.auth import Usuario, usuario_actual
from app.correcciones import normalizar
from app.db import conexion, cursor_dict
from app.main import app
from tests.utiles_bd import hay_base

cliente = TestClient(app)


def cuenta(tipo, modulos=None):
    return Usuario(id="1", email="ana@agrofresh.com", nombre="Ana", tipoAcceso=tipo, modulos=modulos)


@pytest.fixture
def como():
    def _como(u):
        app.dependency_overrides[usuario_actual] = lambda: u
    yield _como
    app.dependency_overrides.clear()


class TestNormalizar:
    def test_sin_tildes_mayusculas_ni_espacios_de_mas(self):
        assert normalizar("  Soc.  Agr.  La HORNILLA  Spa. ") == "soc. agr. la hornilla spa."
        assert normalizar("Agrícola Ñuble") == "agricola nuble"

    def test_vacio(self):
        assert normalizar(None) == "" and normalizar("   ") == ""


class TestEntradas:
    def _post(self, **extra):
        cuerpo = {"campo": "sold_to", "contexto": "", "valor_crudo": "X S.A.", "valor_oficial": "X SA", **extra}
        return cliente.post("/api/correcciones", json=cuerpo)

    def test_campo_desconocido(self, como):
        como(cuenta("analista"))
        assert self._post(campo="color").status_code == 400

    def test_no_hay_nada_que_recordar_si_es_el_mismo_valor(self, como):
        como(cuenta("analista"))
        r = self._post(valor_crudo="dole  chile", valor_oficial="DOLE CHILE")
        assert r.status_code == 400 and "mismo" in r.json()["detail"]

    def test_un_ship_to_sin_sold_to_no_tiene_sentido(self, como):
        como(cuenta("analista"))
        assert self._post(campo="ship_to", contexto="  ").status_code == 400

    def test_faltan_valores(self, como):
        como(cuenta("analista"))
        assert self._post(valor_oficial="  ").status_code == 400

    def test_un_cliente_no_puede_ni_leer_ni_guardar(self, como):
        como(cuenta("cliente"))
        assert self._post().status_code == 403
        assert cliente.get("/api/correcciones/alias").status_code == 403


class TestPermisos:
    def test_el_historial_es_solo_del_admin_general(self, como):
        # es el módulo Administración General: ni siquiera quien tiene
        # Auditoría interna asignada lo ve
        como(cuenta("admin_area", ["auditoria_interna"]))
        assert cliente.get("/api/correcciones").status_code == 403
        como(cuenta("gerencia"))
        assert cliente.get("/api/correcciones").status_code == 403

    def test_olvidar_es_solo_del_admin_general(self, como):
        como(cuenta("admin_area", ["auditoria_interna"]))
        assert cliente.delete("/api/correcciones/1").status_code == 403


pytestmark_bd = pytest.mark.skipif(
    not (hay_base("cliente") and hay_base("correccion_converter")),
    reason="sin Postgres con la migración 0045",
)


@pytest.mark.usefixtures("como")
@pytestmark_bd
class TestCicloConBase:
    @pytest.fixture(autouse=True)
    def datos(self):
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM correccion_converter WHERE valor_crudo LIKE 'TEST-CORR%'")
            cur.execute("DELETE FROM planta WHERE nombre = 'TEST-CORR PLANTA'")
            cur.execute("DELETE FROM cliente WHERE nombre = 'TEST-CORR CLIENTE'")
            cur.execute("INSERT INTO cliente (nombre, activo) VALUES ('TEST-CORR CLIENTE', true) RETURNING id")
            cid = cur.fetchone()["id"]
            cur.execute("INSERT INTO planta (cliente_id, nombre, activo) VALUES (%s, 'TEST-CORR PLANTA', true)", (cid,))
        yield
        app.dependency_overrides.clear()
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM correccion_converter WHERE valor_crudo LIKE 'TEST-CORR%'")
            cur.execute("DELETE FROM planta WHERE nombre = 'TEST-CORR PLANTA'")
            cur.execute("DELETE FROM cliente WHERE nombre = 'TEST-CORR CLIENTE'")

    def test_se_guarda_se_aplica_se_cuenta_y_se_olvida(self, como):
        como(cuenta("admin_general"))
        r = cliente.post("/api/correcciones", json={
            "campo": "sold_to", "valor_crudo": "TEST-CORR Cliente S.A.", "valor_oficial": "TEST-CORR CLIENTE", "archivo": "inf.pdf"})
        assert r.status_code == 200, r.text
        id_ = r.json()["id"]

        alias = [a for a in cliente.get("/api/correcciones/alias").json() if a["valor_crudo"].startswith("TEST-CORR")]
        assert alias == [{"campo": "sold_to", "contexto": "", "valor_crudo": "TEST-CORR Cliente S.A.", "valor_oficial": "TEST-CORR CLIENTE"}]

        # el Converter avisa dos usos (con otra escritura del mismo texto)
        u = cliente.post("/api/correcciones/usos", json=[
            {"campo": "sold_to", "valor_crudo": "test-corr  cliente s.a."}, {"campo": "sold_to", "valor_crudo": "TEST-CORR Cliente S.A."}])
        assert u.json() == {"contados": 2}

        fila = next(f for f in cliente.get("/api/correcciones").json() if f["id"] == id_)
        assert fila["usos"] == 2 and fila["ultimo_uso"] and fila["creado_por_nombre"] == "Ana" and fila["archivo_origen"] == "inf.pdf"

        assert cliente.delete(f"/api/correcciones/{id_}").status_code == 200
        assert cliente.delete(f"/api/correcciones/{id_}").status_code == 404
        assert not [a for a in cliente.get("/api/correcciones/alias").json() if a["valor_crudo"].startswith("TEST-CORR")]

    def test_volver_a_enseñar_el_mismo_texto_no_duplica_y_cuenta_la_revision(self, como):
        como(cuenta("admin_general"))
        base = {"campo": "sold_to", "valor_crudo": "TEST-CORR Otro", "valor_oficial": "TEST-CORR CLIENTE"}
        assert cliente.post("/api/correcciones", json=base).json()["revisiones"] == 0
        # mismo destino con otra escritura del texto: sigue siendo la misma asociación
        assert cliente.post("/api/correcciones", json={**base, "valor_crudo": "test-corr   OTRO"}).json()["revisiones"] == 0
        filas = [f for f in cliente.get("/api/correcciones").json() if f["valor_crudo"].upper().startswith("TEST-CORR OTRO")]
        assert len(filas) == 1

    def test_una_planta_se_asocia_dentro_de_su_cliente(self, como):
        como(cuenta("admin_general"))
        ok = cliente.post("/api/correcciones", json={
            "campo": "ship_to", "contexto": "TEST-CORR CLIENTE", "valor_crudo": "TEST-CORR planta x", "valor_oficial": "TEST-CORR PLANTA"})
        assert ok.status_code == 200, ok.text
        # la misma planta bajo otro cliente NO existe: no se aprende
        mal = cliente.post("/api/correcciones", json={
            "campo": "ship_to", "contexto": "OTRO CLIENTE", "valor_crudo": "TEST-CORR planta y", "valor_oficial": "TEST-CORR PLANTA"})
        assert mal.status_code == 400 and "no existe" in mal.json()["detail"]

    def test_no_aprende_hacia_un_valor_que_no_existe(self, como):
        como(cuenta("admin_general"))
        r = cliente.post("/api/correcciones", json={
            "campo": "sold_to", "valor_crudo": "TEST-CORR z", "valor_oficial": "CLIENTE INVENTADO"})
        assert r.status_code == 400
