"""El enlace de un resultado con su analito del catálogo tolera cómo escribe cada sistema el
laboratorio («ALS (Corthon)», «Diagnofruit») y el código (ECOLI en la ingesta, ECOLI100 en el catálogo)."""
from app import bd_excel, ingest
from app.mapeo import laboratorio_base, variantes_codigo


class _Cur:
    def __init__(self, filas):
        self.filas = filas

    def execute(self, *_):
        pass

    def fetchall(self):
        return self.filas


def _mapas(*filas):
    return ingest._cargar_analitos(_Cur([{"id": i, "codigo": c, "laboratorio": lab} for i, c, lab in filas]))


def test_laboratorio_base_ignora_mayusculas_y_parentesis():
    assert laboratorio_base("ALS (Corthon)") == laboratorio_base("Als") == laboratorio_base("ALS") == "als"
    assert laboratorio_base(None) == ""


def test_codigo_y_su_equivalente_del_otro_sistema():
    assert variantes_codigo("ECOLI") == ["ECOLI", "ECOLI100"]
    assert variantes_codigo("ECOLI100") == ["ECOLI100", "ECOLI"]
    assert variantes_codigo("PB") == ["PB"]


def test_als_corthon_encuentra_su_analito_sin_aviso():
    mapa, primero = _mapas((1, "PB", "ALS"), (2, "ECOLI100", "ALS"))
    assert ingest._analito_id_cache(mapa, primero, "PB", "ALS (Corthon)") == (1, None)
    # ECOLI (ingesta) = ECOLI100 (catálogo), y del laboratorio correcto, así que sin advertencia.
    assert ingest._analito_id_cache(mapa, primero, "ECOLI", "ALS (Corthon)") == (2, None)


def test_diagnofruit_sin_importar_mayusculas():
    mapa, primero = _mapas((7, "LEV", "DIAGNOFRUIT"))
    assert ingest._analito_id_cache(mapa, primero, "LEV", "Diagnofruit") == (7, None)


def test_lo_que_no_esta_en_el_catalogo_sigue_cayendo_en_analito_raw():
    mapa, primero = _mapas((1, "PB", "ALS"))
    ident, aviso = ingest._analito_id_cache(mapa, primero, "XYZ", "ALS")
    assert ident is None and "no está en el catálogo" in aviso


def test_mismo_codigo_en_otro_laboratorio_conserva_el_aviso_de_antes():
    mapa, primero = _mapas((1, "FDL", "QUITECA"))
    ident, aviso = ingest._analito_id_cache(mapa, primero, "FDL", "Agrofresh")
    assert ident == 1 and "no calzó exacto" in aviso


def test_la_descarga_de_bd_usa_la_misma_tabla_de_equivalencias():
    assert bd_excel.ALIAS_CODIGO["ECOLI"] == "ECOLI100" and bd_excel.codigo_de_formato("ECOLI") == "ECOLI100"
