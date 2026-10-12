"""La base «con muestra» lleva columna de todo analito que alguna fila pidió,
aunque el catálogo de AGROFRESH no lo traiga (caso DPA)."""
from app.emitir import _analitos_con_solicitados
from app.solicitud_excel import _analitos_fungicidas


def _codigos(analitos):
    return [a["codigo"] for a in _analitos_fungicidas(analitos, ("AGROFRESH",))]


def test_analito_pedido_sin_catalogo_propio_tiene_columna():
    catalogo = [
        {"laboratorio": "AGROFRESH", "codigo": "FDL", "nombre": "Fludioxonil", "activo": True, "orden": 1},
        {"laboratorio": "QUITECA", "codigo": "DPA", "nombre": "Difenilamina", "activo": True, "orden": 7},
    ]
    assert _codigos(catalogo) == ["FDL"]
    assert _codigos(_analitos_con_solicitados(catalogo, [["FDL", "DPA"]])) == ["FDL", "DPA"]


def test_laboratorio_con_otra_capitalizacion_cuenta_como_propio():
    catalogo = [{"laboratorio": "Agrofresh", "codigo": "DPA", "nombre": "Difenilamina", "activo": True, "orden": 7}]
    assert _codigos(_analitos_con_solicitados(catalogo, [["DPA"]])) == ["DPA"]


def test_no_agrega_lo_que_nadie_pidio():
    catalogo = [{"laboratorio": "AGROFRESH", "codigo": "FDL", "nombre": "Fludioxonil", "activo": True, "orden": 1}]
    assert _codigos(_analitos_con_solicitados(catalogo, [["FDL"]])) == ["FDL"]
