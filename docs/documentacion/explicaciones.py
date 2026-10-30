"""Explicación escrita de cada diagrama del capítulo 6: cómo leerlo y qué decisiones de diseño muestra."""

EXPLICACIONES = {
    "er1a_catalogo": [
        "Cómo leerlo. Cada caja es una tabla de PostgreSQL y cada línea una relación; el símbolo de «pata de gallo» indica «muchos». "
        "Un cliente (Sold To) tiene muchas plantas (Ship To) y cada planta origina muchas solicitudes, que en este diagrama son los informes "
        "de laboratorio ya cargados. No debe confundirse con la «solicitud de toma de muestras» del módulo del mismo nombre, que vive en "
        "otra tabla (solicitud_archivo) y se describe en la sección 6.1.3.",
        "El catálogo es la fuente de verdad. El nombre de un cliente es único y el de una planta es único dentro de su cliente. Todo lo que "
        "se carga se valida contra estas dos tablas: si un Sold To o un Ship To no calza, la fila no se inserta y queda en la bandeja de filas "
        "pendientes. Por eso planta_id puede ser nulo en las solicitudes de Actimist y Ecofog: esos servicios tienen su propio listado "
        "y guardan el nombre como texto (sold_to_raw y ship_to_raw) sin enlazarse nunca con una planta de Línea de proceso.",
        "La carga de datos como unidad de control. Cada vez que se carga un Excel o un PDF se anota una fila en carga_datos (quién, cuándo, de "
        "dónde, qué archivo y cuántas filas) y todo lo que esa carga insertó lleva su carga_id. Gracias a eso existe el botón «Deshacer»: "
        "borra exactamente lo de esa carga. La clave foránea usa ON DELETE SET NULL para que borrar el registro de una carga no arrastre los "
        "informes que ya se hicieron parte de la base.",
    ],
    "er1b_resultados": [
        "Cómo leerlo. Un informe (solicitud) contiene uno o más resultados, uno por analito medido, y uno o más productos aplicados, que "
        "registran qué producto y con qué dosis se aplicó a la fruta. El analito es el catálogo de sustancias que se miden y se identifica por la "
        "pareja código y laboratorio: el mismo código puede existir en AgroFresh y en Quiteca con unidad o límite de detección distintos.",
        "Valor numérico o texto. Un resultado guarda su valor en dos columnas, valor_num y valor_texto. Los laboratorios informan cosas como "
        "«<1», «ND» o «>100» que no son números; guardarlas como texto evita un error que existió al comienzo, cuando «<10» se convertía en 10 y "
        "se leía como un valor detectado. Cuando el nombre de un analito no existe en el catálogo, el texto original se conserva en analito_raw y "
        "el resultado queda sin enlace en lugar de perderse.",
        "Los límites. La tabla analito_limite permite definir un mínimo, un valor central y un máximo por analito, especie y tipo de servicio. "
        "Estos límites son una decisión del laboratorio y el sistema nunca los inventa: hoy la pantalla de Report usa una tabla estática "
        "tomada de la tabla oficial del laboratorio, y esta tabla de base de datos queda disponible para cuando se decida cargarlos allí.",
    ],
    "er2a_solicitud": [
        "Cómo leerlo. Este diagrama usa líneas punteadas porque las relaciones son lógicas: las tablas se unen por el nombre del archivo de la "
        "solicitud (la columna archivo) y no por una clave foránea. Es una decisión deliberada: solicitud_archivo es un índice que se puede "
        "reconstruir leyendo los Excel guardados en Cloudflare R2, y si estuviera atada por claves foráneas, reindexar sería peligroso.",
        "El índice. Cada solicitud de toma de muestras es un archivo Excel en R2 con una hoja de datos oculta. La tabla guarda además esos "
        "datos como JSON para poder filtrar y listar sin abrir cada archivo. De ella cuelgan el historial de envíos al laboratorio "
        "(destinatarios, resultado y error), las fotos del cruce de la muestra y la actividad del laboratorio (cruces, ediciones y "
        "acciones de quitar la muestra, con el antes y el después).",
        "Fortificados. La tabla fortificado no se relaciona con ninguna solicitud: un fortificado es una muestra de control que se prepara en el "
        "laboratorio, así que solo lleva su número, su peso y quién y cuándo lo ingresó.",
    ],
    "er2b_informes": [
        "Cómo leerlo. Aquí se ven los informes PDF y su recorrido hacia el cliente. informe_auditoria guarda cada PDF que sube el Converter y lo "
        "amarra a la solicitud por la OT; envio_informe_log guarda cada correo que el módulo Envío de informes mandó al cliente, con sus "
        "listas Para, CC y CCO y el modo (prueba o producción).",
        "Informes propios. Los informes que emite el propio laboratorio de AgroFresh no pasan por el Converter y por lo tanto no tienen "
        "fila en informe_auditoria. Para poder medir su demora, informe_fecha_manual permite anotar a mano la fecha y hora de envío de uno "
        "de ellos. El sistema los reconoce igual porque llegan a Report con la OT en la columna referencia.",
        "Trazabilidad hacia el cliente. Que un informe esté «enviado al cliente» se puede saber de tres maneras: un envío real en modo "
        "producción, una marca puesta a mano en el Converter o en Solicitudes e informes, o la fecha de envío del PDF. El indicador toma la más "
        "antigua de ellas.",
    ],
    "er3_correo": [
        "Cómo leerlo. correo_informe tiene una fila por cada PDF que llegó al buzón (un correo con tres informes genera tres filas). Se "
        "identifica por el Message-ID del correo y el hash SHA-256 del PDF, lo que permite saber si un informe es una copia nueva o un reenvío "
        "idéntico. Guarda lo que se esperaba (la lista de la solicitud), lo que se encontró y la lista de hallazgos, y con ellos el estado "
        "(verde, amarillo o rojo).",
        "La decisión de una persona. El informe nunca se carga solo: la columna decision pasa de pendiente a aceptado o rechazado por acción "
        "del administrador principal, y al aceptar queda el carga_id de lo que se cargó, lo que permite deshacer. Las columnas homogeneo y "
        "homogeneo_motivos dicen si el informe ya calza con Listados o qué falta corregir.",
        "Tres tablas de apoyo. correo_informe_visto es una libreta de lo ya examinado (incluso lo que se descartó, como un reenvío interno) "
        "para no leer dos veces el mismo correo; correo_informe_sondeo registra cada revisión del buzón con cuántos correos examinó y cuántos "
        "eran nuevos; correccion_converter es la memoria de correcciones que comparten el Converter y el correo.",
    ],
    "er4a_cuentas": [
        "Cómo leerlo. El usuario es el centro: de él cuelgan sus sesiones y sus permisos de carpeta. La tabla usuario concentra el tipo de "
        "cuenta, el área, el cliente y la planta de las cuentas externas y, sobre todo, tres listas: modulos, reportes y plantas_asignadas.",
        "Una sola lista para permisos. La columna modulos guarda tanto los módulos que la cuenta puede abrir como las funciones sueltas (por "
        "ejemplo toma_reanalisis) y la marca todas_las_plantas de un comercial. Se eligió así para no necesitar una migración cada vez que "
        "aparece un permiso nuevo. plantas_asignadas, en cambio, es un JSON con la lista de accesos de un comercial o de un cliente con varias "
        "plantas y especies: cada elemento tiene el nombre del cliente, de la planta y de la especie.",
        "Sesiones sin secretos. La tabla sesion guarda solo el hash del token, nunca el token, y se borra en cascada con el usuario. "
        "storage_permiso restringe una carpeta a una cuenta; una carpeta sin filas es abierta y con filas es restringida.",
    ],
    "er4b_notificaciones": [
        "Cómo leerlo. Una notificación es un aviso que se publica una vez y cada usuario la marca como leída por separado: la tabla "
        "notificacion_leida tiene como clave la pareja notificación y usuario.",
        "Quién recibe qué. Cada notificación lleva su tipo en un campo de metadata (solicitud, reanálisis, verificación, descarga del "
        "cromatógrafo, carga de datos o anuncio). La tabla notificacion_suscripcion guarda, por usuario, la lista de tipos que quiere recibir. "
        "Sin fila, la cuenta recibe lo que corresponde a su perfil; con la lista vacía, no tiene el módulo y no ve la campana.",
    ],
    "er5_monitoreo": [
        "Cómo leerlo. Estas tres tablas se unen al usuario por el correo, no por una clave foránea, porque el monitoreo no debe romperse si una "
        "cuenta se borra. presencia guarda solo la última señal de cada persona, mientras que presencia_sesion guarda una fila por visita y "
        "actividad_usuario guarda cada acción relevante.",
        "Visitas. Una visita continúa mientras no pasen más de 10 minutos desde la última señal; si pasan, se abre una nueva. El tiempo de "
        "uso (segundos_activos) suma solo los latidos en que la pestaña estaba a la vista y la persona había tocado algo hacía menos de tres "
        "minutos. Esa diferencia entre tiempo conectado y tiempo de uso es la que permite medir la adopción real del portal por los clientes.",
    ],
    "er6a_micropipetas": [
        "Cómo leerlo. Es el primero de cuatro diagramas de las verificaciones diarias del laboratorio. Un registro representa un día y es único por "
        "fecha. De él cuelgan las mediciones de cada equipo, y cada medición apunta al equipo que se midió.",
        "Micropipetas. Cada micropipeta tiene un volumen nominal y una tolerancia. La medición registra tres pesadas y el sistema calcula el "
        "volumen medio, la desviación y el error porcentual, y con eso el veredicto. El registro del día guarda además, en una columna JSON, los "
        "criterios con los que se juzgó ese día, de modo que cambiar una tolerancia más adelante no reescribe los días pasados.",
    ],
    "er6b_balanza": [
        "Cómo leerlo. La balanza se verifica con pesas patrón; cada pesa tiene un valor nominal y una tolerancia, y cada medición guarda tres "
        "lecturas con su promedio y desviación.",
        "Bloqueo por sección. La tabla verif_seccion_lock guarda, por fecha y sección, qué analista guardó y cuándo. Evita que dos personas "
        "pisen la misma sección y deja constancia de quién la trabajó. Limpiar una sección suelta el bloqueo y los criterios congelados.",
    ],
    "er6c_temperatura_gases": [
        "Cómo leerlo. Los puntos de temperatura (por ejemplo refrigeradores) tienen un mínimo y un máximo, y su medición guarda la lectura del día. "
        "Los gases (los cilindros del cromatógrafo) se miden por su presión de contenido y de trabajo, junto con el código del cilindro.",
        "Cada medición apunta al registro del día y a su equipo, y el par registro y equipo es único: no puede haber dos mediciones del mismo punto "
        "en el mismo día.",
    ],
    "er6d_inyector_detector": [
        "Cómo leerlo. El inyector y el detector son relaciones uno a uno con el registro del día: su clave primaria es el propio registro.",
        "Detector. Guarda el voltaje de la perla, si el método es el correcto y el output del detector. Por decisión del laboratorio (25 de "
        "septiembre de 2026), el output es solo un registro: se anota y se grafica pero no tiene rango ni decide el veredicto. Quedó así a propósito "
        "y no se le debe volver a poner un rango sin que el laboratorio lo pida.",
    ],
    "bpmn_a_solicitud": [
        "Cómo leerlo. El proceso va de arriba hacia abajo y se divide en dos responsables. El muestreo crea la solicitud y la envía; el "
        "laboratorio cruza la muestra con su solicitud, la analiza y emite el informe. El círculo redondeado superior es el inicio y el inferior "
        "el fin de esta parte del proceso.",
        "Qué decide cada paso. Al crear la solicitud se reserva el folio OT y se calculan los destinatarios de los resultados. Al cruzar la muestra "
        "en el Ingreso al laboratorio se registra la hora de recepción, el peso y la foto. El laboratorio emite entonces un informe PDF que "
        "envía al buzón del Report Hub, y ahí empieza el segundo diagrama.",
    ],
    "bpmn_b_informe": [
        "Cómo leerlo. Continúa el proceso anterior desde que el informe llega al buzón. El rombo es la decisión de control: se revisa si el "
        "envío del laboratorio fue correcto y si los datos calzan con Listados.",
        "Tres salidas. Si todo está bien, el informe se acepta y se carga. Si falta homogeneizar, se corrige a mano con ayuda del buscador de "
        "Listados y luego se acepta. Si el envío salió en rojo (por ejemplo, a personas ajenas a la lista del cliente), el informe nunca se carga: "
        "se rechaza o se pide el reenvío al laboratorio, y el ciclo vuelve al buzón. Tras aceptar, el informe queda visible para el cliente en "
        "Report y Storage y, si corresponde, se envía a la lista del cliente.",
    ],
    "estados_solicitud": [
        "Cómo leerlo. Cada rectángulo es un estado y cada flecha una acción que cambia el estado. El punto negro es el comienzo y el círculo "
        "con borde, el final.",
        "Reversibles y no reversibles. Dos estados admiten volver atrás: una muestra cruzada vuelve a «Enviada» si se quita la muestra, y un informe "
        "rechazado vuelve a «Informe recibido» si se devuelve a pendiente. Los estados finales del cliente (enviado y observado) se alcanzan "
        "por hechos medidos: «Observado» exige que alguna cuenta cliente haya abierto efectivamente los resultados de ese informe.",
    ],
    "sec1_login": [
        "Cómo leerlo. Cada columna es un participante y el tiempo avanza hacia abajo. Las flechas continuas son llamadas y las punteadas son "
        "respuestas. El bloque «alt» muestra dos caminos excluyentes.",
        "Detalle importante. El servidor guarda en la base el hash del token y no el token, y toda respuesta 401 hace que el navegador cierre la "
        "sesión; por eso, cuando una clave de Gmail es rechazada o una contraseña del administrador principal es incorrecta, el servidor responde 503 "
        "o 403 y nunca 401.",
    ],
    "sec2_solicitud": [
        "Cómo leerlo. El envío al laboratorio aparece como un bloque opcional porque depende de la configuración: el administrador puede "
        "encender el envío automático por tipo de servicio, y las solicitudes de prueba nunca se envían solas.",
        "Qué ocurre al guardar. El servidor reserva el folio correlativo del laboratorio, genera los tres documentos de la solicitud (Excel, PDF y "
        "JSON), guarda el Excel en R2 e indexa la solicitud. El envío arma tres listas: Para, CC y CCO; el creador de la solicitud siempre va en "
        "copia oculta y los técnicos y comerciales de la planta siempre van, tenga o no lista de distribución el laboratorio.",
    ],
    "sec3_correo_report": [
        "Cómo leerlo. La parte superior es automática (el sistema revisa el buzón y deja el informe pendiente) y la inferior es una decisión del "
        "administrador principal, con tres alternativas.",
        "Qué compara el sistema. Con la OT impresa en el PDF busca la solicitud y compara contra la lista esperada de destinatarios, la planta y "
        "el laboratorio. El buzón se abre solo en modo lectura: el sistema no marca, no mueve y no borra correos. Aceptar es la única puerta por "
        "la que un informe del correo entra a Report.",
    ],
    "sec4_envio_informes": [
        "Cómo leerlo. El analista nunca escribe destinatarios: sube los PDF, el sistema propone todo y él confirma. El bloque «alt» muestra la "
        "diferencia entre los dos modos del sistema.",
        "Modo prueba y producción. El sistema parte siempre en prueba. En prueba todo sale solo a los destinatarios de prueba, con la palabra "
        "(PRUEBA) en el asunto y un aviso arriba que dice a quién habría ido de verdad. Pasar a producción pide la contraseña de quien lo hace y se "
        "verifica en el servidor. Cada envío queda en envio_informe_log con sus destinatarios y su resultado.",
    ],
    "sec5_verificaciones": [
        "Cómo leerlo. Hay dos veredictos: el de la pantalla, que se calcula en el navegador mientras se escribe, y el del servidor, que se calcula "
        "al guardar y es el que queda guardado. Los dos usan los mismos casos de prueba para que nunca discrepen.",
        "Firma. Cuando el día está completo, el administrador de Cromatografía (o quien tenga la función de firma) lo revisa y lo firma; la firma "
        "anota quién revisó y genera una notificación para quienes la reciben.",
    ],
    "sec6_converter": [
        "Cómo leerlo. El Converter es un componente del navegador que lee los PDF en el propio equipo del analista. Primero pide una previsualización "
        "al servidor (que no escribe nada) y recién después, con la confirmación, se escribe en la base.",
        "Protecciones. El servidor avisa qué informes ya existen y deja decidir; un dato vacío nunca borra uno existente; lo que no calza con "
        "Listados queda como pendiente y nunca se auto-crea un cliente ni una planta. Cada carga puede deshacerse salvo que otra carga haya "
        "agregado resultados a sus informes.",
    ],
    "componentes": [
        "Cómo leerlo. A la izquierda, las carpetas de funcionalidad del frontend; al centro, los módulos del backend que atienden a cada una; a "
        "la derecha, los servicios comunes. Cada flecha es una dependencia.",
        "Un dominio, un router. El backend se organiza con un router de FastAPI por dominio (toma_muestras, reportes, correo_informes, etc.) y no "
        "usa un ORM: las consultas son SQL directo con psycopg2. Los servicios comunes son pequeños: db.py entrega las conexiones, r2.py "
        "habla con Cloudflare R2 y correo.py envía por Gmail o Resend. La lógica de negocio delicada se mantiene en funciones puras (por ejemplo "
        "los cálculos de verificaciones o la lectura de PDF) para poder probarla sin base de datos.",
    ],
    "arquitectura": [
        "Cómo leerlo. Va de arriba hacia abajo desde la persona hasta los datos. Las líneas punteadas son llamadas a servicios externos.",
        "Dónde corre cada pieza. El frontend se publica en Vercel; la rama estable genera producción y la rama de desarrollo genera vistas "
        "previas, que usan el mismo backend y la misma base. El backend y PostgreSQL corren en un servidor de la oficina (Windows) y el "
        "túnel de Cloudflare es la única entrada desde Internet. Cloudflare R2 guarda archivos y respaldos, no es base de datos. Se abandonaron "
        "Render y Neon: un servicio de Render activo sería huérfano. La revisión del buzón corre como un hilo del propio backend.",
    ],
    "cu1_laboratorio": [
        "Cómo leerlo. Cada óvalo a la izquierda es un tipo de cuenta y cada caja de la derecha, un caso de uso agrupado por módulo.",
        "El muestreador solo crea solicitudes y ve las suyas. El analista de laboratorio concentra AgroFresh Lab (ingreso, verificaciones y envío "
        "de informes) y la carga de datos. Ambos necesitan que el administrador les haya marcado los módulos correspondientes.",
    ],
    "cu2_administracion": [
        "Cómo leerlo. Muestra lo que pueden hacer las dos cuentas con más alcance. El administrador general accede a todo, incluida la sección de "
        "Administración, que no se reparte entre cuentas. Gerencia consulta lo que se le marque y nunca escribe.",
        "Algunas acciones son todavía más restringidas: cambiar el modo de Envío de informes a producción, encender qué servicios muestra Report o "
        "borrar el historial exigen la contraseña del administrador principal.",
    ],
    "cu3_externos": [
        "Cómo leerlo. Muestra el portal de solo lectura. El cliente y el comercial comparten Report, la descarga de la base, Storage y los informes de "
        "Accu-Tab, y el comercial además abre Solicitudes e informes y el Panel de control interno acotado a sus plantas.",
        "Ninguno de los dos puede crear, editar, subir ni borrar nada, y el servidor acota por dentro todo lo que muestran a las plantas y especies "
        "de su cuenta.",
    ],
    "gantt": [
        "Cómo leerlo. Cada fila es una semana de trabajo y su color indica la etapa del proyecto. El número a la derecha de cada barra es la "
        "cantidad de pull requests abiertos ese periodo. Las fechas del eje son lunes.",
        "Lectura del ritmo. Las dos primeras semanas fueron de andamiaje. La tercera concentra el trabajo de infraestructura (correo y R2) y desde "
        "entonces el ritmo se mantiene entre 36 y 95 pull requests por semana, con el máximo en la semana 10 (95), cuando se construyeron el plan "
        "de entregables, el lead time y las verificaciones, y la semana 11 (89), con el portal de clientes y el ingreso de informes por correo.",
    ],
}
