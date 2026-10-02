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


# --- ALS y Diagnofruit: solo el análisis, sin tabla de analitos/dosis ---------

def _textos(flowables) -> list[str]:
    """Todo el texto de los flowables (recorre las tablas anidadas)."""
    salida: list[str] = []
    for f in flowables:
        if hasattr(f, "getPlainText"):
            salida.append(f.getPlainText())
        celdas = getattr(f, "_cellvalues", None)
        if celdas:
            for fila in celdas:
                for celda in fila:
                    salida.extend(_textos(celda if isinstance(celda, list) else [celda]))
    return salida


def _elementos(laboratorio: str, **extra):
    from app.toma_muestras_pdf import _construir_elementos

    analitos = [{"id": 10, "codigo": "ECOLI100", "nombre": "E. Coli", "unidad": "UFC/100mL",
                 "laboratorio": laboratorio, "categoria": "Microbiología", "orden": 1}]
    datos = {
        "laboratorio": laboratorio, "numero_solicitud": "OT-1", "sold_to": "X", "ship_to": "Y",
        "campos_laboratorio": {"E. Coli (UFC/100mL)": "250cc/100L"}, "analitos_solicitados": ["ECOLI100"],
        **extra,
    }
    analisis = [{**FSMA, "laboratorio": laboratorio}]
    return _textos(_construir_elementos(datos, analitos, analisis_config=analisis))


def test_als_y_diagnofruit_solo_muestran_el_analisis():
    for lab in ("ALS", "DIAGNOFRUIT", "Diagnofruit"):
        textos = _elementos(lab, pdf_solo_analisis=True)
        assert "ANÁLISIS REQUERIDOS" in textos
        assert "FSMA (E. Coli + Coliformes Totales)" in textos
        assert "ANALITO SOLICITADO" not in textos and "DOSIS" not in textos
        assert "250cc/100L" not in textos


def test_otros_laboratorios_siguen_con_su_tabla_de_analitos_y_dosis():
    textos = _elementos("AGROFRESH")
    assert "ANALITO SOLICITADO" in textos and "DOSIS" in textos
    assert "250cc/100L" in textos


def test_las_solicitudes_anteriores_conservan_su_tabla():
    """Sin la marca `pdf_solo_analisis` (solicitudes emitidas antes del cambio) el
    PDF sigue igual: ALS y Diagnofruit con su tabla de analitos y dosis."""
    for lab in ("ALS", "DIAGNOFRUIT"):
        textos = _elementos(lab)
        assert "ANALITO SOLICITADO" in textos and "DOSIS" in textos
        assert "250cc/100L" in textos


def test_el_marcador_no_viaja_en_el_json_del_laboratorio():
    import json
    from app import toma_muestras as tm

    salida = json.loads(tm._generar_json_solicitud({"laboratorio": "ALS", "pdf_solo_analisis": True}))
    assert "pdf_solo_analisis" not in salida
