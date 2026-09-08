"""
El prefijo de solicitud de un laboratorio (Laboratorios → editar), la parte
que se valida al crear/editar -no la que arma el folio, esa está en
test_toma_muestras_indice.py::TestPrefijoDeSolicitud-.

No toca disco ni R2: `_leer_config`/`_escribir_config` se reemplazan por una
lista en memoria.
"""
import pytest
from fastapi import HTTPException

from app import toma_muestras as tm


def _config_en_memoria(monkeypatch, items):
    """`_leer_config` siempre devuelve una COPIA de la lista actual -como
    haría leer un archivo de verdad-, y `_escribir_config` reemplaza esa
    lista, para que crear/editar en cadena se vean entre sí."""
    estado = {"items": items}
    monkeypatch.setattr(tm, "_leer_config", lambda archivo, defecto=None: [dict(i) for i in estado["items"]])
    monkeypatch.setattr(tm, "_escribir_config", lambda archivo, datos: estado.update(items=datos))
    return estado


def _lab(id, codigo, prefijo=""):
    return {"id": id, "codigo": codigo, "nombre": codigo.title(), "descripcion": None, "prefijo_solicitud": prefijo, "activo": True, "orden": id}


class TestCrear:
    def test_prefijo_valido_se_guarda(self, monkeypatch):
        _config_en_memoria(monkeypatch, [])
        creado = tm.crear_laboratorio_config(tm.LaboratorioIn(codigo="SGS", nombre="SGS", prefijo_solicitud="SGS"))
        assert creado.prefijo_solicitud == "SGS"

    def test_prefijo_vacio_es_valido(self, monkeypatch):
        """Vacío significa "todavía sin configurar", no un error."""
        _config_en_memoria(monkeypatch, [])
        creado = tm.crear_laboratorio_config(tm.LaboratorioIn(codigo="SGS", nombre="SGS", prefijo_solicitud=""))
        assert creado.prefijo_solicitud == ""

    @pytest.mark.parametrize("prefijo", ["agf", "AG-F", "AG F", "A" * 9])
    def test_prefijo_con_formato_invalido_rechaza(self, monkeypatch, prefijo):
        _config_en_memoria(monkeypatch, [])
        with pytest.raises(HTTPException) as exc:
            tm.crear_laboratorio_config(tm.LaboratorioIn(codigo="SGS", nombre="SGS", prefijo_solicitud=prefijo))
        assert exc.value.status_code == 400

    def test_no_puede_repetir_el_prefijo_de_otro_laboratorio(self, monkeypatch):
        """Dos laboratorios con el mismo prefijo generarían folios idénticos
        -cada uno numera aparte, así que "AGF" en los dos repetiría
        OT-AGF0001 en ambos-."""
        _config_en_memoria(monkeypatch, [_lab(1, "AGROFRESH", "AGF")])
        with pytest.raises(HTTPException) as exc:
            tm.crear_laboratorio_config(tm.LaboratorioIn(codigo="SGS", nombre="SGS", prefijo_solicitud="AGF"))
        assert exc.value.status_code == 400

    def test_dos_laboratorios_sin_prefijo_no_chocan_entre_si(self, monkeypatch):
        """Vacío no es "un prefijo repetido": puede haber varios laboratorios
        todavía sin configurar."""
        _config_en_memoria(monkeypatch, [_lab(1, "AGROFRESH", "")])
        creado = tm.crear_laboratorio_config(tm.LaboratorioIn(codigo="SGS", nombre="SGS", prefijo_solicitud=""))
        assert creado.prefijo_solicitud == ""


class TestEditar:
    def test_conservar_su_propio_prefijo_no_choca_consigo_mismo(self, monkeypatch):
        _config_en_memoria(monkeypatch, [_lab(1, "AGROFRESH", "AGF")])
        actualizado = tm.editar_laboratorio_config(
            1, tm.LaboratorioIn(codigo="AGROFRESH", nombre="AgroFresh renombrado", prefijo_solicitud="AGF")
        )
        assert actualizado.prefijo_solicitud == "AGF"

    def test_no_puede_tomar_el_prefijo_de_otro_laboratorio(self, monkeypatch):
        _config_en_memoria(monkeypatch, [_lab(1, "AGROFRESH", "AGF"), _lab(2, "QUITECA", "QTC")])
        with pytest.raises(HTTPException) as exc:
            tm.editar_laboratorio_config(2, tm.LaboratorioIn(codigo="QUITECA", nombre="Quiteca", prefijo_solicitud="AGF"))
        assert exc.value.status_code == 400

    def test_puede_configurarle_un_prefijo_a_uno_que_no_tenia(self, monkeypatch):
        _config_en_memoria(monkeypatch, [_lab(1, "AGROFRESH", "")])
        actualizado = tm.editar_laboratorio_config(
            1, tm.LaboratorioIn(codigo="AGROFRESH", nombre="AgroFresh", prefijo_solicitud="AGF")
        )
        assert actualizado.prefijo_solicitud == "AGF"
