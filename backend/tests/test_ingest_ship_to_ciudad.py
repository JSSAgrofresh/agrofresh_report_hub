"""El Ship To de la ingesta llega como la ciudad de la planta ("SAN FERNANDO")
y en Listados la planta del cliente se llama "DOLE PLANTA SAN FERNANDO".
También llega "0" cuando la celda estaba vacía. Casos reales de la carga del
23-09-2026, donde 326 filas quedaron fuera de la base por esto."""
from app import mapeo
from app.homogenizador import Homogenizador
from app.ingest import _resolver_listados, clave_normalizada_empresa

PLANTAS_DOLE = [
    "DOLE PLANTA CHILLAN",
    "DOLE PLANTA LONTUE",
    "DOLE PLANTA SAN FELIPE",
    "DOLE PLANTA SAN FERNANDO",
]


def _mapas() -> dict:
    clientes = {
        "DOLE CHILE": 1,
        "EXPORTADORA LOS LIRIOS": 2,
        "SOCIEDAD AGRICOLA EL PORVENIR": 3,
    }
    plantas = {
        1: PLANTAS_DOLE,
        2: ["SAN FERNANDO"],
        3: ["EL PORVENIR ( VERFRUT) PLANTA ORO VERDE", "EL PORVENIR (VERFRUT) PLANTA LONGAVI"],
    }
    ids = iter(range(100, 200))
    return {
        "clientes": {clave_normalizada_empresa(n): (n, i) for n, i in clientes.items()},
        "plantas": {
            c: {clave_normalizada_empresa(p): (p, next(ids)) for p in ps} for c, ps in plantas.items()
        },
        "especies": {},
        "variedades": {},
        "variedades_huerfanas": {},
        "mapeos_sold_to": {},
        "mapeos_ship_to": {},
    }


def _resolver(sold_to: str, ship_to: str | None) -> tuple[dict, list]:
    sol = {"sold_to_raw": sold_to, "ship_to_raw": ship_to, "especie": None, "variedad": None}
    motivos = _resolver_listados(sol, _mapas())
    return sol, motivos


class TestReglaContiene:
    def test_la_ciudad_encuentra_la_planta_del_cliente(self):
        h = Homogenizador(PLANTAS_DOLE, permitir_contiene=True)
        r = h.resolver("SAN FERNANDO")
        assert (r.valor, r.regla, r.automatico) == ("DOLE PLANTA SAN FERNANDO", "contiene", True)

    def test_sin_habilitarla_no_se_aplica(self):
        # Contra el catálogo completo de clientes "SAN FERNANDO" calzaría con
        # cualquiera que lo lleve en el nombre: por eso es opcional.
        assert Homogenizador(PLANTAS_DOLE).resolver("SAN FERNANDO").valor is None

    def test_palabras_completas(self):
        # "SAN FE" no es "SAN FELIPE" ni "SAN FERNANDO".
        assert Homogenizador(PLANTAS_DOLE, permitir_contiene=True).resolver("SAN FE").valor is None

    def test_dos_candidatos_no_se_adivina(self):
        h = Homogenizador(["X PLANTA CURICO NORTE", "X PLANTA CURICO SUR"], permitir_contiene=True)
        assert h.resolver("Curico").valor is None

    def test_sin_tildes(self):
        h = Homogenizador(["EL PORVENIR (VERFRUT) PLANTA LONGAVI"], permitir_contiene=True)
        assert h.resolver("LONGAVÍ").valor == "EL PORVENIR (VERFRUT) PLANTA LONGAVI"


class TestResolverListados:
    def test_ship_to_ciudad_se_resuelve_dentro_de_su_cliente(self):
        sol, motivos = _resolver("DOLE CHILE", "SAN FERNANDO")
        assert motivos == []
        assert sol["ship_to_raw"] == "DOLE PLANTA SAN FERNANDO"

    def test_planta_de_otro_cliente_sigue_a_revision(self):
        # El Porvenir no tiene planta en San Fernando; la de Los Lirios no le sirve.
        sol, motivos = _resolver("SOCIEDAD AGRICOLA EL PORVENIR", "SAN FERNANDO")
        assert [m["campo"] for m in motivos] == ["ship_to_raw"]
        assert sol["ship_to_raw"] == "SAN FERNANDO"

    def test_la_regla_no_toca_el_sold_to(self):
        # "SAN FERNANDO" está contenido en un solo cliente... no es su Sold To.
        _, motivos = _resolver("LIRIOS SAN FERNANDO", None)
        assert [m["campo"] for m in motivos] == ["sold_to_raw"]


class TestCeroEsVacio:
    def test_mapeo_limpia_el_cero_y_el_guion(self):
        sol = mapeo.mapear_solicitud({"Sold To": "DOLE CHILE", "Ship To": "0", "Especie": "-"})
        assert sol["ship_to_raw"] is None
        assert sol["especie"] is None
        assert sol["sold_to_raw"] == "DOLE CHILE"

    def test_sin_ship_to_no_es_motivo_de_revision(self):
        _, motivos = _resolver("DOLE CHILE", None)
        assert motivos == []

    def test_sin_relleno_no_toca_valores_reales(self):
        assert mapeo.sin_relleno("10") == "10"
        assert mapeo.sin_relleno("SAN FERNANDO") == "SAN FERNANDO"
        assert mapeo.sin_relleno(None) is None
