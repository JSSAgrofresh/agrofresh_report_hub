"""Capítulos 1 a 5 ampliados, decisiones de diseño, operación y mantenimiento, y bibliografía con citas."""
from __future__ import annotations

from lib_docx import bloque_codigo, nota, parrafo, tabla, titulo, viñetas, figura
import contenido_a as A


def P(doc, *textos):
    for t in textos:
        parrafo(doc, t)


# =====================================================================================================
def capitulo_1(doc, datos):
    titulo(doc, "1. Introducción", 1)
    titulo(doc, "1.1 Contexto", 2, False)
    P(doc,
      "Chile es uno de los principales exportadores de fruta fresca del hemisferio sur. Para llegar a los mercados de destino, la fruta debe "
      "cumplir exigencias sanitarias que varían según el país y el cliente: límites máximos de residuos de plaguicidas, como los que fija la "
      "Unión Europea (Parlamento Europeo y Consejo, 2005), y requisitos de inocuidad microbiológica, como los de la ley estadounidense de "
      "modernización de la seguridad alimentaria (FDA, 2011), conocida como FSMA. Cumplirlas exige medir: cada temporada, las plantas "
      "empacadoras toman muestras de fruta y de agua y las envían a laboratorios que informan cuánto residuo o qué microorganismos se "
      "detectaron.",
      "AgroFresh Chile presta servicios de poscosecha a esa industria. Dentro de su operación participan el laboratorio de cromatografía propio "
      "y laboratorios externos con los que trabaja (Quiteca, ALS Global y Diagnofruit). Cada resultado pertenece a un cliente (Sold To), a una "
      "planta de ese cliente (Ship To), a una especie y a un tipo de servicio (Línea de proceso, Actimist, Ecofog o RYD), y debe llegar a las "
      "personas correctas: el cliente, su técnico, su comercial y el equipo interno.",
      "Hasta antes de este sistema, ese flujo vivía repartido en planillas Excel con macros, correos individuales y carpetas de archivos. La "
      "información no se podía cruzar con facilidad, los informes llegaban por correo sin un control sistemático de a quién se enviaban y no "
      "había un lugar donde un cliente pudiera consultar sus propios resultados. Cada paso dependía del conocimiento de una persona.")
    titulo(doc, "1.2 Planteamiento del problema", 2, False)
    P(doc,
      "El problema puede resumirse en cuatro dolores concretos. Primero, la fragmentación: la solicitud del análisis, el ingreso de la muestra, "
      "el informe del laboratorio y el envío al cliente se registraban en lugares distintos sin una identificación común. Segundo, la calidad del "
      "dato: los nombres de clientes, plantas, especies y variedades se escribían de formas diferentes en cada informe (por ejemplo «Cereza» y "
      "«Cerezas», o un Ship To con un espacio doble), lo que impedía agrupar y comparar. Tercero, el control de los envíos: no había forma de "
      "saber si el laboratorio había enviado un informe a las personas correctas o a gente ajena a la lista del cliente. Cuarto, la visibilidad "
      "para el cliente: no existía un portal donde consultar sus informes y gráficos de residuos.")
    titulo(doc, "1.3 Importancia y contribución", 2, False)
    titulo(doc, "1.3.1 Eficiencia y productividad", 3, False)
    P(doc,
      "La solicitud de análisis se genera una sola vez y de ella salen el PDF, el Excel, el JSON y el correo al laboratorio, con su lista de "
      "distribución ya resuelta. Los informes que llegan al buzón se leen, se cruzan con su solicitud por el número de OT y se cargan a la base "
      "por el mismo camino que usa la carga manual, con la posibilidad de deshacer cada carga. La persona que antes digitaba o corregía "
      "resultados hoy revisa y aprueba.")
    titulo(doc, "1.3.2 Trazabilidad y control", 3, False)
    P(doc,
      "Cada solicitud, informe, envío y carga queda registrado con su autor y su fecha. Lo ya emitido no se reescribe: los cambios de formato "
      "de una solicitud quedan detrás de una marca guardada en sus datos, de modo que las solicitudes antiguas se siguen viendo como se emitieron. "
      "Esa disciplina de no alterar el pasado es lo que permite confiar en el sistema como registro de laboratorio.")
    titulo(doc, "1.3.3 Comunicación con el cliente", 3, False)
    P(doc,
      "Los clientes y los comerciales entran a un portal de solo lectura acotado a sus propias plantas y especies, donde ven sus informes, gráficos "
      "de residuos, análisis FSMA y de fitopatología, y los informes de Post Venta (Accu-Tab). El cliente deja de depender de un correo para "
      "consultar un resultado anterior.")
    titulo(doc, "1.3.4 Calidad del dato", 3, False)
    P(doc,
      "Todo lo que se carga se valida contra los Listados oficiales de Sold To, Ship To, especie y variedad. Lo que no calza no se inserta: queda en "
      "una bandeja de filas pendientes donde se corrige a mano y el sistema aprende la corrección para la próxima vez. Con el tiempo, la base se "
      "limpia sola.")
    titulo(doc, "1.4 Objetivos", 2, False)
    titulo(doc, "1.4.1 Objetivo general", 3, False)
    P(doc,
      "Construir una plataforma web que gestione el ciclo completo de los análisis de laboratorio de AgroFresh: solicitud, ingreso de la "
      "muestra, recepción y carga del informe, envío al cliente y consulta de resultados, con trazabilidad y control de acceso por tipo de cuenta.")
    titulo(doc, "1.4.2 Objetivos específicos", 3, False)
    viñetas(doc, [
        "Emitir solicitudes de toma de muestras por laboratorio, con folio correlativo, documentos adjuntos y envío por correo a la lista de distribución correcta.",
        "Registrar el ingreso de la muestra al laboratorio y cruzarla con su solicitud.",
        "Reemplazar el control diario de equipos en Excel con macros por un registro validado (verificaciones diarias, REG-03).",
        "Recibir los informes de los laboratorios, leerlos, cruzarlos con su solicitud y cargarlos a la base homogeneizados contra Listados.",
        "Enviar los informes propios al cliente con su lista de distribución y un modo de prueba seguro.",
        "Entregar a clientes y comerciales un portal acotado a sus plantas con gráficos y descargas.",
        "Dar al área interna indicadores de entrega, rendimiento de calidad y uso del sistema.",
        "Administrar usuarios, permisos, listas de distribución y funciones sin tocar la base a mano.",
    ])
    titulo(doc, "1.5 Alcance y limitaciones", 2, False)
    P(doc, "Este documento describe el sistema tal como está en producción al 30 de octubre de 2026. Quedan fuera del alcance actual, por decisión "
           "de negocio o por dependencia de terceros:")
    viñetas(doc, [
        ("Límites residuales: ", "son decisión del laboratorio. El sistema los carga desde la tabla del laboratorio y nunca los inventa."),
        ("Informes de ALS y Diagnofruit: ", "los lectores del Converter se probaron con informes reales de octubre de 2026; faltan más muestras para endurecerlos."),
        ("Plan de entregables de los comerciales: ", "se carga por Sold To; nueve clientes del plan aún no tienen nombre oficial en Listados."),
        ("Envío masivo de avisos a clientes: ", "el aviso existe y se puede probar, pero el envío a los clientes no está habilitado hasta definir la audiencia."),
        ("Reglas por confirmar con el laboratorio: ", "criterio de cumplimiento de FSMA y si el nivel «Moderado» de fitopatología cumple."),
    ])
    titulo(doc, "1.6 Estructura del documento", 2, False)
    P(doc,
      "El documento sigue el enfoque Scrum++ definido en la memoria de título del autor. El capítulo 2 explica los marcos y herramientas; el 3 "
      "describe a AgroFresh y sus servicios; el 4 recoge los requerimientos; el 5 narra el desarrollo semana a semana; el 6 es el corazón "
      "técnico, con las cuatro vistas del modelo 4+1 y la vista de escenarios; el 7 describe cada módulo en detalle; los capítulos 8 y 9 "
      "especifican las historias de usuario y los casos de uso; el 10 explica las decisiones de diseño, el 11 cómo se opera y mantiene el "
      "sistema y el 12 es el manual de usuario, con capturas de pantalla; el 13 trata las pruebas, el 14 la retrospectiva y el 15 las conclusiones. "
      "Al final están la bibliografía y cuatro anexos.")


# =====================================================================================================
def capitulo_2(doc, datos):
    titulo(doc, "2. Marco teórico y metodología", 1)
    P(doc,
      "Este capítulo explica los marcos de trabajo, las notaciones y las ideas de arquitectura que se usaron para construir y documentar el "
      "sistema. Se mantiene el enfoque Scrum++ definido en la memoria de título del autor: la agilidad de Scrum combinada con el modelo de vistas "
      "arquitectónicas 4+1.")
    titulo(doc, "2.1 Metodología de trabajo", 2, False)
    titulo(doc, "2.1.1 Scrum", 3, False)
    P(doc,
      "Scrum es un marco ligero para desarrollar productos complejos de forma incremental. Su idea central es trabajar en iteraciones de "
      "duración fija llamadas sprints, al final de las cuales el equipo entrega un incremento utilizable del producto, y usar esa entrega para "
      "aprender y ajustar (Schwaber y Sutherland, 2020). En lugar de planificar todo al comienzo, se mantiene una lista ordenada de lo que "
      "falta construir y se decide, sprint a sprint, qué parte se hace.",
      "El marco se sostiene en tres artefactos: el Product Backlog, la lista ordenada de todo lo que el producto podría necesitar; el Sprint "
      "Backlog, el subconjunto que el equipo se compromete a completar en el sprint; y el incremento, el resultado utilizable. Y en cinco "
      "eventos: la planificación del sprint (Sprint Planning), la reunión diaria de sincronización (Daily Scrum), el sprint mismo, la revisión "
      "(Sprint Review), donde se muestra lo construido, y la retrospectiva (Sprint Retrospective), donde el equipo analiza cómo trabajó "
      "(Hurtado Sáez, 2021).")
    titulo(doc, "2.1.2 Perfiles de Scrum", 3, False)
    tabla(doc, ["Perfil", "Responsabilidad"], [
        ("Product Owner", "Define y prioriza el Product Backlog, maximiza el valor del producto y representa la voz del cliente."),
        ("Equipo de desarrollo", "Diseña, construye y prueba el producto; es autoorganizado y multidisciplinario."),
        ("Scrum Master", "Guía al equipo en la práctica de Scrum y elimina los obstáculos que aparezcan."),
    ], [4.0, 12.0], "Perfiles del equipo Scrum")
    P(doc, "En este proyecto, la dirección del producto la ejerce quien conoce la operación del laboratorio y de los clientes, y el desarrollo es "
           "realizado por el autor con apoyo de herramientas de programación asistida. Los nombres concretos se completan en la sección 5.3.")
    titulo(doc, "2.1.3 Stakeholders", 3, False)
    P(doc,
      "Los stakeholders son las personas o grupos con interés directo o indirecto en el proyecto. Gestionarlos bien significa conocer qué "
      "espera cada uno del sistema. En AgroFresh Report Hub son: el laboratorio de cromatografía, que quiere registrar y validar sus controles; "
      "los muestreadores, que necesitan pedir análisis sin errores; la gerencia de operaciones, que quiere medir entrega y calidad; el equipo "
      "comercial, que necesita seguimiento de sus clientes; el equipo de Post Venta, que gestiona informes de equipos; los clientes, que "
      "quieren sus resultados; y los laboratorios externos, que entregan sus informes por correo.")
    titulo(doc, "2.1.4 Modelo de vistas 4+1", 3, False)
    P(doc,
      "El modelo 4+1 fue propuesto por Kruchten (1995) a partir de un problema práctico: un único diagrama no alcanza para describir la "
      "arquitectura de un sistema, porque distintas personas necesitan ver cosas distintas. Por eso describe el sistema desde cuatro vistas "
      "y las conecta con una quinta formada por escenarios. La vista lógica muestra la funcionalidad y la estructura de los datos que el sistema "
      "ofrece al usuario. La vista de procesos muestra cómo fluyen los procesos y cómo se comunican los componentes. La vista de desarrollo "
      "muestra cómo se organiza el software en módulos. La vista física muestra dónde corre cada pieza. Y los escenarios, expresados como "
      "casos de uso, enlazan las cuatro anteriores: a partir de un caso de uso se puede seguir qué datos, qué procesos, qué módulos y qué "
      "equipos lo hacen posible (Bass et al., 2003).")
    tabla(doc, ["Vista", "Qué muestra", "Diagramas usados aquí"], [
        ("Lógica", "La funcionalidad y la estructura de los datos que el sistema ofrece.", "Modelo entidad-relación (12 diagramas)"),
        ("De procesos", "Cómo fluyen los procesos y cómo se comunican los componentes.", "Proceso BPMN, diagrama de estados y 6 secuencias"),
        ("De desarrollo", "Cómo se divide el software en módulos y paquetes.", "Componentes del backend y del frontend"),
        ("Física", "Dónde corre cada pieza y cómo se conectan.", "Arquitectura y despliegue"),
        ("Escenarios (+1)", "Los casos de uso que unen las otras cuatro vistas.", "Casos de uso por rol y especificación"),
    ], [3.0, 7.0, 6.0], "Vistas del modelo 4+1 y diagramas que las representan")
    titulo(doc, "2.1.5 Scrum++", 3, False)
    P(doc,
      "Scrum++ es la combinación de los dos enfoques anteriores. Scrum aporta la forma de trabajar —iteraciones cortas, backlog, entregas "
      "frecuentes— y el modelo 4+1 aporta la forma de documentar. En la práctica significa que cada incremento se acompaña de las vistas "
      "que lo describen, de modo que la documentación no es un trabajo aparte al final sino una consecuencia del desarrollo. Esa es la razón "
      "por la que este documento puede regenerarse desde el repositorio.")
    titulo(doc, "2.1.6 BPMN y UML", 3, False)
    P(doc,
      "BPMN (Business Process Model and Notation) es el estándar del Object Management Group para modelar procesos de negocio; usa eventos de "
      "inicio y fin, actividades, decisiones (compuertas) y carriles que separan a los responsables (OMG, 2014). UML es el lenguaje unificado de "
      "modelado para sistemas de software, con diagramas estructurales (clases, componentes, despliegue) y de comportamiento (casos de uso, "
      "secuencia, estados) (Booch et al., 1999). Los diagramas de este documento siguen esas convenciones adaptadas a las herramientas "
      "usadas; donde la herramienta no ofrece la notación estricta —por ejemplo, un diagrama de casos de uso en FigJam— se dibuja con el "
      "equivalente más cercano y se indica.")
    titulo(doc, "2.1.7 Historias de usuario y casos de uso", 3, False)
    P(doc,
      "Las historias de usuario describen una necesidad desde el punto de vista de quien la tiene, con el formato «como [rol] quiero [algo] para "
      "[beneficio]» (Cohn, 2004); son breves y se priorizan en el backlog. Los casos de uso, en cambio, detallan la interacción entre un actor "
      "y el sistema paso a paso, con sus flujos alternativos y de error (Cockburn, 2001). Este proyecto usa ambos: las historias para ordenar el "
      "trabajo (capítulo 8) y los casos de uso para especificar el comportamiento (capítulo 9).")

    titulo(doc, "2.2 Conceptos de arquitectura aplicados", 2, False)
    titulo(doc, "2.2.1 Arquitectura cliente-servidor y API REST", 3, False)
    P(doc,
      "El sistema separa un cliente (el navegador, con una aplicación React) de un servidor (el backend). Se comunican mediante una API con "
      "estilo REST: recursos identificados por rutas, operaciones expresadas con los verbos HTTP y respuestas sin estado, donde cada petición "
      "lleva su propia credencial (Fielding, 2000). Esa separación permite publicar el frontend y el backend de forma independiente y usar el "
      "mismo backend para el portal de clientes y para el personal.")
    titulo(doc, "2.2.2 Modelo relacional y modelo entidad-relación", 3, False)
    P(doc,
      "Los datos se guardan en una base relacional, donde la información se organiza en tablas relacionadas por claves (Codd, 1970). Para "
      "diseñarla y explicarla se usa el modelo entidad-relación (Chen, 1976): entidades que corresponden a tablas, atributos a columnas y "
      "relaciones con su cardinalidad. Los doce diagramas de la sección 6.1 siguen esa notación.")
    titulo(doc, "2.2.3 Almacenamiento de objetos", 3, False)
    P(doc,
      "Los archivos (Excel de solicitudes, PDF de informes, fotos de muestras y respaldos) no se guardan en la base sino en un almacenamiento de "
      "objetos, Cloudflare R2. Un almacenamiento de objetos no tiene carpetas reales: cada archivo es un objeto con una clave que contiene "
      "barras, y una «carpeta» es solo un prefijo. Esto condiciona cómo se renombran y mueven carpetas en el explorador de Storage.")
    titulo(doc, "2.2.4 Aplicación de página única y aplicación instalable", 3, False)
    P(doc,
      "El frontend es una aplicación de página única (SPA): el navegador descarga la aplicación una vez y cambia de pantalla sin recargar. El "
      "Monitoreo, además, se puede instalar como aplicación (PWA) gracias a un manifiesto y a un service worker mínimo (MDN, 2025).")
    titulo(doc, "2.2.5 Control de acceso", 3, False)
    P(doc,
      "El control de acceso del sistema sigue la idea de «denegar por defecto»: un router nuevo nace cerrado a clientes y comerciales y solo se "
      "abre a propósito. Además, los datos que ve una cuenta externa se acotan por dentro, en el servidor, nunca por lo que pida el navegador. "
      "Esto responde a la categoría de riesgo de control de acceso roto que encabeza la lista de OWASP (2021).")
    titulo(doc, "2.2.6 Correo electrónico: SMTP e IMAP", 3, False)
    P(doc,
      "El envío de correo usa el protocolo SMTP (Klensin, 2008) y la lectura del buzón de informes usa IMAP (Crispin, 2003). El buzón se "
      "abre en modo de solo lectura y se leen los mensajes sin marcarlos (BODY.PEEK), de modo que el sistema nunca altera lo que está en el "
      "buzón.")
    titulo(doc, "2.2.7 Calidad de software", 3, False)
    P(doc,
      "Para describir los requisitos no funcionales se usan las características de calidad del modelo ISO/IEC 25010 (2011): adecuación "
      "funcional, eficiencia de desempeño, compatibilidad, usabilidad, fiabilidad, seguridad, mantenibilidad y portabilidad. El capítulo 4 las "
      "relaciona con el sistema. Para entregar cambios con frecuencia y poco riesgo se sigue la práctica de entrega continua (Humble y "
      "Farley, 2010): cambios pequeños, pruebas automáticas y una rama estable siempre lista para publicar.")

    titulo(doc, "2.3 Herramientas y tecnologías", 2, False)
    tabla(doc, ["Capa", "Tecnología", "Por qué se usa"], [
        ("Frontend", "React 19, Vite, TypeScript estricto, React Router 7, Chart.js 4", "Interfaz web con tipos estrictos; Chart.js dibuja los gráficos; CSS Modules con tokens de diseño."),
        ("Backend", "Python, FastAPI, psycopg2 (SQL directo), Pydantic v2", "API rápida con validación de datos; SQL directo para controlar cada consulta; sin ORM."),
        ("Base de datos", "PostgreSQL", "Base relacional robusta para informes, resultados, usuarios y actividad."),
        ("Archivos", "Cloudflare R2 y disco del servidor", "R2 para archivos y respaldos; el disco para el explorador de Storage."),
        ("Documentos", "openpyxl y ReportLab", "Generan los Excel y los PDF de solicitudes e informes."),
        ("Correo", "Gmail (SMTP e IMAP) y Resend", "Envío de solicitudes e informes y lectura del buzón de informes."),
        ("Publicación", "Vercel y túnel Cloudflare", "Frontend en Vercel; backend en el servidor de la oficina."),
        ("Pruebas", "pytest, Vitest, Testing Library, Playwright", "Pruebas automáticas y revisión visual en un navegador real."),
        ("Control de versiones", "Git y GitHub", "Ramas, pull requests e historial."),
        ("Diagramas", "FigJam y Mermaid", "Diagramas editables y su versión para el documento."),
    ], [3.0, 5.5, 7.5], "Tecnologías del sistema")
    P(doc, "La documentación oficial de cada una está en la bibliografía (React, 2025; FastAPI, 2025; PostgreSQL Global Development Group, 2025; "
           "Vite, 2025; Vitest, 2025; pytest, 2025; Playwright, 2025; Chart.js, 2025; Cloudflare, 2025; Vercel, 2025; Mermaid, 2025). Cada una de "
           "estas elecciones se justifica con más detalle en el capítulo 10, Decisiones de diseño.")


# =====================================================================================================
def capitulo_3(doc, datos):
    titulo(doc, "3. Descripción de la organización", 1)
    titulo(doc, "3.1 Historia", 2, False)
    nota(doc, "Este apartado se completa con la historia oficial de AgroFresh Chile (fundación, hitos y evolución del laboratorio).", "Por completar")
    titulo(doc, "3.2 Visión y proyección", 2, False)
    P(doc,
      "La marca AgroFresh se presenta con el lema «Science. Solutions. Sustainability.» (ciencia, soluciones, sostenibilidad). El sistema se alinea "
      "con esa visión: ordena la ciencia del laboratorio en soluciones concretas para el cliente y reduce el uso de papel y de procesos manuales.")
    titulo(doc, "3.3 El flujo del negocio", 2, False)
    P(doc,
      "El negocio que el sistema apoya puede contarse como una historia en seis pasos. Primero, una planta del cliente necesita saber cuánto residuo "
      "tiene su fruta o si su agua cumple una norma; un muestreador de AgroFresh toma la muestra y emite una solicitud de análisis. Segundo, esa "
      "solicitud viaja al laboratorio —el propio de AgroFresh o uno externo— con los datos de la muestra. Tercero, la muestra llega al "
      "laboratorio y se registra su ingreso. Cuarto, el laboratorio analiza y emite un informe. Quinto, el informe vuelve a AgroFresh, que lo "
      "revisa, lo carga a su base y lo envía al cliente. Sexto, el cliente consulta sus resultados y AgroFresh mide cuánto demoró y qué tan bien "
      "salió todo.",
      "El sistema cubre cada uno de esos pasos con un módulo propio, y los conecta con un identificador común, la OT (orden de trabajo) de la "
      "solicitud, que viaja impresa en el informe del laboratorio y permite reunir todo lo que corresponde a una misma muestra.")
    titulo(doc, "3.4 Áreas y tipos de servicio", 2, False)
    P(doc,
      "AgroFresh organiza su oferta en tipos de servicio. Cada uno tiene su propio listado de clientes y plantas y su propia lista de "
      "distribución de resultados, aunque todos comparten el mismo sistema. La regla vive en un solo lugar del código y se espeja en el frontend.")
    tabla(doc, ["Tipo de servicio", "Qué es", "Particularidades en el sistema"], [
        ("Línea de proceso", "Análisis de fruta en las líneas de proceso de las plantas de los clientes.", "Es el servicio por defecto; usa el listado general de Sold To y Ship To."),
        ("Actimist", "Servicio de aplicación con su propio listado de clientes y plantas.", "Listado y lista de distribución propios; referentes fijos en Para."),
        ("Ecofog", "Copia de Actimist con listado propio.", "Mismas reglas de correo que Actimist."),
        ("RYD", "Servicio con lista de distribución propia sobre el listado general.", "Para: Carla y Fran; Jorge y el Report Hub en copia."),
        ("Post Venta (Accu-Tab)", "Informes de equipos Accu-Tab de Trace y de costo por kilo del C&M-500.", "Informe PDF generado automáticamente y portal del cliente."),
    ], [3.4, 6.0, 6.6], "Tipos de servicio que maneja el sistema")
    titulo(doc, "3.5 Laboratorios", 2, False)
    P(doc,
      "El sistema trabaja con cuatro laboratorios. AgroFresh es el laboratorio propio de cromatografía y emite informes que no pasan por el Converter. "
      "Quiteca es un laboratorio externo de análisis de residuos y envía sus informes por correo con la OT impresa. ALS Global realiza los "
      "análisis microbiológicos FSMA (principalmente de agua) y Diagnofruit los análisis de fitopatología, con una página por muestra. Cada uno "
      "tiene su lector de PDF, su plazo de entrega por análisis y sus propios folios.")
    titulo(doc, "3.6 Políticas de trabajo", 2, False)
    viñetas(doc, [
        "Se trabaja en una rama de desarrollo; la rama principal (main) es la estable y la que está en producción.",
        "Cada cambio se publica con un pull request a main; Vercel publica el frontend solo.",
        "En el servidor de la oficina se hace git pull origin main y se reinicia el backend.",
        "Los cambios que necesitan migración de base de datos se publican junto con ella y se corren antes de reiniciar.",
        "Los scripts que escriben en la base primero miran y solo aplican con --aplicar.",
        "Nunca se escriben credenciales en el código ni se versionan archivos .env.",
    ])


# =====================================================================================================
def capitulo_4(doc, datos):
    titulo(doc, "4. Toma de requerimientos", 1)
    titulo(doc, "4.1 Roles del sistema", 2, False)
    P(doc,
      "El tipo de cuenta decide el alcance de cada persona. Los permisos finos se ajustan por cuenta con casillas, organizadas por categoría. Esta "
      "separación entre un tipo que fija el alcance general y casillas que lo afinan permite dar a cada persona lo que necesita y nada más.")
    tabla(doc, ["Tipo de cuenta", "Alcance", "Restricciones"], [
        ("Administrador general", "Todo el sistema, incluida Administración.", "Solo el administrador principal ejecuta las acciones más delicadas (con su contraseña)."),
        ("Gerencia", "Los módulos que se le marquen; solo lectura.", "No escribe; las funciones sueltas no se le asignan, salvo Vista de cliente."),
        ("Administrador de área", "Plantilla típica de su área, ajustable.", "No accede a Administración."),
        ("Analista", "Módulos de su trabajo diario (laboratorio, carga de datos).", "Sin Administración."),
        ("Muestreador", "Toma de muestras: crear y ver sus solicitudes.", "Solo ve lo suyo."),
        ("Comercial", "Report, Storage, Panel de control interno y Solicitudes e informes de sus plantas.", "Solo lectura y solo sus plantas (o todas, si se marca)."),
        ("Cliente", "Report y Storage de su Sold To / Ship To y especies.", "Solo lectura; nunca ve módulos internos ni límites."),
    ], [3.5, 6.5, 6.0], "Tipos de cuenta")
    titulo(doc, "4.2 Requisitos funcionales", 2, False)
    P(doc,
      "Los requisitos funcionales se numeran con el prefijo RF y el módulo al que pertenecen. Cada uno se traza a las historias de usuario del "
      "capítulo 8 y a los casos de uso del capítulo 9.")
    rf = [
        ("RF-TM-01", "Crear una solicitud de análisis con folio OT correlativo por laboratorio."),
        ("RF-TM-02", "Generar el Excel, el PDF y el JSON de cada solicitud."),
        ("RF-TM-03", "Calcular los destinatarios de resultados (Para, CC y CCO) según servicio, planta y especie."),
        ("RF-TM-04", "Enviar la solicitud al laboratorio por correo, de forma manual o automática por tipo de servicio."),
        ("RF-TM-05", "Listar solicitudes con filtros acumulables y mostrar el informe de cada una."),
        ("RF-TM-06", "Crear solicitudes de prueba y muestras internas sin alterar los folios reales."),
        ("RF-AL-01", "Cruzar la muestra con su solicitud escaneando el código, con peso y foto."),
        ("RF-AL-02", "Registrar fortificados con número y peso."),
        ("RF-AL-03", "Registrar y juzgar las verificaciones diarias de equipos con criterios congelados por día."),
        ("RF-AL-04", "Firmar la revisión del día."),
        ("RF-AL-05", "Enviar informes propios al cliente con modo prueba y producción."),
        ("RF-IN-01", "Cargar informes por Excel y por Converter, validados contra Listados."),
        ("RF-IN-02", "Registrar cada carga y permitir deshacerla."),
        ("RF-IN-03", "Mantener una bandeja de filas pendientes y aprender las correcciones."),
        ("RF-IN-04", "Leer el buzón de informes en solo lectura y cruzar cada informe con su solicitud."),
        ("RF-IN-05", "Aceptar un informe del correo, salvo que su envío esté en rojo."),
        ("RF-RP-01", "Consultar resultados por bloques de análisis con filtros generales y específicos."),
        ("RF-RP-02", "Abrir la ficha de un informe con su PDF."),
        ("RF-RP-03", "Descargar la base de resultados en Excel acotada al alcance de la cuenta."),
        ("RF-PC-01", "Medir el lead time de solicitud a informe y el rendimiento de calidad por cliente y semana."),
        ("RF-PC-02", "Mostrar límites residuales y los informes fuera de rango."),
        ("RF-PV-01", "Generar el informe PDF de cada carga de Accu-Tab y entregarlo al cliente."),
        ("RF-PV-02", "Calcular y mostrar el costo por kilo del equipo C&M-500."),
        ("RF-ST-01", "Explorar archivos con permisos por carpeta y vista previa."),
        ("RF-AD-01", "Administrar cuentas, funciones sueltas, listas de distribución, funciones y avisos."),
        ("RF-MO-01", "Mostrar quién está conectado, qué hizo y cuánto tiempo usó el sistema."),
    ]
    tabla(doc, ["ID", "Requisito"], rf, [2.4, 13.6], "Requisitos funcionales principales", tam=9)
    titulo(doc, "4.3 Requisitos no funcionales", 2, False)
    P(doc,
      "Los requisitos no funcionales se agrupan según las características de calidad de ISO/IEC 25010 (2011). La tabla muestra qué se pide y "
      "cómo lo cumple el sistema.")
    tabla(doc, ["Característica", "Requisito", "Cómo se cumple"], [
        ("Seguridad", "Los datos de un cliente nunca deben verlos otros clientes.", "El servidor acota por dentro; las credenciales viven solo en el .env del backend; la contraseña del administrador principal se verifica en el servidor."),
        ("Fiabilidad", "Una carga errónea debe poder revertirse.", "Cada carga se registra con su carga_id y se puede deshacer; los scripts miran primero y escriben solo con --aplicar."),
        ("Compatibilidad", "Un cambio de formato no puede reescribir lo emitido.", "Todo cambio detrás de una marca guardada en los datos de la solicitud."),
        ("Usabilidad", "El portal debe funcionar en teléfono y respetar el movimiento reducido.", "Diseño responsive probado en cuatro tamaños; animaciones apagadas con prefers-reduced-motion."),
        ("Eficiencia", "El portal debe desplazarse con fluidez.", "Se evitaron efectos de desenfoque animados; los datos ya traídos se guardan en memoria por sesión."),
        ("Mantenibilidad", "La lógica delicada debe poder probarse sin base de datos.", "Funciones puras con pruebas; 126 archivos de prueba en el backend y 154 en el frontend."),
        ("Portabilidad", "El sistema debe correr en el servidor de la oficina (Windows).", "El backend corre como tarea programada de Windows, con zoneinfo y tzdata declarados."),
        ("Adecuación funcional", "El sistema debe cubrir el ciclo completo del análisis.", "Doce módulos que cubren desde la solicitud hasta la consulta del cliente."),
    ], [3.0, 5.4, 7.6], "Requisitos no funcionales según ISO/IEC 25010")


# =====================================================================================================
SEMANAS_TEXTO = [
    ("Semanas 1 y 2 (11 al 24 de agosto, 5 pull requests)",
     "El proyecto nació con el andamiaje de una aplicación React con Vite y TypeScript y una estructura de carpetas por funcionalidad (el primer "
     "pull request, abierto el 12 de agosto). Son las semanas de menor volumen porque se definieron las bases: el formato del código, las pruebas "
     "y la forma de organizar el trabajo."),
    ("Semana 3 (25 al 31 de agosto, 57)",
     "Se montó la infraestructura de fondo. El correo pasó de SMTP a la API HTTP de Resend (y luego se ajustó para evitar un bloqueo de Cloudflare), "
     "se integró Cloudflare R2 para guardar las solicitudes y la configuración, y se optimizó la carga de datos precargando catálogos en memoria "
     "para eliminar consultas por cada fila y los tiempos de espera."),
    ("Semana 4 (1 al 7 de septiembre, 51)",
     "Llegó el cruce de la muestra guiado por escáner en el módulo de emisión de informes, se rediseñó el informe final para que fuera más sobrio y "
     "técnico, se corrigió la exportación de la ficha completa con el número de muestra y se hizo que el sistema aguantara estar actualizado sin "
     "haber corrido todavía una migración."),
    ("Semana 5 (8 al 14 de septiembre, 64)",
     "Se trabajó la experiencia de Solicitudes: vista de tarjetas en móvil, tinte verde y filtro de estado para las enviadas, fotos de muestra por cámara, "
     "carpetas de R2 por Ship To y el CSG dividido. En datos, apareció el chequeo de integridad contra Listados en Data Core y el homogenizador "
     "inteligente, y el checklist de analitos pasó a agruparse por análisis y no por categoría."),
    ("Semana 6 (15 al 21 de septiembre, 50)",
     "Se agregó la descarga del JSON de cada solicitud y se limpió el JSON adjunto (sin metadata interna ni correos del propio sistema). Se incorporó el "
     "analito requerido, los correos de Actimist y un script para sembrar productos, y la especie pasó a mostrarse en la tabla de destinatarios."),
    ("Semana 7 (22 al 28 de septiembre, 36)",
     "El envío de correo migró de Gmail OAuth a Gmail SMTP con contraseña de aplicación. Se agregaron las áreas de Toma de muestras y de R y D, el rol de "
     "gerencia, las solicitudes de reanálisis (migración 0038) con su plantilla editable, el nuevo flujo de ingesta con el homogenizador visual y el "
     "módulo único de Ingesta de Datos, que reemplazó a Cargar Datos y Auditoría."),
    ("Semana 8 (29 de septiembre al 5 de octubre, 83)",
     "Se completaron las bases en Excel con los datos de la solicitud de Toma de muestras, apareció la memoria de correcciones del Converter y la "
     "Auditoría interna con sus donas y el gráfico de análisis contra informes por cliente. También se hizo editable el encabezado del correo "
     "de informes y se acordó el formato corto del aviso de despliegue."),
    ("Semana 9 (6 al 12 de octubre, 60)",
     "Se construyó Post Venta: el informe PDF automático de Accu-Tab idéntico al de Trace, su orden por cliente y fecha en R2, la tabla de informes y el "
     "portal donde el cliente ve sus informes. Además, se completaron desde su PDF los informes de Quiteca ya cargados."),
    ("Semana 10 (13 al 19 de octubre, 95)",
     "La semana de mayor volumen. Aparecieron el lector del plan de entregables de los comerciales, la marca manual de «enviado al cliente», el hito "
     "«reporte observado», el flujograma del lead time, el permiso para modificar los criterios de verificaciones y el peso hueso de la muestra."),
    ("Semana 11 (20 al 26 de octubre, 89)",
     "Se creó la cuenta de comercial con sus plantas (migración 0063), se construyó el ingreso de informes por correo con su tablero y su aceptación "
     "(migraciones 0064 a 0067), el marco visual nuevo del portal de clientes con sus estilos, el módulo de rendimiento de calidad y el Monitoreo "
     "con su presencia y sus sesiones (migraciones 0068 a 0070). Las cuentas de cliente pasaron a admitir varias plantas y especies."),
    ("Semana 12 (27 al 30 de octubre, 41)",
     "Se terminó la Vista de cliente para el administrador general y la simulación de 300 datos, se rediseñó el reporte de Accu-Tab como un Report de "
     "laboratorio, se agregó el módulo de Costo por kilo del equipo C&M-500, la muestra interna (migración 0071) y se reordenó Storage → Informes "
     "por planta, laboratorio y fecha, con la carpeta de solicitudes visible solo para el personal."),
]


def capitulo_5(doc, datos):
    titulo(doc, "5. Desarrollo del proyecto", 1)
    P(doc,
      f"El repositorio se creó en GitHub el 11 de agosto de 2026. Hasta el 30 de octubre, el trabajo suma {datos['prs']} pull requests en 11 "
      f"semanas, {datos['migraciones']} migraciones de base de datos y {datos['tablas']} tablas. Este capítulo cuenta cómo se organizó el trabajo y "
      "qué se construyó en cada semana.")
    titulo(doc, "5.1 Flujo de ramas y publicación", 2, False)
    P(doc,
      "El trabajo se hace en una rama de desarrollo y se publica a la rama estable mediante pull request. Cada push a la rama de desarrollo genera una "
      "vista previa en Vercel para mirar el resultado antes de publicar; esa vista previa usa el mismo backend y la misma base de producción, por lo "
      "que lo que se guarde ahí es real. Cuando algo está listo se abre un pull request a main y se fusiona; Vercel publica producción solo. "
      "En el servidor de la oficina se actualiza con un pull de main y se reinicia el backend. El servidor nunca queda en la rama de desarrollo.")
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
    P(doc, "Esta forma de trabajar —cambios pequeños, una rama estable y publicaciones frecuentes— sigue la práctica de entrega continua "
           "descrita por Humble y Farley (2010).")
    titulo(doc, "5.2 Cronograma real", 2, False)
    P(doc, "El historial de pull requests permite reconstruir el ritmo real de trabajo semana a semana. La tabla y el gráfico resumen el volumen; la "
           "sección 5.3 cuenta qué se construyó en cada semana.")
    tabla(doc, ["Semana", "Fechas", "PR", "Foco principal"], datos["semanas"], [1.6, 3.4, 1.4, 9.6],
          "Pull requests y foco por semana", alinear=["c", "l", "c", "l"])
    figura(doc, A.PNG / "grafico_prs_semana.png", "Pull requests abiertos por semana", ancho_cm=15.5)
    titulo(doc, "5.3 Qué se construyó cada semana", 2, False)
    for tit, txt in SEMANAS_TEXTO:
        titulo(doc, tit, 3, False)
        P(doc, txt)
    titulo(doc, "5.4 Equipo y roles", 2, False)
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
    A.pagina_con_figura(doc, datos, "5.5 Diagrama de Gantt", "gantt", "Cronograma de desarrollo, 11 de agosto al 30 de octubre de 2026",
                        "Cada barra es una semana de trabajo según el historial de pull requests de GitHub.", nivel=2)


# =====================================================================================================
def capitulo_decisiones(doc, datos):
    titulo(doc, "10. Decisiones de diseño y evolución técnica", 1)
    P(doc,
      "Un sistema es el resultado de decisiones, muchas veces tomadas con información incompleta y corregidas después. Este capítulo recoge "
      "las decisiones que más condicionan el sistema, qué alternativas existían y qué consecuencias tuvieron. Sirve para que quien herede el "
      "proyecto entienda por qué las cosas son así antes de cambiarlas. Varias responden a un mismo principio de la arquitectura limpia: "
      "mantener la lógica de negocio separada de los detalles de entrada y salida, de modo que pueda probarse sin la base de datos "
      "ni el correo (Martin, 2017).")
    titulo(doc, "10.1 Registro de decisiones", 2, False)
    tabla(doc, ["Decisión", "Contexto y razón", "Consecuencia"], [
        ("SQL directo, sin ORM", "El equipo necesitaba controlar cada consulta y sus filtros de alcance, que son delicados para el portal de clientes.", "Más código SQL escrito a mano, pero cada consulta de un cliente lleva a la vista su filtro de planta."),
        ("PostgreSQL en el servidor de la oficina", "Se abandonaron Render y Neon; el servidor ya existía y el volumen de datos es acotado.", "La base y el backend comparten máquina; hace falta respaldar (respaldar.ps1) y cuidar la disponibilidad de la oficina."),
        ("Cloudflare R2 solo para archivos", "Excel, PDF, fotos y respaldos no caben bien en la base y R2 no cobra salida de datos.", "R2 no es base de datos; el índice de solicitudes se mantiene en una tabla reconstruible."),
        ("Backend como tarea programada con túnel", "La oficina no expone puertos; el túnel de Cloudflare es la única entrada.", "Hay un límite de unos 100 segundos por petición, lo que obligó a correr la revisión del buzón en segundo plano."),
        ("Marcas en los datos para lo ya emitido", "El PDF y el Excel se regeneran al abrirse; cambiar el diseño reescribiría lo ya emitido.", "Cada cambio de formato añade una marca (pdf_solo_analisis, mixto_desde_2, respaldo_ryd, json_als_v2, hoja_informe_v1, muestra_interna)."),
        ("Cálculo de verificaciones en dos lugares", "El frontend necesita pintar el veredicto mientras se escribe y el backend debe decidir lo que se guarda.", "Dos implementaciones que se prueban con los mismos casos."),
        ("Criterios congelados por día", "Cambiar una tolerancia tumbó días ya aprobados.", "Cada sección guarda los criterios con los que se juzgó."),
        ("Aprender de las correcciones, no autocrear", "Crear clientes o plantas al vuelo ensucia el catálogo.", "Lo que no calza queda pendiente y la corrección humana se recuerda."),
        ("Una sola lista de permisos (modulos)", "Cada permiso nuevo no debía exigir una migración.", "Módulos, funciones sueltas y marcas conviven en una columna; la lógica de normalización las separa."),
        ("Acotar por dentro y lista blanca para comerciales", "Un router abierto a sesiones puede filtrar datos de otros clientes si olvida acotar.", "Un router nuevo nace cerrado; para abrir una ruta a comerciales hay que agregarla a RUTAS_COMERCIAL con su acotado y su prueba."),
        ("Un envío en rojo nunca se carga", "El informe llegó a personas ajenas al cliente y no debe ingresar como si todo estuviera bien.", "Solo se puede resolver, marcar como informado o rechazar."),
        ("Contraseña del principal en el servidor", "Una verificación solo en la pantalla se puede saltar.", "Las acciones delicadas responden 403, y nunca 401, que cerraría la sesión."),
        ("No usar blur ni backdrop-filter en lo grande", "Un fondo desenfocado y animado bajaba el desplazamiento a 20 cuadros por segundo.", "Fondos con degradados radiales; se midió con Playwright y Tracing."),
        ("Nombres antiguos tras un renombre", "Ingesta de Datos pasó a llamarse Ingreso de Informes y Auditoría interna, Panel de control interno.", "Cambió lo que se ve; rutas, permisos y carpetas conservan el nombre antiguo."),
    ], [3.8, 6.2, 6.0], "Registro de decisiones de diseño", tam=8.5)
    titulo(doc, "10.2 La evolución del correo", 2, False)
    P(doc,
      "El correo es el mejor ejemplo de una decisión que se corrigió varias veces. Al comienzo, el envío usaba SMTP directo. En la tercera semana "
      "se cambió a la API HTTP de Resend, y poco después se debió ajustar la librería de llamadas porque Cloudflare bloqueaba el agente por defecto "
      "(error 1010). Más adelante se probó Gmail con OAuth, y en la séptima semana se migró a Gmail SMTP con una contraseña de aplicación, que es "
      "más simple de operar. Hoy el sistema envía por Gmail y conserva Resend como alternativa.",
      "La lección práctica es que el proveedor de correo es un detalle cambiable: el resto del sistema solo conoce el módulo de correo. Por la "
      "misma razón, una clave rechazada por Gmail responde con un error 503 y no con un 401, que haría que quien envía una solicitud quedara "
      "fuera del sistema.")
    titulo(doc, "10.3 De carga manual a ingreso automático", 2, False)
    P(doc,
      "Las primeras versiones de la carga de datos eran un Excel que se subía y se revisaba. El Converter nació para leer los PDF de otros "
      "laboratorios. Con el tiempo se vio que la fuente real de los informes era el correo, y se construyó el ingreso por correo en etapas: "
      "primero solo leer y clasificar, luego aceptar con carga registrada y posibilidad de deshacer, luego homogeneizar igual de bien que el "
      "Converter y por último un tablero que ordena el trabajo del administrador. En todas las etapas se mantuvo un principio: la persona "
      "decide; el sistema propone. Un informe nunca se carga solo.")
    titulo(doc, "10.4 Lo que se decidió no hacer", 2, False)
    viñetas(doc, [
        "No inventar límites residuales: son del laboratorio.",
        "No volver a mostrar la tabla unificada de mediciones de Accu-Tab ni el filtro de período, que se quitaron a pedido.",
        "No volver a mostrar los gráficos de línea de tiempo de ALS y Diagnofruit: se probó y se prefirió una tabla y tortas; quedan apagados de fábrica.",
        "No poner permisos de Administración como casillas: no existen como id y nunca se reparten.",
        "No guardar datos de la API en el service worker: son resultados de laboratorio.",
    ])


# =====================================================================================================
def capitulo_operacion(doc, datos):
    titulo(doc, "11. Operación y mantenimiento", 1)
    P(doc,
      "Este capítulo es la guía de quien opera el sistema: dónde corre, cómo se actualiza, qué hacer cuando algo falla y qué trampas conocidas "
      "evitar. Todo lo que aquí se describe viene de problemas que ya ocurrieron.")
    titulo(doc, "11.1 Dónde corre cada pieza", 2, False)
    tabla(doc, ["Pieza", "Dónde corre", "Cómo se levanta"], [
        ("Frontend", "Vercel", "Se publica solo al fusionar a main; la rama de desarrollo genera vistas previas."),
        ("Backend", "Servidor de la oficina (Windows), 127.0.0.1:8000", "Tarea programada «AgroFresh Report Hub - Backend», con 4 workers; escribe en logs/backend.log."),
        ("PostgreSQL", "El mismo servidor", "Servicio de Windows; se respalda con deploy/windows/respaldar.ps1."),
        ("Túnel", "El mismo servidor", "Servicio de Cloudflare; es la única entrada desde Internet."),
        ("Archivos", "Cloudflare R2 y el disco del servidor", "R2 con credenciales en el .env del backend; el disco en STORAGE_DIR."),
    ], [2.8, 5.4, 7.8], "Dónde corre cada pieza")
    titulo(doc, "11.2 Procedimiento de actualización", 2, False)
    P(doc, "Cada cambio sigue el mismo orden. Primero se actualiza el código, luego se corren las migraciones si las hay, después se reinicia el backend y "
           "por último se corren los scripts de operación que el cambio necesite. Los comandos se separan por consola.")
    bloque_codigo(doc, [
        "# 1) Consola de pull",
        "git checkout main",
        "git pull origin main",
        "",
        "# 2) Consola .venv (solo si hay migración)",
        ".venv\\Scripts\\python.exe scripts\\migrar.py 0071_muestra_interna.sql",
        "",
        "# 3) Consola del backend",
        'Stop-ScheduledTask -TaskName "AgroFresh Report Hub - Backend"',
        "Start-Sleep -Seconds 3",
        'Start-ScheduledTask -TaskName "AgroFresh Report Hub - Backend"',
    ])
    nota(doc, "Los scripts que escriben en la base miran primero y solo aplican con --aplicar. Los que borran dejan un respaldo en la carpeta logs/.", "Regla")
    titulo(doc, "11.3 Respaldos", 2, False)
    P(doc,
      "La base se respalda con respaldar.ps1. Además, varias operaciones dejan su propio respaldo antes de escribir: las listas de distribución "
      "guardan contactos_laboratorio_respaldo con la fecha antes de cada cambio; los scripts de corrección dejan una copia en logs/; y la limpieza "
      "de informes de Storage mueve lo sobrante a una papelera reversible (informes_papelera) en lugar de borrarlo.")
    titulo(doc, "11.4 Diagnóstico", 2, False)
    P(doc, "El script estado.ps1 resume el estado general del servidor (backend, túnel, base). Si la pantalla dice «El backend que está corriendo "
           "todavía no conoce este módulo», probablemente haya dos backends vivos; el diagnóstico es este:")
    bloque_codigo(doc, [
        "Get-NetTCPConnection -LocalPort 8000 -State Listen    # tiene que salir UNA línea",
        "(Invoke-RestMethod http://localhost:8000/openapi.json).paths.PSObject.Properties.Name",
        ".\\deploy\\windows\\estado.ps1",
    ])
    titulo(doc, "11.5 Trampas conocidas", 2, False)
    P(doc, "Estas son las trampas que costaron tiempo. Cada una está en la memoria del proyecto para no volver a caer en ella.")
    tabla(doc, ["Trampa", "Síntoma", "Qué hacer"], [
        ("Dos backends en el puerto 8000", "Se reinicia y la pantalla sigue con el código viejo.", "Reiniciar la tarea programada; nunca arrancar uno a mano."),
        ("Gmail no quita la etiqueta de la carpeta abierta", "Cada corrida volvía a subir todos los correos de Accu-Tab.", "Se saca con \\Deleted y EXPUNGE y cada correo se anota por Message-ID."),
        ("Un transform atrapa position: fixed", "Un diálogo salía recortado dentro de una fila animada.", "Modal y Dialogo se dibujan con createPortal en document.body."),
        ("Finales de línea mezclados", "Un reemplazo no calza en emitir.py, toma_muestras.py o listados.py (CRLF).", "Editar en binario con un patrón tolerante a \\r?\\n."),
        ("Excel: tabla y autofiltro no conviven", "Excel pide reparar el archivo.", "Una tabla ya trae su filtro; no agregar auto_filter al mismo rango."),
        ("Agrofresh y AGROFRESH", "Un laboratorio aparece escrito de dos formas.", "Comparar siempre normalizando."),
        ("Un 401 cierra la sesión", "Quien envía una solicitud queda fuera del sistema.", "Responder 503 o 403 para otros errores."),
        ("µL en mayúsculas", "text-transform: uppercase convierte µL en ΜL, que se lee ML.", "Las unidades van en un span que las deja como están."),
        ("Encabezados HTTP no son UTF-8", "Un nombre de archivo con tildes llega roto.", "Usar filename* (RFC 5987) con un filename sin tildes."),
        ("Falta tzdata en Windows", "zoneinfo no encuentra las zonas.", "Está declarado en requirements.txt."),
        ("jsdom no evalúa media queries", "getByRole no encuentra un elemento oculto por @media.", "Probar en un navegador real con Playwright."),
        ("100vh en Chrome de Android", "Incluye la barra de direcciones.", "Usar dvh."),
    ], [4.2, 5.6, 6.2], "Trampas conocidas", tam=8.5)
    titulo(doc, "11.6 Variables de entorno", 2, False)
    P(doc, "El backend lee su configuración del archivo .env, que nunca se versiona. Por seguridad aquí solo se nombran las variables, nunca sus valores.")
    tabla(doc, ["Grupo", "Variables (nombres)", "Para qué"], [
        ("Gmail", "GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN", "Envío y lectura del correo."),
        ("Cloudflare R2", "Credenciales de R2 y R2_BUCKET (y las opcionales R2_AUDITORIA_*)", "Archivos y respaldos."),
        ("Servidor", "STORAGE_DIR", "Carpeta raíz del explorador de archivos."),
        ("Pruebas", "AGROFRESH_BD_PRUEBAS, SOLICITUDES_PRUEBA_EMAIL", "Base de pruebas y cuenta que puede crear solicitudes de prueba."),
    ], [3.0, 7.0, 6.0], "Variables de entorno por grupo")
    titulo(doc, "11.7 Seguridad operativa", 2, False)
    viñetas(doc, [
        "Nunca escribir credenciales en el código ni versionar archivos .env.",
        "Nunca exponer refresh tokens, client secrets ni claves de acceso en logs ni en el frontend.",
        "Todo OAuth ocurre solo en el backend.",
        "Los scripts que crean cuentas de clientes dejan un Excel con claves en logs/: es sensible y se borra al terminar.",
        "Antes de correr una limpieza, mirar la lista que deja en logs/.",
    ])


# =====================================================================================================
def bibliografia(doc, datos):
    titulo(doc, "16. Bibliografía", 1)
    P(doc, "Las referencias siguen el formato APA y se citan en el texto con el apellido del autor y el año.")
    refs = [
        "Bass, L., Clements, P., y Kazman, R. (2003). Software Architecture in Practice (2.ª ed.). Addison-Wesley.",
        "Booch, G., Rumbaugh, J., y Jacobson, I. (1999). The Unified Modeling Language User Guide. Addison-Wesley.",
        "Chen, P. P. (1976). The entity-relationship model: toward a unified view of data. ACM Transactions on Database Systems, 1(1), 9-36.",
        "Cockburn, A. (2001). Writing Effective Use Cases. Addison-Wesley.",
        "Codd, E. F. (1970). A relational model of data for large shared data banks. Communications of the ACM, 13(6), 377-387.",
        "Cohn, M. (2004). User Stories Applied: For Agile Software Development. Addison-Wesley.",
        "Crispin, M. (2003). RFC 3501: Internet Message Access Protocol, versión 4rev1. Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc3501",
        "Fielding, R. T. (2000). Architectural Styles and the Design of Network-based Software Architectures [Tesis doctoral, University of California, Irvine].",
        "Food and Drug Administration (FDA). (2011). FDA Food Safety Modernization Act (FSMA), Public Law 111-353. https://www.fda.gov/food/guidance-regulation-food-and-dietary-supplements/food-safety-modernization-act-fsma",
        "Humble, J., y Farley, D. (2010). Continuous Delivery: Reliable Software Releases through Build, Test, and Deployment Automation. Addison-Wesley.",
        "Hurtado Sáez, J. (2021). Cómo funciona la metodología Scrum: qué es y cómo utilizarla. IEBS. https://www.iebschool.com/blog/metodologia-scrum-agile-scrum/",
        "ISO/IEC. (2011). ISO/IEC 25010:2011 Systems and software engineering: Systems and software Quality Requirements and Evaluation (SQuaRE), System and software quality models.",
        "Klensin, J. (2008). RFC 5321: Simple Mail Transfer Protocol. Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc5321",
        "Kruchten, P. (1995). Architectural Blueprints: the «4+1» view model of software architecture. IEEE Software, 12(6), 42-50.",
        "Martin, R. C. (2017). Clean Architecture: A Craftsman's Guide to Software Structure and Design. Prentice Hall.",
        "MDN Web Docs. (2025). Progressive web apps. Mozilla. https://developer.mozilla.org/docs/Web/Progressive_web_apps",
        "Object Management Group (OMG). (2014). Business Process Model and Notation (BPMN), versión 2.0. https://www.omg.org/spec/BPMN/2.0/",
        "OWASP Foundation. (2021). OWASP Top 10:2021. https://owasp.org/Top10/",
        "Parlamento Europeo y Consejo de la Unión Europea. (2005). Reglamento (CE) n.º 396/2005 relativo a los límites máximos de residuos de plaguicidas en alimentos y piensos de origen vegetal y animal.",
        "Schwaber, K., y Sutherland, J. (2020). La Guía de Scrum. https://scrumguides.org/",
        "Chart.js. (2025). Chart.js documentation. https://www.chartjs.org/docs/",
        "Cloudflare. (2025). Cloudflare R2 y Cloudflare Tunnel: documentación. https://developers.cloudflare.com/",
        "FastAPI. (2025). FastAPI documentation. https://fastapi.tiangolo.com",
        "Mermaid. (2025). Mermaid documentation. https://mermaid.js.org",
        "Playwright. (2025). Playwright documentation. https://playwright.dev",
        "PostgreSQL Global Development Group. (2025). PostgreSQL documentation. https://www.postgresql.org/docs/",
        "pytest. (2025). pytest documentation. https://docs.pytest.org",
        "React. (2025). React documentation. https://react.dev",
        "Vercel. (2025). Vercel documentation. https://vercel.com/docs",
        "Vite. (2025). Vite documentation. https://vite.dev",
        "Vitest. (2025). Vitest documentation. https://vitest.dev",
    ]
    viñetas(doc, refs, "List Number")
