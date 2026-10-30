"""Capítulos 8 y 9: Product Backlog (historias de usuario) y especificación de casos de uso."""
from __future__ import annotations

from lib_docx import nota, parrafo, tabla, titulo, viñetas

H = "Hecha"
P = "Pendiente"

# (id, rol, "quiero ... para ...", prioridad, estado)
BACKLOG = {
    "Toma de muestras": [
        ("HU-TM-01", "Muestreador", "crear una solicitud de análisis con su folio OT para pedir el análisis al laboratorio", "Alta", H),
        ("HU-TM-02", "Muestreador", "enviar la solicitud al laboratorio por correo con su PDF, Excel y JSON para no escribir correos a mano", "Alta", H),
        ("HU-TM-03", "Muestreador", "ver solo mis solicitudes y su estado (Enviada o Pendiente) para saber qué falta", "Alta", H),
        ("HU-TM-04", "Administrador", "encender o apagar el envío automático por tipo de servicio para controlar qué sale solo", "Media", H),
        ("HU-TM-05", "Analista", "ver el informe de cada solicitud y si su OT está bien cruzada para detectar errores", "Alta", H),
        ("HU-TM-06", "Administrador", "editar una solicitud guardada solo con permiso y solo en tipos que no se envían solos para no reenviar por error", "Media", H),
        ("HU-TM-07", "Laboratorio", "crear una muestra interna de pulpa propia con campos libres para analizarla en cualquier laboratorio", "Media", H),
        ("HU-TM-08", "Administrador principal", "crear solicitudes de prueba con su propia serie para probar sin mover los folios reales", "Media", H),
        ("HU-TM-09", "Comercial", "ver las solicitudes e informes de mis plantas en solo lectura para hacer seguimiento a mis clientes", "Media", H),
        ("HU-TM-10", "Administrador", "crear un reanálisis a partir de una solicitud para repetir un análisis", "Baja", H),
        ("HU-TM-11", "Analista", "descargar varias solicitudes en un zip de PDF, JSON o Excel para revisarlas o reenviarlas", "Baja", H),
    ],
    "AgroFresh Lab": [
        ("HU-AL-01", "Analista", "escanear el código de la solicitud y cruzarla con su muestra para registrar su llegada", "Alta", H),
        ("HU-AL-02", "Analista", "anotar el peso extraído y el peso hueso de la muestra para que salgan en el informe y las bases", "Alta", H),
        ("HU-AL-03", "Analista", "corregir un cruce (N° de muestra, peso y foto) para arreglar errores sin perder la hora de recepción", "Media", H),
        ("HU-AL-04", "Analista", "registrar un fortificado con su número y peso para llevar su control", "Media", H),
        ("HU-AL-05", "Analista", "descargar la base en Excel de lo cruzado para cruzarla con otras planillas", "Media", H),
        ("HU-AL-06", "Analista", "registrar cada día las mediciones de los equipos por sección para cumplir el REG-03", "Alta", H),
        ("HU-AL-07", "Analista", "ver el veredicto mientras escribo para corregir en el momento", "Media", H),
        ("HU-AL-08", "Administrador de Cromatografía", "firmar la revisión del día para dejarla aprobada", "Alta", H),
        ("HU-AL-09", "Administrador de Cromatografía", "modificar los criterios sin alterar los días ya guardados para ajustar tolerancias sin reescribir la historia", "Media", H),
        ("HU-AL-10", "Analista", "ver el histórico de cada medición para detectar derivas de un equipo", "Media", H),
        ("HU-AL-11", "Analista", "subir el PDF de un informe y enviarlo al cliente con la lista correcta para no armar correos a mano", "Alta", H),
        ("HU-AL-12", "Analista", "probar el envío en modo prueba antes de pasar a producción para no enviar nada al cliente por error", "Alta", H),
        ("HU-AL-13", "Analista", "editar un correo individual sin cambiar los demás para casos especiales", "Baja", H),
        ("HU-AL-14", "Administrador principal", "ver el historial de envíos con sus destinatarios y resultado para auditar lo que salió", "Media", H),
    ],
    "Ingreso de Informes": [
        ("HU-IN-01", "Analista", "cargar un Excel validado contra Listados para que no entre información que no calza", "Alta", H),
        ("HU-IN-02", "Analista", "cargar los PDF de los laboratorios con el Converter para no digitar resultados", "Alta", H),
        ("HU-IN-03", "Analista", "saber si un informe ya existe antes de subirlo para decidir si actualizar o sacarlo", "Alta", H),
        ("HU-IN-04", "Analista", "deshacer una carga completa para corregir un error de carga", "Alta", H),
        ("HU-IN-05", "Analista", "resolver las filas pendientes sin volver a subir el archivo para no perder tiempo", "Alta", H),
        ("HU-IN-06", "Analista", "que el sistema aprenda mis correcciones para no repetirlas", "Media", H),
        ("HU-IN-07", "Administrador principal", "que los informes de los laboratorios se lean desde el buzón sin tocarlo para no depender de la carga manual", "Alta", H),
        ("HU-IN-08", "Administrador principal", "saber si el laboratorio envió bien el informe y a quién para reclamar los errores de envío", "Alta", H),
        ("HU-IN-09", "Administrador principal", "aceptar un informe en un clic para cargarlo sin pasos manuales", "Alta", H),
        ("HU-IN-10", "Administrador principal", "homogeneizar a mano un informe que no calza para poder cargarlo igual", "Media", H),
        ("HU-IN-11", "Administrador principal", "ver todos los informes y su estado en un solo lugar para saber qué falta o qué salió mal", "Alta", H),
        ("HU-IN-12", "Gerencia", "ver cuánto demora cada laboratorio en entregar para evaluar su servicio", "Media", H),
        ("HU-IN-13", "Administrador principal", "que el buzón se revise solo cada 5 minutos para no apretar un botón", "Media", P),
    ],
    "Report": [
        ("HU-RP-01", "Usuario interno", "consultar los resultados con filtros combinables para encontrar un informe", "Alta", H),
        ("HU-RP-02", "Usuario interno", "ver el gráfico de residuos por informe con una curva por analito para detectar tendencias", "Alta", H),
        ("HU-RP-03", "Cliente", "ver mis análisis FSMA y de fitopatología con tortas de presencia y nivel para entender mis resultados", "Alta", H),
        ("HU-RP-04", "Usuario", "abrir la ficha de un informe y ver su PDF para revisar el detalle", "Alta", H),
        ("HU-RP-05", "Cliente", "descargar la base de mis resultados en Excel para analizarlos por mi cuenta", "Media", H),
        ("HU-RP-06", "Cliente", "ver solo mis plantas y especies para que no se mezcle con otros clientes", "Alta", H),
        ("HU-RP-07", "Administrador principal", "simular datos en la Vista de cliente para probar el diseño sin tocar la base", "Baja", H),
        ("HU-RP-08", "Usuario interno", "filtrar Report con casillas de varios valores en todos los filtros para comparar más de uno", "Media", P),
        ("HU-RP-09", "Gerencia", "decidir si los límites residuales se muestran al cliente", "Baja", P),
    ],
    "Panel de control interno": [
        ("HU-PC-01", "Gerencia", "ver el lead time de solicitud a informe para medir el servicio", "Alta", H),
        ("HU-PC-02", "Gerencia", "ver el flujograma de cada solicitud con sus fechas para ubicar dónde se detiene", "Media", H),
        ("HU-PC-03", "Gerencia de operaciones", "ver por cliente y semana cuántos informes cumplen y cuántos no para actuar sobre el riesgo", "Alta", H),
        ("HU-PC-04", "Gerencia de operaciones", "abrir el detalle de una planta con sus informes y la variación contra el límite para entender por qué no cumple", "Media", H),
        ("HU-PC-05", "Administrador", "ver los límites residuales por especie y los informes fuera de rango para priorizar", "Alta", H),
        ("HU-PC-06", "Administrador", "comparar lo prometido por cada comercial con lo realizado para cumplir el plan de entregables", "Media", H),
        ("HU-PC-07", "Analista", "marcar un informe como enviado al cliente a mano para que el indicador lo cuente", "Baja", H),
    ],
    "Post Venta y Costo por kilo": [
        ("HU-PV-01", "Post Venta", "subir una carga de Accu-Tab desde Trace para generar su informe", "Alta", H),
        ("HU-PV-02", "Post Venta", "que cada carga genere sola su informe PDF idéntico al de Trace para no armarlo a mano", "Alta", H),
        ("HU-PV-03", "Post Venta", "filtrar los informes por cliente, planta, posición, equipo y semana para encontrar uno", "Media", H),
        ("HU-PV-04", "Cliente", "ver mis informes de Accu-Tab con gráficos de pH y ORP para controlar mi equipo", "Alta", H),
        ("HU-PV-05", "Post Venta", "descargar la BD de registros y de informes en Excel para analizarlos", "Media", H),
        ("HU-PV-06", "Post Venta", "subir el CSV del C&M-500 y ver su costo por kilo para informar el consumo de producto", "Alta", H),
        ("HU-PV-07", "Cliente", "ver los litros por ingrediente activo y los ml/kg de cada día para entender mi consumo", "Media", H),
        ("HU-PV-08", "Post Venta", "que el correo del C&M-500 cree solo el informe", "Media", P),
    ],
    "Storage": [
        ("HU-ST-01", "Usuario interno", "explorar y descargar archivos con vista previa para no pedirlos a TI", "Alta", H),
        ("HU-ST-02", "Administrador general", "restringir una carpeta a ciertas cuentas para proteger información", "Alta", H),
        ("HU-ST-03", "Cliente", "ver y descargar solo la carpeta de informes de mi Ship To para tener mis informes a mano", "Alta", H),
        ("HU-ST-04", "Usuario interno", "buscar en todo Storage con una tecla para encontrar un archivo rápido", "Media", H),
        ("HU-ST-05", "Administrador", "que los informes queden ordenados por planta, laboratorio y fecha para encontrarlos sin buscar", "Media", H),
        ("HU-ST-06", "Cliente", "descargar la carpeta completa de mi planta en un clic", "Baja", P),
    ],
    "Administración": [
        ("HU-AD-01", "Administrador general", "crear cuentas por tipo con su alcance para dar acceso sin riesgo", "Alta", H),
        ("HU-AD-02", "Administrador general", "asignar funciones sueltas a una cuenta para dar permisos puntuales", "Media", H),
        ("HU-AD-03", "Administrador general", "importar listas de distribución desde Excel y aceptar los cambios celda por celda para actualizar contactos sin errores", "Alta", H),
        ("HU-AD-04", "Administrador principal", "encender qué servicios muestra Report para controlar lo que ven los clientes", "Alta", H),
        ("HU-AD-05", "Administrador general", "editar y probar el aviso a clientes para comunicar el nuevo canal", "Media", H),
        ("HU-AD-06", "Administrador general", "cargar el plan de entregables de los comerciales para compararlo con lo realizado", "Media", H),
        ("HU-AD-07", "Administrador general", "armar el panel de inicio de cada tipo de cuenta para mostrar lo que le sirve", "Baja", H),
        ("HU-AD-08", "Administrador general", "ver la actividad de cada persona y el uso por módulo para saber la adopción", "Media", H),
        ("HU-AD-09", "Administrador general", "crear en lote las cuentas de clientes y probar que no haya traspaso de información", "Alta", H),
        ("HU-AD-10", "Administrador general", "elegir qué notificaciones recibe cada cuenta para evitar ruido", "Baja", H),
        ("HU-AD-11", "Administrador principal", "enviar el aviso a los clientes", "Alta", P),
    ],
    "Monitoreo": [
        ("HU-MO-01", "Administrador principal", "ver quién está conectado y dónde desde el teléfono para saber si usan el sistema", "Media", H),
        ("HU-MO-02", "Administrador principal", "abrir el detalle de una persona con su recorrido y a qué Sold To pertenece para entender su uso", "Media", H),
        ("HU-MO-03", "Administrador principal", "ver qué clientes se conectaron y por cuánto tiempo para medir la adopción del portal", "Alta", H),
        ("HU-MO-04", "Administrador principal", "instalar el Monitoreo como app en mi teléfono para abrirlo rápido", "Baja", H),
    ],
}


def capitulo_8(doc, datos):
    titulo(doc, "8. Product Backlog e historias de usuario", 1)
    total = sum(len(v) for v in BACKLOG.values())
    hechas = sum(1 for v in BACKLOG.values() for h in v if h[4] == H)
    parrafo(doc, (
        f"El Product Backlog del sistema reúne {total} historias de usuario agrupadas por módulo. {hechas} están "
        f"hechas y {total - hechas} siguen pendientes. Cada historia sigue el formato «Como [rol] quiero [algo] para "
        "[beneficio]»; en las tablas el rol y el «quiero… para…» van separados para que se lean rápido. La prioridad "
        "(Alta, Media o Baja) refleja el valor para el negocio y el estado (Hecha o Pendiente) corresponde al sistema en "
        "producción al 30 de octubre de 2026."))
    nota(doc, "Las prioridades y los estados se dedujeron del documento de contexto del proyecto y del historial de cambios; el Product "
              "Owner puede ajustarlos. Las historias pendientes coinciden con los pendientes declarados en el proyecto.", "Para validar")
    tabla(doc, ["Módulo", "Historias", "Hechas", "Pendientes"],
          [(m, len(v), sum(1 for h in v if h[4] == H), sum(1 for h in v if h[4] == P)) for m, v in BACKLOG.items()]
          + [("Total", total, hechas, total - hechas)], [6.5, 3.0, 3.0, 3.5], "Resumen del Product Backlog", alinear=["l", "c", "c", "c"])
    for i, (modulo, hus) in enumerate(BACKLOG.items(), 1):
        titulo(doc, f"8.{i} {modulo}", 2, False)
        tabla(doc, ["ID", "Rol", "Quiero… para…", "Prio.", "Estado"],
              [(a, b, c, d, e) for a, b, c, d, e in hus], [1.9, 3.0, 8.6, 1.2, 1.7],
              f"Historias de usuario de {modulo}", tam=8.5, alinear=["l", "l", "l", "c", "c"])


# --------------------------------------------------------------------------------------------------
CASOS = [
    ("CU-01", "Iniciar sesión", "Cualquier usuario", "Entrar al sistema con su correo y contraseña.",
     "La cuenta existe y tiene contraseña.",
     ["El usuario ingresa su correo y contraseña.", "El sistema verifica las credenciales.", "El sistema crea la sesión y devuelve el token.",
      "El frontend elige el panel de inicio según el tipo de cuenta."],
     "Credenciales incorrectas: el sistema anota el ingreso fallido y muestra un mensaje de error. Cuenta con cambio de clave pendiente: se pide la nueva antes de entrar.",
     "El usuario queda autenticado con una sesión que expira.", "Un 401 cierra la sesión en el navegador."),
    ("CU-02", "Crear una solicitud de análisis", "Muestreador", "Pedir un análisis a un laboratorio.",
     "Tener acceso a Toma de muestras y los listados del servicio cargados.",
     ["El usuario elige el laboratorio y el tipo de aplicación.", "Elige Sold To y Ship To del listado de ese servicio.",
      "Completa especie, producto, fechas y analitos.", "El sistema muestra los destinatarios de resultados.",
      "Al guardar, el servidor reserva el folio OT, genera Excel, PDF y JSON y los guarda en R2."],
     "Campos obligatorios vacíos: el formulario lo señala. Observación sobre el tope: se rechaza. Sin lista de distribución: se avisa con el chip morado.",
     "La solicitud queda indexada con su OT y visible en Solicitudes e informes.", "Folio por laboratorio; observación de 50 caracteres (500 en ensayo)."),
    ("CU-03", "Enviar una solicitud al laboratorio", "Muestreador o administrador", "Mandar por correo la solicitud con sus adjuntos.",
     "La solicitud existe y no es de prueba (o se envía solo a quien la prueba).",
     ["El usuario abre el detalle y presiona Enviar, o el envío automático lo dispara al guardar.", "El sistema arma Para, CC y CCO.",
      "Envía el correo con PDF, Excel y JSON.", "Anota el envío en envio_solicitud_log y marca la solicitud como Enviada."],
     "Falla del correo: se registra el error y la solicitud sigue Pendiente. Una solicitud de prueba nunca se envía sola.",
     "La solicitud queda Enviada con su historial.", "Una clave de Gmail rechazada responde 503, nunca 401."),
    ("CU-04", "Cruzar la muestra con su solicitud", "Analista de laboratorio", "Registrar la llegada física de la muestra.",
     "La solicitud existe y no está cruzada.",
     ["El analista escanea el código de la solicitud.", "El sistema muestra su ficha.", "El analista anota el N° de muestra y el peso y sube la foto.",
      "El sistema guarda la hora de recepción y quién cruzó."],
     "N° de muestra repetido: 409. Cámara sin soporte nativo: se usa el lector de respaldo.",
     "La fila queda cruzada; se pueden anotar los pesos extraído y hueso.", "Quitar la muestra es solo del administrador principal."),
    ("CU-05", "Registrar la verificación diaria de equipos", "Analista", "Dejar registrado y juzgado el control diario.",
     "Tener la sección Verificaciones.",
     ["El analista abre el día.", "Completa una sección y ve el veredicto en pantalla.", "Guarda la sección.",
      "El servidor recalcula, guarda y congela los criterios del día."],
     "Sección ya guardada por otro analista: se muestra quién y cuándo. Valores fuera de rango: la sección queda con resultado No conforme.",
     "El día tiene la sección guardada; al completarse todas, queda lista para firma.", "El output del detector es solo registro."),
    ("CU-06", "Firmar la revisión del día", "Administrador de Cromatografía", "Aprobar las verificaciones del día.",
     "Todas las secciones del día guardadas y permiso de firma.",
     ["El usuario revisa el día completo.", "Presiona Firmar.", "El sistema guarda revisado_por y la fecha.", "Emite la notificación."],
     "Sin permiso de firma: 403.", "El día queda aprobado.", "Función suelta verif_firmar."),
    ("CU-07", "Enviar un informe al cliente", "Analista de laboratorio", "Mandar el informe propio con la lista correcta.",
     "Sistema en producción (o en prueba) y PDF de informe propio.",
     ["El analista sube el PDF.", "El sistema lee Sold To, Ship To, especie y OT.", "Arma la lista desde la solicitud y suma las copias internas.",
      "El analista revisa la vista previa y presiona Enviar.", "El sistema envía y registra en envio_informe_log."],
     "Sin OT o sin solicitud: arma la lista con lo leído del PDF. Sin lista del cliente: no deja enviar. Falla de un envío: los demás salen y ese queda para reintentar.",
     "El cliente recibe el informe; el envío queda en el historial.", "En prueba todo sale solo a los destinatarios de prueba."),
    ("CU-08", "Cargar informes con el Converter", "Analista", "Subir los PDF de los laboratorios a la base.",
     "PDF de Quiteca, ALS, Diagnofruit o AgroFresh.",
     ["El analista sube los PDF.", "El Converter lee y homogeniza con Listados.", "Consulta /ingest/preview y avisa los que ya existen.",
      "El analista confirma la subida.", "El servidor inserta con su carga_id y deja pendientes los que no calzan.", "Cada PDF se guarda en Auditoría."],
     "Informe ya existente: actualizar, sacar o cancelar. Valor fuera de catálogo: queda en Filas pendientes.",
     "Los informes cargados quedan en Report; la carga se puede deshacer.", "Un dato vacío nunca borra uno existente."),
    ("CU-09", "Resolver filas pendientes", "Analista", "Corregir lo que no calzó con Listados.",
     "Existen filas en pendiente_revision.",
     ["El analista abre Filas pendientes.", "Elige corregir el valor con el buscador de Listados.", "Reintenta la carga.", "Descarta las que siguen sin Ship To válido."],
     "El valor sigue sin calzar: la fila vuelve a pendiente.", "Las filas corregidas se insertan; las descartadas se respaldan.", "El sistema aprende la corrección."),
    ("CU-10", "Aceptar un informe del correo", "Administrador principal", "Cargar un informe que llegó al buzón.",
     "El informe fue leído por la revisión del buzón y no está en rojo.",
     ["El administrador abre el tablero y elige un informe por aceptar.", "Revisa el detalle esperado contra lo que llegó.", "Presiona Aceptar.",
      "El sistema lee el PDF, previsualiza y carga con carga registrada.", "Guarda el PDF y anota «enviado al cliente»."],
     "No calza con Listados: se homogeneiza a mano y se acepta. Envío en rojo: solo se puede marcar ya informado, resolver o rechazar.",
     "El informe queda en Report y en Storage; se puede deshacer la aceptación.", "Un envío en rojo nunca se carga."),
    ("CU-11", "Consultar Report", "Cliente, comercial o usuario interno", "Ver resultados con filtros y gráficos.",
     "Cuenta con acceso a Report.",
     ["El usuario abre Report.", "Elige filtros generales y específicos.", "Ve indicadores, gráficos y tablas por análisis.", "Hace clic en un punto para abrir la ficha del informe."],
     "Sin plantas asignadas: no ve nada. Informe fuera de su alcance: 404.", "El usuario ve solo lo de su alcance.", "El alcance lo decide el servidor."),
    ("CU-12", "Descargar la BD en Excel", "Cliente o usuario interno", "Llevarse sus resultados.",
     "Cuenta con acceso a Report.",
     ["El usuario presiona Descargar BD.", "Si hay filtros, elige descargar filtrada o completa.", "El servidor arma el Excel con el alcance de la cuenta."],
     "Cliente sin Sold To asignado: 403.", "Descarga el archivo.", "Al cliente se le quitan las columnas internas."),
    ("CU-13", "Ver informes de Accu-Tab", "Cliente o Post Venta", "Consultar mediciones de pH y ORP.",
     "Existen cargas de su cliente.",
     ["El usuario abre Reportes Accutab.", "Filtra por Sold To, Ship To, posición, equipo y semana.", "Elige un informe de la lista.", "Ve sus cifras y gráficos y descarga el PDF."],
     "Sin cargas de su cliente: pantalla vacía.", "Descarga el PDF o la BD en Excel.", "Acotado por el servidor al cliente y Ship To."),
    ("CU-14", "Cargar costo por kilo", "Post Venta", "Subir el CSV del C&M-500 y ver el consumo.",
     "CSV original del equipo.",
     ["El usuario elige el CSV en Trace.", "El sistema muestra una vista previa.", "Elige Sold To, Ship To, línea y equipo.", "Guarda en el servidor.", "El sistema genera el PDF y el Excel."],
     "CSV que no se puede leer: se informa. Día parcial: barra tenue.", "El informe aparece en Reportes Accutab.", "El valor diario es la suma de los incrementos."),
    ("CU-15", "Gestionar usuarios", "Administrador general", "Dar o quitar acceso a una persona.",
     "Rol de administrador general.",
     ["El administrador abre Usuarios y presiona Nueva cuenta.", "Completa quién es, el tipo de cuenta y lo que puede hacer.", "El servidor normaliza la cuenta y la guarda."],
     "Datos incoherentes: el servidor los descarta. Cambios de permisos: quedan como cambios sensibles.", "La cuenta queda activa con su alcance.", "Las funciones sueltas se asignan una a una."),
    ("CU-16", "Actualizar una lista de distribución", "Administrador general", "Cambiar los destinatarios de una planta.",
     "Rol de administrador general.",
     ["El administrador abre Listas de distribución.", "Importa un Excel o edita una celda.", "Revisa las propuestas en amarillo y acepta o rechaza.", "Presiona Guardar."],
     "Planta que no existe en Listados: sugiere nombres parecidos o la crea.", "Se guarda con un respaldo con fecha.", "Una celda vacía no quita a nadie."),
    ("CU-17", "Explorar Storage", "Usuario interno o cliente", "Encontrar y bajar un archivo.",
     "Tener el módulo Storage.",
     ["El usuario elige una entrada del árbol.", "Navega o busca con «/».", "Abre la vista previa o descarga el archivo."],
     "Carpeta restringida: no aparece. Cliente: solo ve su Ship To.", "Archivo visto o descargado.", "Los permisos se aplican al listar y al descargar."),
    ("CU-18", "Ver el Monitoreo", "Administrador principal", "Saber quién usa el sistema.",
     "Ser el administrador principal.",
     ["El administrador abre /monitoreo.", "Ve conectados, atención requerida y pulso de 24 horas.", "Toca a una persona para ver su detalle."],
     "Otra cuenta: 403.", "Pantalla actualizada cada 20 segundos.", "La presencia es un latido cada 60 segundos."),
]


def capitulo_9(doc, datos):
    titulo(doc, "9. Especificación de casos de uso", 1)
    parrafo(doc, (
        f"Se especifican {len(CASOS)} casos de uso, los que cubren el flujo central del sistema. Cada uno indica su actor, su "
        "objetivo, las precondiciones, el flujo principal, los flujos alternativos y de error, las postcondiciones y las "
        "reglas que lo condicionan. Los diagramas de casos de uso por tipo de cuenta están en la sección 6.5."))
    for cid, nombre, actor, objetivo, pre, flujo, alt, post, regla in CASOS:
        titulo(doc, f"{cid} {nombre}", 2, False)
        tabla(doc, ["Campo", "Detalle"], [
            ("Actor", actor), ("Objetivo", objetivo), ("Precondiciones", pre),
            ("Flujo principal", "\n".join(f"{i}. {p}" for i, p in enumerate(flujo, 1))),
            ("Flujos alternativos y errores", alt), ("Postcondiciones", post), ("Reglas relacionadas", regla),
        ], [3.8, 12.2], f"{cid}. {nombre}", tam=9)
