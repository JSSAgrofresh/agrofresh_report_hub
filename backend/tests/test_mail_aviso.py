"""Plantillas visuales del aviso a clientes (`app/mail_aviso.py`)."""
import os

import pytest

from app import mail_aviso as ma
from app import mail_templates as mt

TEXTO = "Hola **a todos**\nsegunda línea\n\n# Cambios\n- uno\n- dos con **negrita**\n\nChao"


def test_hay_siete_plantillas_y_estandar_es_la_primera_y_la_de_defecto():
    assert list(ma.PLANTILLAS)[0] == "estandar" == ma.PLANTILLA_DEFECTO
    assert len(ma.PLANTILLAS) == 7


@pytest.mark.parametrize("clave", list(ma.PLANTILLAS))
def test_cada_plantilla_tiene_sus_imagenes_en_el_repositorio(clave):
    assert os.path.exists(os.path.join(ma.RUTA_ASSETS, f"mini_{clave}.png"))
    if ma.PLANTILLAS[clave]["banner"]:
        formato = ma.PLANTILLAS[clave].get("formato", "png")
        assert os.path.exists(os.path.join(ma.RUTA_ASSETS, f"banner_{clave}.{formato}"))


@pytest.mark.parametrize("clave", [c for c, p in ma.PLANTILLAS.items() if p["banner"]])
def test_las_plantillas_de_marca_llevan_su_encabezado_por_content_id(clave):
    html, imagenes = ma.html_de_aviso(TEXTO, "Mi título", "Sub", "", clave)
    assert f"cid:{ma.BANNER_CONTENT_ID}" in html
    assert [i.content_id for i in imagenes] == [ma.BANNER_CONTENT_ID]
    firma = {"png": b"\x89PNG", "jpg": b"\xff\xd8\xff"}[ma.PLANTILLAS[clave].get("formato", "png")]
    assert imagenes[0].contenido.startswith(firma)
    assert imagenes[0].subtype == ("jpeg" if ma.PLANTILLAS[clave].get("formato") == "jpg" else "png")
    assert "Mi título" in html and "AgroFresh. All Rights Reserved" in html


def test_estandar_es_el_correo_sobrio_con_el_logo_de_siempre():
    html, imagenes = ma.html_de_aviso(TEXTO, "Mi título", "Sub", "", "estandar")
    assert "MI TÍTULO" in html and ma.BANNER_CONTENT_ID not in html
    assert [i.content_id for i in imagenes] == [mt.LOGO_CONTENT_ID]


def test_una_clave_desconocida_o_vacia_cae_en_estandar():
    assert ma.clave_plantilla("no_existe") == ma.clave_plantilla(None) == ma.clave_plantilla("") == "estandar"
    html, _ = ma.html_de_aviso(TEXTO, "T", "", "", "no_existe")
    assert ma.BANNER_CONTENT_ID not in html


def test_formato_negrita_listas_y_titulos():
    html = ma.cuerpo_html(TEXTO, "#000", "#111")
    assert "<strong>a todos</strong>" in html
    assert html.count("<li") == 2 and "<strong>negrita</strong>" in html
    assert "<h2" in html and "Cambios" in html
    assert "Hola <strong>a todos</strong><br>segunda línea" in html     # un salto simple es <br>
    assert html.count("<p ") == 2                                         # dos párrafos


def test_el_texto_escrito_nunca_se_interpreta_como_html():
    html = ma.cuerpo_html("<script>alert(1)</script> **<b>x</b>**", "#000", "#111")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "<b>" not in html


def test_la_nota_de_prueba_tambien_se_escapa_y_va_arriba():
    html, _ = ma.html_de_aviso("Texto", "T", "", "CORREO <DE> PRUEBA", "azul")
    assert "CORREO &lt;DE&gt; PRUEBA" in html


def test_texto_plano_quita_las_marcas():
    assert ma.texto_plano(TEXTO) == "Hola a todos\nsegunda línea\n\nCambios\n- uno\n- dos con negrita\n\nChao"


def test_el_catalogo_trae_miniaturas_para_el_selector():
    cat = ma.catalogo()
    assert [c["clave"] for c in cat] == list(ma.PLANTILLAS)
    assert all(c["miniatura"].startswith("data:image/png;base64,") and c["nombre"] and c["descripcion"] for c in cat)


def test_sin_la_imagen_del_encabezado_el_correo_sale_igual(monkeypatch):
    monkeypatch.setattr(ma, "_leer", lambda nombre: None)
    html, imagenes = ma.html_de_aviso(TEXTO, "T", "", "", "azul")
    assert imagenes == [] and "cid:" not in html and "Estimados" not in html and "Hola" in html


@pytest.mark.parametrize("clave", [c for c, p in ma.PLANTILLAS.items() if p["banner"]])
def test_outlook_de_escritorio_recibe_una_tabla_de_600_px(clave):
    """Outlook (motor Word) ignora max-width: una tabla fantasma solo para él contiene el correo."""
    html, _ = ma.html_de_aviso(TEXTO, "T", "", "", clave)
    assert html.count("<!--[if mso]>") == 2 and 'width="600" align="center"' in html
    assert html.index("<!--[if mso]><table") < html.index("max-width:600px") < html.index("<!--[if mso]></td></tr></table>")


@pytest.mark.parametrize("clave", [c for c, p in ma.PLANTILLAS.items() if p["banner"]])
def test_la_barra_de_acento_mide_4_px_tambien_en_outlook(clave):
    html, _ = ma.html_de_aviso(TEXTO, "T", "", "", clave)
    assert "line-height:4px;mso-line-height-rule:exactly" in html


def test_un_enlace_largo_no_ensancha_el_correo():
    largo = "https://agrofresh-report-hub.vercel.app/modulos/report/informes/2026-1885-PC"
    html, _ = ma.html_de_aviso(f"Mira {largo}\n\n- {largo}\n\n# {largo}", "T", "", "", "azul")
    assert html.count("overflow-wrap:anywhere") >= 4          # párrafo, elemento de lista, subtítulo y título


def test_los_jpeg_no_son_progresivos_porque_outlook_de_escritorio_no_los_pinta():
    for clave, p in ma.PLANTILLAS.items():
        if p.get("formato") == "jpg":
            datos = open(os.path.join(ma.RUTA_ASSETS, f"banner_{clave}.jpg"), "rb").read()
            assert b"\xff\xc2" not in datos and b"\xff\xc0" in datos


def test_los_encabezados_pesan_poco_para_un_envio_masivo():
    for clave, p in ma.PLANTILLAS.items():
        if p["banner"]:
            ruta = os.path.join(ma.RUTA_ASSETS, f"banner_{clave}.{p.get('formato', 'png')}")
            assert os.path.getsize(ruta) < 120 * 1024, clave


def test_el_pie_de_todas_las_plantillas_se_lee(clave=None):
    def luminancia(h):
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
        f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

    for clave, p in ma.PLANTILLAS.items():
        if p["banner"]:
            a, b = sorted((luminancia(p["pie_fondo"]), luminancia(p["pie_texto"])), reverse=True)
            assert (a + 0.05) / (b + 0.05) >= 4.5, f"contraste bajo en el pie de {clave}"
