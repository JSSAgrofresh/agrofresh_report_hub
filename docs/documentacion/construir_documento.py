"""Arma «Documentación del sistema AgroFresh Report Hub» en Word.

Uso (desde docs/documentacion):  python construir_documento.py

Hace tres pasadas: la primera junta títulos y leyendas, la segunda calcula en qué página de un PDF
(LibreOffice) cae cada uno y la tercera escribe el índice con esos números. Si en Word se actualiza el
campo (clic derecho > Actualizar campo) el índice se recalcula con la paginación de Word.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

import contenido_a as A
import contenido_b as B
import contenido_c as C
import contenido_d as D
import lib_docx as L

AQUI = Path(__file__).parent
RAIZ = AQUI.parent.parent
SALIDA = AQUI / "Documentacion_AgroFresh_Report_Hub.docx"
TMP = AQUI / "_tmp"
ENCABEZADO = "Documentación del sistema · AgroFresh Report Hub"
VERSION = "Versión 0.3 · borrador · 30 de octubre de 2026"

SEMANAS = [
    ("1-2", "11 al 24 ago", 5, "Estructura React, Vite y TypeScript"),
    ("3", "25 al 31 ago", 57, "Correo con Resend, Cloudflare R2 y optimización de la Ingesta"),
    ("4", "1 al 7 sep", 51, "Cruce con escáner e informe final de cromatografía"),
    ("5", "8 al 14 sep", 64, "Solicitudes en móvil, Listados y homogenizador inteligente"),
    ("6", "15 al 21 sep", 50, "JSON adjunto, correos de Actimist y analitos requeridos"),
    ("7", "22 al 28 sep", 36, "Gmail SMTP, áreas, solicitudes de reanálisis y módulo de Ingesta"),
    ("8", "29 sep al 5 oct", 83, "BD en Excel, Converter con memoria de correcciones y Auditoría interna"),
    ("9", "6 al 12 oct", 60, "Post Venta (Accu-Tab), informe PDF automático y portal de informes"),
    ("10", "13 al 19 oct", 95, "Plan de entregables, lead time, envío al cliente y verificaciones"),
    ("11", "20 al 26 oct", 89, "Portal de clientes, cuentas comerciales e informes por correo"),
    ("12", "27 al 30 oct", 41, "Vista de cliente, simulación de datos y Storage de informes"),
]

SCRIPTS = [
    ("scripts/migrar.py", "Corre una migración SQL por archivo, en orden."),
    ("scripts/clave.py", "Asigna contraseña a una cuenta."),
    ("scripts/reconciliar_indice.py", "Saca del índice las solicitudes borradas por fuera de la app."),
    ("scripts/sembrar_catalogo_analitos.py", "Crea los analitos faltantes y enlaza resultados sueltos."),
    ("scripts/actualizar_codigos_sap.py", "Actualiza los códigos SAP de clientes y plantas desde el Excel maestro."),
    ("scripts/cargar_listado_actimist.py", "Carga el listado de Actimist desde la dinámica del Planner."),
    ("scripts/reintentar_pendientes_ingesta.py", "Reprocesa las filas pendientes de la ingesta."),
    ("scripts/crear_clientes.py", "Crea una cuenta por cada correo de «Resultado a clientes» de las listas."),
    ("scripts/crear_comerciales.py", "Crea una cuenta de comercial por cada correo con ese rol en las listas."),
    ("scripts/corregir_correos_lista.py", "Corrige correos mal escritos de la lista de distribución."),
    ("scripts/probar_traspaso_clientes.py", "Solo lectura: compara lo que ve cada cliente con lo que le corresponde."),
    ("scripts/recibir_informes_correo.py", "Revisa el buzón de informes y los deja en la bandeja."),
    ("scripts/revisar_informes_correo.py", "Solo lectura: qué hay en el sistema y qué llegó al correo."),
    ("scripts/diagnostico_informes_report.py", "Solo lectura: revisa todos los informes de Report."),
    ("scripts/generar_informes_accutab.py", "Genera el PDF de las cargas de Post Venta que no lo tenían."),
    ("scripts/clasificar_servicio_solicitudes.py", "Deduce el tipo de servicio de lo cargado antes de la migración 0055."),
    ("deploy/windows/respaldar.ps1", "Respaldo manual de la base."),
    ("deploy/windows/estado.ps1", "Estado general del servidor."),
]


# --------------------------------------------------------------------------------------
def reunir_datos() -> dict:
    migs = sorted((RAIZ / "backend" / "migrations").glob("*.sql"))
    lista = []
    for m in migs:
        mm = re.match(r"(\d+)_(.*)\.sql", m.name)
        lista.append((mm.group(1) if mm else "—", m.name))
    app = [p for p in (RAIZ / "backend" / "app").glob("*.py") if p.name != "__init__.py"]
    feats = [p for p in (RAIZ / "src" / "features").iterdir() if p.is_dir()]
    tests_back = len(list((RAIZ / "backend" / "tests").rglob("test_*.py")))
    tests_front = len(list((RAIZ / "src").rglob("*.test.ts"))) + len(list((RAIZ / "src").rglob("*.test.tsx")))
    return {
        "prs": 631,
        "migraciones": len([m for m in migs if re.match(r"\d{4}_", m.name)]),
        "migraciones_lista": lista,
        "tablas": 61,
        "routers": len(app),
        "features": len(feats),
        "tests_back": tests_back,
        "tests_front": tests_front,
        "semanas": [(s, f, str(n), foco) for s, f, n, foco in SEMANAS],
        "scripts": SCRIPTS,
        "logo": AQUI / "recursos" / "logo_agrofresh.png",
        "encabezado": ENCABEZADO,
    }


# --------------------------------------------------------------------------------------
def _indice(doc, entradas, ancho_cm, instruccion, indentar=True):
    """Escribe un índice como campo TOC con su resultado ya calculado."""
    if not entradas:
        entradas = [(1, "(se genera al actualizar el campo)", "")]
    for i, (nivel, texto, pagina) in enumerate(entradas):
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.space_after = Pt(1 if nivel > 1 else 2)
        pf.space_before = Pt(4 if nivel == 1 and indentar else 0)
        pf.line_spacing = 1.0
        pf.left_indent = Cm((nivel - 1) * 0.7) if indentar else Cm(0)
        pf.tab_stops.add_tab_stop(Cm(ancho_cm), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        if i == 0:
            r = p.add_run()
            L._fld_char(r, "begin")
            r = p.add_run()
            it = OxmlElement("w:instrText")
            it.set(qn("xml:space"), "preserve")
            it.text = f" {instruccion} "
            r._r.append(it)
            r = p.add_run()
            L._fld_char(r, "separate")
        run = p.add_run(texto + "\t" + str(pagina))
        run.font.size = Pt(10 if nivel == 1 else 9)
        run.bold = nivel == 1 and indentar
        if i == len(entradas) - 1:
            r = p.add_run()
            L._fld_char(r, "end")


def _titulo_sin_numero(doc, texto, salto=True):
    if salto:
        doc.add_page_break()
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(14)
    r = p.add_run(texto)
    r.bold, r.font.size, r.font.color.rgb, r.font.name = True, Pt(22), L.VERDE_OSCURO, L.FUENTE
    L._borde_inferior(p, L.HEX_AMARILLO_CLARO.replace("FDF3CF", "F0C419"), "12")
    return p


def construir(ruta: Path, cache: dict | None) -> dict:
    """Arma el documento. `cache` trae las listas y páginas de los índices (None en la primera pasada)."""
    L.Contadores.figuras, L.Contadores.tablas = [], []
    datos = reunir_datos()
    doc = L.nuevo_documento()
    L.portada(
        doc,
        AQUI / "recursos" / "portada_marca.png",
        "AgroFresh Report Hub",
        "Plataforma de gestión del ciclo de análisis de laboratorio: solicitudes, informes, resultados y portal de clientes",
        VERSION,
        ["Documentación técnica y funcional · metodología Scrum++ (Scrum + modelo de vistas 4+1)",
         "Repositorio: JSSAgrofresh/agrofresh_report_hub"],
    )
    # ---- Control del documento
    L.nueva_seccion(doc, False, datos["logo"], ENCABEZADO)
    _titulo_sin_numero(doc, "Control del documento", salto=False)
    L.tabla(doc, ["Campo", "Detalle"], [
        ("Documento", "Documentación del sistema AgroFresh Report Hub"),
        ("Versión", "0.3 (borrador en construcción)"),
        ("Fecha", "30 de octubre de 2026"),
        ("Autor", "Jorge Sandoval"),
        ("Metodología", "Scrum++ (Scrum y modelo de vistas 4+1)"),
        ("Periodo documentado", "11 de agosto al 30 de octubre de 2026 (11 semanas)"),
        ("Repositorio", "github.com/JSSAgrofresh/agrofresh_report_hub"),
        ("Diagramas editables", "Tablero de FigJam «Documentación AgroFresh Report Hub»; el código fuente de cada diagrama está en docs/documentacion/diagramas"),
    ], [4.0, 12.0], None)
    L.nota(doc, "Este documento se genera con docs/documentacion/construir_documento.py a partir del código del "
                "repositorio. Cuando el sistema cambia, se vuelve a generar.", "Cómo se mantiene", L.HEX_VERDE_CLARO)
    L.tabla(doc, ["Versión", "Fecha", "Cambios"], [
        ("0.1", "30-10-2026", "Primeros diagramas entidad-relación, de secuencia, de estados y de procesos."),
        ("0.2", "30-10-2026", "Estructura completa: introducción, marco teórico, requerimientos, vistas 4+1, módulos, pruebas y anexos."),
        ("0.3", "30-10-2026", "Capítulo de módulos ampliado (flujos, reglas, API), Product Backlog con historias de usuario, 18 casos de uso especificados, módulos nuevos (Costo por kilo, Muestra interna) y catálogo de endpoints."),
    ], [2.0, 3.0, 11.0], "Historial de versiones")

    # ---- Mensaje inicial (se escribe a mano)
    _titulo_sin_numero(doc, "Mensaje inicial")
    L.nota(doc, "Espacio reservado. Aquí va el mensaje de agradecimiento a todas las personas que participaron en el "
                "proyecto, que se escribe a mano. Se puede borrar esta nota y las líneas de abajo.", "Para completar")
    for _ in range(14):
        p = doc.add_paragraph("_" * 78)
        p.runs[0].font.color.rgb = L.GRIS

    # ---- Índices
    _titulo_sin_numero(doc, "Índice de contenidos")
    ancho = 16.4
    _indice(doc, cache["titulos"] if cache else None, ancho, 'TOC \\o "1-3" \\h \\z \\u')
    _titulo_sin_numero(doc, "Índice de figuras")
    _indice(doc, cache["figuras"] if cache else None, ancho, 'TOC \\h \\z \\c "Figura"', indentar=False)
    _titulo_sin_numero(doc, "Índice de tablas")
    _indice(doc, cache["tablas"] if cache else None, ancho, 'TOC \\h \\z \\c "Tabla"', indentar=False)

    # ---- Capítulos
    A.capitulo_1(doc, datos)
    A.capitulo_2(doc, datos)
    A.capitulo_3(doc, datos)
    A.capitulo_4(doc, datos)
    A.capitulo_5(doc, datos)
    A.capitulo_6(doc, datos)
    C.capitulo_7(doc, datos)
    D.capitulo_8(doc, datos)
    D.capitulo_9(doc, datos)
    B.capitulo_8(doc, datos)
    B.capitulo_9(doc, datos)
    B.capitulo_10(doc, datos)
    B.bibliografia(doc, datos)
    B.anexos(doc, datos)
    B.anexo_d(doc, datos)

    cp = doc.core_properties
    cp.title = "Documentación del sistema AgroFresh Report Hub"
    cp.author = "Jorge Sandoval"
    cp.subject = "Documentación técnica y funcional (Scrum++)"
    cp.keywords = "AgroFresh, Report Hub, documentación, Scrum++, 4+1"
    doc.save(ruta)

    titulos = []
    for p in doc.paragraphs:
        n = p.style.name
        if n in ("Heading 1", "Heading 2", "Heading 3"):
            titulos.append((int(n[-1]), p.text.strip(), ""))
    return {
        "titulos": titulos,
        "figuras": [(n, t) for n, t in L.Contadores.figuras],
        "tablas": [(n, t) for n, t in L.Contadores.tablas],
    }


# --------------------------------------------------------------------------------------
def a_pdf(docx: Path) -> Path:
    TMP.mkdir(exist_ok=True)
    subprocess.run(
        ["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(TMP), str(docx)],
        check=True, capture_output=True, timeout=600,
    )
    return TMP / (docx.stem + ".pdf")


def paginas_de(pdf: Path, base: dict) -> dict:
    from pypdf import PdfReader

    lectura = PdfReader(str(pdf))
    paginas = []
    for pg in lectura.pages:
        lineas = [ln.strip() for ln in (pg.extract_text() or "").splitlines()]
        paginas.append(lineas)

    def buscar(pred, desde):
        for i in range(desde, len(paginas)):
            if any(pred(ln) for ln in paginas[i]):
                return i
        return None

    # Primer capítulo: la primera página donde «1. Introducción» es una línea exacta.
    inicio = buscar(lambda ln: ln == "1. Introducción", 0)
    cursor = inicio if inicio is not None else 0
    titulos = []
    for nivel, texto, _ in base["titulos"]:
        i = buscar(lambda ln, t=texto: ln == t, cursor)
        if i is None:
            titulos.append((nivel, texto, ""))
            continue
        cursor = i
        titulos.append((nivel, texto, i + 1))
    figuras, tablas = [], []
    for tipo, lista, destino in (("Figura", base["figuras"], figuras), ("Tabla", base["tablas"], tablas)):
        cur = inicio or 0
        for n, texto in lista:
            pref = f"{tipo} {n}."
            i = buscar(lambda ln, p=pref: ln.startswith(p), cur)
            pagina = ""
            if i is not None:
                cur = i
                pagina = i + 1
            destino.append((1, f"{tipo} {n}. {texto}", pagina))
    return {"titulos": titulos, "figuras": figuras, "tablas": tablas, "total_paginas": len(paginas)}


def main() -> None:
    TMP.mkdir(exist_ok=True)
    a = construir(TMP / "pasada_a.docx", None)
    base = {"titulos": [(n, t, "0") for n, t, _ in a["titulos"]],
            "figuras": [(1, f"Figura {n}. {t}", "0") for n, t in a["figuras"]],
            "tablas": [(1, f"Tabla {n}. {t}", "0") for n, t in a["tablas"]]}
    b = construir(TMP / "pasada_b.docx", base)
    pdf = a_pdf(TMP / "pasada_b.docx")
    pags = paginas_de(pdf, {"titulos": b["titulos"], "figuras": b["figuras"], "tablas": b["tablas"]})
    construir(SALIDA, pags)
    final_pdf = a_pdf(SALIDA)
    shutil.copy(final_pdf, AQUI / "Documentacion_AgroFresh_Report_Hub.pdf")
    sin = [t for _, t, p in pags["titulos"] if p == ""]
    print(f"Listo: {SALIDA.name} · {pags['total_paginas']} páginas · títulos sin página: {len(sin)}")
    for t in sin[:10]:
        print("  sin página:", t)


if __name__ == "__main__":
    sys.path.insert(0, str(AQUI))
    main()
