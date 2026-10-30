"""Capítulos 7 a 11 y anexos: módulos, pruebas, retrospectiva, conclusiones, bibliografía y anexos."""
from __future__ import annotations

import json
from pathlib import Path

from lib_docx import bloque_codigo, nota, parrafo, tabla, titulo, viñetas


def capitulo_8(doc, datos):
    titulo(doc, "10. Pruebas y calidad", 1)
    parrafo(doc, (
        f"El proyecto tiene {datos['tests_back']} archivos de prueba en el backend y {datos['tests_front']} en el "
        "frontend. Las pruebas del backend nunca tocan servicios reales: el archivo conftest vacía R2, Gmail y "
        "Resend y apaga la base, incluso si el .env apunta a producción."))
    titulo(doc, "10.1 Estrategia de pruebas", 2, False)
    tabla(doc, ["Nivel", "Herramienta", "Qué cubre"], [
        ("Unitarias backend", "pytest", "Reglas de negocio, lectores de PDF, cálculos y permisos."),
        ("Con base de datos", "pytest con una base aparte", "Consultas reales: cargas, correo, monitoreo, alcance de cuentas."),
        ("Unitarias frontend", "Vitest y Testing Library", "Lógica pura, componentes y vistas."),
        ("Tipos y estilo", "tsc -b y ESLint", "Contrato de tipos (incluye los archivos de prueba) y calidad de código."),
        ("Visual", "Playwright con Chromium", "Cambios de diseño en navegador real y en varios tamaños de pantalla."),
    ], [3.5, 4.5, 8.0], "Niveles de prueba")
    titulo(doc, "10.2 Cómo se ejecutan", 2, False)
    bloque_codigo(doc, [
        "# Backend",
        "cd backend",
        "python -m pytest -q",
        "$env:AGROFRESH_BD_PRUEBAS = \"agrofresh_pruebas\"   # para correr con base aparte",
        "",
        "# Frontend",
        "npx vitest run",
        "npm run build      # corre tsc -b",
        "npm run lint",
    ])
    nota(doc, "El lint tiene 12 errores de línea base preexistentes. Si salen 12 está bien; si salen 13, algo nuevo lo rompió. "
              "npx tsc --noEmit no sirve: no revisa los archivos de prueba.", "Ojo")
    titulo(doc, "10.3 Prácticas acordadas", 2, False)
    viñetas(doc, [
        "Al escribir una prueba para un error, se rompe el arreglo a propósito para confirmar que la prueba falla.",
        "Los cálculos que existen en frontend y backend se prueban con los mismos casos.",
        "Antes de entregar un cambio de formato se prueba cómo se ve una solicitud antigua sin la marca nueva.",
        "Las pruebas que dependen de la base se saltan solas si no hay una disponible.",
    ])


def capitulo_9(doc, datos):
    titulo(doc, "11. Retrospectiva del proyecto", 1)
    titulo(doc, "11.1 Evaluación de esfuerzo", 2, False)
    parrafo(doc, (
        f"En 11 semanas el repositorio acumuló {datos['prs']} pull requests. El ritmo creció de forma "
        "sostenida: las dos primeras semanas fueron de andamiaje y desde la tercera el promedio supera los 50 "
        "pull requests por semana, con picos en las semanas 8, 10 y 11, cuando se construyeron la Auditoría "
        "interna, los indicadores de entrega y el portal de clientes."))
    titulo(doc, "11.2 Qué funcionó", 2, False)
    viñetas(doc, [
        "Publicar cada cambio de a poco, con pull request y despliegue sencillo, mantuvo la rama estable siempre lista.",
        "Los scripts que miran primero y escriben solo con --aplicar evitaron errores al corregir datos reales.",
        "Las pruebas automáticas que no tocan servicios reales permitieron cambiar con seguridad.",
        "Registrar quién hizo qué desde el comienzo hizo posibles el Monitoreo y los indicadores de uso.",
    ])
    titulo(doc, "11.3 Qué mejorar", 2, False)
    viñetas(doc, [
        "Cerrar los pendientes que dependen del laboratorio (límites residuales, regla de FSMA, nivel Moderado).",
        "Probar los lectores de ALS y Diagnofruit con más informes reales.",
        "Terminar la lectura de la hoja «Para el informe» de Diagnofruit en el Converter.",
        "Migrar los mantenedores en archivos JSON a tablas y paginar /api/reportes/datos.",
        "Documentar de forma continua: este documento debe actualizarse con cada cambio mayor.",
    ])


def capitulo_10(doc, datos):
    titulo(doc, "12. Conclusiones", 1)
    nota(doc, "Las conclusiones finales sobre los objetivos, la metodología y el beneficio obtenido se redactan una vez "
              "que el equipo revise el documento.", "Por completar")
    titulo(doc, "12.1 Respecto a los objetivos", 2, False)
    parrafo(doc, "[Por completar]")
    titulo(doc, "12.2 Respecto a la metodología", 2, False)
    parrafo(doc, "[Por completar]")
    titulo(doc, "12.3 Respecto al beneficio obtenido", 2, False)
    parrafo(doc, "[Por completar]")


def bibliografia(doc, datos):
    titulo(doc, "13. Bibliografía", 1)
    refs = [
        "Bass, L., Clements, P., y Kazman, R. (2003). Software Architecture in Practice. Addison-Wesley Professional.",
        "Booch, G., Rumbaugh, J., y Jacobson, I. (1999). The Unified Modeling Language User Guide. Addison-Wesley.",
        "Kruchten, P. (1995). Architectural Blueprints — The «4+1» View Model of Software Architecture. IEEE Software, 12(6), 42-50.",
        "Object Management Group (OMG). (2014). Business Process Model and Notation (BPMN) Version 2.0. https://www.omg.org/spec/BPMN/2.0/",
        "Schwaber, K., y Sutherland, J. (2020). The Scrum Guide. https://scrumguides.org/",
        "Hurtado Sáez, J. (2021). Cómo funciona la metodología Scrum. IEBS. https://www.iebschool.com/blog/metodologia-scrum-agile-scrum/",
        "React. (2025). React documentation. https://react.dev",
        "FastAPI. (2025). FastAPI documentation. https://fastapi.tiangolo.com",
        "PostgreSQL Global Development Group. (2025). PostgreSQL documentation. https://www.postgresql.org/docs/",
        "Vite. (2025). Vite documentation. https://vite.dev",
    ]
    viñetas(doc, refs, "List Number")


def anexos(doc, datos):
    titulo(doc, "Anexo A. Migraciones de base de datos", 1)
    parrafo(doc, "Las migraciones se corren una por archivo y en orden con el script migrar.py, antes de reiniciar el backend.")
    bloque_codigo(doc, [
        "cd backend",
        ".venv\\Scripts\\python.exe scripts\\migrar.py 0070_presencia_sesion.sql",
    ])
    tabla(doc, ["N°", "Archivo"], datos["migraciones_lista"], [2.0, 14.0], "Migraciones numeradas del sistema", tam=8.5)
    titulo(doc, "Anexo B. Scripts de operación", 1)
    parrafo(doc, "Los scripts que escriben en la base miran primero y solo aplican con --aplicar. Los principales:")
    tabla(doc, ["Script", "Para qué sirve"], datos["scripts"], [6.0, 10.0], "Scripts de operación principales", tam=8.5)
    titulo(doc, "Anexo C. Glosario", 1)
    tabla(doc, ["Término", "Significado"], [
        ("Sold To", "Cliente que compra el servicio."),
        ("Ship To", "Planta o sucursal del cliente donde se toma la muestra."),
        ("OT", "Orden de trabajo: el folio de una solicitud de análisis (por ejemplo OT-QUI0053)."),
        ("Converter", "Herramienta que lee PDF de informes de laboratorios y los carga a la base."),
        ("Listados", "Catálogos oficiales de clientes, plantas, especies y variedades."),
        ("Línea de proceso", "Servicio por defecto: análisis en las líneas de proceso de las plantas."),
        ("Actimist / Ecofog / RYD", "Otros tipos de servicio con listado o lista de distribución propia."),
        ("FSMA", "Análisis microbiológicos exigidos por la ley de seguridad alimentaria de Estados Unidos."),
        ("Accu-Tab", "Equipo de Post Venta cuyos informes de pH y ORP se cargan desde Trace."),
        ("PWA", "Aplicación web instalable: el Monitoreo se puede instalar como app."),
        ("R2", "Almacenamiento de objetos de Cloudflare; guarda archivos y respaldos, no es base de datos."),
    ], [4.0, 12.0], "Glosario", tam=9.5)


def anexo_d(doc, datos):
    ep = json.loads((Path(__file__).parent / "datos_endpoints.json").read_text(encoding="utf8"))
    total = sum(len(v) for v in ep.values())
    titulo(doc, "Anexo D. Catálogo de endpoints de la API", 1)
    parrafo(doc, (f"El backend expone {total} endpoints en {len(ep)} módulos. El catálogo se genera leyendo los decoradores "
                  "de FastAPI del código (docs/documentacion/generar_endpoints.py); la columna «Qué hace» sale de la "
                  "primera línea de la documentación de cada función o, si no la tiene, de su nombre."))
    for archivo, lista in ep.items():
        titulo(doc, archivo, 3, False)
        tabla(doc, ["Método", "Ruta", "Qué hace"], [(e["m"], e["r"], e["d"][:120]) for e in lista], [1.6, 7.4, 7.0], None, tam=7.5)
