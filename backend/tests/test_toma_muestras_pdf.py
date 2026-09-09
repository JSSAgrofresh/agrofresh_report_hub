"""
El subtítulo de "3. ANÁLISIS REQUERIDOS" en el PDF de la solicitud: debe
mostrar el nombre del Análisis (ej. "FSMA (E. Coli + Coliformes Totales)")
en vez del texto genérico "Checklist técnico para el laboratorio", igual
que ya agrupa el checklist de la solicitud (NuevaSolicitudView.tsx).

No necesita Postgres: son funciones puras sobre los mismos dicts de config
que ya sirve /toma-muestras/config/analitos y /laboratorios/analisis.
"""
from __future__ import annotations

from app.toma_muestras_pdf import _analisis_por_analito_id, _subtitulo_analisis_requeridos

FSMA = {
    "id": 1,
    "laboratorio": "DIAGNOFRUIT",
    "nombre": "FSMA (E. Coli + Coliformes Totales)",
    "observaciones": "",
    "modo": "seleccionable",
    "analitos": [
        {"analito_id": 10, "unidad": "UFC/100mL", "preseleccionado": False},
        {"analito_id": 11, "unidad": "UFC/100mL", "preseleccionado": False},
    ],
    "activo": True,
    "orden": 1,
}

PANEL_PATOGENOS = {
    "id": 2,
    "laboratorio": "DIAGNOFRUIT",
    "nombre": "Cuantificación de patógenos (qPCR)",
    "observaciones": "",
    "modo": "completo",
    "analitos": [{"analito_id": 12, "unidad": "UFC/mL", "preseleccionado": True}],
    "activo": True,
    "orden": 2,
}

ECOLI = {"id": 10, "codigo": "ECOLI100", "nombre": "E. Coli"}
COLIFORMES = {"id": 11, "codigo": "COLIF100", "nombre": "Coliformes Totales"}
LEVADURAS = {"id": 12, "codigo": "LEV", "nombre": "Levaduras"}
SUELTO = {"id": 99, "codigo": "SUE", "nombre": "Analito sin agrupar"}


def test_mapea_cada_analito_al_analisis_del_laboratorio_que_lo_incluye():
    mapa = _analisis_por_analito_id([FSMA, PANEL_PATOGENOS], "DIAGNOFRUIT")
    assert mapa[10]["nombre"] == "FSMA (E. Coli + Coliformes Totales)"
    assert mapa[11]["nombre"] == "FSMA (E. Coli + Coliformes Totales)"
    assert mapa[12]["nombre"] == "Cuantificación de patógenos (qPCR)"
    assert 99 not in mapa


def test_ignora_analisis_inactivos_o_de_otro_laboratorio():
    inactivo = {**FSMA, "activo": False}
    otro_lab = {**PANEL_PATOGENOS, "laboratorio": "ALS"}
    mapa = _analisis_por_analito_id([inactivo, otro_lab], "DIAGNOFRUIT")
    assert mapa == {}


def test_subtitulo_usa_el_nombre_del_analisis_cuando_todos_los_analitos_son_del_mismo():
    mapa = _analisis_por_analito_id([FSMA], "DIAGNOFRUIT")
    subtitulo = _subtitulo_analisis_requeridos([ECOLI, COLIFORMES], mapa)
    assert subtitulo == "FSMA (E. Coli + Coliformes Totales)"


def test_subtitulo_junta_los_nombres_si_se_pidieron_varios_analisis_distintos():
    mapa = _analisis_por_analito_id([FSMA, PANEL_PATOGENOS], "DIAGNOFRUIT")
    subtitulo = _subtitulo_analisis_requeridos([ECOLI, LEVADURAS], mapa)
    assert subtitulo == "FSMA (E. Coli + Coliformes Totales) · Cuantificación de patógenos (qPCR)"


def test_subtitulo_cae_al_texto_generico_si_ningun_analito_pertenece_a_un_analisis():
    subtitulo = _subtitulo_analisis_requeridos([SUELTO], {})
    assert subtitulo == "Checklist técnico para el laboratorio"
