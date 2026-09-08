"""
El "chequeo de integridad" contra Listados (`_clave_empresa`,
`_sugerencias_fuzzy` en auditoria.py): funciones puras, no necesitan Postgres.
La consulta SQL que las usa (`_auditar_fuera_de_listados`) se prueba a mano
contra una base real -acá solo se cubre la lógica de matching, que es la que
decide si algo se marca como "fuera de Listados" o no.
"""
from __future__ import annotations

from app.auditoria import _clave_empresa, _sugerencias_fuzzy


def test_clave_empresa_ignora_forma_juridica():
    assert _clave_empresa("DOLE CHILE S.A.") == _clave_empresa("Dole Chile")


def test_clave_empresa_no_se_come_una_palabra_real():
    # "SA" al final de "COPEFRUT SA" es forma jurídica; "SA" en medio de un
    # nombre real no debería desaparecer solo por parecerse.
    assert _clave_empresa("COPEFRUT SA") == "copefrut"


def test_sugerencias_fuzzy_encuentra_un_parecido_cercano():
    candidatos = {"blue ribbon": "Blue Ribbon", "brightwell": "Brightwell"}
    sugerencias = _sugerencias_fuzzy("blue ribon", candidatos)
    assert sugerencias
    assert sugerencias[0]["valor"] == "Blue Ribbon"


def test_sugerencias_fuzzy_vacio_sin_parecido():
    candidatos = {"brightwell": "Brightwell", "cargo": "Cargo"}
    assert _sugerencias_fuzzy("algo completamente distinto", candidatos) == []


def test_sugerencias_fuzzy_nunca_devuelve_mas_del_tope():
    candidatos = {f"variante {i}": f"Variante {i}" for i in range(10)}
    sugerencias = _sugerencias_fuzzy("variante 1", candidatos)
    assert len(sugerencias) <= 3
