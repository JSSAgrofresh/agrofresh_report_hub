"""Panel de Ingreso de informes: demora en días hábiles, tendencia y estado de cada solicitud."""
from datetime import datetime, timedelta, timezone

import pytest

from app import correo_informes_panel as P

UTC = timezone.utc


def _t(dia: int, hora: int = 12, mes: int = 10) -> datetime:
    # Octubre de 2026: el 1 es jueves; 5 = lunes, 9 = viernes, 12 = lunes.
    return datetime(2026, mes, dia, hora, 0, tzinfo=UTC)


def test_dias_habiles_no_cuenta_fines_de_semana():
    assert P.dias_habiles(_t(5), _t(6)) == 1.0                       # lunes → martes
    assert P.dias_habiles(_t(9), _t(12)) < 1.01                      # viernes 12:00 → lunes 12:00: solo el viernes tarde y el lunes
    assert P.dias_habiles(_t(10), _t(11)) == 0.0                     # sábado → domingo
    assert P.dias_habiles(_t(6), _t(5)) == 0.0                       # al revés no hay demora negativa
    assert P.dias_habiles(_t(5), _t(5, 18)) == pytest.approx(0.25, abs=0.05)


def test_regresion_y_tendencia_semanal():
    assert P.regresion([(0, 1), (1, 2), (2, 3)]) == pytest.approx((1.0, 1.0))
    assert P.regresion([(0, 1)]) is None
    demoras = [(_t(6), "Quiteca", 2.0), (_t(7), "Quiteca", 4.0), (_t(14), "Quiteca", 6.0), (_t(14), "ALS", 8.0)]
    t = P.tendencia_de_demora(demoras)
    assert [p["semana"] for p in t["puntos"]] == ["2026-10-05", "2026-10-12"]
    assert t["puntos"][0]["mediana"] == 3.0 and t["puntos"][0]["n"] == 2
    assert t["puntos"][1]["mediana"] == 7.0
    assert t["puntos"][1]["por_laboratorio"] == {"Quiteca": 6.0, "ALS": 8.0}
    assert t["pendiente_por_semana"] == 4.0 and len(t["recta"]) == 2
    assert P.tendencia_de_demora([])["pendiente_por_semana"] is None


AHORA = _t(21)


def _sol(ot, lab="Quiteca", enviada=None):
    return {"ot": ot, "laboratorio": lab, "sold_to": "S", "ship_to": "P", "especie": "Cereza", "enviada_en": enviada or _t(5)}


def _mail(i, ot, nro, llegada, decision="pendiente", estado="ok", lab="Quiteca", resuelto=None):
    return {"id": i, "ot": ot, "nro_informe": nro, "laboratorio": lab, "llegada_en": llegada, "decision": decision,
            "estado": estado, "resuelto_en": resuelto}


def test_estado_de_cada_solicitud():
    correo = {"OT-A": [_mail(1, "OT-A", "1", _t(8))], "OT-B": [_mail(2, "OT-B", "2", _t(8), "rechazado")]}
    assert P.estado_de_solicitud("OT-X", {"OT-X"}, correo) == "cargado"
    assert P.estado_de_solicitud("OT-A", set(), correo) == "recibido"
    assert P.estado_de_solicitud("OT-B", set(), correo) == "rechazado"
    assert P.estado_de_solicitud("OT-C", set(), correo) == "esperando"


def test_el_panel_cuenta_lo_que_falta_lo_aceptado_lo_rechazado_y_el_seguimiento():
    solicitudes = [_sol("OT-1"), _sol("OT-2"), _sol("OT-3"), _sol("OT-4"), _sol("OT-5", enviada=_t(15))]
    correo = [
        _mail(1, "OT-1", "I-1", _t(7)),                                      # pendiente de aceptar
        _mail(2, "OT-2", "I-2", _t(8), "aceptado"),
        _mail(3, "OT-3", "I-3", _t(9), "rechazado", "rojo"),                 # rechazado y en seguimiento
        _mail(4, "OT-3", "I-3", _t(13), "pendiente", "rojo"),                # su reenvío (misma copia lógica)
        _mail(5, "OT-4", "I-5", _t(1, mes=8)),                               # fuera del período
    ]
    r = P.armar_panel(solicitudes, correo, set(), AHORA, dias=60)
    k = r["kpis"]
    # Un reenvío no cuenta dos veces: I-3 se cuenta una vez (su última copia, pendiente).
    assert (k["recibidos"], k["pendientes"], k["aceptados"], k["rechazados"]) == (3, 2, 1, 0)
    # Las dos copias del I-3 en rojo son UN incidente (no dos alertas): sigue abierto porque su última copia sigue mal.
    assert (k["incidentes"], k["incidentes_abiertos"], k["incidentes_cerrados"]) == (1, 1, 0)
    assert k["incidentes_por_informar"] == 1
    assert k["esperando"] == 1                                                # OT-5
    por_ot = {s["ot"]: s for s in r["solicitudes"]}
    assert por_ot["OT-5"]["estado"] == "esperando" and por_ot["OT-5"]["dias_esperando"] > 0
    assert por_ot["OT-1"]["estado"] == "recibido" and por_ot["OT-1"]["demora"] == 2.0
    assert r["solicitudes"][0]["ot"] == "OT-5"                                # lo que falta va primero
    assert k["demora_mediana"] is not None and r["tendencia"]["puntos"]


def test_una_solicitud_cargada_no_cuenta_como_que_falta():
    r = P.armar_panel([_sol("OT-1")], [], {"OT-1"}, AHORA, 60)
    assert r["kpis"]["esperando"] == 0 and r["solicitudes"][0]["estado"] == "cargado"


def test_el_incidente_se_cierra_al_resolverlo_a_mano():
    correo = [_mail(1, "OT-1", "I-1", _t(7), "pendiente", "rojo", resuelto=_t(9))]
    k = P.armar_panel([_sol("OT-1")], correo, set(), AHORA, 60)["kpis"]
    assert (k["incidentes"], k["incidentes_abiertos"], k["incidentes_cerrados"]) == (1, 0, 1)


def test_un_informe_mal_enviado_y_corregido_por_un_reenvio_es_un_incidente_cerrado():
    """El caso del 1912: salió a otra planta el 16 y Quiteca lo reenvió bien el 20."""
    correo = [_mail(1, "OT-1", "2026-1912-PC", _t(8), estado="rojo"), _mail(2, "OT-1", "2026-1912-PC", _t(12), estado="ok")]
    k = P.armar_panel([_sol("OT-1")], correo, set(), AHORA, 60)["kpis"]
    assert (k["incidentes"], k["incidentes_abiertos"], k["incidentes_cerrados"]) == (1, 0, 1)


def test_dos_informes_mal_enviados_son_dos_incidentes_aunque_haya_tres_correos_en_rojo():
    """1912 (corregido) y 1914 (mandado dos veces mal): tres correos en rojo, dos incidentes, uno abierto."""
    correo = [
        _mail(1, "OT-A", "2026-1912-PC", _t(8), estado="rojo"), _mail(2, "OT-A", "2026-1912-PC", _t(12), estado="ok"),
        _mail(3, "OT-B", "2026-1914-PC", _t(8), estado="rojo"), _mail(4, "OT-B", "2026-1914-PC", _t(13), estado="rojo"),
    ]
    k = P.armar_panel([_sol("OT-A"), _sol("OT-B")], correo, set(), AHORA, 60)["kpis"]
    assert (k["incidentes"], k["incidentes_abiertos"], k["incidentes_cerrados"]) == (2, 1, 1)


def test_un_incidente_ya_informado_al_laboratorio_deja_de_estar_por_informar_aunque_lo_sigan_mandando_mal():
    """Se le avisó a Quiteca por la primera copia; la segunda copia mala no vuelve a pedir aviso."""
    correo = [
        {**_mail(1, "OT-B", "2026-1914-PC", _t(8), estado="rojo"), "informado_en": _t(9)},
        _mail(2, "OT-B", "2026-1914-PC", _t(13), estado="rojo"),
    ]
    k = P.armar_panel([_sol("OT-B")], correo, set(), AHORA, 60)["kpis"]
    assert (k["incidentes"], k["incidentes_abiertos"], k["incidentes_por_informar"]) == (1, 1, 0)


def test_un_incidente_abierto_cuenta_aunque_sea_anterior_al_periodo():
    correo = [_mail(1, "OT-1", "I-1", _t(1, mes=7), estado="rojo")]
    k = P.armar_panel([_sol("OT-1")], correo, set(), AHORA, 30)["kpis"]
    assert k["incidentes_abiertos"] == 1


def test_los_endpoints_nuevos_son_solo_del_administrador_principal():
    from fastapi.testclient import TestClient

    from app.auth import Usuario, usuario_actual
    from app.main import app

    app.dependency_overrides[usuario_actual] = lambda: Usuario(id="1", email="otra@agrofresh.com", nombre="X", tipoAcceso="admin_general")
    try:
        c = TestClient(app)
        assert c.get("/api/correo-informes/panel").status_code == 403
        assert c.post("/api/correo-informes/5/rechazar", json={"nota": "x"}).status_code == 403
        assert c.post("/api/correo-informes/5/resolver", json={}).status_code == 403
        assert c.post("/api/correo-informes/5/informado", json={"nota": "x"}).status_code == 403
        assert c.post("/api/correo-informes/5/volver-a-pendiente").status_code == 403
    finally:
        app.dependency_overrides.clear()
