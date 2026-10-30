"""Capítulo 7 (extenso): descripción detallada de cada módulo del sistema."""
from __future__ import annotations

import json
from pathlib import Path

from lib_docx import nota, parrafo, tabla, titulo, viñetas

AQUI = Path(__file__).parent
ENDPOINTS = json.loads((AQUI / "datos_endpoints.json").read_text(encoding="utf8"))


def _sub(doc, texto, nivel=3):
    return titulo(doc, texto, nivel, False)


def _pasos(doc, pasos):
    viñetas(doc, pasos, "List Number")


def _reglas(doc, reglas):
    """reglas: lista de (título corto, explicación)."""
    viñetas(doc, [(f"{t}. ", d) for t, d in reglas])


def _api(doc, archivos, tope=12, titulo_tabla=None):
    filas = []
    total = 0
    for a in archivos:
        eps = ENDPOINTS.get(a, [])
        total += len(eps)
        utiles = [e for e in eps if "/config" not in e["r"]] or eps
        utiles.sort(key=lambda e: (not e["doc"], e["r"]))
        for e in utiles[: max(2, tope // len(archivos))]:
            filas.append((e["m"], e["r"].replace("/api", "", 1) if e["r"].startswith("/api") else e["r"], e["d"][:110]))
    parrafo(doc, f"El módulo expone {total} endpoints en {', '.join(archivos)}. Los principales; el listado completo está en el Anexo D.")
    tabla(doc, ["Método", "Ruta (prefijo /api)", "Qué hace"], filas, [1.6, 7.2, 7.2], titulo_tabla, tam=8)


def _ficha(doc, ruta, usuarios, datos):
    tabla(doc, ["Ficha", ""], [("Ruta en el sistema", ruta), ("Quién lo usa", usuarios), ("Datos y servicios", datos)],
          [3.8, 12.2], None, tam=9.5)


def _pruebas(doc, texto):
    parrafo(doc, texto)


INTERNO = {
    "tm": "El backend de Toma de muestras vive en toma_muestras.py, el router más grande del sistema, y se apoya en módulos de lógica pura: solicitud_excel.py construye el libro de cada solicitud, toma_muestras_pdf.py dibuja el PDF, json_als.py y hoja_informe.py arman los formatos específicos de ALS y Diagnofruit, e indice_solicitudes.py mantiene en PostgreSQL el índice que permite listar sin abrir cada Excel. La configuración (analitos, campos por laboratorio, tipos de aplicación, productos y categorías) se guarda como JSON en R2 mediante config_store. En el frontend, features/tomaMuestras agrupa la lógica pura (filtros acumulables, tope de la observación, permisos de edición) y las pantallas NuevaSolicitudView y SolicitudesView la usan.",
    "ingreso_lab": "El cruce de la muestra lo resuelve emitir.py junto con indice_solicitudes.py (cruzar y editar_cruce), y los fortificados viven en fortificados.py. En el frontend, views/modules/lab contiene el escáner (EscanerCamara con el detector nativo y un lector de respaldo en WebAssembly), la ficha escaneada, los modales de cruce y de edición y el componente FotoCruce, que descarga las fotos con el token de sesión.",
    "verif": "verificaciones.py concentra el cálculo y la persistencia; verificaciones_excel.py y verificaciones_pdf.py generan los documentos del día y lab_secciones.py aplica los permisos por sección. En el frontend, features/verificaciones/lib/calculos.ts replica el cálculo para pintar el veredicto al escribir. Ambos lados se prueban contra los mismos casos, que son la garantía de que no discrepen.",
    "envio": "envio_informes.py arma el plan de destinatarios con plan_desde_solicitud, la misma función que usa el PDF de la solicitud; informe_lectura.py lee el PDF con pypdf; mail_templates.py comparte con las solicitudes el marco del correo, y mail_aviso.py maneja las siete plantillas del aviso, cuyas imágenes están generadas y versionadas en correo_assets. La vista previa que ve el analista se arma con el mismo código del envío.",
    "ingreso": "ingest.py es el corazón de la carga: su función _procesar_filas la usan tanto la carga por Excel como el Converter y el correo. El Converter es un módulo de navegador (public/modules/converter.html, con lectores por laboratorio en JavaScript) y su espejo en Python (quiteca_lectura.py y agrofresh_lectura.py) se compara contra casos dorados. El correo se divide en correo_informes.py (buzón y base), correo_informes_lectura.py (lectura y revisión, pura), correo_informes_homogeneo.py, correo_informes_aceptar.py y correo_informes_panel.py (cálculo del tablero). En el frontend, features/ingest y features/correoInformes contienen la lógica pura y los componentes del tablero.",
    "report": "reportes.py expone los datos y arma el alcance con _filtro_alcance; bd_excel.py y columnas_base.py generan la BD en Excel con las mismas columnas que la base de Ingreso al laboratorio; ficha_informe.py devuelve la ficha de un informe y su PDF. En el frontend, features/reportes/lib contiene la lógica pura (filtros, bloques de análisis, tabla por informe, estados de patógenos, curva suave y límites residuales) y ReporteView orquesta la pantalla.",
    "panel": "entrega_indicadores.py entrega los hitos de cada solicitud; auditoria_interna.py lista solicitudes e informes; rendimiento_calidad.py contiene los límites y las reglas de cumplimiento; plan_carga.py, plan_entregables.py y plan_cruce.py manejan el plan de los comerciales. En el frontend, features/auditoriaInterna/lib/entrega.ts calcula los tiempos en días hábiles y features/rendimientoCalidad/lib/agregar.ts agrupa y filtra las celdas que devuelve el servidor.",
    "postventa": "postventa.py y accutab_parser.py leen y guardan las cargas; accutab_informe.py dibuja el informe PDF igual al de Trace; costo_kilo.py (lógica pura) interpreta el CSV del equipo, costo_kilo_informe.py genera el PDF y el Excel y costo_kilo_api.py expone la API para el personal y para el cliente. El correo lo procesa scripts/accutab_mail_ingest.py. En el frontend, features/postventa contiene la lógica del reporte y views/modules/trace la subida a mano.",
    "storage": "storage.py maneja el disco del servidor; storage_r2.py decide qué se puede modificar en R2 (permitir) y storage_permisos.py aplica los permisos por carpeta. informes_storage.py construye la ruta de cada informe y de cada solicitud, e informes_cliente.py entrega al cliente solo su carpeta. En el frontend, features/storage/lib/explorador.ts espeja las reglas y ambos se prueban con los mismos casos.",
    "admin": "usuarios.py y permisos_funciones.py normalizan y guardan las cuentas; auth.py contiene la sesión, el control de acceso y la lista blanca de comerciales; listas_distribucion.py, listados.py y servicios.py resuelven contactos y listados por servicio; funciones.py guarda qué muestra Report; panel_inicio.py valida la grilla; admin_panel.py, actividad.py y actividad_auto.py forman la bitácora y los paneles de uso; notificaciones.py maneja avisos y suscripciones. La grilla del panel de inicio tiene sus reglas en un solo lugar puro, features/panelInicio/lib/grilla.ts, espejo de validar_piezas del backend.",
    "portal": "components/layout/portal contiene PortalShell (el marco), FiltrosPegajosos, PortalHero y las tarjetas de análisis; lib/cacheDeSesion.ts guarda en memoria lo último traído por sesión y lib/paleta.ts fija los colores de los gráficos según el estilo. El marco aplica sus estilos solo a las cuentas externas gracias al atributo data-portal, de modo que las pantallas internas no se ven afectadas.",
    "monitoreo": "monitoreo.py contiene la lógica pura (armar_conectados, pulso_por_hora, linea_de_tiempo) y la lectura de las tablas; en el frontend, el hook usePresencia manda el latido con la pantalla, el aparato y la versión, y features/monitoreo contiene la lógica pura de la hoja de cada persona. El manifiesto y el service worker mínimo viven en public/.",
}


def _interno(doc, clave):
    _sub(doc, "Cómo funciona por dentro", 4)
    parrafo(doc, INTERNO[clave])


# =====================================================================================================
def capitulo_7(doc, datos):
    titulo(doc, "7. Descripción de los módulos", 1)
    parrafo(doc, (
        "Este capítulo describe cada módulo con el mismo esquema: una ficha (ruta, usuarios y datos), su "
        "propósito, el flujo de uso paso a paso, las reglas de negocio que no son obvias desde la pantalla, "
        "los datos que toca, su API, sus pruebas y lo que queda pendiente. Está escrito para que quien "
        "mantenga el sistema entienda no solo qué hace cada pantalla sino por qué funciona como funciona."))
    tabla(doc, ["Módulo", "Sección", "Propósito en una línea"], [
        ("Toma de muestras", "7.1", "Emitir solicitudes de análisis y seguir sus informes"),
        ("AgroFresh Lab", "7.2", "Ingreso de muestras, verificaciones diarias y envío de informes"),
        ("Ingreso de Informes", "7.3", "Cargar informes por Excel, Converter y correo"),
        ("Report", "7.4", "Consultar resultados con filtros y gráficos"),
        ("Panel de control interno", "7.5", "Entrega, rendimiento de calidad y límites"),
        ("Post Venta y Costo por kilo", "7.6", "Informes de equipos Accu-Tab y de consumo de producto"),
        ("Storage", "7.7", "Explorador de archivos con permisos por carpeta"),
        ("Administración", "7.8", "Usuarios, listados, listas de distribución y funciones"),
        ("Portal de clientes y comerciales", "7.9", "El marco de solo lectura acotado a las plantas"),
        ("Monitoreo", "7.10", "Quién usa el sistema, dónde y cuánto"),
        ("Servicios y listas de distribución", "7.11", "Línea de proceso, Actimist, Ecofog y RYD"),
        ("Seguridad y permisos", "7.12", "Cómo se acota lo que ve cada cuenta"),
    ], [5.2, 1.8, 9.0], "Mapa de módulos")
    _toma_muestras(doc)
    _interno(doc, "tm")
    _lab(doc)
    _ingreso(doc)
    _interno(doc, "ingreso")
    _report(doc)
    _interno(doc, "report")
    _panel(doc)
    _interno(doc, "panel")
    _postventa(doc)
    _interno(doc, "postventa")
    _storage(doc)
    _interno(doc, "storage")
    _admin(doc)
    _interno(doc, "admin")
    _portal(doc)
    _interno(doc, "portal")
    _monitoreo(doc)
    _interno(doc, "monitoreo")
    _servicios(doc)
    _seguridad(doc)


# -----------------------------------------------------------------------------------------------------
def _toma_muestras(doc):
    titulo(doc, "7.1 Toma de muestras", 2, False)
    _ficha(doc, "/modulos/toma-muestras",
           "Muestreadores, administradores de área y administrador general; los comerciales ven las solicitudes de sus plantas.",
           "solicitud_archivo, envio_solicitud_log, folio_solicitud_laboratorio, Cloudflare R2 (Excel y fotos), Gmail.")
    _sub(doc, "7.1.1 Propósito")
    parrafo(doc, (
        "Es el punto de partida del ciclo de análisis. Una persona completa el formulario de una solicitud "
        "(laboratorio, Sold To, Ship To, especie, variedad, tipo de aplicación, analitos y observaciones) y el "
        "sistema asigna un folio OT correlativo, genera el Excel, el PDF y el JSON de la solicitud, calcula a "
        "quién se le envía cada resultado y, si corresponde, manda el correo al laboratorio. Después, la misma "
        "pantalla permite seguir el estado de cada solicitud hasta que su informe llega y se carga."))
    _sub(doc, "7.1.2 Flujo de uso")
    _pasos(doc, [
        "El muestreador abre «Nueva solicitud» y elige el laboratorio; el formulario muestra los campos propios de ese laboratorio.",
        "Elige el Tipo de Aplicación (Línea de proceso, Actimist, Ecofog o RYD); eso decide de qué listado salen el Sold To y el Ship To.",
        "Completa especie, variedad, producto, fecha de muestreo y los analitos con su dosis cuando corresponde.",
        "El sistema muestra los destinatarios de resultados (Para, CC y CCO) que arma con la lista de distribución de esa planta y especie.",
        "Al guardar, el servidor reserva el folio OT del laboratorio y escribe el Excel en R2; la solicitud queda indexada y visible en «Solicitudes e informes».",
        "Si el envío automático está encendido para ese tipo de servicio, el navegador dispara el envío del correo al laboratorio; si no, queda como Pendiente y se envía a mano desde el detalle.",
        "En «Solicitudes e informes» el equipo filtra, abre el PDF, descarga el Excel o el JSON y, cuando llega el informe, ve su N° junto a la solicitud.",
    ])
    _sub(doc, "7.1.3 Reglas de negocio")
    _reglas(doc, [
        ("Folios", "Cada laboratorio tiene su serie OT con un prefijo propio (por ejemplo OT-QUI0053 para Quiteca u OT-AGF0075 para AgroFresh). Las solicitudes de prueba usan una serie aparte, OTP-, que no mueve el contador real."),
        ("Listados por servicio", "El Sold To y el Ship To se validan contra el listado del tipo de servicio. Cambiar el tipo de aplicación vacía ambos campos."),
        ("Destinatarios", "El correo al laboratorio usa los contactos del laboratorio. Los resultados van a la lista del cliente para esa planta y especie; los técnicos y comerciales siempre van, con o sin lista, y el creador de la solicitud siempre va en copia oculta."),
        ("Sin lista de distribución", "Si el cliente no tiene a nadie en Para, el Para pasa a ser Jorge y Claudia más los administradores del Report Hub; la solicitud lleva el chip morado «Sin lista de distribución»."),
        ("Productos mixtos", "Con dos o más productos, el Excel, el PDF, el JSON y el correo dicen MIXTO y la lista real queda aparte. Vale solo para las solicitudes creadas desde ese cambio."),
        ("Observación", "Tiene un tope de 50 caracteres, y 500 para un ensayo (Sold To AGROFRESH y Ship To ENSAYO). El tope rige al crear o editar, no al leer."),
        ("Edición", "Editar una solicitud guardada exige el permiso «Editar solicitudes» y solo se permite en los tipos que se envían a mano, porque editar uno que se envía solo lo reenviaría de inmediato."),
        ("Reanálisis", "Crear un reanálisis es una función suelta que ningún tipo de cuenta trae sola; la asigna el administrador general cuenta por cuenta."),
        ("Muestra interna", "Solicitud de pulpa propia de AgroFresh con Sold To AGROFRESH y Ship To MUESTRA INTERNA fijos, sin tipo de aplicación y con casi todos los campos libres. Nunca se envía sola y tiene una lista de resultados fija."),
        ("Lo ya emitido no se reescribe", "El PDF y el Excel se regeneran cada vez que se abren, por eso todo cambio de formato va detrás de una marca guardada en los datos de la solicitud (pdf_solo_analisis, mixto_desde_2, respaldo_ryd, json_als_v2, hoja_informe_v1, muestra_interna)."),
        ("Informe de cada solicitud", "Una solicitud llega a su informe solo por la OT impresa en el PDF o por los resultados de Report cuya referencia es esa OT. No se adivina por parecido."),
        ("Verificación de la OT", "Cada informe dice si su OT está bien cruzada: ✓ si coincide, «OT por revisar» si el informe dice otra o algo no calza, y «OT sin confirmar» si el informe no trae OT."),
        ("Descargas", "La selección permite bajar los PDF, los JSON o los Excel de las solicitudes en un zip; si una solicitud tiene informe con PDF, el zip de PDF lleva las carpetas Solicitudes e Informes. Las cuentas cliente nunca reciben informes en el zip."),
        ("Quitar un informe", "Solo el administrador principal, con su contraseña verificada en el servidor, puede quitar el informe de una solicitud; borra el registro de Report, las filas pendientes, el registro de auditoría y los PDF, para poder volver a subirlo."),
    ])
    _sub(doc, "7.1.4 Pantalla «Solicitudes e informes»")
    parrafo(doc, (
        "Cuatro indicadores arriba (Solicitudes, Por enviar, Esperando informe y Con informe) son también filtros de "
        "un clic. Debajo, una tarjeta con buscador, panel de filtros plegable y descarga a Excel. Los filtros "
        "(laboratorio, Sold To, Ship To, especie, tipo de aplicación, línea, tipo de muestra, muestreador y estado) "
        "se marcan de a varios y se acumulan: cada lista ofrece solo lo que queda con los otros filtros puestos. Se "
        "guardan por cuenta en el navegador y vencen a las 8 horas. Bajo 760 px la tabla pasa a tarjetas."))
    _sub(doc, "7.1.5 API")
    _api(doc, ["toma_muestras.py", "informes_solicitud.py"], 14, "Endpoints principales de Toma de muestras")
    _sub(doc, "7.1.6 Pruebas")
    _pruebas(doc, "tests/test_solicitud_excel.py, test_observacion_ensayo.py, test_productos_mixto.py, test_editar_permiso.py, "
                  "test_muestra_interna.py, test_informes_solicitud.py, test_quitar_informe.py, test_json_als.py y test_hoja_informe.py en "
                  "el backend; observacion.test.ts, puedeEditarSolicitud.test.ts, NuevaSolicitudView.test.tsx y SolicitudesView.*.test.tsx en el frontend.")


# -----------------------------------------------------------------------------------------------------
def _lab(doc):
    titulo(doc, "7.2 AgroFresh Lab", 2, False)
    parrafo(doc, (
        "AgroFresh Lab es un hub de tres tarjetas dentro de /modulos/agrofresh-lab. Los tres módulos comparten el "
        "permiso agrofresh_lab, pero cada cuenta puede ver solo algunos: sin ninguna sección marcada se ven las tres. "
        "Modificar los criterios de las verificaciones es un permiso aparte."))
    # ---------------- Ingreso
    titulo(doc, "7.2.1 Ingreso al laboratorio", 3, False)
    _ficha(doc, "/modulos/agrofresh-lab/ingreso", "Analistas del laboratorio y administrador general.",
           "solicitud_archivo (cruce y pesos), cruce_foto, lab_actividad, fortificado, Cloudflare R2.")
    _sub(doc, "Propósito", 4)
    parrafo(doc, (
        "Registra la llegada física de la muestra al laboratorio y la cruza con la solicitud que la originó. Es el "
        "puente entre el papel y el sistema: a partir del cruce el laboratorio sabe qué muestra corresponde a qué "
        "solicitud, con su peso y su foto."))
    _sub(doc, "Flujo de uso", 4)
    _pasos(doc, [
        "El analista abre la pestaña «Ingreso estándar» y escanea el código de la solicitud con la cámara (BarcodeDetector nativo o el lector de respaldo en WebAssembly).",
        "La ficha escaneada muestra los datos de la solicitud; el analista anota el N° de muestra y el peso, y sube una foto.",
        "Al cruzar, el sistema guarda la hora de recepción y quién lo hizo; la fila queda en verde.",
        "Con la fila cruzada se anotan el peso extraído y el peso hueso, que pasan al Excel «con muestra», a la BD de Report y al informe.",
        "Si algo está mal, «Editar cruce» corrige N° de muestra, peso y foto sin tocar la hora de recepción.",
        "En la pestaña «Ingreso fortificados» se anota el N° de fortificado y el peso extraído; el servidor pone la fecha y hora de ingreso.",
        "«Descargar base (Excel)» baja una hoja BD con las solicitudes cruzadas y los fortificados.",
    ])
    _sub(doc, "Reglas de negocio", 4)
    _reglas(doc, [
        ("Unicidad", "Un N° de muestra no puede estar en dos solicitudes (409). Los N° de fortificado no se repiten sin importar mayúsculas."),
        ("Historial", "Cada acción (cruce, edición, quitar muestra) queda en lab_actividad con el antes y el después; la foto anterior se conserva pero deja de ser la activa."),
        ("Acciones del administrador principal", "Quitar la muestra (descruzar) y eliminar una solicitud piden su contraseña, verificada también en el servidor. El valor vacío cuenta igual que ausente."),
        ("Fotos", "Se descargan con el token de sesión (componente FotoCruce); un enlace directo a la imagen daría 401."),
        ("Pruebas fuera", "Las solicitudes de prueba no aparecen en el Ingreso al laboratorio."),
    ])
    _interno(doc, "ingreso_lab")
    # ---------------- Verificaciones
    titulo(doc, "7.2.2 Verificaciones diarias (REG-03)", 3, False)
    _ficha(doc, "/modulos/agrofresh-lab/verificaciones", "Analistas, administrador de Cromatografía y administrador general.",
           "Tablas verif_* (migraciones 0026 a 0041), notificaciones de tipo verificacion.")
    _sub(doc, "Propósito", 4)
    parrafo(doc, (
        "Reemplaza el Excel con macros con que se llevaba el control diario de los equipos del laboratorio de "
        "cromatografía. Cada día se verifican micropipetas, balanza, puntos de temperatura, gases, inyector y detector, y "
        "el sistema juzga cada medición contra criterios definidos por el laboratorio."))
    _sub(doc, "Flujo de uso", 4)
    _pasos(doc, [
        "El analista abre el día (por defecto, hoy) y entra a una sección, por ejemplo micropipetas.",
        "Escribe las mediciones; el frontend calcula el veredicto en pantalla mientras escribe.",
        "Al guardar la sección, el servidor recalcula el veredicto, guarda las mediciones, congela los criterios del día y marca la sección como guardada por ese analista.",
        "Completadas las secciones, quien tenga el permiso de firma revisa el día y lo firma.",
        "La firma anota revisado_por y genera una notificación para quienes suscriben ese tipo de aviso.",
        "El histórico grafica la evolución de cada medición; el día se puede bajar en Excel o PDF.",
    ])
    _sub(doc, "Reglas de negocio", 4)
    _reglas(doc, [
        ("Cálculo en dos lugares a propósito", "verificaciones.py decide y es lo que se guarda; calculos.ts pinta el veredicto mientras se escribe. Ambos se prueban con los mismos casos: si se toca uno, se toca el otro."),
        ("Un día se juzga con sus criterios", "Cada sección congela sus criterios la primera vez que se guarda (columna criterios, migración 0040). Cambiar una tolerancia no reescribe días pasados; limpiar una sección suelta sus criterios."),
        ("Output del detector", "Es solo registro (migración 0041): se anota y se grafica, pero no tiene rango ni decide el veredicto."),
        ("Permisos", "Modificar criterios es la función «lab_criterios»; firmar el día es «verif_firmar», además del administrador general y el de Cromatografía."),
        ("Secciones por cuenta", "En Usuarios se puede limitar qué puertas de AgroFresh Lab ve cada cuenta (lab_ingreso, lab_verificaciones, lab_envio)."),
    ])
    _interno(doc, "verif")
    _sub(doc, "API", 4)
    _api(doc, ["verificaciones.py"], 12, "Endpoints principales de Verificaciones")
    # ---------------- Envío de informes
    titulo(doc, "7.2.3 Envío de informes", 3, False)
    _ficha(doc, "/modulos/agrofresh-lab/envio-informes", "Analistas del laboratorio (quien tenga agrofresh_lab) y administrador general.",
           "envio_informe_log (migración 0052), envio_informes.json y templates en R2, Gmail.")
    _sub(doc, "Propósito", 4)
    parrafo(doc, (
        "Permite subir el PDF de un informe propio de AgroFresh y enviarlo al cliente con la lista de distribución "
        "correcta, sin escribir destinatarios a mano. Se suben uno o varios PDF y cada uno sale como un correo aparte."))
    _sub(doc, "Flujo de uso", 4)
    _pasos(doc, [
        "El analista sube uno o varios PDF; el sistema lee de cada uno el Sold To, el Ship To, la especie, el tipo de aplicación y el N° de solicitud (OT).",
        "Con la OT busca la solicitud y arma el Para, CC y CCO de esa solicitud tal cual; si no hay OT, arma la lista con los datos leídos del PDF.",
        "Encima suma las copias ocultas internas del módulo (hoy Paz y Jorge) sin repetir a nadie.",
        "La tarjeta de cada informe muestra la vista previa del correo con el mismo código del envío, de modo que lo que se ve es lo que sale.",
        "Si hace falta, «Editar este correo» cambia Para, CC, CCO, asunto y texto solo de ese informe.",
        "«Enviar todos» manda uno tras otro; si uno falla, los demás igual salen y ese queda para reintentar.",
        "Cada envío queda en el historial con sus destinatarios, adjuntos y resultado.",
    ])
    _sub(doc, "Reglas de negocio", 4)
    _reglas(doc, [
        ("Modo prueba o producción", "El sistema parte siempre en prueba. En prueba todo sale solo a los destinatarios de prueba, con (PRUEBA) en el asunto y un aviso arriba que dice a quién habría ido de verdad. Pasar a producción pide la contraseña de quien lo hace (403 si falla; nunca 401)."),
        ("Laboratorio fijo", "El laboratorio es siempre AGROFRESH y los datos leídos del PDF no se editan; solo el administrador principal los habilita con su clave, y solo mientras la pantalla siga abierta."),
        ("Sin lista del cliente", "El Para queda vacío (el informe va al cliente, no al respaldo) y la tarjeta no deja enviar hasta escribir a quién."),
        ("Destinatarios fijos de servicio", "Un informe de Actimist, Ecofog o RYD sin lista del cliente toma los destinatarios fijos de su servicio."),
        ("Plantilla", "Es única y predeterminada, editable en Configuración con el mismo editor que Administración → Laboratorios. El encabezado del correo (título y subtítulo) también se edita."),
        ("Adjuntos", "PDF, Excel, CSV, ZIP, imágenes y DOCX; hasta 15 por correo, 20 MB cada uno y 24 MB en total. Un PDF debe empezar por %PDF."),
        ("Historial", "Solo el administrador principal borra registros, de a uno y con su clave; queda como cambio sensible en Actividad."),
        ("Aviso a clientes", "El aviso «ahora los informes salen por el Report Hub» vive en Administración General; es editable, con siete plantillas, y se puede probar enviándolo solo a Paz y Jorge. El envío masivo a clientes aún no existe."),
    ])
    _interno(doc, "envio")
    _sub(doc, "API", 4)
    _api(doc, ["envio_informes.py"], 12, "Endpoints principales de Envío de informes")


# -----------------------------------------------------------------------------------------------------
def _ingreso(doc):
    titulo(doc, "7.3 Ingreso de Informes", 2, False)
    _ficha(doc, "/modulos/ingesta", "Analistas (carga manual) y administrador principal (panel y bandeja del correo).",
           "carga_datos, pendiente_revision, correccion_converter, correo_informe*, informe_auditoria, R2 y el buzón del Report Hub.")
    _sub(doc, "7.3.1 Propósito")
    parrafo(doc, (
        "Reúne todas las puertas por las que un informe de laboratorio entra a Report. Antes se llamaba «Ingesta de "
        "Datos»; hoy se muestra como «Ingreso de Informes», aunque la ruta y el permiso conservan el nombre antiguo. La "
        "carga manual usa el Excel nativo o el Converter; la automática lee el buzón del Report Hub. Todas cargan por "
        "la misma función, así que las reglas de calidad son idénticas."))
    _sub(doc, "7.3.2 Las puertas de entrada")
    tabla(doc, ["Puerta", "Cómo funciona", "Quién la usa"], [
        ("Excel nativo", "Se sube un Excel; el homogenizador lo revisa contra Listados y muestra un plan antes de cargar.", "Analistas"),
        ("Converter", "Lee los PDF de Quiteca, ALS, Diagnofruit y AgroFresh, los homogeniza con Listados y los sube.", "Analistas"),
        ("Filas pendientes", "Bandeja de lo que no calzó con Listados: se corrige a mano, se reintenta o se descarta.", "Analistas"),
        ("Correo", "Un buzón recibe los informes de los laboratorios; el sistema los lee, cruza con su OT y los deja para aceptar.", "Administrador principal"),
    ], [3.2, 9.8, 3.0], "Puertas de entrada de un informe")
    _sub(doc, "7.3.3 Flujo de la carga manual con el Converter")
    _pasos(doc, [
        "El analista sube los PDF; el Converter lee cada informe con el lector de su laboratorio.",
        "Homogeniza Sold To, Ship To, especie y variedad contra Listados y aplica las correcciones aprendidas antes.",
        "Llama a /ingest/preview: el servidor responde qué informes ya existen y qué valores quedan fuera de catálogo.",
        "Si algún N° de informe ya existe, pregunta: subir y actualizar, sacarlos de la tanda o cancelar.",
        "«Subir a la base de datos» llama a /ingest/confirmar: inserta solicitud, resultados y productos con su carga_id y deja en pendientes lo que no calzó.",
        "Cada PDF se sube además a Auditoría (informe_auditoria) con la OT a la que corresponde.",
        "La carga queda en la pantalla de inicio con un botón «Deshacer».",
    ])
    _sub(doc, "7.3.4 Flujo del correo (administrador principal)")
    _pasos(doc, [
        "El buzón agrofreshreporthub@gmail.com recibe los informes. El sistema lo abre en solo lectura (BODY.PEEK) y revisa los correos con PDF.",
        "De cada PDF deduce el laboratorio, la OT y el N° de informe; busca la solicitud y compara destinatarios, planta y laboratorio.",
        "Cada informe cae en el tablero: «Por aceptar» (listos o por homogeneizar), «Revisión de envíos» (salió mal, incompleto o ya informado) o «Aceptados».",
        "«Aceptar» lee el PDF, previsualiza, carga a la base con su carga registrada, guarda el PDF y anota «enviado al cliente» con la fecha del correo.",
        "Si el informe no calza con Listados, se homogeneiza a mano en la misma pantalla y el sistema recuerda la corrección.",
        "Un envío en rojo nunca se carga: solo se puede marcar «ya informé al laboratorio», resolver con una nota o rechazar.",
    ])
    _sub(doc, "7.3.5 Reglas de negocio")
    _reglas(doc, [
        ("Validación contra Listados", "Lo que no calza (Sold To, Ship To, especie, variedad) no se inserta: queda en pendiente_revision. El Ship To se busca solo entre las plantas de su Sold To; «0» o «-» es «sin dato»."),
        ("Listado por servicio", "El Tipo Aplicación del informe decide el listado: Actimist y Ecofog usan el suyo; Línea de proceso y RYD, el general. Si las tablas del servicio no existen, la fila va a pendientes, nunca cae en el listado de Línea de proceso."),
        ("Cargas registradas", "Cada carga guarda quién, cuándo, de dónde y qué archivo. Deshacer borra exactamente esa carga y no procede si otra carga agregó resultados a sus informes (409)."),
        ("Informes que ya existen", "«Actualizar» reemplaza los datos guardados por los del archivo (un dato vacío nunca borra uno existente); «Deshacer carga» no revierte lo actualizado."),
        ("Memoria de correcciones", "El Converter y el correo guardan «texto del informe → valor oficial» dentro de su contexto (un Ship To dentro de su Sold To, una variedad dentro de su especie). Solo se aplica si el valor sigue siendo válido para ese informe."),
        ("Homogeneización automática", "Replica la del Converter: oficial, alias, sin espacios ni guiones, nombre entre paréntesis, abreviado único de al menos 5 letras y Ship To por palabras dentro de su Sold To."),
        ("Un informe es un incidente", "Quiteca reenvía el mismo informe y eso no son alertas nuevas: la bandeja muestra una fila por informe (su última copia) con su historial de envíos."),
        ("Demora", "Se mide en días hábiles (lunes a viernes, sin feriados) entre que la solicitud salió al laboratorio y que su informe llegó. Usa la fecha del correo y, si no hay, la que el sistema ya tenía."),
        ("Fechas ISO", "Las fechas año-mes-día se leen enteras; un error antiguo dejó fechas de entrada de 2001 a 2005 que se repararon con un script."),
        ("PDF sin restricciones", "Todo endpoint que sirve un informe pasa los bytes por pdf_permisos.sin_restricciones, que quita el cifrado y los campos de firma digital de la copia que se muestra."),
        ("Revisión en segundo plano", "El túnel Cloudflare corta peticiones de más de unos 100 segundos, por eso «Recibir informes ahora» lanza un hilo y la pantalla lee su avance."),
    ])
    _sub(doc, "7.3.6 Lectores de cada laboratorio")
    tabla(doc, ["Laboratorio", "Qué se lee", "Particularidades"], [
        ("Quiteca", "N° de informe, OT, Sold To (Empacador), Ship To (Lugar de muestreo), fechas y resultados.", "Es un port literal de leerQuiteca del Converter; se compara con casos dorados."),
        ("AgroFresh", "Informe propio nuevo (N° AGF…), con fecha de recepción.", "El formato antiguo, sin N° AGF, se carga con el Converter."),
        ("ALS (Microbiología)", "N° de informe, OT de la identificación de muestra, fechas, E. coli y Coliformes.", "Un resultado «<1» se guarda como texto; ALS no entrega Sold To, Ship To ni especie."),
        ("Diagnofruit", "Una página por muestra; cada una es un informe. Resultados con «Mayor a 100» guardado como >100.", "Su hoja «Para el informe» lleva la cadena de la solicitud."),
    ], [3.2, 7.0, 5.8], "Lectores de informes por laboratorio")
    _sub(doc, "7.3.7 API")
    _api(doc, ["ingest.py", "correo_informes.py", "homogenizador_ingesta.py", "registro_informes.py"], 16, "Endpoints principales de Ingreso de Informes")
    _sub(doc, "7.3.8 Pendientes")
    viñetas(doc, [
        "Probar los lectores de ALS y Diagnofruit con más informes reales.",
        "Que el panel de vista previa de la Ingesta de Excel y las sugerencias de Filas pendientes miren también los listados de Actimist y Ecofog.",
        "Definir la matriz de recepción de correos y encender la revisión automática cada 5 minutos.",
    ])


# -----------------------------------------------------------------------------------------------------
def _report(doc):
    titulo(doc, "7.4 Report", 2, False)
    _ficha(doc, "/modulos/reportes", "Personal interno, gerencia, comerciales y clientes, cada uno acotado a su alcance.",
           "solicitud, resultado, producto_aplicado, analito, analito_limite y funciones.json.")
    _sub(doc, "7.4.1 Propósito")
    parrafo(doc, (
        "Es la ventana de consulta de los resultados. Muestra, con filtros e indicadores, todo lo que está cargado en "
        "la base. Lo usan por igual el personal interno y, con un marco visual propio, los clientes y comerciales."))
    _sub(doc, "7.4.2 Estructura de la pantalla")
    _pasos(doc, [
        "Arriba, un encabezado con la foto de la especie filtrada (en el portal, un carrusel de las especies de la cuenta).",
        "Tres tarjetas de análisis (Residuos, FSMA y Fitopatología) con el total de informes de cada una; tocarlas salta al bloque.",
        "Filtros en dos grupos: Generales (laboratorio, Sold To, Ship To, tipo de servicio, N° de línea, semana, mes y rango) y Específicos, que siguen al análisis que se mira.",
        "Bloque 1, Análisis de residuos: indicadores, gráfico grande de una columna por informe y gráficos por especie e ingrediente.",
        "Bloque 2, Análisis FSMA (ALS Global): indicadores, tortas de presencia y tabla vertical por informe.",
        "Bloque 3, Análisis de fitopatología (Diagnofruit): indicadores, tortas de presencia y de nivel y tabla por informe.",
        "El clic en un punto del gráfico abre la ficha del informe con sus resultados y el PDF.",
    ])
    _sub(doc, "7.4.3 Reglas de negocio")
    _reglas(doc, [
        ("Alcance en el servidor", "Report acota por la sesión: _filtro_alcance arma las alternativas (cliente Y planta Y especie) O …; sin plantas el resultado es FALSE, nunca todo. Lo que pida el navegador solo acota más."),
        ("Servicios visibles", "Report muestra solo los tipos de servicio que el administrador principal encienda en Funciones; de fábrica, solo Línea de proceso."),
        ("Gráfico de residuos", "Una columna por informe, con una curva monótona por analito que nunca promedia ni se sale de los valores, y una curva por laboratorio con trazo distinto."),
        ("Ingrediente activo", "Es solo de residuos: no filtra los resultados de ALS ni Diagnofruit, salvo que ese laboratorio sea el elegido."),
        ("FSMA y fitopatología", "Estados Detectado / No detectado (un «<1» es No detectado). Las tortas de nivel usan la tabla del laboratorio (Botrytis, Alternaria, Geotrichum y Penicillium); no se inventan límites de otros hongos."),
        ("Límites", "Los límites residuales no se muestran a clientes ni comerciales hasta que el negocio lo decida; vienen de la tabla del laboratorio."),
        ("Descarga de BD", "La BD en Excel respeta los filtros; para un cliente se acota a su alcance y se quitan las columnas internas (correos, listas de distribución, generado por)."),
        ("Ficha del informe", "El cliente y el comercial abren la misma ficha que el personal, pero acotada por dentro (404 si no es de su alcance) y sin datos internos."),
        ("Simulación", "El botón «Simular 300 datos» existe solo para el administrador principal y solo dentro de la Vista de cliente; nunca va al backend."),
        ("Memoria de sesión", "Los datos ya traídos se guardan en memoria por sesión (la clave lleva el token) para que cambiar de pantalla no vuelva a mostrar «cargando»."),
    ])
    _sub(doc, "7.4.4 API")
    _api(doc, ["reportes.py", "ficha_informe.py"], 12, "Endpoints principales de Report")


# -----------------------------------------------------------------------------------------------------
def _panel(doc):
    titulo(doc, "7.5 Panel de control interno", 2, False)
    _ficha(doc, "/modulos/auditoria-interna", "Administrador general y a quien se asigne; los comerciales ven algunas pantallas acotadas a sus plantas.",
           "solicitud_archivo, informe_auditoria, envio_solicitud_log, envio_informe_log, informe_visto, plan_entregable, carga_datos.")
    parrafo(doc, (
        "Antes se llamaba «Auditoría interna»; solo cambió el nombre que se ve, no las rutas ni el permiso. Es un hub "
        "con tres pantallas."))
    titulo(doc, "7.5.1 Solicitudes e informes (lead time)", 3, False)
    parrafo(doc, (
        "Compara las solicitudes emitidas con los informes recibidos. Muestra barras de solicitudes por laboratorio, "
        "dos donas por tipo de servicio, el gráfico «Análisis por cliente» con las columnas de entregables del plan, "
        "una tabla dinámica por tipo de servicio y laboratorio, y el Lead time con su flujograma."))
    _reglas(doc, [
        ("Hitos reales", "Cada número sale de fechas guardadas: emitida (creado_en), enviada al laboratorio (envío exitoso), informe (fecha de envío o de subida), Report (carga), cliente (envío en modo producción o marca a mano) y observado (primera vez que un cliente abrió el informe)."),
        ("Único supuesto", "La recepción en el laboratorio se estima 24 horas después de emitida la solicitud (RECEPCION_ESTIMADA_DIAS = 1), porque no se sabe cuándo retiran las muestras. Desde ahí corren todos los tiempos y plazos, en días hábiles sin feriados."),
        ("Se miden informes", "La solicitud existe apenas se crea; lo que se entrega, y puede atrasarse, es el informe. Una OT con varios informes (uno por vial) cuenta una vez."),
        ("Enviado al cliente a mano", "Puede marcarse en el Converter o en Solicitudes e informes; el hito toma la fecha más antigua entre el envío real y la marca manual."),
        ("Informes propios", "No pasan por el Converter, así que no tienen fila en informe_auditoria; el sistema los reconoce por la referencia en Report y puede guardarles una fecha de envío manual."),
        ("Plazos", "Se fijan por laboratorio y por análisis; a cada solicitud la rige su análisis más lento. Sin plazo cargado no se juzga."),
    ])
    titulo(doc, "7.5.2 Rendimiento de calidad", 3, False)
    parrafo(doc, (
        "Responde, por cliente y por semana, cuántos informes cumplen y cuántos no, por análisis. Tiene dos vistas del "
        "mismo dato: «Por cliente» (una fila por Ship To, ordenada del que más no cumple) y «Por semana» (se elige "
        "cliente y planta). Un clic abre el detalle de los informes de esa planta, los que no cumplen primero."))
    _reglas(doc, [
        ("Residuales", "Se juzgan contra límites por especie y servicio: sobre el máximo o bajo el mínimo es no cumple. Hay tablas para Línea de proceso, Actimist y Ecofog (esta última igual a la de Actimist, por confirmar)."),
        ("FSMA", "Es «hay / no hay»: detectó algo es no cumple."),
        ("Fitopatología", "Se juzga por el nivel de Botrytis, Alternaria, Geotrichum y Penicillium; solo Óptimo cumple (pendiente confirmar si Moderado cumple)."),
        ("General", "Es el promedio simple del porcentaje que no cumple de los análisis con informes, y se marca en rojo desde 40 % (corte por confirmar)."),
        ("Sin criterio", "Un informe que no se puede juzgar no entra a la cuenta y se informa aparte."),
    ])
    titulo(doc, "7.5.3 Vista de límites", 3, False)
    parrafo(doc, (
        "Es el mismo Report con dos modos: «Límites residuales», con franjas fijas por especie y analito tomadas de la "
        "tabla del laboratorio, y «Límites de control», con promedio más menos N desviaciones. Agrega la tarjeta "
        "«Informes fuera de rango» y, abajo, el gráfico «Fuera de rango por cliente» y una dona por especie o analito, con "
        "el detalle de cuánto se pasaron. Los filtros son de varios valores."))
    _sub(doc, "7.5.4 API")
    _api(doc, ["auditoria_interna.py", "entrega_indicadores.py", "rendimiento_calidad.py"], 10, "Endpoints principales del Panel de control interno")


# -----------------------------------------------------------------------------------------------------
def _postventa(doc):
    titulo(doc, "7.6 Post Venta (Accu-Tab) y Costo por kilo", 2, False)
    _ficha(doc, "/modulos/trace (equipo) y Reportes Accutab (cliente)", "Equipo de Post Venta; clientes y comerciales ven sus informes en su portal.",
           "Storage/Accutab, Storage/CostoKilo, accutab/mail y costo_kilo/ en R2, registro.json por carga.")
    titulo(doc, "7.6.1 Informes de Accu-Tab (pH y ORP)", 3, False)
    parrafo(doc, (
        "Cada carga de un equipo Accu-Tab, manual desde Trace o automática desde el correo, termina con su informe PDF "
        "generado por el sistema, el mismo que imprime Trace. Quedan ordenados por cliente y fecha en R2: "
        "accutab/mail/<CLIENTE>/<AAAA-MM-DD>/Informe <hora>.pdf y, al lado, los archivos del equipo."))
    _pasos(doc, [
        "El equipo de Post Venta sube la carga en Trace, o el correo del equipo llega al buzón.",
        "El sistema lee las mediciones, genera el informe PDF con el gráfico de pH y mV, y guarda disco y R2.",
        "En el reporte, el equipo filtra por Sold To, Ship To, posición de muestreo, equipo, semana y rango de fechas.",
        "Elige un informe de la lista y ve sus cifras y los gráficos de pH y ORP, cada uno en su escala.",
        "Descarga la «BD de registros» (una fila por medición) o la «BD de informes» (una fila por informe) en Excel.",
        "El cliente ve «Tus informes Accu-Tab» con los mismos filtros, acotado a su cliente y Ship To.",
    ])
    _reglas(doc, [
        ("Acotado en el servidor", "El router del cliente cuelga de CON_SESION y acota por dentro: un cliente sin cliente asignado no ve nada; lo que pida por parámetro se descarta."),
        ("Gmail y las etiquetas", "Gmail no quita por IMAP la etiqueta de la carpeta abierta; por eso cada correo se anota por su Message-ID y no se vuelve a subir."),
        ("Borrado", "Borrar una carga quita también sus archivos de R2 (registro.json guarda r2_claves)."),
        ("Mismo reporte para equipo y cliente", "ReporteAccutab es un único componente armado como el Report de laboratorio."),
    ])
    titulo(doc, "7.6.2 Costo por kilo (equipo C&M-500)", 3, False)
    parrafo(doc, (
        "Informe de cuánto producto se gastó cada día —litros de solución madre y de producto comercial por ingrediente "
        "activo—, no de cuánto cuesta en dinero. Se lee el CSV original del equipo, sin tabular."))
    _pasos(doc, [
        "En Trace, pestaña «Costo por kilo», se elige el CSV; el sistema muestra una vista previa de lo leído.",
        "Se escoge el Sold To y Ship To de Listados, la línea y el equipo, y se guarda en el servidor.",
        "El sistema calcula el valor diario, genera el informe PDF y el Excel con gráficos, y archiva en R2.",
        "En Reportes Accutab aparece la tarjeta «Costo por kilo» y su sección con indicadores, un chip por ingrediente activo y dos gráficos.",
    ])
    _reglas(doc, [
        ("Contadores acumulados", "Los contadores del equipo vuelven a cero al preparar una piscina nueva: el valor diario es la suma de los incrementos entre lecturas. Si el contador baja es un reinicio y se cuenta desde el valor nuevo, nunca resta."),
        ("Días parciales", "El primer día, el último o un día con menos de 24 lecturas es «parcial» y se dibuja con barra tenue."),
        ("ml/kg", "Se calcula como litros por 1000 dividido por los kg de fruta."),
        ("Gráficos", "Copian la plantilla del cliente: barras de kg de fruta al cierre del día y líneas de carga inicial y de litros por activo; el valor va dentro de cada barra y las líneas no se suavizan."),
        ("Correo pendiente", "El correo del equipo está a la espera de una matriz de recepción (asunto a cliente, planta y línea); mientras no exista, el CSV queda en costo_kilo/por_clasificar/ y no se genera informe."),
    ])
    _sub(doc, "7.6.3 API")
    _api(doc, ["postventa.py", "costo_kilo_api.py"], 12, "Endpoints principales de Post Venta y Costo por kilo")


# -----------------------------------------------------------------------------------------------------
def _storage(doc):
    titulo(doc, "7.7 Storage", 2, False)
    _ficha(doc, "/modulos/storage", "Quien tenga el módulo; los clientes ven solo la carpeta de su Ship To.",
           "storage_permiso (migración 0043), Cloudflare R2, disco del servidor (STORAGE_DIR).")
    _sub(doc, "7.7.1 Propósito")
    parrafo(doc, (
        "Explorador de archivos tipo file manager con cinco entradas: Archivos del servidor, Solicitudes, Accutab, "
        "Laboratorio AgroFresh e Informes. Soporta lista y cuadrícula, vista previa de imágenes, PDF y texto, favoritos "
        "(en el navegador de cada persona) y búsqueda global con la tecla «/»."))
    _sub(doc, "7.7.2 Qué se puede modificar en R2")
    tabla(doc, ["Espacio", "Se puede", "No se puede"], [
        ("Accutab (accutab/mail)", "Administrarse entero.", "Borrar su carpeta base."),
        ("Solicitudes (solicitudes)", "Crear, renombrar y mover carpetas.", "Subir archivos, borrar (se hace desde Toma de muestras) ni mover archivos sueltos."),
        ("Informes (informes)", "Ver, descargar y borrar.", "Subir o renombrar."),
        ("_config", "Nada.", "Nunca se toca ni se mueve."),
    ], [4.0, 6.0, 6.0], "Reglas de modificación por espacio de R2")
    _sub(doc, "7.7.3 Permisos por carpeta")
    _reglas(doc, [
        ("Sin filas, abierta", "Una carpeta sin reglas la ve todo el que tenga el módulo; aplicar la migración no cambió nada de lo existente."),
        ("Con filas, restringida", "Solo esas cuentas, más administrador general y gerencia; se aplica al listar y al descargar o escribir."),
        ("Herencia", "Las subcarpetas heredan la regla más cercana hacia arriba y solo pueden restringir más, nunca ampliar."),
        ("Acompañan a la carpeta", "Renombrar, mover o borrar una carpeta acompaña su regla."),
    ])
    _sub(doc, "7.7.4 Estructura de Informes")
    parrafo(doc, (
        "Cada PDF de informe que se sube por el Converter, llega por correo o se genera como informe propio queda en "
        "informes/<PLANTA>/<LABORATORIO>/Informes/<FECHA DEL INFORME>/<archivo>.pdf. Al lado, en "
        "<LABORATORIO>/Solicitudes/<FECHA>/<OT>.pdf, queda el PDF de la solicitud de cada informe, con su lista de "
        "distribución. La carpeta Solicitudes es solo para el personal: los clientes y comerciales no la ven ni pueden abrirla."))
    nota(doc, "Esta estructura cambió el 29 y 30 de octubre de 2026: antes incluía una carpeta de tipo de servicio y ordenaba por fecha de muestreo. "
              "Dos scripts de operación mueven y completan lo ya guardado (reordenar_informes_storage.py y completar_solicitudes_storage.py).",
         "Cambio reciente", "E9F5E7")
    _sub(doc, "7.7.5 Portal del cliente")
    parrafo(doc, (
        "Una cuenta cliente que entra a Storage ve solo la carpeta de su Ship To, con el mismo explorador del personal en "
        "solo lectura. Una cuenta de sucursal ve su planta y una de Sold To las plantas de su cliente. Una cuenta limitada "
        "a una especie no abre la carpeta de la planta, porque las carpetas no distinguen especie."))
    _sub(doc, "7.7.6 API")
    _api(doc, ["storage.py", "informes_cliente.py"], 12, "Endpoints principales de Storage")


# -----------------------------------------------------------------------------------------------------
def _admin(doc):
    titulo(doc, "7.8 Administración", 2, False)
    _ficha(doc, "/admin/*", "Administrador general; algunas acciones, solo el administrador principal con su contraseña.",
           "usuario, notificacion*, contactos_laboratorio.json, funciones.json, panel_inicio.json, plan_entregable, correccion_converter.")
    parrafo(doc, (
        "Reúne todo lo que nunca se reparte entre cuentas: no existe como permiso. Se organiza en secciones; cada una "
        "tiene su propia lógica pura con pruebas."))
    titulo(doc, "7.8.1 Usuarios", 3, False)
    parrafo(doc, (
        "El formulario va en tres pasos: quién es, tipo de cuenta y qué puede hacer. El tipo decide el alcance: "
        "Administrador general (todo) y Gerencia se ven marcados y bloqueados; Administrador de área, Analista y "
        "Muestreador parten de una plantilla típica ajustable; Cliente no tiene área y se le eligen su Sold To, Ship To y "
        "qué ve; Comercial lleva una lista de plantas."))
    _reglas(doc, [
        ("Catálogo por categoría", "Data Core, Resultados y auditoría, AgroFresh Lab, Toma de muestras y Archivos, con «Marcar todo» por categoría; quitar al padre quita a los hijos."),
        ("Funciones sueltas", "Se asignan a propósito y marcar al padre no las da: lab_criterios, verif_firmar, toma_reanalisis, toma_editar, toma_muestra_interna y vista_cliente."),
        ("Cliente con varios accesos", "Una cuenta cliente puede llevar una lista de accesos (Sold To, planta y especie, una fila por especie) en la misma columna plantas_asignadas de los comerciales."),
        ("Comercial con todas las plantas", "Una casilla permite que un comercial vea las plantas de todos los clientes, siempre en solo lectura."),
        ("Lista de usuarios", "Buscador sin tildes, filtros por tipo con su conteo y una columna «Qué ve» con chips."),
        ("Normalización", "El servidor deduce el área de lo que la cuenta ve y descarta lo incoherente (normalizar_cuenta)."),
    ])
    titulo(doc, "7.8.2 Listados y listas de distribución", 3, False)
    parrafo(doc, (
        "Listados mantiene Sold To, Ship To, especie y variedad, con un selector de tipo de servicio. Las listas de "
        "distribución son una tabla dinámica: una fila por planta y una columna por rol (Admin Report Hub, Comercial, Técnico) "
        "y por especie. Todo cambio es una propuesta sobre una celda: lo que sale de importar un Excel queda en amarillo y "
        "se acepta o rechaza celda por celda; lo editado a mano queda en verde. Nada se escribe hasta «Guardar», que deja "
        "antes un respaldo con la fecha."))
    _reglas(doc, [
        ("Una celda vacía no quita a nadie", "Para sacar a alguien se quita su correo de la celda."),
        ("Plantas nuevas", "Si el nombre no existe en Listados, la fila avisa y sugiere los parecidos; al guardar se crea también en Listados."),
        ("Plantas que el Excel ya no trae", "Importar nunca las borra; la tarjeta roja las ofrece con casillas desmarcadas."),
        ("Renombrar una planta", "Cambia el nombre en Listados y en los contactos de todas las listas que lo comparten, sin perder a nadie."),
    ])
    titulo(doc, "7.8.3 Funciones, avisos y plan de entregables", 3, False)
    tabla(doc, ["Sección", "Qué hace", "Quién puede cambiarla"], [
        ("Funciones", "Enciende qué tipos de servicio muestra Report, los gráficos de ALS y Diagnofruit y el estilo del portal.", "Solo el administrador principal, con su contraseña"),
        ("Avisos a clientes", "Edita y prueba el aviso con siete plantillas de correo.", "Administrador general"),
        ("Plan de entregables", "Carga el plan de análisis prometido por cada comercial (por Sold To) para compararlo con lo realizado.", "Administrador general"),
        ("Correcciones del Converter", "Historial de lo aprendido; permite olvidar una asociación equivocada.", "Administrador general"),
    ], [3.6, 8.4, 4.0], "Secciones de Administración General")
    titulo(doc, "7.8.4 Panel de inicio editable", 3, False)
    parrafo(doc, (
        "El administrador arma, como un tablero de 12 columnas, qué widgets ve cada tipo de cuenta o cada cuenta en su "
        "Panel general. Los widgets se arrastran desde una paleta; verde significa que cabe y rojo que no hay espacio. "
        "La clave de un diseño es usuario:<id>, tipo:<tipo>:<área> o tipo:<tipo>, y la más específica gana. Sin diseño, "
        "la cuenta ve su panel de siempre: personalizar nunca deja a nadie sin panel."))
    titulo(doc, "7.8.5 Actividad, Seguimiento y Resumen", 3, False)
    parrafo(doc, (
        "El Resumen muestra usuarios activos, solicitudes, informes concretados, días de solicitud a informe y la salud "
        "de los datos. Actividad arma la historia de cada persona uniendo tablas que ya existían más la bitácora "
        "(actividad_usuario). Seguimiento clasifica cada cuenta (activa, en alza, en baja, nueva, dormida) y muestra un "
        "mapa de calor día por hora. Todas las llamadas que escriben quedan anotadas automáticamente por un middleware."))
    _sub(doc, "7.8.6 API")
    _api(doc, ["usuarios.py", "listas_distribucion.py", "listados.py", "funciones.py", "plan_carga.py", "panel_inicio.py", "admin_panel.py", "notificaciones.py"], 16,
         "Endpoints principales de Administración")


# -----------------------------------------------------------------------------------------------------
def _portal(doc):
    titulo(doc, "7.9 Portal de clientes y comerciales", 2, False)
    _ficha(doc, "/modulos/reportes/laboratorio (inicio), /modulos/storage, Reportes Accutab", "Cuentas cliente y comercial.",
           "usuario.plantas_asignadas, reportes._filtro_alcance, funciones.json (estilo).")
    _sub(doc, "7.9.1 Propósito")
    parrafo(doc, (
        "Entrega al cliente y al comercial sus propios resultados con un marco visual dedicado. Estas cuentas no ven la "
        "barra lateral: usan una barra de vidrio flotante con el logo y los accesos que su cuenta permite. Lo primero que "
        "ven son los gráficos."))
    _sub(doc, "7.9.2 Qué incluye")
    viñetas(doc, [
        ("Navegación", "Menú «Análisis de Laboratorio» (Report), «Informes de Laboratorio» (Storage) y «Reportes Accutab»."),
        ("Saludo", "Encabezado con la foto de la especie filtrada; con varias especies, un carrusel con fundido lento."),
        ("Filtros pegajosos", "Al bajar, la tarjeta de filtros se junta con la barra y queda en una banda delgada con «Mostrar filtros»."),
        ("Teléfono", "Barra plegable en horizontal, filtros en una hoja desde un botón flotante, tarjetas por informe y un gráfico deslizable con su ficha fija."),
        ("Dos estilos", "Básico y Sobrio; el administrador principal fija el predeterminado, el estilo por tipo de cuenta y por cuenta. Los gráficos de Sobrio cambian solo sus tortas."),
        ("Vista de cliente", "Permite a quien tenga esa función ver el portal con su propia cuenta para auditar cómo lo ve cada cliente, en solo lectura."),
    ])
    _sub(doc, "7.9.3 Reglas de negocio")
    _reglas(doc, [
        ("Solo lectura", "Los clientes y comerciales no pueden crear, editar, subir ni borrar nada."),
        ("Acotar por dentro", "Todo endpoint abierto a estas cuentas debe acotar a sus plantas; un endpoint nuevo en CON_SESION sin acotar sería un hueco de seguridad."),
        ("Rendimiento", "No se usa filter: blur() ni backdrop-filter en elementos grandes que se animen: bajaban el desplazamiento a 20 cuadros por segundo."),
        ("Movimiento reducido", "Las animaciones constantes se apagan con prefers-reduced-motion."),
        ("Revisión visual", "Cualquier cambio del portal se prueba en Playwright a 412×860, 860×400, 740×360 y 1100×450, comparando scrollWidth con clientWidth."),
    ])


# -----------------------------------------------------------------------------------------------------
def _monitoreo(doc):
    titulo(doc, "7.10 Monitoreo", 2, False)
    _ficha(doc, "/monitoreo", "Solo el administrador principal.", "presencia, presencia_sesion, actividad_usuario; migraciones 0068 a 0070.")
    _sub(doc, "7.10.1 Propósito")
    parrafo(doc, (
        "Una pantalla pensada para el teléfono, a propósito oscura, con la que el administrador principal ve de un "
        "vistazo quién está conectado, dónde está, qué hizo, cuánto tiempo usó el sistema, los informes que llegaron y los "
        "últimos envíos. Se actualiza sola cada 20 segundos con la pantalla a la vista."))
    _sub(doc, "7.10.2 Cómo se mide")
    _reglas(doc, [
        ("Latido", "El frontend manda un latido al cambiar de pantalla y cada 60 segundos mientras la pestaña está a la vista. En línea es un latido de los últimos 3 minutos; estuvo hace es hasta 30 minutos."),
        ("Activo, en pausa o segundo plano", "Activo es haber tocado algo hace 3 minutos o menos; en pausa es una pestaña abierta sin tocar; segundo plano es una pestaña oculta."),
        ("Visitas", "Cada visita guarda el cliente y la planta de la cuenta; el tiempo de uso suma solo los latidos con la pestaña a la vista y algo tocado, sin contar la pausa."),
        ("Clientes que se conectaron", "Agrupa por cuenta (cliente y comercial) en hoy, 7 y 30 días; solo cuenta desde que se instaló."),
        ("Detalle por persona", "La hoja de una persona muestra su estado, su pantalla actual, el aparato, la versión, su tiempo por módulo aproximado, sus conexiones recientes y a qué Sold To y Ship To pertenece."),
        ("App instalable", "Es una PWA con un service worker mínimo que no guarda datos ni respuestas de la API: son resultados de laboratorio."),
    ])
    _sub(doc, "7.10.3 API")
    _api(doc, ["monitoreo.py", "actividad.py"], 6, "Endpoints principales de Monitoreo")


# -----------------------------------------------------------------------------------------------------
def _servicios(doc):
    titulo(doc, "7.11 Servicios y listas de distribución", 2, False)
    parrafo(doc, (
        "Cada tipo de servicio tiene su listado de Sold To y Ship To y su lista de distribución. Todo lo que existía antes "
        "es de Línea de proceso, que es el valor por defecto. La regla vive en servicios.py (clave_servicio), con espejo en "
        "el frontend (src/lib/servicio.ts); ambos se prueban con los mismos casos."))
    tabla(doc, ["Servicio", "Listado", "Lista de distribución", "Destinatarios fijos"], [
        ("Línea de proceso", "cliente / planta", "Contactos sin servicio", "Ninguno; sin lista, Jorge y Claudia"),
        ("RYD", "Comparte el de Línea de proceso", "Propia (servicio ryd)", "Para: Carla y Fran; copia: Jorge y el Report Hub"),
        ("Actimist", "cliente_actimist / planta_actimist (0049)", "Propia (servicio actimist)", "Para: Carlos Jiménez y Cristian Valenzuela; copia: Jorge y el Report Hub"),
        ("Ecofog", "cliente_ecofog / planta_ecofog (0050), copia de Actimist", "Propia (servicio ecofog)", "Los mismos que Actimist"),
    ], [2.8, 4.4, 3.8, 5.0], "Tipos de servicio y sus listas")
    _reglas(doc, [
        ("Marca de las reglas nuevas", "Las reglas actuales de las listas rigen solo para las solicitudes con la marca respaldo_ryd (nombre histórico); las anteriores se ven como se emitieron."),
        ("Fijos editables", "Los destinatarios fijos se editan en Administración General, con una memoria de 15 segundos por proceso; las solicitudes de prueba siempre van a Jorge y el Report Hub."),
        ("Contactos por envío", "Cada contacto lleva envio (para, cc o bcc); nadie va dos veces, comparado sin mayúsculas."),
        ("Técnicos y comerciales", "Siempre van, con o sin lista del laboratorio: los comerciales en copia y los técnicos en copia oculta."),
        ("Aislamiento", "Un contacto de un servicio nunca se mezcla con los de otro."),
    ])


# -----------------------------------------------------------------------------------------------------
def _seguridad(doc):
    titulo(doc, "7.12 Seguridad y control de acceso", 2, False)
    parrafo(doc, (
        "La seguridad es por capas: la sesión identifica a la persona, el router decide quién puede entrar, y cada "
        "consulta acota por dentro lo que esa persona puede ver."))
    tabla(doc, ["Capa", "Mecanismo", "Efecto"], [
        ("Autenticación", "Token de sesión con hash en la base (tabla sesion).", "Sin sesión válida, 401 y el navegador cierra la sesión."),
        ("Entrada a los routers", "SOLO_AGROFRESH, CON_SESION o interno_o_comercial_acotado.", "Un router nuevo nace cerrado a clientes y comerciales."),
        ("Lista blanca del comercial", "auth.RUTAS_COMERCIAL (método y ruta).", "Todo lo demás da 403 a un comercial."),
        ("Acotado por dentro", "reportes._filtro_alcance, planta_permitida, plantas_de_comercial.", "Un cliente o comercial solo ve sus plantas y especies."),
        ("Escritura", "solo_escribiente y solo_interno.", "Gerencia, comerciales y clientes nunca escriben."),
        ("Acciones delicadas", "Contraseña del administrador principal verificada en el servidor (confirmar_clave).", "403 si falla; nunca 401."),
        ("Bitácora", "Middleware RegistroActividad y actividad_usuario.", "Toda llamada que escribe queda anotada; los borrados van como cambios sensibles."),
    ], [3.4, 6.4, 6.2], "Capas de seguridad")
    _reglas(doc, [
        ("Secretos", "Las credenciales de Gmail y R2 y los tokens viven solo en el .env del backend; nunca en el código, el frontend ni los logs. El OAuth ocurre solo en el backend."),
        ("Un 401 cierra la sesión", "Por eso una clave de Gmail rechazada responde 503 y una contraseña equivocada del principal, 403."),
        ("Pruebas aisladas", "El conftest vacía R2, Gmail y Resend y apaga la base aun si el .env apunta a producción."),
        ("Copias de seguridad", "El script respaldar.ps1 hace el respaldo manual de la base; las listas de distribución guardan un respaldo con fecha antes de cada cambio."),
    ])
