"""Capítulos 7 a 11 y anexos: módulos, pruebas, retrospectiva, conclusiones, bibliografía y anexos."""
from __future__ import annotations

from lib_docx import bloque_codigo, nota, parrafo, tabla, titulo, viñetas


def _modulo(doc, nombre, ruta, para_quien, que_hace, reglas, datos_ref):
    titulo(doc, nombre, 2, False)
    tabla(doc, ["Ficha", ""], [
        ("Ruta en el sistema", ruta),
        ("Quién lo usa", para_quien),
        ("Datos y servicios", datos_ref),
    ], [3.8, 12.2], None, tam=9.5)
    parrafo(doc, que_hace)
    if reglas:
        parrafo(doc, "Reglas de negocio relevantes:", cursiva=False).runs[0].bold = True
        viñetas(doc, reglas)


def capitulo_7(doc, datos):
    titulo(doc, "7. Descripción de los módulos", 1)
    parrafo(doc, (
        "Cada módulo se describe con una ficha (ruta, usuarios y datos), su funcionamiento y las reglas de "
        "negocio que no son obvias desde la pantalla. Las reglas están pensadas para que quien mantenga el "
        "sistema entienda por qué las cosas funcionan como funcionan."))

    # ---------------------------------------------------------------- Toma de muestras
    _modulo(doc, "7.1 Toma de muestras", "/modulos/muestreo",
            "Muestreadores, administradores de área y administrador general; los comerciales ven sus plantas.",
            ("Es el punto de partida del ciclo. Una persona completa el formulario de una solicitud de análisis "
             "(laboratorio, Sold To, Ship To, especie, tipo de aplicación, analitos y observaciones) y el "
             "sistema asigna un folio OT correlativo por laboratorio, genera el Excel, el PDF y el JSON y "
             "puede enviar el correo al laboratorio. La pantalla «Solicitudes e informes» lista todo con "
             "filtros acumulables, indicadores que filtran con un clic y el informe de cada solicitud."),
            [
                "El Sold To y el Ship To salen del listado del tipo de servicio (Línea de proceso, Actimist, Ecofog).",
                "La observación admite 50 caracteres, y 500 en un ensayo (Sold To AGROFRESH y Ship To ENSAYO).",
                "Con 2 o más productos, el documento dice MIXTO y la lista real queda aparte.",
                "Editar una solicitud guardada exige el permiso «Editar solicitudes» y solo se permite en tipos que no se envían solos.",
                "Las solicitudes de prueba tienen su propia serie (OTP-) y nunca se envían a la lista real.",
                "Un informe se cruza con su solicitud solo por la OT impresa; nunca se adivina por parecido.",
            ],
            "solicitud_archivo (índice), envio_solicitud_log, Cloudflare R2 (Excel y fotos), Gmail.")

    # ---------------------------------------------------------------- AgroFresh Lab
    titulo(doc, "7.2 AgroFresh Lab", 2, False)
    parrafo(doc, (
        "AgroFresh Lab es un hub con tres módulos. Las secciones visibles se pueden restringir por cuenta; "
        "sin ninguna marcada se ven las tres. Modificar los criterios de las verificaciones es un permiso aparte."))
    titulo(doc, "7.2.1 Ingreso al laboratorio", 3, False)
    parrafo(doc, (
        "Recibe la muestra física: se escanea el código de la solicitud, se anota el número de muestra, el "
        "peso, el peso extraído y el peso hueso, y se sube una foto. La tabla tiene dos pestañas: Ingreso "
        "estándar y Ingreso fortificados (sin solicitud; se anota número y peso y el servidor pone la fecha y hora)."))
    viñetas(doc, [
        "Quitar la muestra y eliminar una solicitud son acciones solo del administrador principal y piden su contraseña.",
        "Descargar base (Excel) produce una hoja BD con las solicitudes cruzadas y los fortificados.",
        "Las fotos se piden con el token de sesión; un enlace directo a la imagen daría 401.",
    ])
    titulo(doc, "7.2.2 Verificaciones diarias (REG-03)", 3, False)
    parrafo(doc, (
        "Reemplaza el control diario de equipos que antes se llevaba en un Excel con macros: micropipetas, "
        "balanza, temperaturas, gases, inyector y detector. El cálculo del veredicto existe en el frontend "
        "(para pintar mientras se escribe) y en el backend (que es lo que se guarda); ambos se prueban con los mismos casos."))
    viñetas(doc, [
        "Un día se juzga con los criterios que regían ese día: cada sección los congela al guardarse por primera vez.",
        "El output del detector es solo registro; no tiene rango ni decide el veredicto.",
        "Firmar la revisión del día es una función suelta, además del administrador general y el de Cromatografía.",
    ])
    titulo(doc, "7.2.3 Envío de informes", 3, False)
    parrafo(doc, (
        "El analista sube uno o varios PDF de informes propios. Cada PDF se lee (Sold To, Ship To, especie, "
        "tipo de aplicación y número de solicitud) y se arma un correo aparte. La lista de destinatarios sale "
        "de la solicitud del informe, tal cual, y se le suman copias ocultas internas."))
    viñetas(doc, [
        "El sistema parte siempre en modo prueba; pasar a producción pide la contraseña de quien lo hace.",
        "En prueba todo sale solo a los destinatarios de prueba, con (PRUEBA) en el asunto.",
        "Si la solicitud no tiene lista del cliente, el Para queda vacío y la tarjeta no deja enviar.",
        "Solo el administrador principal puede editar los datos leídos del PDF o cambiar el laboratorio.",
        "El historial queda en envio_informe_log; solo el administrador principal borra registros, con su clave.",
    ])

    # ---------------------------------------------------------------- Ingreso de Informes
    _modulo(doc, "7.3 Ingreso de Informes", "/modulos/ingesta",
            "Analistas (carga manual) y administrador principal (panel y bandeja del correo).",
            ("Reúne todas las puertas de entrada de un informe a Report. La carga manual usa el Excel nativo o "
             "el Converter (que lee PDF de Quiteca, ALS, Diagnofruit y AgroFresh); la automática lee el buzón "
             "del Report Hub. Todo se carga con la misma función y cada carga queda registrada y se puede deshacer."),
            [
                "Lo que no calza con Listados (Sold To, Ship To, especie, variedad) no se inserta: queda en Filas pendientes.",
                "El Converter y el correo aprenden las correcciones a mano y las aplican solas, solo si el valor sigue siendo válido.",
                "Un envío en rojo nunca se carga: solo se puede resolver, marcar como ya informado o rechazar.",
                "El buzón se abre solo en lectura; la revisión corre en segundo plano porque el túnel corta peticiones de más de ~100 s.",
                "Un informe es un incidente: los reenvíos del mismo informe no son alertas nuevas.",
                "La demora se mide en días hábiles desde que la solicitud salió al laboratorio hasta que llegó el informe.",
            ],
            "carga_datos, pendiente_revision, correccion_converter, correo_informe, correo_informe_visto, R2.")

    # ---------------------------------------------------------------- Report
    _modulo(doc, "7.4 Report", "/modulos/reportes",
            "Personal interno, gerencia, comerciales y clientes (acotados por su alcance).",
            ("Consulta de resultados con filtros, indicadores y gráficos. Con «Todos» muestra, en este orden, "
             "Análisis de residuos (AgroFresh y Quiteca), Análisis FSMA (ALS Global) y Análisis de fitopatología "
             "(Diagnofruit). El gráfico de residuos dibuja una columna por informe, con una curva por analito."),
            [
                "El alcance de un cliente o comercial lo decide el servidor con la sesión, nunca el navegador.",
                "Report muestra solo los tipos de servicio que el administrador principal encienda en Funciones.",
                "FSMA y fitopatología muestran un estado Detectado / No detectado y tortas de presencia y nivel.",
                "Los límites residuales vienen de la tabla del laboratorio; nunca se inventan.",
                "La descarga de BD en Excel respeta los filtros y, para un cliente, quita las columnas internas.",
            ],
            "solicitud, resultado, analito, analito_limite, funciones.json.")

    # ---------------------------------------------------------------- Panel de control interno
    _modulo(doc, "7.5 Panel de control interno", "/modulos/auditoria-interna",
            "Administrador general y a quien se le asigne; los comerciales ven solo sus plantas en algunas pantallas.",
            ("Tres pantallas: Solicitudes e informes (solicitudes emitidas contra informes recibidos, lead time y "
             "flujograma), Rendimiento de calidad (por cliente y semana, cuántos informes cumplen y cuántos no) y "
             "Vista de límites (límites residuales y de control)."),
            [
                "Las fechas del lead time salen de eventos reales: emitida, enviada al laboratorio, informe, Report, cliente y observado.",
                "La recepción en el laboratorio se estima 24 horas después de emitida la solicitud; todo corre en días hábiles.",
                "Rendimiento de calidad juzga residuales contra límites por especie y servicio; FSMA por detección; fitopatología por nivel.",
                "Un informe que no se puede juzgar no entra a la cuenta y se informa aparte.",
            ],
            "solicitud_archivo, informe_auditoria, envio_solicitud_log, plan_entregable, carga_datos.")

    # ---------------------------------------------------------------- Post Venta
    _modulo(doc, "7.6 Post Venta (Accu-Tab)", "/modulos/trace",
            "Equipo de Post Venta; el cliente ve sus informes en su portal.",
            ("Cada carga de un equipo Accu-Tab, manual desde Trace o automática desde el correo, termina con su "
             "informe PDF generado por el sistema (el mismo que imprime Trace). Quedan ordenados por cliente y "
             "fecha en R2. El cliente ve «Tus informes Accu-Tab» con filtros, gráficos de pH y ORP y descarga del PDF."),
            [
                "Gmail no quita por IMAP la etiqueta de la carpeta abierta; por eso cada correo se anota por su Message-ID.",
                "Borrar una carga quita también sus archivos de R2.",
                "Cada endpoint abierto a clientes acota por su cliente y Ship To en el servidor.",
            ],
            "Storage/Accutab, accutab/mail en R2, registro.json por carga.")

    # ---------------------------------------------------------------- Storage
    _modulo(doc, "7.7 Storage", "/modulos/storage",
            "Quien tenga el módulo; los clientes ven solo la carpeta de su Ship To.",
            ("Explorador de archivos con cinco entradas: Archivos del servidor, Solicitudes, Accutab, "
             "Laboratorio AgroFresh e Informes. Soporta lista y cuadrícula, vista previa, favoritos y búsqueda global."),
            [
                "Una carpeta sin reglas es abierta; con reglas es restringida a esas cuentas, más administrador y gerencia.",
                "Las subcarpetas heredan la regla más cercana y solo pueden restringir más.",
                "La carpeta _config no se toca nunca; en Solicitudes se crean y mueven carpetas pero no se suben ni borran archivos.",
                "Los informes quedan en informes/<planta>/<fecha de muestreo>/<tipo de servicio>/<laboratorio>/.",
            ],
            "storage_permiso, Cloudflare R2, disco del servidor.")

    # ---------------------------------------------------------------- Administración
    titulo(doc, "7.8 Administración", 2, False)
    parrafo(doc, "Reservada al administrador general. Reúne las funciones que nunca se reparten entre cuentas.")
    tabla(doc, ["Sección", "Qué hace"], [
        ("Usuarios", "Crea y edita cuentas en tres pasos (quién es, tipo de cuenta, qué puede hacer) con permisos por categoría y funciones sueltas."),
        ("Listados", "Mantiene Sold To, Ship To, especie y variedad por tipo de servicio."),
        ("Listas de distribución", "Tabla dinámica por planta y rol; importa Excel como propuestas que se aceptan celda por celda."),
        ("Funciones", "Enciende qué tipos de servicio muestra Report, los gráficos de ALS y Diagnofruit y el estilo del portal."),
        ("Avisos a clientes", "Edita y prueba el aviso «los informes salen por el Report Hub» con siete plantillas de correo."),
        ("Plan de entregables", "Carga el plan de análisis prometido por cada comercial para compararlo con lo realizado."),
        ("Panel de inicio", "Arma, como un tablero de 12 columnas, qué widgets ve cada tipo de cuenta."),
        ("Actividad y Seguimiento", "Bitácora de lo que hace cada persona, mapa de calor y adopción por módulo."),
    ], [4.0, 12.0], "Secciones de Administración")

    # ---------------------------------------------------------------- Portal
    _modulo(doc, "7.9 Portal de clientes y comerciales", "/modulos/reportes/laboratorio",
            "Cuentas cliente y comercial.",
            ("Las cuentas cliente y comercial usan un marco propio: barra de vidrio flotante, saludo con la foto de "
             "la especie, filtros que se pegan al bajar y tarjetas de análisis. Un cliente puede tener varias "
             "plantas y especies; un comercial ve las plantas que le asignan (o todas)."),
            [
                "Todo endpoint abierto a estas cuentas debe acotar a sus plantas por dentro.",
                "Hay dos estilos (Básico y Sobrio) que fija el administrador principal por tipo de cuenta o por cuenta.",
                "Los límites residuales no se muestran a clientes ni comerciales.",
                "Se prueba en teléfono vertical y horizontal, tableta y escritorio.",
            ],
            "usuario.plantas_asignadas, reportes._filtro_alcance, funciones.json.")

    # ---------------------------------------------------------------- Monitoreo
    _modulo(doc, "7.10 Monitoreo", "/monitoreo",
            "Solo el administrador principal.",
            ("Pantalla oscura pensada para el teléfono. Muestra quién está conectado, dónde está, qué hizo y "
             "cuánto tiempo usó el sistema, informes que llegaron y últimos envíos. Se instala como app (PWA)."),
            [
                "La presencia es un latido cada 60 segundos; en línea es un latido de los últimos 3 minutos.",
                "El historial de visitas guarda tiempo conectado y tiempo de uso (sin contar la pausa).",
                "El service worker no guarda datos ni respuestas de la API: son resultados de laboratorio.",
            ],
            "presencia, presencia_sesion, actividad_usuario.")

    # ---------------------------------------------------------------- Transversales
    titulo(doc, "7.11 Reglas transversales", 2, False)
    viñetas(doc, [
        ("Lo ya emitido no se reescribe. ", "El PDF, el Excel y el JSON se regeneran al abrirse; por eso todo cambio de formato va detrás de una marca guardada en los datos de la solicitud."),
        ("Un 401 cierra la sesión. ", "El cliente HTTP trata cualquier 401 como sesión vencida, así que otros errores nunca responden 401."),
        ("Acciones delicadas. ", "Se piden con la contraseña del administrador principal y se verifican en el servidor."),
        ("Servicios. ", "Línea de proceso, Actimist, Ecofog y RYD se resuelven en un solo lugar (servicios.py) con espejo en el frontend."),
        ("Memoria de 15 segundos. ", "Los destinatarios fijos se leen de R2 con una memoria breve por proceso."),
    ])


def capitulo_8(doc, datos):
    titulo(doc, "8. Pruebas y calidad", 1)
    parrafo(doc, (
        f"El proyecto tiene {datos['tests_back']} archivos de prueba en el backend y {datos['tests_front']} en el "
        "frontend. Las pruebas del backend nunca tocan servicios reales: el archivo conftest vacía R2, Gmail y "
        "Resend y apaga la base, incluso si el .env apunta a producción."))
    titulo(doc, "8.1 Estrategia de pruebas", 2, False)
    tabla(doc, ["Nivel", "Herramienta", "Qué cubre"], [
        ("Unitarias backend", "pytest", "Reglas de negocio, lectores de PDF, cálculos y permisos."),
        ("Con base de datos", "pytest con una base aparte", "Consultas reales: cargas, correo, monitoreo, alcance de cuentas."),
        ("Unitarias frontend", "Vitest y Testing Library", "Lógica pura, componentes y vistas."),
        ("Tipos y estilo", "tsc -b y ESLint", "Contrato de tipos (incluye los archivos de prueba) y calidad de código."),
        ("Visual", "Playwright con Chromium", "Cambios de diseño en navegador real y en varios tamaños de pantalla."),
    ], [3.5, 4.5, 8.0], "Niveles de prueba")
    titulo(doc, "8.2 Cómo se ejecutan", 2, False)
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
    titulo(doc, "8.3 Prácticas acordadas", 2, False)
    viñetas(doc, [
        "Al escribir una prueba para un error, se rompe el arreglo a propósito para confirmar que la prueba falla.",
        "Los cálculos que existen en frontend y backend se prueban con los mismos casos.",
        "Antes de entregar un cambio de formato se prueba cómo se ve una solicitud antigua sin la marca nueva.",
        "Las pruebas que dependen de la base se saltan solas si no hay una disponible.",
    ])


def capitulo_9(doc, datos):
    titulo(doc, "9. Retrospectiva del proyecto", 1)
    titulo(doc, "9.1 Evaluación de esfuerzo", 2, False)
    parrafo(doc, (
        f"En 11 semanas el repositorio acumuló {datos['prs']} pull requests. El ritmo creció de forma "
        "sostenida: las dos primeras semanas fueron de andamiaje y desde la tercera el promedio supera los 50 "
        "pull requests por semana, con picos en las semanas 8, 10 y 11, cuando se construyeron la Auditoría "
        "interna, los indicadores de entrega y el portal de clientes."))
    titulo(doc, "9.2 Qué funcionó", 2, False)
    viñetas(doc, [
        "Publicar cada cambio de a poco, con pull request y despliegue sencillo, mantuvo la rama estable siempre lista.",
        "Los scripts que miran primero y escriben solo con --aplicar evitaron errores al corregir datos reales.",
        "Las pruebas automáticas que no tocan servicios reales permitieron cambiar con seguridad.",
        "Registrar quién hizo qué desde el comienzo hizo posibles el Monitoreo y los indicadores de uso.",
    ])
    titulo(doc, "9.3 Qué mejorar", 2, False)
    viñetas(doc, [
        "Cerrar los pendientes que dependen del laboratorio (límites residuales, regla de FSMA, nivel Moderado).",
        "Probar los lectores de ALS y Diagnofruit con más informes reales.",
        "Terminar la lectura de la hoja «Para el informe» de Diagnofruit en el Converter.",
        "Migrar los mantenedores en archivos JSON a tablas y paginar /api/reportes/datos.",
        "Documentar de forma continua: este documento debe actualizarse con cada cambio mayor.",
    ])


def capitulo_10(doc, datos):
    titulo(doc, "10. Conclusiones", 1)
    nota(doc, "Las conclusiones finales sobre los objetivos, la metodología y el beneficio obtenido se redactan una vez "
              "que el equipo revise el documento.", "Por completar")
    titulo(doc, "10.1 Respecto a los objetivos", 2, False)
    parrafo(doc, "[Por completar]")
    titulo(doc, "10.2 Respecto a la metodología", 2, False)
    parrafo(doc, "[Por completar]")
    titulo(doc, "10.3 Respecto al beneficio obtenido", 2, False)
    parrafo(doc, "[Por completar]")


def bibliografia(doc, datos):
    titulo(doc, "11. Bibliografía", 1)
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
