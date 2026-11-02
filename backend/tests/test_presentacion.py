"""Presentación con control remoto: la lógica pura y que todo quede cerrado al administrador general."""
from datetime import datetime, timedelta, timezone

import pytest

from app import presentacion
from app.auth import solo_admin_general

AHORA = datetime(2026, 11, 2, 12, 0, 0, tzinfo=timezone.utc)


def test_la_presentacion_esta_abierta_si_el_computador_dio_senal_hace_poco():
    assert presentacion.esta_activo(AHORA - timedelta(seconds=3), AHORA)
    assert presentacion.esta_activo(AHORA - timedelta(seconds=presentacion.SEGUNDOS_ACTIVO), AHORA)
    assert not presentacion.esta_activo(AHORA - timedelta(seconds=presentacion.SEGUNDOS_ACTIVO + 1), AHORA)


def test_sin_senal_nunca_esta_abierta():
    assert not presentacion.esta_activo(None, AHORA)


@pytest.mark.parametrize("tipo", ["siguiente", "anterior", "simular"])
def test_las_ordenes_sin_datos_no_aceptan_datos_de_mas(tipo):
    assert presentacion.validar_comando(tipo, {"x": 1, "slide": "viaje"}) == {}


def test_ir_solo_a_diapositivas_que_existen():
    assert presentacion.validar_comando("ir", {"slide": "motor"}) == {"slide": "motor"}
    with pytest.raises(ValueError):
        presentacion.validar_comando("ir", {"slide": "no-existe"})
    with pytest.raises(ValueError):
        presentacion.validar_comando("ir", None)


def test_el_paso_de_la_simulacion_tiene_limites():
    assert presentacion.validar_comando("paso", {"n": "3"}) == {"n": 3}
    for malo in (-1, 21, "x", None):
        with pytest.raises(ValueError):
            presentacion.validar_comando("paso", {"n": malo})


def test_eco_pestana_y_paneles():
    assert presentacion.validar_comando("eco", {"abierto": 1}) == {"abierto": True}
    assert presentacion.validar_comando("pausa_eco", {"pausa": False}) == {"pausa": False}
    assert presentacion.validar_comando("pestana", {"t": "tok"}) == {"t": "tok"}
    with pytest.raises(ValueError):
        presentacion.validar_comando("pestana", {"t": "otra"})
    assert presentacion.validar_comando("nodo", {"k": "B"}) == {"k": "B"}
    assert presentacion.validar_comando("engranaje", {"id": "ingesta"}) == {"k": "ingesta"}
    for malo in ({"k": ""}, {"k": "a b"}, {"k": "<script>"}, {}):
        with pytest.raises(ValueError):
            presentacion.validar_comando("nodo", malo)


def test_una_orden_desconocida_se_rechaza():
    with pytest.raises(ValueError):
        presentacion.validar_comando("borrar_todo", {})


def test_las_ordenes_llevan_numero_correlativo_y_solo_quedan_las_ultimas():
    cs, seq = [], 0
    for i in range(presentacion.MAX_COMANDOS + 10):
        cs, seq = presentacion.agregar_comando(cs, seq, "siguiente", {})
    assert seq == presentacion.MAX_COMANDOS + 10
    assert len(cs) == presentacion.MAX_COMANDOS
    assert cs[-1]["seq"] == seq and cs[0]["seq"] == seq - presentacion.MAX_COMANDOS + 1


def test_el_computador_recibe_solo_lo_que_aun_no_ejecuto():
    cs = [{"seq": n, "tipo": "siguiente", "datos": {}} for n in (4, 5, 6)]
    assert [c["seq"] for c in presentacion.comandos_desde(cs, 4)] == [5, 6]
    assert presentacion.comandos_desde(cs, 6) == []


def test_al_abrir_la_presentacion_no_se_repiten_las_ordenes_viejas():
    cs = [{"seq": 9, "tipo": "ir", "datos": {"slide": "motor"}}]
    assert presentacion.comandos_desde(cs, -1) == []


def test_las_notas_se_limpian_y_se_acotan():
    assert presentacion.limpiar_nota("  hola\r\nmundo  ") == "hola\nmundo"
    assert len(presentacion.limpiar_nota("x" * 5000)) == presentacion.MAX_NOTA
    assert presentacion.limpiar_nota(None) == ""


def test_las_diapositivas_del_servidor_son_las_de_la_presentacion():
    """Espejo de `public/deck/index.html` (ORDER) y de `diapositivas.ts`: si se agrega una, se agrega en los tres."""
    import re
    from pathlib import Path
    raiz = Path(__file__).resolve().parents[2]
    html = (raiz / "public" / "deck" / "index.html").read_text(encoding="utf-8")
    orden = re.search(r"var ORDER=\[([^\]]+)\]", html).group(1)
    assert tuple(re.findall(r"'([a-z]+)'", orden)) == presentacion.DIAPOSITIVAS
    ts = (raiz / "src" / "features" / "presentacion" / "lib" / "diapositivas.ts").read_text(encoding="utf-8")
    assert tuple(re.findall(r"id: '([a-z]+)'", ts)) == presentacion.DIAPOSITIVAS


def test_todas_las_rutas_son_solo_del_administrador_general():
    rutas = [r for r in presentacion.router.routes if hasattr(r, "dependant")]
    assert rutas, "no se encontraron rutas"
    for r in rutas:
        llamadas = [d.call for d in r.dependant.dependencies]
        assert solo_admin_general in llamadas, f"{r.path} no exige administrador general"


def test_decidir_solo_acepta_aceptar_o_rechazar():
    assert presentacion.validar_comando("decidir", {"v": "accept", "x": 1}) == {"v": "accept"}
    assert presentacion.validar_comando("decidir", {"v": "reject"}) == {"v": "reject"}
    with pytest.raises(ValueError):
        presentacion.validar_comando("decidir", {"v": "quizas"})
    with pytest.raises(ValueError):
        presentacion.validar_comando("decidir", None)
