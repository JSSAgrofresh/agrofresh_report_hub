"""Cuentas de cliente con varios accesos: la lógica pura (listas de distribución → accesos) y, con Postgres, el script
de prueba de traspaso contra el MISMO filtro de Report que usa un cliente real."""
import importlib.util
import os

import pytest

from app import accesos_clientes as ac
from app.auth import Usuario
from tests.utiles_bd import hay_base


def _cargar(nombre):
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", nombre + ".py")
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _c(sold, ship, email, especie=None, activo=True, servicio=None, tipo="resultado_cliente"):
    c = {"tipo": tipo, "sold_to": sold, "ship_to": ship, "email": email, "activo": activo, "orden": 0}
    if especie:
        c["especie"] = especie
    if servicio:
        c["servicio"] = servicio
    return c


CONTACTOS = [
    _c("DOLE", "DOLE LONTUE", "Ana@dole.cl", "Cereza"),
    _c("DOLE", "DOLE LONTUE", "ana@dole.cl", "Manzana"),
    _c("DOLE", "DOLE CODEGUA", "ana@dole.cl", "Cereza"),
    _c("DOLE", "DOLE LONTUE", "luis@dole.cl"),                      # sin especie = todas
    _c("DOLE", "DOLE LONTUE", "luis@dole.cl", "Cereza"),            # cubierta por la anterior: no se repite
    _c("VERFRUT", "VERFRUT RAPEL", "eva@verfrut.cl", "Kiwi"),
    _c("DOLE", "DOLE LONTUE", "jorge.sandoval@agrofresh.com", "Cereza"),   # interno: no es cliente
    _c("DOLE", "DOLE LONTUE", "agrofreshreporthub@gmail.com"),
    _c("DOLE", "DOLE LONTUE", "uno@x.cl; dos@x.cl", "Cereza"),      # dos pegados: no es un correo
    _c("DOLE", "DOLE LONTUE", "inactivo@dole.cl", "Cereza", activo=False),
    _c("DOLE", "DOLE LONTUE", "actimist@dole.cl", "Cereza", servicio="actimist"),
    _c("DOLE", "DOLE LONTUE", "com@agrofresh.com", tipo="resultado_interno"),
]


def test_un_correo_es_una_cuenta_con_sus_accesos_y_sin_repetir_ni_mezclar_mayusculas():
    accesos, invalidos = ac.accesos_por_correo(CONTACTOS)
    assert accesos["ana@dole.cl"] == [
        {"clienteNombre": "DOLE", "plantaNombre": "DOLE CODEGUA", "especie": "Cereza"},
        {"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE", "especie": "Cereza"},
        {"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE", "especie": "Manzana"},
    ]
    assert accesos["luis@dole.cl"] == [{"clienteNombre": "DOLE", "plantaNombre": "DOLE LONTUE"}]
    assert invalidos == ["uno@x.cl; dos@x.cl"]


def test_no_hay_cuenta_para_internos_inactivos_ni_otros_servicios():
    accesos, _ = ac.accesos_por_correo(CONTACTOS)
    assert set(accesos) == {"ana@dole.cl", "luis@dole.cl", "eva@verfrut.cl"}
    todos, _ = ac.accesos_por_correo(CONTACTOS, ["", "actimist"])
    assert "actimist@dole.cl" in todos


def test_los_tres_tipos_de_correo():
    accesos, _ = ac.accesos_por_correo(CONTACTOS)
    assert ac.tipo_de_cuenta(accesos["eva@verfrut.cl"]) == 1     # una planta y una especie
    assert ac.tipo_de_cuenta(accesos["luis@dole.cl"]) == 2       # una planta, todas las especies
    assert ac.tipo_de_cuenta([a for a in accesos["ana@dole.cl"] if a["plantaNombre"] == "DOLE LONTUE"]) == 2
    assert ac.tipo_de_cuenta(accesos["ana@dole.cl"]) == 3        # varias plantas


UNIVERSO = {("DOLE", "DOLE LONTUE", "Cereza"), ("DOLE", "DOLE LONTUE", "Manzana"), ("DOLE", "DOLE LONTUE", "Kiwi"),
            ("DOLE", "DOLE CODEGUA", "Cereza"), ("DOLE", "DOLE CODEGUA", "Manzana"), ("VERFRUT", "VERFRUT RAPEL", "Kiwi")}


def test_lo_esperado_y_la_comparacion_son_exactos():
    accesos, _ = ac.accesos_por_correo(CONTACTOS)
    esperado = ac.triples_esperados(accesos["ana@dole.cl"], UNIVERSO)
    assert esperado == {("DOLE", "DOLE LONTUE", "Cereza"), ("DOLE", "DOLE LONTUE", "Manzana"), ("DOLE", "DOLE CODEGUA", "Cereza")}
    assert ac.comparar(set(esperado), esperado)["estado"] == "sin traspaso"
    de_mas = ac.comparar(esperado | {("DOLE", "DOLE CODEGUA", "Manzana")}, esperado)
    assert de_mas["estado"] == "con traspaso" and de_mas["ve_de_mas"] == [("DOLE", "DOLE CODEGUA", "Manzana")]
    falta = ac.comparar(esperado - {("DOLE", "DOLE LONTUE", "Manzana")}, esperado)
    assert falta["estado"] == "con traspaso" and falta["le_falta"] == [("DOLE", "DOLE LONTUE", "Manzana")]


# ── Con Postgres: el filtro REAL de Report ───────────────────────────────────────────────────────



@pytest.fixture
def datos():
    """Dos clientes con plantas y solicitudes de varias especies; se borran al terminar."""
    from app.db import conexion, cursor_dict

    filas = [("ZZT DOLE", "ZZT LONTUE", "Cereza"), ("ZZT DOLE", "ZZT LONTUE", "Manzana"), ("ZZT DOLE", "ZZT LONTUE", "Kiwi"),
             ("ZZT DOLE", "ZZT CODEGUA", "Cereza"), ("ZZT DOLE", "ZZT CODEGUA", "Manzana"), ("ZZT VERFRUT", "ZZT RAPEL", "Kiwi")]
    with conexion() as conn, cursor_dict(conn) as cur:
        ids_c, ids_p = {}, {}
        for sold, ship, esp in filas:
            if sold not in ids_c:
                cur.execute("INSERT INTO cliente (nombre) VALUES (%s) RETURNING id", (sold,))
                ids_c[sold] = cur.fetchone()["id"]
            if (sold, ship) not in ids_p:
                cur.execute("INSERT INTO planta (cliente_id, nombre) VALUES (%s, %s) RETURNING id", (ids_c[sold], ship))
                ids_p[(sold, ship)] = cur.fetchone()["id"]
            cur.execute("INSERT INTO solicitud (planta_id, especie) VALUES (%s, %s)", (ids_p[(sold, ship)], esp))
    yield set(filas)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud WHERE planta_id = ANY(%s)", (list(ids_p.values()),))
        cur.execute("DELETE FROM planta WHERE id = ANY(%s)", (list(ids_p.values()),))
        cur.execute("DELETE FROM cliente WHERE id = ANY(%s)", (list(ids_c.values()),))


def _cuenta(accesos):
    return Usuario(id="7", email="a@dole.cl", nombre="A", tipoAcceso="cliente", clienteNombre=accesos[0]["clienteNombre"],
                   plantaNombre=accesos[0].get("plantaNombre"), plantasAsignadas=accesos)


def _vista(cuenta):
    from app.db import conexion, cursor_dict

    prueba = _cargar("probar_traspaso_clientes")
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        return {t for t in prueba._triples(cur, cuenta) if t[0].startswith("ZZT")}


@pytest.mark.skipif(not hay_base("solicitud"), reason="sin Postgres con el esquema aplicado")
def test_el_filtro_real_deja_a_cada_tipo_de_cuenta_ver_exactamente_lo_suyo(datos):
    A = lambda s, p, e=None: {"clienteNombre": s, "plantaNombre": p, **({"especie": e} if e else {})}  # noqa: E731
    # Tipo 1: una planta y una especie.
    assert _vista(_cuenta([A("ZZT DOLE", "ZZT LONTUE", "Cereza")])) == {("ZZT DOLE", "ZZT LONTUE", "Cereza")}
    # Tipo 2: una planta y varias especies.
    assert _vista(_cuenta([A("ZZT DOLE", "ZZT LONTUE", "Cereza"), A("ZZT DOLE", "ZZT LONTUE", "kiwi ")])) == {
        ("ZZT DOLE", "ZZT LONTUE", "Cereza"), ("ZZT DOLE", "ZZT LONTUE", "Kiwi")}
    # Tipo 3: varias plantas y varias especies (la misma especie en otra planta no se cuela).
    assert _vista(_cuenta([A("ZZT DOLE", "ZZT LONTUE", "Manzana"), A("ZZT VERFRUT", "ZZT RAPEL", "Kiwi"),
                           A("ZZT DOLE", "ZZT CODEGUA", "Cereza")])) == {
        ("ZZT DOLE", "ZZT LONTUE", "Manzana"), ("ZZT VERFRUT", "ZZT RAPEL", "Kiwi"), ("ZZT DOLE", "ZZT CODEGUA", "Cereza")}
    # Sin especie = todas las de esa planta; sin planta = todo el Sold To.
    assert _vista(_cuenta([A("ZZT DOLE", "ZZT CODEGUA")])) == {("ZZT DOLE", "ZZT CODEGUA", "Cereza"), ("ZZT DOLE", "ZZT CODEGUA", "Manzana")}
    assert len(_vista(_cuenta([A("ZZT DOLE", None)]))) == 5


@pytest.mark.skipif(not hay_base("solicitud"), reason="sin Postgres con el esquema aplicado")
def test_la_prueba_de_traspaso_detecta_una_cuenta_mal_creada(datos):
    """La lista dice una cosa y la cuenta guardada otra: el traspaso se ve y se nombra."""
    lista = [{"clienteNombre": "ZZT DOLE", "plantaNombre": "ZZT LONTUE", "especie": "Cereza"}]
    mal = _cuenta([{"clienteNombre": "ZZT DOLE", "plantaNombre": "ZZT LONTUE"}])   # le dieron todas las especies
    universo = {t for t in datos}
    r = ac.comparar(_vista(mal), ac.triples_esperados(lista, universo))
    assert r["estado"] == "con traspaso"
    assert set(r["ve_de_mas"]) == {("ZZT DOLE", "ZZT LONTUE", "Manzana"), ("ZZT DOLE", "ZZT LONTUE", "Kiwi")}
    bien = _cuenta(lista)
    assert ac.comparar(_vista(bien), ac.triples_esperados(lista, universo))["estado"] == "sin traspaso"


# ── Correos mal escritos en la lista ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("texto,esperado", [
    ("cibarra@grupoara.cl cibarra@grupoara.cl", ["cibarra@grupoara.cl"]),
    ("gsalazar@auroraa.cl / eespina@auroraa.cl", ["gsalazar@auroraa.cl", "eespina@auroraa.cl"]),
    ("eduardo quiero mejias equieromejias@camarico.cl / francisca atala sagcamarico@camarico.cl",
     ["equieromejias@camarico.cl", "sagcamarico@camarico.cl"]),
    ("pamela.donoso@dole.commarcela.lecannelier@dole.com", ["pamela.donoso@dole.com", "marcela.lecannelier@dole.com"]),
    ("matias.barrera@manio.cl:juan.lorca@manio.cl", ["matias.barrera@manio.cl", "juan.lorca@manio.cl"]),
    ("clagos@exser.cl@pchamorro@exser.cl", ["clagos@exser.cl", "pchamorro@exser.cl"]),
    ("julio salgado frio@fruitservice.cl", ["frio@fruitservice.cl"]),
    ("juan@empresa.com.cl", ["juan@empresa.com.cl"]),   # un dominio con .com adentro no se parte
    ("sin correo aquí", []),
])
def test_separar_correos_lee_los_que_hay_y_descarta_el_resto(texto, esperado):
    assert ac.separar_correos(texto) == esperado


def test_corregir_contactos_reemplaza_sin_duplicar_ni_tocar_lo_bueno():
    malo = _c("DOLE", "DOLE LONTUE", "ana@dole.cl / luis@dole.cl", "Cereza")
    malo.update(id=5, nombre="ana@dole.cl / luis@dole.cl")
    bueno = _c("DOLE", "DOLE LONTUE", "luis@dole.cl", "Cereza")
    bueno["id"] = 6
    otro = _c("DOLE", "DOLE LONTUE", "ok@dole.cl", "Cereza")
    otro["id"] = 7
    ilegible = _c("DOLE", "DOLE LONTUE", "llamar a Juan", "Cereza")
    ilegible["id"] = 8
    nuevos, cambios, sin_arreglo = ac.corregir_contactos([malo, bueno, otro, ilegible])
    correos = [c["email"] for c in nuevos]
    assert correos == ["ana@dole.cl", "luis@dole.cl", "ok@dole.cl", "llamar a Juan"]   # luis ya estaba: no se repite
    assert nuevos[0]["id"] == 5 and nuevos[0]["nombre"] == "ana@dole.cl"
    assert [c["email"] for c in sin_arreglo] == ["llamar a Juan"]
    assert len(cambios) == 1 and cambios[0]["despues"] == ["ana@dole.cl"]


def test_corregir_contactos_da_un_id_nuevo_a_cada_correo_extra():
    malo = _c("DOLE", "DOLE LONTUE", "a@x.cl / b@x.cl / c@x.cl", "Cereza")
    malo["id"] = 1
    nuevos, _, _ = ac.corregir_contactos([malo, {**_c("VERFRUT", "VERFRUT RAPEL", "z@v.cl"), "id": 9}])
    assert [c["email"] for c in nuevos[:3]] == ["a@x.cl", "b@x.cl", "c@x.cl"]
    assert len({c["id"] for c in nuevos}) == 4 and nuevos[0]["id"] == 1 and nuevos[1]["id"] == 10


def test_el_script_mira_primero_y_aplica_con_respaldo(tmp_path, monkeypatch, capsys):
    import json

    from app import config, config_store

    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    contactos = [{**_c("DOLE", "DOLE LONTUE", "a@x.cl / b@x.cl", "Cereza"), "id": 1}]
    config_store.escribir("contactos_laboratorio.json", contactos)
    mod = _cargar("corregir_correos_lista")

    monkeypatch.setattr("sys.argv", ["corregir_correos_lista.py"])
    mod.main()
    assert "No se escribió nada" in capsys.readouterr().out
    assert config_store.leer("contactos_laboratorio.json", []) == contactos

    monkeypatch.setattr("sys.argv", ["corregir_correos_lista.py", "--aplicar"])
    mod.main()
    carpeta = tmp_path / "solicitudes" / "_config"
    assert [c["email"] for c in config_store.leer("contactos_laboratorio.json", [])] == ["a@x.cl", "b@x.cl"]
    respaldos = [f for f in os.listdir(carpeta) if f.startswith("contactos_laboratorio_respaldo_")]
    assert len(respaldos) == 1 and json.load(open(carpeta / respaldos[0], encoding="utf-8")) == contactos
