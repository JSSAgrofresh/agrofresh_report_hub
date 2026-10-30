"""Capítulos 1 a 6: introducción, marco teórico, organización, requerimientos, desarrollo y vistas 4+1."""
from __future__ import annotations

from pathlib import Path

from lib_docx import (
    bloque_codigo, figura, nota, parrafo, tabla, titulo, viñetas,
)

PNG = Path(__file__).parent / "png"


def capitulo_1(doc, datos):
    titulo(doc, "1. Introducción", 1)
    titulo(doc, "1.1 Contexto", 2, False)
    parrafo(doc, (
        "AgroFresh Chile presta servicios de poscosecha a la industria frutícola de exportación. Dentro de "
        "esa operación, su laboratorio de cromatografía y los laboratorios externos con los que trabaja "
        "(Quiteca, ALS Global y Diagnofruit) producen cada temporada miles de resultados: residuos de "
        "plaguicidas en fruta, análisis microbiológicos exigidos por FSMA y análisis de fitopatología. "
        "Cada resultado pertenece a un cliente (Sold To), a una planta de ese cliente (Ship To), a una "
        "especie y a un tipo de servicio (Línea de proceso, Actimist, Ecofog o RYD)."))
    parrafo(doc, (
        "Antes de este sistema, ese flujo vivía repartido en planillas Excel con macros, correos "
        "individuales y carpetas de archivos. La información no se podía cruzar con facilidad, los "
        "informes llegaban por correo sin un control sistemático de a quién se enviaban y no había un "
        "punto donde un cliente pudiera consultar sus propios resultados."))
    parrafo(doc, (
        "AgroFresh Report Hub nace para unificar ese ciclo completo en una sola plataforma web: desde que "
        "se solicita un análisis hasta que el informe del laboratorio queda cargado, verificado y "
        "disponible para el cliente."))

    titulo(doc, "1.2 Importancia y contribución", 2, False)
    titulo(doc, "1.2.1 Eficiencia y productividad", 3, False)
    parrafo(doc, (
        "La solicitud de análisis se genera una sola vez y de ella salen el PDF, el Excel, el JSON y el "
        "correo al laboratorio, con su lista de distribución ya resuelta. Los informes que llegan al buzón "
        "se leen, se cruzan con su solicitud por el número de OT y se cargan a la base por el mismo camino "
        "que usa la carga manual, con la posibilidad de deshacer cada carga."))
    titulo(doc, "1.2.2 Trazabilidad y control", 3, False)
    parrafo(doc, (
        "Cada solicitud, informe, envío y carga queda registrado con su autor y su fecha. Lo ya emitido no "
        "se reescribe: los cambios de formato de una solicitud quedan detrás de una marca guardada en sus "
        "datos, de modo que las solicitudes antiguas se siguen viendo como se emitieron."))
    titulo(doc, "1.2.3 Comunicación con el cliente", 3, False)
    parrafo(doc, (
        "Los clientes y los comerciales entran a un portal de solo lectura acotado a sus propias plantas y "
        "especies, donde ven sus informes, gráficos de residuos, análisis FSMA y de fitopatología, y los "
        "informes de Post Venta (Accu-Tab)."))
    titulo(doc, "1.2.4 Calidad del dato", 3, False)
    parrafo(doc, (
        "Todo lo que se carga se valida contra los Listados oficiales de Sold To, Ship To, especie y "
        "variedad. Lo que no calza no se inserta: queda en una bandeja de filas pendientes donde se "
        "corrige a mano y el sistema aprende la corrección para la próxima vez."))

    titulo(doc, "1.3 Objetivos", 2, False)
    titulo(doc, "1.3.1 Objetivo general", 3, False)
    parrafo(doc, (
        "Construir una plataforma web que gestione el ciclo completo de los análisis de laboratorio de "
        "AgroFresh: solicitud, ingreso de la muestra, recepción y carga del informe, envío al cliente y "
        "consulta de resultados, con trazabilidad y control de acceso por tipo de cuenta."))
    titulo(doc, "1.3.2 Objetivos específicos", 3, False)
    viñetas(doc, [
        "Emitir solicitudes de toma de muestras por laboratorio, con folio correlativo, documentos "
        "adjuntos y envío por correo a la lista de distribución correcta.",
        "Registrar el ingreso de la muestra al laboratorio y cruzarla con su solicitud.",
        "Reemplazar el control diario de equipos en Excel con macros por un registro validado "
        "(verificaciones diarias, REG-03).",
        "Recibir los informes de los laboratorios, leerlos, cruzarlos con su solicitud y cargarlos a la "
        "base homogeneizados contra Listados.",
        "Enviar los informes propios al cliente con su lista de distribución y un modo de prueba seguro.",
        "Entregar a clientes y comerciales un portal acotado a sus plantas con gráficos y descargas.",
        "Dar al área interna indicadores de entrega, rendimiento de calidad y uso del sistema.",
        "Administrar usuarios, permisos, listas de distribución y funciones sin tocar la base a mano.",
    ])

    titulo(doc, "1.4 Alcance y limitaciones", 2, False)
    parrafo(doc, "Este documento describe el sistema tal como está en producción al 30 de octubre de 2026. Quedan "
                 "fuera del alcance actual, por decisión de negocio o por dependencia de terceros:")
    viñetas(doc, [
        ("Límites residuales: ", "son decisión del laboratorio. El sistema los carga desde la tabla del "
                                 "laboratorio y nunca los inventa."),
        ("Informes de ALS y Diagnofruit: ", "los lectores del Converter se probaron con textos de informes "
                                            "reales de octubre de 2026; faltan más muestras para endurecerlos."),
        ("Plan de entregables de los comerciales: ", "se carga por Sold To; nueve clientes del plan aún no "
                                                      "tienen nombre oficial en Listados."),
        ("Envío automático de avisos a clientes: ", "el aviso existe y se puede probar, pero el envío masivo "
                                                     "no está habilitado hasta definir la audiencia."),
        ("Reglas pendientes de confirmar con el laboratorio: ", "criterio de cumplimiento de FSMA y si el nivel "
                                                                 "«Moderado» de fitopatología cumple."),
    ])


def capitulo_2(doc, datos):
    titulo(doc, "2. Marco teórico y metodología", 1)
    parrafo(doc, (
        "Este capítulo resume los marcos de trabajo y las notaciones que se usaron para construir y "
        "documentar el sistema. Se mantiene el enfoque Scrum++ definido en la memoria de título del autor: "
        "la agilidad de Scrum combinada con el modelo de vistas arquitectónicas 4+1."))
    titulo(doc, "2.1 Metodología de trabajo", 2, False)
    titulo(doc, "2.1.1 Scrum", 3, False)
    parrafo(doc, (
        "Scrum es un marco ágil e incremental. El trabajo se organiza en iteraciones de duración fija "
        "llamadas sprints, al final de las cuales se entrega un incremento funcional del producto "
        "(Schwaber y Sutherland, 2020). El avance se gestiona con tres artefactos —Product Backlog, Sprint "
        "Backlog e incremento— y cinco eventos: Sprint Planning, Daily Scrum, el propio sprint, Sprint "
        "Review y Sprint Retrospective."))
    titulo(doc, "2.1.2 Perfiles de Scrum", 3, False)
    tabla(doc, ["Perfil", "Responsabilidad"], [
        ("Product Owner", "Define y prioriza el Product Backlog, maximiza el valor del producto y representa la voz del cliente."),
        ("Equipo de desarrollo", "Diseña, construye y prueba el producto; es autoorganizado y multidisciplinario."),
        ("Scrum Master", "Guía al equipo en la práctica de Scrum y elimina los obstáculos que aparezcan."),
    ], [4.0, 12.0], "Perfiles del equipo Scrum")
    titulo(doc, "2.1.3 Stakeholders", 3, False)
    parrafo(doc, (
        "Los stakeholders son las personas o grupos con interés directo o indirecto en el proyecto. En este "
        "sistema son el laboratorio de cromatografía, los muestreadores, la gerencia de operaciones, el "
        "equipo comercial, el equipo de Post Venta y los clientes que reciben los informes."))
    titulo(doc, "2.1.4 Modelo de vistas 4+1", 3, False)
    parrafo(doc, (
        "El modelo 4+1, propuesto por Kruchten (1995), describe la arquitectura de un sistema desde "
        "cuatro vistas —lógica, de desarrollo, de procesos y física— conectadas por una quinta, la de "
        "escenarios, que se expresa con casos de uso."))
    tabla(doc, ["Vista", "Qué muestra", "Diagramas usados aquí"], [
        ("Lógica", "La funcionalidad y la estructura de los datos que el sistema ofrece.", "Modelo entidad-relación (6 diagramas)"),
        ("De procesos", "Cómo fluyen los procesos y cómo se comunican los componentes.", "Proceso BPMN, diagrama de estados y 6 secuencias"),
        ("De desarrollo", "Cómo se divide el software en módulos y paquetes.", "Componentes del backend y del frontend"),
        ("Física", "Dónde corre cada pieza y cómo se conectan.", "Arquitectura y despliegue"),
        ("Escenarios (+1)", "Los casos de uso que unen las otras cuatro vistas.", "Casos de uso por rol"),
    ], [3.0, 7.0, 6.0], "Vistas del modelo 4+1 y diagramas que las representan")
    titulo(doc, "2.1.5 Scrum++", 3, False)
    parrafo(doc, (
        "Scrum++ combina las dos anteriores: el trabajo se planifica y entrega en iteraciones de Scrum y, "
        "en paralelo, se documenta con las vistas del modelo 4+1. Es el enfoque aplicado durante todo el "
        "desarrollo y el que ordena este documento."))
    titulo(doc, "2.1.6 BPMN y UML", 3, False)
    parrafo(doc, (
        "BPMN es el estándar del Object Management Group para modelar procesos de negocio (OMG, 2014). UML "
        "es el lenguaje de modelado para sistemas de software (Booch, Rumbaugh y Jacobson, 1999). Los "
        "diagramas de este documento siguen esas convenciones adaptadas a las herramientas usadas; donde "
        "la herramienta no ofrece la notación estricta, se indica."))

    titulo(doc, "2.2 Herramientas y tecnologías", 2, False)
    tabla(doc, ["Capa", "Tecnología", "Uso en el sistema"], [
        ("Frontend", "React 19, Vite, TypeScript estricto, React Router 7, Chart.js 4", "Interfaz web, gráficos y portal de clientes; CSS Modules con tokens de diseño."),
        ("Backend", "Python, FastAPI, psycopg2 (SQL directo), Pydantic v2", "API REST; sin ORM; openpyxl para Excel y reportlab para PDF."),
        ("Base de datos", "PostgreSQL", "Datos de informes, resultados, usuarios, actividad y configuración."),
        ("Archivos", "Cloudflare R2 y disco del servidor", "Solicitudes, informes en PDF, fotos y respaldos."),
        ("Correo", "Gmail (SMTP e IMAP) y Resend", "Envío de solicitudes e informes y lectura del buzón de informes."),
        ("Publicación", "Vercel y túnel Cloudflare", "Frontend en Vercel; backend en el servidor de la oficina."),
        ("Pruebas", "pytest, Vitest, Testing Library, Playwright", "Pruebas automáticas y revisión visual en un navegador real."),
        ("Control de versiones", "Git y GitHub", "Ramas, pull requests e historial."),
        ("Diagramas", "FigJam y Mermaid", "Diagramas editables y su versión para el documento."),
    ], [3.0, 5.5, 7.5], "Tecnologías del sistema")


def capitulo_3(doc, datos):
    titulo(doc, "3. Descripción de la organización", 1)
    titulo(doc, "3.1 Historia", 2, False)
    nota(doc, "Este apartado se completa con la historia oficial de AgroFresh Chile (fundación, hitos y "
              "evolución del laboratorio).", "Por completar")
    titulo(doc, "3.2 Visión y proyección", 2, False)
    parrafo(doc, (
        "La marca AgroFresh se presenta con el lema «Science. Solutions. Sustainability.». El sistema se "
        "alinea con esa visión: ordena la ciencia del laboratorio en soluciones concretas para el cliente "
        "y reduce el uso de papel y de procesos manuales."))
    titulo(doc, "3.3 Áreas y tipos de servicio", 2, False)
    tabla(doc, ["Tipo de servicio", "Qué es", "Particularidades en el sistema"], [
        ("Línea de proceso", "Análisis de fruta en las líneas de proceso de las plantas de los clientes.", "Es el servicio por defecto; usa el listado general de Sold To y Ship To."),
        ("Actimist", "Servicio de aplicación con su propio listado de clientes y plantas.", "Listado y lista de distribución propios; referentes fijos en Para."),
        ("Ecofog", "Copia de Actimist con listado propio.", "Mismas reglas de correo que Actimist."),
        ("RYD", "Servicio con lista de distribución propia sobre el listado general.", "Para: Carla y Fran; Jorge y el Report Hub en copia."),
        ("Post Venta (Accu-Tab)", "Informes de equipos Accu-Tab de Trace.", "Informe PDF generado automáticamente y portal del cliente."),
    ], [3.4, 6.0, 6.6], "Tipos de servicio que maneja el sistema")
    titulo(doc, "3.4 Políticas de trabajo", 2, False)
    viñetas(doc, [
        "Se trabaja en una rama de desarrollo; la rama principal (main) es la estable y la que está en producción.",
        "Cada cambio se publica con un pull request a main; Vercel publica el frontend solo.",
        "En el servidor de la oficina se hace git pull origin main y se reinicia el backend.",
        "Los cambios que necesitan migración de base de datos se publican junto con ella y se corren antes de reiniciar.",
        "Los scripts que escriben en la base primero miran y solo aplican con --aplicar.",
        "Nunca se escriben credenciales en el código ni se versionan archivos .env.",
    ])


def capitulo_4(doc, datos):
    titulo(doc, "4. Toma de requerimientos", 1)
    titulo(doc, "4.1 Roles del sistema", 2, False)
    parrafo(doc, "El tipo de cuenta decide el alcance de cada persona. Los permisos finos se ajustan por cuenta con casillas.")
    tabla(doc, ["Tipo de cuenta", "Alcance", "Restricciones"], [
        ("Administrador general", "Todo el sistema, incluida Administración.", "Solo el administrador principal ejecuta las acciones más delicadas (con su contraseña)."),
        ("Gerencia", "Los módulos que se le marquen; solo lectura.", "No escribe; las funciones sueltas no se le asignan, salvo Vista de cliente."),
        ("Administrador de área", "Plantilla típica de su área, ajustable.", "No accede a Administración."),
        ("Analista", "Módulos de su trabajo diario (laboratorio, carga de datos).", "Sin Administración."),
        ("Muestreador", "Toma de muestras: crear y ver sus solicitudes.", "Solo ve lo suyo."),
        ("Comercial", "Report, Storage, Panel de control interno y Solicitudes e informes de sus plantas.", "Solo lectura y solo sus plantas (o todas, si se marca)."),
        ("Cliente", "Report y Storage de su Sold To / Ship To y especies.", "Solo lectura; nunca ve módulos internos ni límites."),
    ], [3.5, 6.5, 6.0], "Tipos de cuenta")
    titulo(doc, "4.2 Requisitos funcionales por módulo", 2, False)
    tabla(doc, ["Módulo", "Requisito principal"], [
        ("Toma de muestras", "Crear, editar y enviar solicitudes; listar con filtros; ver el informe de cada solicitud."),
        ("AgroFresh Lab › Ingreso", "Cruzar la muestra con su solicitud con escáner, peso y foto; registrar fortificados."),
        ("AgroFresh Lab › Verificaciones", "Registrar y juzgar las verificaciones diarias de equipos con criterios congelados por día."),
        ("AgroFresh Lab › Envío de informes", "Leer el PDF, armar la lista de distribución y enviar, con modo prueba y producción."),
        ("Ingreso de Informes", "Cargar informes por Excel, Converter o correo, homogeneizados contra Listados."),
        ("Report", "Consultar resultados con filtros, gráficos y descarga de la base en Excel."),
        ("Panel de control interno", "Medir entrega, rendimiento de calidad y límites residuales."),
        ("Post Venta", "Cargar y consultar los informes de Accu-Tab y entregarlos al cliente."),
        ("Storage", "Explorar archivos con permisos por carpeta."),
        ("Administración", "Gestionar usuarios, listas de distribución, funciones, avisos y plan de entregables."),
        ("Monitoreo", "Ver quién está conectado, qué hizo y cuánto tiempo usó el sistema."),
    ], [5.0, 11.0], "Requisitos funcionales principales")
    titulo(doc, "4.3 Requisitos no funcionales", 2, False)
    viñetas(doc, [
        ("Seguridad: ", "OAuth y credenciales solo en el backend; los datos de un cliente se acotan en el servidor, "
                        "nunca por lo que pida el navegador."),
        ("Trazabilidad: ", "toda acción relevante queda en una bitácora; las cargas se pueden deshacer."),
        ("Compatibilidad hacia atrás: ", "un cambio de formato no puede reescribir lo ya emitido."),
        ("Disponibilidad: ", "backend como tarea programada de Windows con 4 workers y túnel Cloudflare."),
        ("Responsive: ", "el portal de clientes se prueba en teléfono vertical y horizontal, tableta y escritorio."),
        ("Privacidad: ", "las pruebas automáticas nunca tocan servicios reales (R2, Gmail, Resend ni la base de producción)."),
    ])


def capitulo_5(doc, datos):
    titulo(doc, "5. Desarrollo del proyecto", 1)
    parrafo(doc, (
        f"El repositorio se creó en GitHub el 11 de agosto de 2026. Hasta el 30 de octubre, el trabajo suma "
        f"{datos['prs']} pull requests en 11 semanas, {datos['migraciones']} migraciones de base de datos y "
        f"{datos['tablas']} tablas."))
    titulo(doc, "5.1 Flujo de ramas y publicación", 2, False)
    parrafo(doc, "El trabajo se hace en una rama de desarrollo y se publica a la rama estable mediante pull request.")
    bloque_codigo(doc, [
        "# Servidor de la oficina (siempre desde main)",
        "git checkout main",
        "git pull origin main",
        "",
        "# Reiniciar el backend (el código nuevo no entra solo)",
        'Stop-ScheduledTask -TaskName "AgroFresh Report Hub - Backend"',
        "Start-Sleep -Seconds 3",
        'Start-ScheduledTask -TaskName "AgroFresh Report Hub - Backend"',
    ])
    titulo(doc, "5.2 Cronograma real", 2, False)
    parrafo(doc, "El historial de pull requests permite reconstruir el ritmo real de trabajo semana a semana.")
    tabla(doc, ["Semana", "Fechas", "PR", "Foco principal"], datos["semanas"], [1.6, 3.4, 1.4, 9.6],
          "Pull requests y foco por semana", alinear=["c", "l", "c", "l"])
    figura(doc, PNG / "grafico_prs_semana.png", "Pull requests abiertos por semana", ancho_cm=15.5)
    titulo(doc, "5.3 Equipo y roles", 2, False)
    nota(doc, "Los nombres y roles definitivos (Product Owner, Scrum Master y equipo) se completan a mano.", "Por completar")
    tabla(doc, ["Participante", "Rol", "Aporte"], [
        ("Jorge Sandoval", "Desarrollo y administrador principal del sistema", "Diseño, programación, pruebas y puesta en producción."),
        ("Claude Code (asistente de programación con IA)", "Apoyo al desarrollo", "Implementación de funciones, pruebas y documentación bajo la dirección del autor."),
        ("[Nombre]", "Product Owner", "[Por completar]"),
        ("[Nombre]", "Scrum Master", "[Por completar]"),
        ("[Nombre]", "Laboratorio de cromatografía", "[Por completar]"),
        ("[Nombre]", "Toma de muestras", "[Por completar]"),
        ("[Nombre]", "Comercial", "[Por completar]"),
        ("[Nombre]", "Gerencia de operaciones", "[Por completar]"),
    ], [5.0, 5.0, 6.0], "Equipo del proyecto")
    pagina_con_figura(doc, datos, "5.4 Diagrama de Gantt", "gantt", "Cronograma de desarrollo, 11 de agosto al 30 de octubre de 2026",
                      "Cada barra es una semana de trabajo según el historial de pull requests de GitHub.", nivel=2, horizontal=True)


def _dimensiones(arch):
    from PIL import Image

    with Image.open(PNG / f"{arch}.png") as im:
        return im.size[0] / 2, im.size[1] / 2  # píxeles CSS del diagrama (se dibujó al doble)


def pagina_con_figura(doc, datos, tit, arch, leyenda_txt, desc, nivel=3, horizontal=None):
    """Una página con título, descripción y el diagrama, en la orientación donde se lee más grande."""
    from lib_docx import nueva_seccion

    w, h = _dimensiones(arch)
    cm_vert = min(16.4 / w, 20.0 / h)
    cm_horiz = min(25.8 / w, 12.6 / h)
    if horizontal is None:
        horizontal = cm_horiz > cm_vert * 1.08
    k = min(cm_horiz if horizontal else cm_vert, 0.0265 * 1.4)
    nueva_seccion(doc, horizontal, datos["logo"], datos["encabezado"])
    titulo(doc, tit, nivel, False)
    parrafo(doc, desc)
    figura(doc, PNG / f"{arch}.png", leyenda_txt, ancho_cm=w * k, alto_max_cm=(12.6 if horizontal else 20.0))


def capitulo_6(doc, datos):
    from lib_docx import nueva_seccion

    logo, txt = datos["logo"], datos["encabezado"]
    nueva_seccion(doc, False, logo, txt)
    titulo(doc, "6. Modelo de vistas 4+1", 1, False)
    parrafo(doc, "Este capítulo documenta la arquitectura desde las cuatro vistas del modelo y su vista de escenarios. "
                 "Cada diagrama ocupa una página, en la orientación en que se lee mejor. Todos están disponibles "
                 "como diagramas editables en FigJam y su código fuente está en docs/documentacion/diagramas.")

    # ---- Vista lógica
    titulo(doc, "6.1 Vista lógica", 2, False)
    parrafo(doc, (
        f"La base de datos PostgreSQL tiene {datos['tablas']} tablas, creadas con {datos['migraciones']} "
        "migraciones numeradas. Se documentan en nueve diagramas entidad-relación agrupados por dominio. Las "
        "líneas punteadas son relaciones lógicas: varias tablas del laboratorio se unen por el nombre del "
        "archivo de la solicitud y no por una llave foránea."))
    tabla(doc, ["Diagrama", "Dominio", "Tablas principales"], [
        ("6.1.1", "Catálogo y cargas", "cliente, planta, solicitud, carga_datos"),
        ("6.1.2", "Resultados y analitos", "resultado, producto_aplicado, analito, analito_limite"),
        ("6.1.3", "Solicitudes de toma de muestras", "solicitud_archivo, envio_solicitud_log, cruce_foto, lab_actividad, fortificado"),
        ("6.1.4", "Informes y envío al cliente", "informe_auditoria, informe_fecha_manual, envio_informe_log"),
        ("6.1.5", "Informes por correo", "correo_informe, correo_informe_visto, correo_informe_sondeo"),
        ("6.1.6", "Usuarios y notificaciones", "usuario, sesion, storage_permiso, notificacion"),
        ("6.1.7", "Monitoreo y actividad", "presencia, presencia_sesion, actividad_usuario"),
        ("6.1.8 y 6.1.9", "Verificaciones diarias", "verif_registro y las mediciones de cada equipo"),
    ], [2.6, 5.0, 8.4], "Diagramas entidad-relación por dominio")
    logicas = [
        ("6.1.1 Catálogo y cargas", "er1a_catalogo", "Modelo entidad-relación del catálogo, las solicitudes y las cargas",
         "Cliente (Sold To) y planta (Ship To) forman el catálogo oficial. Cada solicitud es un informe de laboratorio y pertenece a una planta; cada carga de datos registra lo que insertó."),
        ("6.1.2 Resultados y analitos", "er1b_resultados", "Modelo entidad-relación de los resultados y los analitos",
         "Un informe contiene resultados (uno por analito) y productos aplicados. Los límites se definen por analito, especie y tipo de servicio."),
        ("6.1.3 Solicitudes de toma de muestras", "er2a_solicitud", "Modelo entidad-relación de las solicitudes de toma de muestras",
         "El índice de solicitudes apunta al Excel guardado en R2. De él cuelgan los envíos al laboratorio, las fotos del cruce y la actividad del laboratorio."),
        ("6.1.4 Informes y envío al cliente", "er2b_informes", "Modelo entidad-relación de los informes y su envío al cliente",
         "Los PDF de los laboratorios, la fecha de envío anotada a mano para informes propios y el historial de envíos al cliente."),
        ("6.1.5 Ingreso de informes por correo", "er3_correo", "Modelo entidad-relación del ingreso de informes por correo",
         "Informes que llegan al buzón, correos ya examinados, revisiones del buzón y correcciones aprendidas."),
        ("6.1.6 Usuarios, permisos y notificaciones", "er4_usuarios", "Modelo entidad-relación de usuarios y notificaciones",
         "Cuentas, sesiones, permisos por carpeta de Storage y notificaciones."),
        ("6.1.7 Monitoreo y actividad", "er5_monitoreo", "Modelo entidad-relación de monitoreo y actividad",
         "Presencia en línea, visitas de conexión y bitácora de actividad."),
        ("6.1.8 Verificaciones: volumen y peso", "er6a_volumen_peso", "Modelo entidad-relación de las verificaciones de micropipetas y balanza",
         "Registro del día con las mediciones de micropipetas y balanza, y el bloqueo por sección."),
        ("6.1.9 Verificaciones: equipos", "er6b_equipos", "Modelo entidad-relación de las verificaciones de temperatura, gases, inyector y detector",
         "El mismo registro del día con las mediciones de temperatura, gases, inyector y detector."),
    ]
    for tit, arch, leyenda_txt, desc in logicas:
        pagina_con_figura(doc, datos, tit, arch, leyenda_txt, desc)

    # ---- Vista de procesos
    pagina_con_figura(doc, datos, "6.2 Vista de procesos", "bpmn_a_solicitud", "Proceso: de la solicitud al informe del laboratorio",
                      "El proceso central recorre cuatro responsables. Primero, el muestreo y el laboratorio: se crea y se envía la solicitud, "
                      "se cruza la muestra, se analiza y se emite el informe.", nivel=2, horizontal=False)
    pagina_con_figura(doc, datos, "6.2.1 Del informe al cliente", "bpmn_b_informe", "Proceso: del informe en el buzón a la entrega al cliente",
                      "Luego, el Report Hub y la entrega. La decisión de revisión del envío es el punto de control: un envío en rojo nunca se carga.",
                      horizontal=False)
    pagina_con_figura(doc, datos, "6.2.2 Ciclo de vida de una solicitud", "estados_solicitud", "Estados de una solicitud y su informe",
                      "Cada solicitud avanza por estos estados; algunos se pueden revertir, como quitar la muestra o devolver un informe rechazado a pendiente.",
                      horizontal=False)
    secuencias = [
        ("6.2.3 Inicio de sesión", "sec1_login", "Secuencia del inicio de sesión",
         "El servidor nunca responde 401 por motivos distintos a una sesión vencida: el navegador cierra la sesión ante cualquier 401."),
        ("6.2.4 Crear y enviar una solicitud", "sec2_solicitud", "Secuencia de creación y envío de una solicitud",
         "El folio OT se reserva por laboratorio; el envío puede ser automático o manual."),
        ("6.2.5 Del correo a Report", "sec3_correo_report", "Secuencia de un informe desde el buzón hasta Report",
         "El buzón se abre solo en modo lectura. Aceptar es la única puerta por la que un informe del correo entra a Report."),
        ("6.2.6 Envío de informes al cliente", "sec4_envio_informes", "Secuencia del envío de informes al cliente",
         "En modo prueba todo sale solo a los destinatarios de prueba, con (PRUEBA) en el asunto."),
        ("6.2.7 Verificación diaria de equipos", "sec5_verificaciones", "Secuencia de la verificación diaria",
         "El cálculo existe en el frontend y en el backend; el del backend es el que se guarda."),
        ("6.2.8 Carga con el Converter", "sec6_converter", "Secuencia de la carga de informes con el Converter",
         "Cada carga queda registrada y se puede deshacer, salvo que otra carga haya agregado resultados a sus informes."),
    ]
    for tit, arch, leyenda_txt, desc in secuencias:
        pagina_con_figura(doc, datos, tit, arch, leyenda_txt, desc)

    # ---- Vista de desarrollo
    pagina_con_figura(doc, datos, "6.3 Vista de desarrollo", "componentes", "Componentes del backend y del frontend por dominio",
                      f"El backend tiene {datos['routers']} módulos Python en app/ y el frontend se organiza en "
                      f"{datos['features']} carpetas de funcionalidad (features) con sus vistas. Cada dominio tiene su router "
                      "en el backend y su carpeta de funcionalidad en el frontend.", nivel=2)

    # ---- Vista física
    pagina_con_figura(doc, datos, "6.4 Vista física y de despliegue", "arquitectura", "Arquitectura y despliegue del sistema",
                      "El frontend se publica en Vercel; el backend y PostgreSQL corren en un servidor de la oficina "
                      "(Windows) detrás de un túnel Cloudflare. R2 guarda archivos y respaldos, no es base de datos.", nivel=2)

    # ---- Escenarios
    pagina_con_figura(doc, datos, "6.5 Vista de escenarios", "cu1_laboratorio", "Casos de uso del muestreador y del analista de laboratorio",
                      "Los casos de uso por tipo de cuenta conectan las otras cuatro vistas. Primero, el personal de terreno y de laboratorio.",
                      nivel=2, horizontal=False)
    pagina_con_figura(doc, datos, "6.5.1 Administración y gerencia", "cu2_administracion", "Casos de uso del administrador general y de gerencia",
                      "El administrador general tiene acceso a Administración y a todos los módulos; gerencia consulta lo que se le marque, en solo lectura.",
                      horizontal=False)
    pagina_con_figura(doc, datos, "6.5.2 Clientes y comerciales", "cu3_externos", "Casos de uso del comercial y del cliente",
                      "Ambos usan el portal de solo lectura acotado a sus plantas; el comercial además abre Solicitudes e informes y el Panel de control interno de sus plantas.",
                      horizontal=False)
