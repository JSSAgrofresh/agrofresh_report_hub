"""Capítulo 12: manual de usuario por tipo de cuenta, con capturas del sistema en un entorno de demostración."""
from __future__ import annotations

from pathlib import Path

from lib_docx import figura, nota, parrafo, tabla, titulo, viñetas

CAP = Path(__file__).parent / "capturas_doc"


def _cap(doc, archivo, texto, ancho=16.0):
    ruta = CAP / archivo
    if ruta.exists():
        figura(doc, ruta, texto + " (entorno de demostración)", ancho_cm=ancho)


def _pasos(doc, pasos):
    viñetas(doc, pasos, "List Number")


def capitulo_manual(doc, datos):
    titulo(doc, "12. Manual de usuario", 1)
    parrafo(doc, (
        "Este capítulo explica cómo usar el sistema desde la mirada de cada tipo de cuenta. Está escrito para una persona que nunca lo ha "
        "usado: dice qué se ve en cada pantalla, qué pasos seguir y qué errores son comunes. Todas las capturas se tomaron en un entorno de "
        "demostración con datos ficticios (los clientes se marcan «DEMO»); por eso algunas tablas aparecen vacías: en esa instalación de "
        "prueba no había archivos de solicitudes ni correo configurado."))
    nota(doc, "Las pantallas pueden cambiar de aspecto con las versiones del sistema; lo importante son los pasos. El tipo de cuenta decide qué "
              "módulos se ven: si no encuentra uno que aquí se describe, es porque su cuenta no lo tiene.", "Antes de empezar", "E9F5E7")

    titulo(doc, "12.1 Cómo entrar al sistema", 2, False)
    parrafo(doc, (
        "Se entra desde el navegador con el correo y la contraseña de la cuenta. La contraseña la entrega el administrador y, si fue "
        "temporal, el sistema pide cambiarla la primera vez. La sesión expira sola y, si alguien intenta entrar con una clave equivocada, queda "
        "anotado."))
    _cap(doc, "00_login.jpg", "Pantalla de acceso", 13.5)
    _pasos(doc, [
        "Abra la dirección del sistema en el navegador (Chrome, Edge o Safari).",
        "Escriba su correo corporativo y su contraseña.",
        "Presione «Ingresar». El sistema lo lleva a su pantalla de inicio según su tipo de cuenta.",
        "Para salir, use el menú del avatar o el botón de cerrar sesión.",
    ])
    parrafo(doc, "Errores comunes: una contraseña equivocada muestra un mensaje de error y no entra; un correo sin cuenta responde lo mismo, para no "
                 "revelar qué cuentas existen. Si olvidó su contraseña, solicite al administrador que la restablezca.")

    titulo(doc, "12.2 Pantalla de inicio y menú", 2, False)
    parrafo(doc, (
        "El personal interno ve una barra lateral con los módulos de su cuenta, agrupados en Data Core, Funciones, Toma de muestras y "
        "Administración, y un panel general con tarjetas de acceso e indicadores de actividad. Clientes y comerciales ven, en cambio, una barra "
        "de vidrio flotante arriba (ver 12.8)."))
    _cap(doc, "01_inicio.jpg", "Panel general con las tarjetas de cada módulo")

    titulo(doc, "12.3 Muestreador: pedir un análisis", 2, False)
    parrafo(doc, (
        "El muestreador usa Toma de muestras. Desde «Solicitudes e informes» ve todas sus solicitudes y desde «Nueva solicitud» crea una. "
        "La solicitud reúne los datos de la muestra y es lo que el laboratorio recibe."))
    _cap(doc, "06_toma_muestras.jpg", "Solicitudes e informes, con los cuatro indicadores y los filtros")
    titulo(doc, "12.3.1 Crear una solicitud", 3, False)
    _cap(doc, "07_nueva_solicitud.jpg", "Formulario de nueva solicitud, dividido en secciones numeradas")
    _pasos(doc, [
        "Presione «Nueva solicitud». El formulario muestra una barra de avance con los campos obligatorios que faltan.",
        "En «Identificación de la solicitud» elija el laboratorio y el Tipo de Aplicación; esto decide qué listado se usa para el Sold To y el Ship To.",
        "Elija el Sold To y, luego, el Ship To. Si cambia el tipo de aplicación, ambos se vacían y hay que elegirlos otra vez.",
        "Complete la información de la muestra: especie, variedad, producto, fechas y los analitos que se pedirán.",
        "Escriba la observación (máximo 50 caracteres; en un ensayo, 500).",
        "Presione «Guardar y enviar». Si el envío automático está apagado para ese tipo, la solicitud queda Pendiente y se envía desde su detalle.",
    ])
    parrafo(doc, "Consejo: al elegir el Ship To el sistema muestra los destinatarios de resultados; si dice «Sin lista de distribución», avise al "
                 "administrador para que cargue la lista de esa planta.")
    titulo(doc, "12.3.2 Seguir una solicitud", 3, False)
    _pasos(doc, [
        "En «Solicitudes e informes» use los cuatro indicadores de arriba (Solicitudes, Por enviar, Esperando informe y Con informe) para filtrar con un clic.",
        "Abra «Filtros» para acotar por laboratorio, cliente, planta, especie, tipo de aplicación, línea, tipo de muestra, muestreador o estado.",
        "Haga clic en una fila para abrir el PDF de la solicitud; el chip azul del informe abre el informe del laboratorio cuando ya llegó.",
        "Use «Excel» para descargar lo que está a la vista.",
    ])

    titulo(doc, "12.4 Analista de laboratorio", 2, False)
    titulo(doc, "12.4.1 El hub de AgroFresh Lab", 3, False)
    parrafo(doc, "AgroFresh Lab agrupa tres módulos en tarjetas: Ingreso al laboratorio, Verificaciones diarias y Envío de informes.")
    _cap(doc, "02_agrofresh_lab.jpg", "Hub de AgroFresh Lab con sus tres módulos", 14.5)
    titulo(doc, "12.4.2 Ingreso al laboratorio", 3, False)
    _cap(doc, "04_ingreso_lab.jpg", "Ingreso al laboratorio: ingreso de muestras y resultados del GC")
    _pasos(doc, [
        "Abra «Ingreso al laboratorio» y use la pestaña «Ingreso estándar».",
        "Escanee con la cámara el código de la solicitud; aparece su ficha.",
        "Anote el N° de muestra y el peso, y suba una foto de la muestra.",
        "Presione cruzar: la fila queda en verde y se guarda la hora de recepción.",
        "Con la fila cruzada, anote el peso extraído y el peso hueso.",
        "Si se equivocó, use «Editar cruce»; no cambia la hora de recepción.",
    ])
    titulo(doc, "12.4.3 Verificaciones diarias", 3, False)
    parrafo(doc, "Cada día se registran las mediciones de los equipos. La pantalla se divide en secciones plegables y cada una se guarda por separado.")
    _cap(doc, "03_verificaciones.jpg", "Verificaciones diarias: sección de micropipetas")
    _pasos(doc, [
        "Revise que la fecha sea la del día y escriba su nombre como analista.",
        "Abra una sección (por ejemplo Micropipetas) y escriba las pesadas; el veredicto aparece mientras escribe.",
        "Presione «Guardar sección». Queda registrado quién la guardó y se congelan los criterios de ese día.",
        "Repita con balanza, temperaturas, gases, inyector y detector.",
        "Quien tenga el permiso de firma revisa el día y lo firma.",
    ])
    titulo(doc, "12.4.4 Envío de informes al cliente", 3, False)
    _cap(doc, "05_envio_informes.jpg", "Envío de informes en modo prueba")
    _pasos(doc, [
        "Fíjese en el aviso de arriba: «Sistema en prueba» envía solo a destinatarios de prueba; «Sistema en producción» envía al cliente.",
        "Arrastre uno o varios PDF de informes propios. El sistema lee cliente, planta, especie y OT.",
        "Revise la vista previa del correo y los destinatarios propuestos.",
        "Si algo no calza, use «Editar este correo» para cambiar Para, CC, CCO, asunto o texto de ese informe.",
        "Presione «Enviar» (o «Enviar todos»). Si un envío falla, queda para reintentar.",
    ])
    nota(doc, "Pasar a producción pide la contraseña de quien lo hace. Hágalo solo cuando los datos de prueba estén verificados.", "Cuidado")
    titulo(doc, "12.4.5 Ingreso de informes", 3, False)
    parrafo(doc, "Aquí se cargan los informes de los laboratorios. La pestaña «Carga manual» agrupa el Excel, el Converter, las filas pendientes y el historial de cargas.")
    _cap(doc, "08_ingreso_informes.jpg", "Ingreso de informes: tablero del administrador principal")
    _pasos(doc, [
        "Para cargar PDF, abra el Converter y arrastre los archivos de Quiteca, ALS, Diagnofruit o AgroFresh.",
        "Revise cada informe: el Converter homogeniza los nombres con Listados y marca en amarillo lo que no calza.",
        "Si algún informe ya existe en la base, el sistema pregunta si actualizar, sacarlo de la tanda o cancelar.",
        "Presione «Subir a la base de datos». Cada carga queda en el historial con un botón «Deshacer».",
        "Lo que no calzó con Listados va a «Filas pendientes»: corríjalo con el buscador y reintente.",
    ])

    titulo(doc, "12.5 Gerencia y análisis de resultados", 2, False)
    titulo(doc, "12.5.1 Report", 3, False)
    parrafo(doc, "Report muestra los resultados cargados. Arriba hay tres tarjetas de análisis (Residuos, FSMA y Fitopatología) que también sirven para saltar al bloque.")
    _cap(doc, "09_report.jpg", "Report: tarjetas de análisis y filtros generales y específicos")
    _pasos(doc, [
        "Elija los filtros generales (laboratorio, cliente, planta, tipo de servicio, semana, mes o rango de fechas).",
        "Afine con los filtros específicos de cada análisis: especie, variedad e ingrediente activo en residuos; analito y estado en FSMA y fitopatología.",
        "Haga clic en un punto del gráfico para abrir la ficha del informe y su PDF.",
        "Use «Descargar BD» para bajar los datos en Excel; el sistema avisa si hay filtros puestos.",
    ])
    titulo(doc, "12.5.2 Panel de control interno", 3, False)
    _cap(doc, "10_panel_control.jpg", "Panel de control interno con sus tres pantallas")
    parrafo(doc, "Tiene tres pantallas: «Solicitudes e informes», «Rendimiento de calidad» y «Vista de límites».")
    _cap(doc, "11_solicitudes_informes.jpg", "Solicitudes e informes: solicitudes emitidas contra informes recibidos")
    _cap(doc, "12_rendimiento_calidad.jpg", "Rendimiento de calidad por cliente y semana")
    parrafo(doc, (
        "En Rendimiento de calidad, cada fila es una planta y las columnas muestran cuántos informes cumplen y cuántos no, por análisis. "
        "Se ordena de la que más incumple a la que menos; «Solo con riesgo» deja solo las que tienen incumplimientos y un clic en una fila abre "
        "el detalle de sus informes."))
    _cap(doc, "13_vista_limites.jpg", "Vista de límites residuales")

    titulo(doc, "12.6 Administrador general", 2, False)
    titulo(doc, "12.6.1 Usuarios", 3, False)
    _cap(doc, "16_usuarios.jpg", "Lista de usuarios con buscador y filtros por tipo de cuenta")
    _pasos(doc, [
        "Abra Administración › Usuarios y presione «Nuevo usuario».",
        "Paso 1: escriba nombre y correo. Paso 2: elija el tipo de cuenta (administrador, gerencia, administrador de área, analista, muestreador, comercial o cliente).",
        "Paso 3: marque lo que puede hacer. Para un cliente, elija su Sold To, Ship To y qué ve (Report, Storage o informes de Accu-Tab).",
        "Guarde. El sistema genera una contraseña temporal que se muestra una sola vez.",
    ])
    titulo(doc, "12.6.2 Administración General", 3, False)
    parrafo(doc, "Reúne las pestañas Resumen, Actividad, Seguimiento, Listas de distribución, Avisos a clientes, Panel de inicio, Plan de entregables y Funciones.")
    _cap(doc, "19_administracion_general.jpg", "Administración General: resumen de actividad")
    titulo(doc, "12.6.3 Laboratorios y Storage", 3, False)
    _cap(doc, "18_laboratorios.jpg", "Laboratorios: analitos, contactos y plantillas de correo", 14.5)
    _cap(doc, "15_storage.jpg", "Storage: explorador de archivos con sus cinco entradas")

    titulo(doc, "12.7 Post Venta y Monitoreo", 2, False)
    _cap(doc, "14_post_venta.jpg", "Post Venta: carga de informes Accu-Tab y de costo por kilo")
    parrafo(doc, (
        "Post Venta tiene dos pestañas: «Accu-Tab · pH y ORP» y «Costo por kilo». Se arrastra el archivo del equipo, se revisa la vista previa y se "
        "guarda en el servidor; el sistema genera el informe PDF. El administrador principal dispone además del Monitoreo, una pantalla pensada "
        "para el teléfono con quién está conectado y qué hizo."))
    _cap(doc, "20_monitoreo.jpg", "Monitoreo del administrador principal", 14.5)

    titulo(doc, "12.8 Cliente y comercial: el portal", 2, False)
    parrafo(doc, (
        "Las cuentas cliente y comercial entran a un portal de solo lectura acotado a sus plantas y especies. Arriba hay una barra flotante con "
        "«Análisis de Laboratorio», «Informes de Laboratorio» (Storage) y, si corresponde, «Reportes Accutab». Lo primero que ve son sus gráficos."))
    _cap(doc, "30_portal_cliente.jpg", "Portal del cliente: saludo con la foto de la especie, indicadores y filtros")
    _pasos(doc, [
        "Revise las tres tarjetas de análisis: tocarlas lleva al bloque correspondiente.",
        "Use «Mostrar filtros» para elegir planta, especie, semana o rango de fechas; los filtros se pegan arriba al desplazarse.",
        "Haga clic en un punto de un gráfico para abrir la ficha del informe y descargar su PDF.",
        "Use «Descargar mi Excel» para bajar sus resultados.",
    ])
    _cap(doc, "31_portal_cliente_graficos.jpg", "Portal del cliente: gráficos de especies, ingredientes y análisis FSMA")
    titulo(doc, "12.8.1 En el teléfono", 3, False)
    parrafo(doc, "El portal se adapta al teléfono: las tarjetas se apilan, los filtros se abren en una hoja y el gráfico grande se desliza de lado; al "
                 "tocar una columna aparece su ficha debajo.")
    _cap(doc, "32_portal_telefono.jpg", "Portal del cliente en un teléfono vertical", 6.5)

    titulo(doc, "12.9 Preguntas frecuentes", 2, False)
    tabla(doc, ["Situación", "Qué hacer"], [
        ("No veo un módulo que mi compañero sí ve.", "Su cuenta no lo tiene marcado; pídalo al administrador general."),
        ("La pantalla dice «Sin lista de distribución».", "Esa planta y especie no tiene contactos cargados; el administrador debe cargarlos en Listas de distribución."),
        ("Un informe aparece con «OT por revisar».", "El PDF dice otra OT o algo no calza (planta, especie o fecha). Pase el mouse sobre el aviso para ver el motivo."),
        ("Subí un informe y quedó en pendientes.", "Algún nombre (Sold To, Ship To, especie o variedad) no calza con Listados; corríjalo en «Filas pendientes»."),
        ("Me equivoqué en una carga.", "Use «Deshacer» en la carga desde el historial; no procede si otra carga agregó resultados a esos informes."),
        ("El envío salió en modo prueba.", "El sistema parte siempre en prueba; el cambio a producción pide la contraseña de quien lo hace."),
        ("No puedo editar una solicitud.", "Editar exige el permiso «Editar solicitudes» y solo se permite en tipos de servicio que no se envían solos."),
    ], [6.0, 10.0], "Preguntas frecuentes", tam=9)
