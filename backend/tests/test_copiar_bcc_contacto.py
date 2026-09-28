"""`scripts/copiar_bcc_contacto.py`: agregar a alguien en copia oculta en
todos los grupos donde ya figura otra persona, sin duplicar y de forma que
la resolución real de destinatarios lo incluya."""
from app import toma_muestras as tm
from scripts.copiar_bcc_contacto import planificar

REF = "jorge.gomez@agrofresh.com"
NUEVA = "cguerrero@agrofresh.com"


def _c(id, email, ship_to, tipo="resultado_interno", tipo_copia="bcc", especie="", activo=True, orden=1):
    return {
        "id": id, "laboratorio": "AGROFRESH", "nombre": email, "email": email, "cargo": "Admin",
        "tipo": tipo, "sold_to": "Cliente", "ship_to": ship_to, "especie": especie,
        "tipo_copia": tipo_copia, "activo": activo, "orden": orden,
    }


def _base():
    return [
        _c(1, "cliente@x.cl", "Planta A", tipo="resultado_cliente", tipo_copia="cc", orden=1),
        _c(2, REF, "Planta A", orden=2),
        _c(3, REF.upper(), "Planta B", especie="Cereza", activo=False, orden=5),
        _c(4, "comercial@agrofresh.com", "Planta C", tipo_copia="cc"),  # sin la referencia
        _c(5, REF, "Planta D"),
        _c(6, NUEVA, "Planta D", tipo_copia="cc"),  # ya estaba ahí
        _c(7, REF, "Planta E", tipo_copia="cc"),  # referencia en cc, no en bcc
    ]


def test_agrega_en_cada_grupo_bcc_de_la_referencia():
    nuevos, saltados = planificar(_base(), REF, NUEVA, "Claudia Guerrero")
    plantas = sorted(c["ship_to"] for c in nuevos)
    assert plantas == ["Planta A", "Planta B"]
    assert len(saltados) == 1 and saltados[0][2] == "Planta D"
    for c in nuevos:
        assert c["email"] == NUEVA and c["nombre"] == "Claudia Guerrero"
        assert c["tipo"] == "resultado_interno" and c["tipo_copia"] == "bcc"
    b = next(c for c in nuevos if c["ship_to"] == "Planta B")
    assert b["especie"] == "Cereza" and b["activo"] is False and b["orden"] == 6
    assert sorted(c["id"] for c in nuevos) == [8, 9]


def test_no_modifica_la_lista_original_y_es_idempotente():
    base = _base()
    copia = [dict(c) for c in base]
    nuevos, _ = planificar(base, REF, NUEVA, "Claudia")
    assert base == copia
    otra_vez, _ = planificar(base + nuevos, REF, NUEVA, "Claudia")
    assert otra_vez == []


def test_la_resolucion_real_la_pone_en_bcc(monkeypatch):
    base = _base()
    nuevos, _ = planificar(base, REF, NUEVA, "Claudia")
    monkeypatch.setattr(tm, "_leer_config", lambda nombre, defecto: base + nuevos)
    destinos = tm.destinatarios_resultado_por_tipo("AGROFRESH", ship_to="Planta A", sold_to="Cliente")
    assert destinos["bcc"] == [REF, NUEVA]
    assert destinos["to"] == ["cliente@x.cl"]
