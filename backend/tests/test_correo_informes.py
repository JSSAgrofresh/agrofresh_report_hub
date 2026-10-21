"""Ingesta de Datos → Correo (etapa 1), con los correos reales de Quiteca y de Paz (tests/fixtures/correos)."""
import email
import email.policy
from pathlib import Path

import pytest

from app import correo_informes as ci
from app import correo_informes_lectura as L

FIXTURES = Path(__file__).parent / "fixtures" / "correos"
HUB = "agrofreshreporthub@gmail.com"


def _correo(nombre: str):
    return email.message_from_binary_file((FIXTURES / nombre).open("rb"), policy=email.policy.default)


def _examinar(nombre: str, solicitudes: dict, planes: dict, cargados: set | None = None):
    """examinar_mensaje con la base y las listas simuladas: `solicitudes` por OT, `planes` por OT."""
    por_datos = {id(d): ot for ot, (_, d) in solicitudes.items()}
    return ci.examinar_mensaje(
        _correo(nombre),
        buscar_solicitud=lambda ot: solicitudes.get(ot),
        plan_de=lambda datos: planes[por_datos[id(datos)]],
        ya_cargado_de=lambda leido: leido.get("nro_informe") in (cargados or set()),
    )


MORAL = {"laboratorio": "QUITECA", "sold_to": "COMERCIALIZADORA EL MORAL LIMITADA",
         "ship_to": "COMERCIALIZADORA EL MORAL LIMITADA", "especie": "Manzana", "fecha_muestreo": "09-10-2026"}
AGROVIC = {"laboratorio": "QUITECA", "sold_to": "FRUTAS AGROVIC LIMITADA", "ship_to": "FRUTAS AGROVIC LIMITADA",
           "especie": "Cereza", "fecha_muestreo": "2026-10-14"}
SAFRUT = {"laboratorio": "QUITECA", "sold_to": "SOC COMERCIAL SAFRUT LTDA", "ship_to": "SAFRUT LTDA PLANTA LA CALERA",
          "especie": "Mandarina", "fecha_muestreo": "2026-10-08"}

PLAN_MORAL = {"to": ["marcelo@elmoral.cl", "materiales@elmoral.cl", "administracion@elmoral.cl"],
              "cc": ["rtraverso@agrofresh.com"], "bcc": [HUB, "tecnico@agrofresh.com"]}
PLAN_AGROVIC = {"to": ["contacto@agrovic.cl"], "cc": ["juan.labarca@agrofresh.com"], "bcc": [HUB]}
PLAN_SAFRUT = {"to": ["psalazar@safrut.cl"], "cc": ["rodrigo.suarez@agrofresh.com"], "bcc": [HUB]}


# --- Quiteca ---------------------------------------------------------------

def test_quiteca_que_llego_a_su_lista_queda_ok():
    motivo, filas, _ = _examinar("quiteca_1912.eml", {"OT-QUI0051": ("a.xlsx", MORAL)}, {"OT-QUI0051": PLAN_MORAL})
    assert motivo == "informes" and len(filas) == 1
    f = filas[0]
    assert (f["laboratorio"], f["nro_informe"], f["ot"]) == ("Quiteca", "2026-1912-PC", "OT-QUI0051")
    assert f["estado"] == "ok" and f["hallazgos"] == []
    assert f["para"] == PLAN_MORAL["to"] and f["cc"] == ["rtraverso@agrofresh.com"]
    # El Report Hub va en CCO y el correo lo muestra: no cuenta como destinatario de más.
    assert HUB in f["bcc"]


def test_quiteca_1913_a_su_lista_queda_ok():
    _, filas, _ = _examinar("quiteca_1913.eml", {"OT-QUI0052": ("b.xlsx", SAFRUT)}, {"OT-QUI0052": PLAN_SAFRUT})
    assert filas[0]["estado"] == "ok"


def test_el_1914_que_salio_a_otro_cliente_queda_en_rojo():
    """El caso real: el informe de Agrovic (OT-QUI0053) salió a cuatro personas de unifrutti.com."""
    _, filas, _ = _examinar("quiteca_1914.eml", {"OT-QUI0053": ("c.xlsx", AGROVIC)}, {"OT-QUI0053": PLAN_AGROVIC})
    f = filas[0]
    assert f["estado"] == "rojo" and f["ot"] == "OT-QUI0053"
    codigos = {h["codigo"]: h for h in f["hallazgos"]}
    assert codigos["destinatarios_de_mas"]["nivel"] == "rojo"
    assert "patricio.caceres@unifrutti.com" in codigos["destinatarios_de_mas"]["texto"]
    assert codigos["faltan_destinatarios"]["nivel"] == "amarillo"
    assert "contacto@agrovic.cl" in codigos["faltan_destinatarios"]["texto"]


def test_si_falta_alguien_pero_no_sobra_nadie_es_amarillo():
    plan = {**PLAN_MORAL, "to": [*PLAN_MORAL["to"], "otra.persona@elmoral.cl"]}
    _, filas, _ = _examinar("quiteca_1912.eml", {"OT-QUI0051": ("a.xlsx", MORAL)}, {"OT-QUI0051": plan})
    assert filas[0]["estado"] == "amarillo"
    assert [h["codigo"] for h in filas[0]["hallazgos"]] == ["faltan_destinatarios"]


def test_una_copia_interna_que_la_lista_no_trae_es_amarillo_y_no_rojo():
    plan = {**PLAN_MORAL, "cc": ["otro.comercial@agrofresh.com"]}
    _, filas, _ = _examinar("quiteca_1912.eml", {"OT-QUI0051": ("a.xlsx", MORAL)}, {"OT-QUI0051": plan})
    codigos = {h["codigo"] for h in filas[0]["hallazgos"]}
    assert codigos == {"faltan_destinatarios", "copia_interna_de_mas"}
    assert filas[0]["estado"] == "amarillo"


def test_estar_en_copia_en_vez_de_para_no_es_error():
    plan = {"to": [], "cc": [*PLAN_MORAL["to"], "rtraverso@agrofresh.com"], "bcc": []}
    _, filas, _ = _examinar("quiteca_1912.eml", {"OT-QUI0051": ("a.xlsx", MORAL)}, {"OT-QUI0051": plan})
    assert filas[0]["estado"] == "ok"


def test_solicitud_sin_lista_del_cliente_es_amarillo_y_no_acusa_destinatarios_de_mas():
    plan = {"to": [], "cc": [], "bcc": [HUB]}
    _, filas, _ = _examinar("quiteca_1914.eml", {"OT-QUI0053": ("c.xlsx", AGROVIC)}, {"OT-QUI0053": plan})
    assert filas[0]["estado"] == "amarillo"
    assert [h["codigo"] for h in filas[0]["hallazgos"]] == ["sin_lista"]


def test_ot_que_no_existe_es_rojo():
    _, filas, _ = _examinar("quiteca_1912.eml", {}, {})
    assert filas[0]["estado"] == "rojo" and filas[0]["hallazgos"][0]["codigo"] == "ot_desconocida"


def test_planta_distinta_a_la_de_la_solicitud_es_rojo():
    otra = {**MORAL, "ship_to": "FRIGORIFICO LEJANO", "sold_to": "OTRO CLIENTE SA"}
    _, filas, _ = _examinar("quiteca_1912.eml", {"OT-QUI0051": ("a.xlsx", otra)}, {"OT-QUI0051": PLAN_MORAL})
    codigos = {h["codigo"]: h["nivel"] for h in filas[0]["hallazgos"]}
    assert codigos["ship_to_distinto"] == "rojo" and codigos["sold_to_distinto"] == "amarillo"
    assert filas[0]["estado"] == "rojo"


def test_especie_o_fecha_distintas_son_amarillo():
    otra = {**MORAL, "especie": "Pera", "fecha_muestreo": "01-10-2026"}
    _, filas, _ = _examinar("quiteca_1912.eml", {"OT-QUI0051": ("a.xlsx", otra)}, {"OT-QUI0051": PLAN_MORAL})
    assert {h["codigo"] for h in filas[0]["hallazgos"]} == {"especie_distinta", "fecha_muestreo_distinta"}
    assert filas[0]["estado"] == "amarillo"


def test_una_ot_de_otro_laboratorio_es_rojo():
    otra = {**MORAL, "laboratorio": "ALS"}
    _, filas, _ = _examinar("quiteca_1912.eml", {"OT-QUI0051": ("a.xlsx", otra)}, {"OT-QUI0051": PLAN_MORAL})
    assert "laboratorio_distinto" in {h["codigo"] for h in filas[0]["hallazgos"]}


def test_informe_ya_cargado_se_marca_sin_cambiar_su_revision():
    _, filas, _ = _examinar("quiteca_1912.eml", {"OT-QUI0051": ("a.xlsx", MORAL)}, {"OT-QUI0051": PLAN_MORAL},
                            cargados={"2026-1912-PC"})
    assert filas[0]["ya_cargado"] is True and filas[0]["estado"] == "ok"


# --- AgroFresh (Paz) -------------------------------------------------------

DOLE = {"laboratorio": "AGROFRESH", "sold_to": "DOLE CHILE S.A.", "ship_to": "DOLE PLANTA CODEGUA",
        "especie": "Limón", "fecha_muestreo": "06-10-2026"}


def test_informe_de_agrofresh_enviado_por_paz_se_lee_y_se_revisa():
    plan = {"to": ["paula.sibona@dole.com", "maria.marquez@dole.com", "andres.suarez@dole.com", "victor.jerez@dole.com"],
            "cc": ["juan.labarca@agrofresh.com"], "bcc": []}
    _, filas, _ = _examinar("agrofresh_47.eml", {"OT-AGF0102": ("d.xlsx", DOLE)}, {"OT-AGF0102": plan})
    f = filas[0]
    assert (f["laboratorio"], f["nro_informe"], f["ot"], f["especie"]) == ("AgroFresh", "AGF2026-47", "OT-AGF0102", "Limón")
    assert f["fecha_muestreo"] == "2026-10-06"
    assert f["estado"] == "ok", f["hallazgos"]


def test_el_nombre_de_la_planta_se_busca_en_el_informe_de_agrofresh():
    """El PDF propio separa el Sold To / Ship To de sus etiquetas: se comprueban por su nombre escrito."""
    otra = {**DOLE, "ship_to": "PLANTA QUE NO SALE"}
    plan = {"to": ["paula.sibona@dole.com", "maria.marquez@dole.com", "andres.suarez@dole.com", "victor.jerez@dole.com"],
            "cc": ["juan.labarca@agrofresh.com"], "bcc": []}
    _, filas, _ = _examinar("agrofresh_47.eml", {"OT-AGF0102": ("d.xlsx", otra)}, {"OT-AGF0102": plan})
    assert "ship_to_distinto" in {h["codigo"] for h in filas[0]["hallazgos"]}


def test_un_correo_de_paz_con_tres_informes_da_tres_filas_y_no_toma_el_banner():
    sol = {f"OT-AGF00{n}": (f"{n}.xlsx", {**DOLE, "ship_to": "GESEX PLANTA FATIMA", "sold_to": "MULTIFRUTA SA",
                                         "especie": "Naranja", "fecha_muestreo": "2026-10-01"}) for n in (72, 76, 77)}
    planes = {ot: {"to": [], "cc": [], "bcc": []} for ot in sol}
    motivo, filas, elegidos = _examinar("agrofresh_varios.eml", sol, planes)
    assert motivo == "informes" and len(filas) == 3 and len(elegidos) == 3
    assert {f["nro_informe"] for f in filas} == {"AGF2026-2", "AGF2026-6", "AGF2026-7"}
    assert all(n.endswith(".pdf") for n, _ in elegidos)


# --- Lo que no es un informe nuevo -----------------------------------------

def test_una_respuesta_reenviada_no_se_toma_como_informe():
    motivo, filas, _ = _examinar("respuesta_quiteca_1914.eml", {}, {})
    assert motivo == "respuesta_o_reenvio" and filas == []


def test_un_correo_nuestro_no_se_examina(monkeypatch):
    m = _correo("quiteca_1912.eml")
    del m["From"]
    m["From"] = f"Report Hub <{HUB}>"
    assert ci.examinar_mensaje(m, buscar_solicitud=lambda ot: None)[0] == "saliente_del_hub"


def test_als_se_toma_solo_el_pdf_en_espanol():
    pdfs = [("CENTRAL FRUTICOLA-RENAICO-INF-496561.pdf", b"%PDF-a"), ("CENTRAL FRUTICOLA-RENAICO-ENG-496561.pdf", b"%PDF-b")]
    elegidos = ci.elegir_pdfs(pdfs, ["ALS", "ALS"])
    assert [n for n, _ in elegidos] == ["CENTRAL FRUTICOLA-RENAICO-INF-496561.pdf"]
    # Otros laboratorios: se toman todos.
    assert len(ci.elegir_pdfs(pdfs, ["Quiteca", "Quiteca"])) == 2


# --- Lectura -----------------------------------------------------------------

def test_deteccion_de_laboratorio_igual_a_la_del_converter():
    assert L.detectar_laboratorio("Laboratorio Químico Quiteca Ltda.") == "Quiteca"
    assert L.detectar_laboratorio("Diagnofruit SpA") == "Diagnofruit"
    assert L.detectar_laboratorio("Laboratorio Microbiología ALS Food Chile") == "ALS"
    assert L.detectar_laboratorio("un texto cualquiera") is None


def test_ot_partida_de_als_se_une():
    assert L.extraer_ots("OT- ALS0010 y OT-QUI0025 y ot-agf0075") == ["OT-ALS0010", "OT-QUI0025", "OT-AGF0075"]


def test_estado_toma_el_peor_hallazgo():
    assert L.estado_de([]) == "ok"
    assert L.estado_de([{"nivel": "info"}]) == "ok"
    assert L.estado_de([{"nivel": "info"}, {"nivel": "amarillo"}]) == "amarillo"
    assert L.estado_de([{"nivel": "amarillo"}, {"nivel": "rojo"}]) == "rojo"


# --- API: solo el administrador principal ------------------------------------

def test_los_endpoints_son_solo_del_administrador_principal():
    from fastapi.testclient import TestClient

    from app.auth import Usuario, usuario_actual
    from app.main import app

    def como(email_: str, tipo: str = "admin_general"):
        app.dependency_overrides[usuario_actual] = lambda: Usuario(
            id="1", email=email_, nombre="X", tipoAcceso=tipo)

    try:
        client = TestClient(app)
        como("otra.persona@agrofresh.com")
        assert client.get("/api/correo-informes").status_code == 403
        assert client.post("/api/correo-informes/sondear", json={"dias": 7}).status_code == 403
        assert client.get("/api/correo-informes/1/pdf").status_code == 403
        como("jorge.sandoval@agrofresh.com", "gerencia")
        assert client.get("/api/correo-informes").status_code == 403
    finally:
        app.dependency_overrides.clear()


# --- La revisión corre en segundo plano (el túnel corta las peticiones a los ~100 s) ----------

class _ImapFalso:
    def __init__(self):
        self.pedidos = []

    def uid(self, *args):
        self.pedidos.append(args)
        if args[0] == "SEARCH":
            return "OK", [b"3 4 5"]
        cabecera = (b'1 (UID 3 INTERNALDATE "20-Oct-2026 17:21:18 -0300" RFC822.SIZE 188637 BODY[HEADER.FIELDS (MESSAGE-ID)] {40}',
                    b"Message-ID: <abc@mail.gmail.com>\r\n\r\n")
        return "OK", [cabecera, b")"]


def test_solo_se_buscan_los_correos_con_pdf_para_no_bajar_los_adjuntos_de_accutab():
    imap = _ImapFalso()
    assert ci._buscar_uids(imap, 14) == [b"3", b"4", b"5"]
    consulta = imap.pedidos[0][2]
    assert "filename:pdf" in consulta and "has:attachment" in consulta


def test_la_cabecera_trae_el_id_la_llegada_y_el_tamano_sin_bajar_el_correo():
    mid, llegada, tamano = ci._cabecera(_ImapFalso(), b"3")
    assert mid == "<abc@mail.gmail.com>" and tamano == 188637
    assert llegada is not None and llegada.year == 2026


def test_revisar_ahora_vuelve_de_inmediato_y_deja_el_trabajo_en_segundo_plano(monkeypatch):
    lanzados = []
    monkeypatch.setattr(ci, "iniciar_sondeo", lambda dias, por="": (7, False))
    monkeypatch.setattr(ci, "_hilo", lambda sondeo_id, dias: lanzados.append((sondeo_id, dias)))
    monkeypatch.setattr(ci.config, "GMAIL_ACCOUNT", "agrofreshreporthub@gmail.com")
    monkeypatch.setattr(ci.config, "GMAIL_APP_PASSWORD", "clave")
    r = ci.sondear_en_segundo_plano(14, "jorge.sandoval@agrofresh.com")
    assert r == {"id": 7, "en_curso": True, "ya_estaba_en_curso": False}
    import time as _t
    for _ in range(50):          # el hilo es de fondo: se espera a que arranque
        if lanzados:
            break
        _t.sleep(0.02)
    assert lanzados == [(7, 14)]


def test_si_ya_hay_una_revision_en_curso_no_se_abre_otra(monkeypatch):
    lanzados = []
    monkeypatch.setattr(ci, "iniciar_sondeo", lambda dias, por="": (7, True))
    monkeypatch.setattr(ci, "_hilo", lambda *a: lanzados.append(a))
    monkeypatch.setattr(ci.config, "GMAIL_ACCOUNT", "agrofreshreporthub@gmail.com")
    monkeypatch.setattr(ci.config, "GMAIL_APP_PASSWORD", "clave")
    assert ci.sondear_en_segundo_plano(14)["ya_estaba_en_curso"] is True
    import time as _t
    _t.sleep(0.1)
    assert lanzados == []


def test_sin_clave_del_buzon_avisa_antes_de_arrancar(monkeypatch):
    monkeypatch.setattr(ci.config, "GMAIL_APP_PASSWORD", "")
    with pytest.raises(RuntimeError, match="GMAIL_APP_PASSWORD"):
        ci.sondear_en_segundo_plano(14)
