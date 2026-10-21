"""El script de revisión de informes del correo: lectura pura, y SOLO lectura."""
import importlib.util
import io
import re
from email.message import EmailMessage
from pathlib import Path

RUTA = Path(__file__).resolve().parent.parent / "scripts" / "revisar_informes_correo.py"
spec = importlib.util.spec_from_file_location("revisar_informes_correo", RUTA)
rev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rev)


def _pdf(texto: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = 800
    for linea in texto.splitlines():
        c.drawString(40, y, linea)
        y -= 16
    c.save()
    return buf.getvalue()


def test_detecta_laboratorio_como_el_converter():
    assert rev.detectar_laboratorio("Quiteca Ltda. Informe N° 2026-1885-PC") == "Quiteca"
    assert rev.detectar_laboratorio("Diagnofruit SpA M1 - DIAG0007") == "Diagnofruit"
    assert rev.detectar_laboratorio("INFORME DE ANÁLISIS N° AGF2026-22\nN° SOLICITUD OT-AGF0075") == "AgroFresh"
    assert rev.detectar_laboratorio("Laboratorio Microbiología ALS Food Chile") == "ALS"
    assert rev.detectar_laboratorio("un texto cualquiera") is None


def test_extrae_ot_aunque_als_la_parta():
    assert rev.extraer_ots("N° Solicitud: OT-AGF0075 y OT- ALS0010 / ot-qui0025") == ["OT-AGF0075", "OT-ALS0010", "OT-QUI0025"]
    assert rev.extraer_ots("sin nada") == []


def test_extrae_n_de_informe_por_laboratorio():
    assert rev.extraer_nro_informe("Informe N° 2026-1885-PC\nresto", "Quiteca") == "2026-1885-PC"
    assert rev.extraer_nro_informe("INFORME DE ANÁLISIS N° AGF2026-22", "AgroFresh") == "AGF2026-22"
    assert rev.extraer_nro_informe("muestra 253522-DIAG0007 listo", "Diagnofruit") == "253522-DIAG0007"
    assert rev.extraer_nro_informe("nada", None) is None


def test_clasificar_estados():
    k = dict(informes_cargados={"2026-1885-PC"}, ots_conocidas={"OT-QUI0025"})
    assert rev.clasificar(saliente=True, laboratorio=None, nro_informe=None, ots=[], **k) == "SALIENTE"
    assert rev.clasificar(saliente=False, laboratorio="Quiteca", nro_informe="2026-1885-pc", ots=["OT-QUI0025"], **k) == "YA CARGADO"
    assert rev.clasificar(saliente=False, laboratorio="Quiteca", nro_informe="2026-1999-PC", ots=["OT-QUI0025"], **k) == "NUEVO"
    assert rev.clasificar(saliente=False, laboratorio="Quiteca", nro_informe="2026-1999-PC", ots=["OT-QUI9999"], **k) == "OT DESCONOCIDA"
    assert rev.clasificar(saliente=False, laboratorio=None, nro_informe=None, ots=[], **k) == "SIN DATOS"


def test_revisa_un_correo_con_pdf_de_quiteca():
    m = EmailMessage()
    m["From"] = "Lab Quiteca <resultados@quiteca.cl>"
    m["To"] = "agrofreshreporthub@gmail.com"
    m["Subject"] = "Informe 2026-1999-PC"
    m["Date"] = "Tue, 20 Oct 2026 10:00:00 -0300"
    m.set_content("Adjunto informe")
    m.add_attachment(_pdf("Quiteca\nInforme N° 2026-1999-PC\nN° Solicitud : OT-QUI0025"), maintype="application", subtype="pdf", filename="i.pdf")
    sis = {"informes_cargados": set(), "ots_conocidas": {"OT-QUI0025"}}
    fila = rev.revisar_mensaje(m, {"agrofreshreporthub@gmail.com"}, sis)
    assert fila["laboratorio"] == "Quiteca" and fila["nro_informe"] == "2026-1999-PC"
    assert fila["ots"] == ["OT-QUI0025"] and fila["estado"] == "NUEVO" and fila["pdf_legible"]


def test_correo_sin_adjuntos_se_ignora_y_el_propio_es_saliente():
    m = EmailMessage()
    m["From"] = "agrofreshreporthub@gmail.com"
    m.set_content("hola")
    assert rev.revisar_mensaje(m, {"agrofreshreporthub@gmail.com"}, {"informes_cargados": set(), "ots_conocidas": set()}) is None
    m.add_attachment(b"x", maintype="application", subtype="octet-stream", filename="a.bin")
    fila = rev.revisar_mensaje(m, {"agrofreshreporthub@gmail.com"}, {"informes_cargados": set(), "ots_conocidas": set()})
    assert fila["estado"] == "SALIENTE"


def test_el_script_nunca_escribe_en_el_buzon_ni_en_la_base():
    fuente = RUTA.read_text(encoding="utf-8")
    codigo = re.sub(r'""".*?"""', "", fuente, flags=re.S)
    for prohibido in ("STORE", "EXPUNGE", ".copy(", ".append(\"", "\"COPY\"", "INSERT ", "UPDATE ", "DELETE ", "put_object", "send_message"):
        assert prohibido not in codigo, prohibido
    assert "readonly=True" in codigo and "BODY.PEEK" in codigo
    assert "escribir=False" in codigo
