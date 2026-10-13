# AgroFresh Report Hub — contexto para Claude

> ## ⚡ PRIMERO DE TODO: si el primer mensaje del chat es `start`
> (también `/start`, `Start` o `inicio`). El usuario trabaja en muchos chats cortos para ahorrar tokens y
> **necesita que lo primero que se abra sea el aviso de despliegue**, con la última actualización en que quedaron.
> Haz esto **antes que cualquier otra cosa**, sin preguntar y sin empezar otra tarea:
> 1. Lee el Artifact **https://claude.ai/artifact/A1q3w9WBh2Zc3sStYRuYDE** con `Artifact` `action: "read"`
>    (es la versión vigente: la que dejó el último chat). Anota el `data-n` de `<div class="version">` (la «Actualización #N»)
>    y los pasos del servidor que trae (los `<li class="manual">` y los bloques `<h3>` de comandos: pull, migración,
>    reinicio, script).
> 2. Ábrelo con `Artifact` `action: "open"` sobre ese mismo `url` (así queda a la vista en el panel).
> 3. Responde en español con **UNA línea**: el enlace, «Actualización #N» y qué pasos manuales del servidor quedan
>    (o «nada que hacer en el servidor»). Nada más.
> **No lo republiques, no crees otro artifact y no empieces nada más** hasta que el usuario pida algo.
> Lo mismo hace el comando `.claude/commands/start.md`. Si `open` falla, igual da el enlace y el número.

Este archivo se lee solo al empezar cada sesión. Si algo acá quedó viejo,
corrígelo: es la memoria del proyecto entre conversaciones.

Para el detalle profundo (esquema de base, módulo por módulo, decisiones de
negocio) está **`PROJECT_CONTEXT.md`** en esta misma carpeta.

---

## Cómo trabajar acá

- **Responde siempre en español.**
- **Dos ramas, dos papeles** (ver "Flujo de ramas" más abajo):
  - `claude/modulo-x-implementation-plan-3zhite` = **desarrollo**. Todo se
    commitea y pushea ahí. Nunca directo a `main`.
  - `main` = **la estable, la que está en producción**. Solo recibe cambios
    por PR desde la rama de desarrollo, cuando el usuario decide publicarlos.
- **Da los comandos de PowerShell completos y exactos**, con la ruta puesta.
  Nunca "reinicia el backend" a secas.
- **Cada vez que termines un cambio, publícalo de una**: commit y push a la rama de desarrollo, PR a `main` y fusión (regla del usuario, 06-10-2026), para que en el servidor solo haga falta `git pull origin main` y reiniciar el backend. Avisa siempre si el cambio trae migración y dalo con el comando exacto.
  **OBLIGATORIO, SIN QUE LO PIDA, en CADA entrega (aunque sea chica):** al terminar, publica/actualiza el Artifact de abajo con el pull, la migración (si hay) y el reinicio del backend. No cierres el turno sin haberlo hecho: el usuario lo reclamó el 07-10-2026 cuando se olvidó.
  **Formato del aviso final** (pedido del usuario): publica un **Artifact** con una tarjeta (título «Listo para publicar», pasos con ✓ Merge listo y Manual para Pull, Script y Reiniciar backend, y una casilla de código con botón «Copiar»), actualizando siempre el MISMO artifact: **https://claude.ai/artifact/A1q3w9WBh2Zc3sStYRuYDE** (el usuario trabaja en chats distintos y lo deja abierto en una pestaña: en un chat nuevo, léelo con `action: "read"` y publica con ese `url`, nunca crees otro), y en el chat solo el enlace y una línea. **La tarjeta lleva una insignia «Actualización #N»** (con fecha y hora de Chile; `data-n` en el HTML) **y un color que rota** (verde, azul, violeta, naranja, rosa, turquesa: el color es `N mod 6`) para que se note a simple vista que es una versión nueva: al publicar, lee el `data-n` del artifact, súmale 1 y cambia el color según el nuevo N. **Los comandos van SEPARADOS por consola, cada bloque con su propio botón «Copiar» y en el orden en que se corren** (el usuario tiene una consola para el pull, otra para el backend y otra para los `.venv`): 1) consola de pull (`git checkout main`, `git pull origin main`); 2) consola `.venv`: migración; 3) consola del backend: Stop/Start-ScheduledTask; 4) consola `.venv`: scripts. Nunca todo junto en una sola casilla. El script va solo como `.venv\Scripts\python.exe scripts\migrar.py NNNN_nombre.sql`, **sin `cd backend`** (el usuario tiene una PowerShell abierta ya dentro de `backend`). Sin migración, se omite el paso del script.

- **`start` al empezar un chat**: ver el recuadro del principio de este archivo (abre el aviso de despliegue).

### Reglas de seguridad (no negociables)

- Nunca escribas credenciales en el código.
- Nunca commitees archivos `.env` (ya están en `.gitignore`).
- Nunca expongas refresh tokens, client secrets ni access keys en logs ni en
  el frontend.
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` y las
  credenciales de R2 viven **solo** en el `.env` del backend.
- Todo OAuth ocurre exclusivamente en el backend.

---

## Dónde corre el sistema

| Pieza | Dónde |
|---|---|
| Frontend | Vercel: producción sale de `main`; la rama de desarrollo genera *previews* |
| Backend + Postgres | **Servidor de la oficina** (Windows), tras un túnel Cloudflare |
| R2 | Solo archivos y respaldos. **No** es base de datos. |

Render + Neon **se abandonaron**. Si ves un servicio de Render activo, es
huérfano y hay que darlo de baja.

Ruta del proyecto en el servidor:
`C:\Users\Servidor Agrofresh\Documents\Sistemas\Agrofresh Report Hub\agrofresh_report_hub`

---

## Flujo de ramas

Se trabaja en paralelo: mientras se desarrolla, lo que está en producción no
se mueve.

1. Se programa y se prueba en `claude/modulo-x-implementation-plan-3zhite`.
   Cada push genera un *preview* en Vercel para mirarlo antes de publicar.
   **Ojo:** el preview llama al mismo backend y a la misma base de
   producción, así que lo que se guarde ahí es real.
2. Cuando algo está listo y el usuario lo pide, se abre un PR de la rama a
   `main` y se fusiona. Vercel publica producción solo con eso.
3. En el servidor de la oficina se hace `git pull origin main` y se reinicia
   el backend (comandos abajo). El servidor **nunca** queda en la rama de
   desarrollo.
4. Después de fusionar se sigue en la misma rama de desarrollo, sin
   recrearla: `main` solo le suma commits de merge.

Un cambio de backend que necesita migración se publica junto con ella: la
migración se corre en el servidor **antes** de reiniciar.

---

## Comandos que se usan de verdad

```powershell
# Actualizar el servidor (SIEMPRE desde main, la estable)
git checkout main
git pull origin main

# Migraciones (una por archivo, en orden)
cd backend
.venv\Scripts\python.exe scripts\migrar.py 0026_verificaciones_diarias.sql
.venv\Scripts\python.exe scripts\migrar.py 0044_auditoria_interna.sql
.venv\Scripts\python.exe scripts\migrar.py 0045_correcciones_converter.sql
.venv\Scripts\python.exe scripts\migrar.py 0047_actividad_usuario.sql
.venv\Scripts\python.exe scripts\migrar.py 0051_fortificados.sql
.venv\Scripts\python.exe scripts\migrar.py 0048_peso_extraido.sql
.venv\Scripts\python.exe scripts\migrar.py 0049_listado_actimist.sql
.venv\Scripts\python.exe scripts\migrar.py 0050_listado_ecofog.sql
.venv\Scripts\python.exe scripts\migrar.py 0052_envio_informes.sql
.venv\Scripts\python.exe scripts\migrar.py 0054_envio_informe_solicitud.sql
.venv\Scripts\python.exe scripts\migrar.py 0055_solicitud_servicio.sql
.venv\Scripts\python.exe scripts\migrar.py 0057_informe_visto.sql

# Reiniciar el backend (después de cada git pull: el código nuevo NO entra solo)
Stop-ScheduledTask -TaskName "AgroFresh Report Hub - Backend"
Start-Sleep -Seconds 3
Start-ScheduledTask -TaskName "AgroFresh Report Hub - Backend"

# Estado general del servidor
.\deploy\windows\estado.ps1
```

**El backend lo levanta una tarea programada de Windows**, "AgroFresh Report
Hub - Backend" (la instala `deploy/windows/2-instalar-backend.ps1`). Escucha en
`127.0.0.1:8000` con 4 workers y escribe en `logs/backend.log`. **No lo
arranques a mano**: ver la trampa del doble backend más abajo.

Los scripts que **escriben** en la base miran primero y solo aplican con
`--aplicar`. Respeta esa convención al crear scripts nuevos.

| Script | Para qué |
|---|---|
| `scripts/revisar_catalogo_analitos.py` | Estado del catálogo de analitos |
| `scripts/sembrar_catalogo_analitos.py` | Crea analitos faltantes y enlaza resultados sueltos |
| `scripts/reconciliar_indice.py` | Saca del índice solicitudes borradas por fuera de la app |
| `scripts/clave.py` | Asigna contraseña a una cuenta |
| `scripts/limpiar_bd_excel.py` | Normaliza el Excel maestro BD antes de ingestar (laboratorio, guiones, GC) |
| `scripts/actualizar_codigos_sap.py` | Actualiza `codigo_sap` en `cliente`/`planta` desde el Excel maestro SAP |
| `scripts/sembrar_especies_variedades.py` | Crea especies y variedades estándar en `valor_lista` desde el Excel BD |
| `scripts/copiar_bcc_contacto.py` | Pone a alguien en copia oculta de resultados en todas las plantas donde ya está otra persona (`--lista` para ver quiénes) |
| `scripts/congelar_criterios_verificaciones.py` | Congela los criterios de los días de verificación guardados antes de la 0040 (`--param clave=valor` con los valores viejos) |
| `scripts/vaciar_reportes.py` | Borra los datos de Report (solicitud, resultado, producto_aplicado, pendientes). Deja Listados y analitos. Pide escribir "SI" |
| `scripts/cargar_listado_actimist.py` | Carga el listado de Actimist (Sold To / Ship To) desde la dinámica del Planner (`--aplicar` para escribir). Lo mismo desde Listados → Actimist → Importar Excel |
| `scripts/reintentar_pendientes_ingesta.py` | Reprocesa las filas pendientes y descarta las que siguen sin Ship To válido (respaldo en `logs/`) |
| `scripts/limpiar_duplicados_accutab.py` | Borra reportes de Post Venta y carpetas `accutab/mail/` duplicados por la ingesta de correo (deja uno por correo) |
| `scripts/cruce_informes.py` | Solo lee: explica por qué «Solicitudes e informes» (OT con informe) y Report (informes) no dan el mismo número (`--lab Quiteca`) |
| `scripts/completar_desde_pdf_quiteca.py` | Completa los informes de Quiteca ya cargados leyendo su PDF guardado: N° de muestra, hora de muestreo y fechas de análisis/informe (solo lo vacío; necesita la 0053 y `pypdf`; `--aplicar` para escribir, respaldo en `logs/`) |
| `scripts/generar_informes_accutab.py` | Genera el informe PDF de las cargas de Post Venta que ya estaban guardadas sin él, **con las demo incluidas** (`--sin-demo` las salta; en R2 van a la fecha de LLEGADA de la carga, no la de hoy; `--aplicar` para escribir; sin eso solo cuenta; `--rehacer` rehace también los que el sistema ya había generado, nunca el PDF que adjuntó Trace) |
| `scripts/ordenar_r2_accutab.py` | Ordena en R2 las carpetas viejas de Accutab (`accutab/mail/<asunto>/`) a `<CLIENTE>/<FECHA>/Datos <hora>/` (`--aplicar` para mover; sin eso solo cuenta) |
| `scripts/corregir_ot_informe.py` | Deja un informe en UNA sola OT (`--informe 2026-1885-PC --ot OT-QUI0025`): corrige Converter y la `referencia` de Report; respaldo en `logs/` |
| `scripts/cruce_plan_entregables.py` | Solo lee: cruza los clientes de los planes de entregables de los comerciales (`Entregables_*.xlsx`) con las plantas de la lista de distribución de Línea de proceso, buscando cada cliente solo entre las plantas de SU comercial; deja un Excel en `logs/` (cruce, plantas sin plan, comerciales). Acepta una carpeta o los archivos; `--comercial "R. TRAVERSO=rtraverso@agrofresh.com"` fija un comercial mal identificado |
| `deploy/windows/respaldar.ps1` | Respaldo manual de la base |

Hay ~9 scripts en `backend/scripts/` que fueron migraciones de una sola vez
(`migrar_folios_ot`, `homogenizar_*`, `reparar_variedades`, `vincular_*`,
`importar_listados_excel`, `diagnostico_filtros_report`,
`migrar_usuarios_a_bd`). Ya cumplieron: no se vuelven a correr.

---

## Lo ya emitido no se reescribe (regla del usuario)

**Un cambio de formato o estructura no puede alterar las solicitudes anteriores.**
El PDF, el Excel y el JSON de una solicitud **se regeneran cada vez que se abren**
con el código de ese momento, así que cambiar el diseño reescribe también lo ya
emitido y enviado. Todo cambio que modifique cómo se ve o qué lleva una solicitud
debe quedar **detrás de una marca guardada en sus datos** (`datos`, que viaja en la
hoja `_data` del Excel y en el índice) puesta solo al crear, de modo que las
antiguas, sin marca, sigan igual. Ejemplo: `pdf_solo_analisis`. Antes de
terminar, pregúntate «¿cómo se ve ahora una solicitud vieja?» y pruébalo con un
test de una solicitud sin la marca.

## Cómo verificar (importante)

Este proyecto no se da por listo con "debería funcionar":

- **Backend**: `cd backend && python -m pytest -q` (`pytest.ini` limita la corrida
  a `tests/`). **Las pruebas NUNCA tocan servicios reales** (`tests/conftest.py`):
  vacía R2, Gmail y Resend y APAGA la base, aunque el `.env` apunte a
  producción. Antes, correr `pytest` en el servidor de la oficina habría borrado
  el índice de solicitudes (`DELETE FROM solicitud_archivo`), reiniciado los
  folios y pisado `contactos_laboratorio.json` en R2. Sin base, las pruebas que
  la necesitan se saltan solas. Para correrlas, en una base APARTE creada con las
  migraciones y con «prueba» o «test» en el nombre:
  `AGROFRESH_BD_PRUEBAS=agrofresh_pruebas pytest` (en PowerShell,
  `$env:AGROFRESH_BD_PRUEBAS = "agrofresh_pruebas"`). Con base pasan las ~1.590;
  **no hay pruebas que fallen de base**: si una falla, algo se rompió.
- **Frontend**: `npx vitest run`, `npm run build`, `npm run lint`.
  Los tipos se revisan con `npm run build` (o `npm run typecheck`), que corre
  `tsc -b`. **`npx tsc --noEmit` no sirve**: no mira los archivos de test, así
  que un error de tipos ahí pasa limpio acá y bota el deploy de Vercel.
  El lint tiene **12 errores de línea base preexistentes** (casi todos
  `set-state-in-effect`, más 3 de `only-export-components` en
  `SelectorIconoUsuario.tsx`); si salen 12, está bien. Si salen 13, algo nuevo lo rompió.
- **Cambios visuales**: se comprueban en un navegador real con Playwright
  (`executablePath: '/opt/pw-browsers/chromium'`), no solo con tests.
- Al escribir un test para un bug, **rompe el arreglo a propósito** y confirma
  que el test falla. Un test que pasa siempre no prueba nada.

---

## AgroFresh Lab tiene tres módulos adentro

`/modulos/agrofresh-lab` es un **hub** (tres tarjetas), no una pantalla:

| Módulo | Ruta | Qué es |
|---|---|---|
| Ingreso al laboratorio | `/modulos/agrofresh-lab/ingreso` | Lo de siempre: recibir la muestra, cruzarla con su solicitud y subir el resultado del GC. No cambió. |
| Verificaciones diarias | `/modulos/agrofresh-lab/verificaciones` | REG-03: reemplaza el Excel con macros del control diario de equipos. |
| Envío de informes | `/modulos/agrofresh-lab/envio-informes` | Paz sube el PDF del laboratorio, elige Sold To y Ship To y se envía a la lista de distribución del cliente. |

Los tres comparten el permiso `agrofresh_lab`. **Modificar los criterios** (`/verificaciones/criterios`) es un permiso aparte
(13-10-2026): casilla «Modificar criterios» en Administración → Usuarios (bajo «Secciones de AgroFresh Lab»), guardada como
`lab_criterios` en `modulos` (sin migración; NO cuenta como sección, no recorta las tres puertas). Lo tienen el admin general y
quien tenga la casilla; sin ella el botón Criterios no sale, la ruta redirige y el servidor responde 403
(`lab_secciones.exigir_edicion_criterios` en todos los PUT/POST/DELETE de `/config`; ojo: antes cualquier cuenta interna con la
sección podía editar). Espejo: `puedeEditarCriteriosLab` (`permisos.ts`).
**Peso hueso** (migración **0060**, columnas `peso_hueso*` de `solicitud_archivo`): tercer peso (g) de la tabla de Ingreso al laboratorio,
se anota como el peso extraído (`PUT /toma-muestras/solicitudes/{archivo}/peso-hueso`, queda en `lab_actividad`; descruzar lo borra).
**Pendiente**: aún no sale en el Excel «con muestra», la BD de Report ni el informe.

**Secciones por cuenta** (pedido del usuario, 09-10-2026: a algunos admin de toma de muestras les salía «Verificaciones»): en
Administración → Usuarios, al activar AgroFresh Lab sale «Secciones de AgroFresh Lab» con una casilla por puerta (Ingreso,
Verificaciones, Envío). **Sin migración**: las elegidas viajan en la misma lista `modulos` con ids `lab_ingreso`,
`lab_verificaciones`, `lab_envio`; **ninguno en la lista = las tres** (como siempre), alguno = solo esos; admin general y gerencia
ven todo. Front: `LAB_SECCIONES`/`seccionesLabPermitidas`/`puedeVerSeccionLab` (`features/usuarios/permisos.ts`), `RequireSeccionLab`
en el router y las tarjetas del hub. Backend (espejo, `app/lab_secciones.py`): `verificaciones_router` lleva `lab_secciones.exigir(...)` (403)
y `envio_informes.puede_usar` la respeta; **Ingreso al laboratorio solo se oculta en pantalla** (sus endpoints los comparte Toma de
muestras). Pruebas: `tests/test_lab_secciones.py`, `permisos.test.ts`, `UsuarioForm.test.tsx`, `AgrofreshLabHubView.test.tsx`.

**Envío de informes** (`app/envio_informes.py`, prefijo `/api/envio-informes`;
front en `views/modules/lab/envioInformes/` y `features/envioInformes/`):

- **Modo prueba / producción.** Un botón arriba dice «Sistema en prueba» o
  «Sistema en producción» y lo cambia. **Siempre parte en prueba** (sin archivo
  de configuración = prueba). En prueba todo sale SOLO a los **destinatarios de prueba** (parten en `DESTINATARIOS_PRUEBA`: Paz y Jorge; se cambian en el aviso a clientes → «Las pruebas llegan a», `PUT /prueba`, guardados en `envio_informes.json` bajo `destinatarios_prueba`; valen para TODO el modo prueba, informes incluidos), con «(PRUEBA)» en el asunto y un aviso arriba del correo que
  dice a quién habría ido de verdad. Pasar a producción pide la contraseña de
  quien lo hace (403 si se equivoca, **no 401**: un 401 cierra la sesión en el
  navegador); volver a prueba no la pide. La configuración (`envio_informes.json`,
  en `_config/` como los demás mantenedores) guarda el modo y las copias internas.
- **Se suben uno o varios PDF y cada uno es un correo aparte** («Enviar todos» los
  manda de golpe, uno tras otro; si uno falla, los demás igual salen y ese queda
  para reintentar). De cada PDF de AgroFresh (`informe_pdf.py`) se **lee** el
  Sold To, el Ship To, la especie y el Tipo Aplicación (`app/informe_lectura.py`,
  con `pypdf`: **hay que instalarlo en el servidor**, `requirements.txt`; sin él
  la pantalla avisa y no se cae). Nadie los elige a mano: el sistema los usa para
  escoger la lista. `POST /analizar` solo lee y propone, no envía.
- **El laboratorio es siempre AGROFRESH** (`LABORATORIO_FIJO`) y los datos leídos
  del PDF **no se editan**: solo el administrador principal
  (`jorge.sandoval@agrofresh.com`, `_SUPER_ADMIN_EMAIL`) con su clave los habilita
  (`POST /desbloquear`, 403 si no es él o la clave falla; vale solo mientras la
  pantalla siga abierta). El servidor además rechaza otro laboratorio a quien no
  sea el principal.
- **La lista sale de la SOLICITUD del informe, TAL CUAL, y se le SUMAN copias
  ocultas.** El PDF trae su N° de solicitud (`OT-AGF0075`, etiqueta «N° SOLICITUD» o
  escrito en cualquier parte): con él se busca la solicitud y de ahí salen Sold To,
  Ship To, especie, servicio y su «Destinatarios de resultados» completo (Para, CC
  y CCO, `plan_desde_solicitud`: la MISMA función que arma el PDF y el JSON de la
  solicitud, con su servicio y los permanentes de Actimist). **Si la solicitud no
  tiene lista del cliente, el Para queda VACÍO** (el informe va al cliente, no al
  respaldo de Jorge y Claudia) y la tarjeta no deja enviar hasta escribir a quién). Encima se agregan las copias del módulo (`internos`, hoy Paz y Jorge en
  CCO, editables; también admite CC), sin repetir a nadie. Si el PDF no trae N° o
  la solicitud no existe, se arma la misma lista con el Sold To / Ship To / servicio
  leídos del PDF (`plan_destinatarios`) y la tarjeta lo dice. **La forma final de
  las copias queda en stand-by.** Nada de esto escribe en `contactos_laboratorio.json`.
- **La plantilla es única y predeterminada** (clave `predeterminado` en
  `templates_mail_informes.json`; el código ya admite una propia por servicio,
  `linea_proceso` / `actimist` / `ecofog`, que se usa si existe y si no cae a la
  predeterminada, pero hoy no hay pantalla para crearlas; lo guardado por
  laboratorio en la primera versión, `AGROFRESH`, sigue valiendo). Se edita en
  Configuración con `TemplateMailEditor`, el MISMO editor de Administración →
  Laboratorios; `mail_templates.py` comparte el marco del correo, `_layout`, con
  solicitudes y reanálisis: los correos ya emitidos salen igual,
  `tests/test_mail_templates_marco.py` lo compara con la salida de antes). Para
  cambiar UN correo, «Editar este correo» en su tarjeta: Para / CC / CCO, asunto y
  texto **solo de ese informe**.
- **El encabezado del correo** (título «INFORME DE ENSAYO» arriba, subtítulo «Laboratorio de Cromatografía» debajo) se edita en Configuración → «Encabezado» (`PUT /encabezado`, guardado en `envio_informes.json` bajo `encabezado`; título obligatorio, subtítulo vacío = sin línea). Vale para todos los correos de informe; el título se escribe en mayúsculas.
- **Aviso a clientes** («ahora los informes salen por el Report Hub»; vive en **Administración General → pestaña «Avisos a clientes»**, `views/admin/avisos/AvisoClientes.tsx`, ya NO en el módulo Envío de informes; sus endpoints `/api/envio-informes/aviso*` y `PUT /prueba` son solo admin general; idea a futuro del usuario: varios avisos/tareas, cada uno con su audiencia, p. ej. envío de credenciales a cada Ship To con sus usuarios): asunto, título, subtítulo y texto **editables**, con vista previa en vivo, «Guardar cambios» (queda en `envio_informes.json` bajo `aviso`; `leer_config` lo conserva al guardar modo/copias), «Restaurar el original» (pide confirmación) y «Probar el aviso», que manda lo que se ve SOLO a Paz y Jorge con «(PRUEBA)» (en cualquier modo). **El envío a los clientes NO existe todavía** (falta decidir la audiencia). El texto admite `**negrita**`, listas con `- ` y títulos con `# `; todo se escapa (nada de HTML).
- **Plantillas del aviso** (`app/mail_aviso.py`, siete: estándar, corporativa, clara amarillo/verde, azul, marino, verde con foto; el selector trae miniaturas). «Estándar» es el correo sobrio de siempre (`mail_templates._layout_sobrio`, que sigue siendo el de los informes y no cambia). Las demás llevan un encabezado de imagen por Content-ID, título, texto y pie. Las imágenes están **ya generadas** en `backend/app/correo_assets/` (`banner_<clave>.png|jpg`, `mini_<clave>.png`) y viajan por git; `backend/scripts/generar_assets_correo.py` (necesita numpy; el servidor NO lo corre) las rehace desde las portadas de marca de `correo_assets/fuentes/` borrando sus textos de ejemplo. El JPEG de la foto NO debe ser progresivo (Outlook de escritorio no lo pinta). Lo que pide Outlook de escritorio ya está resuelto (tabla fantasma de 600 px con `<!--[if mso]>`, barra de 4 px con `mso-line-height-rule`); pruebas en `tests/test_mail_aviso.py`. Las puntas de algunos triángulos del fondo quedan algo redondeadas donde estaba el texto de ejemplo (a 600 px casi no se nota). Pendiente: usar las plantillas también en los correos de informe.
- La vista previa la arma el backend con el mismo código del envío
  (`armar_correo`): lo que se ve es lo que sale.
- Adjuntos: PDF, Excel, CSV, ZIP, imágenes y DOCX; 15 por correo, 20 MB cada uno
  y 24 MB en total. Un PDF debe empezar por `%PDF`.
- Historial en `envio_informe_log`; **solo el administrador principal borra registros, de a uno y con su clave** (`DELETE /historial/{id}`, `EliminarConClave`; queda como cambio sensible en Actividad) (migración 0052, best-effort: sin la tabla el
  envío igual sale y la pantalla avisa). Aparece también en Administración
  General → Actividad como «informes».
- Acceso: admin general y quien tenga `agrofresh_lab` (`puede_usar`, espejo de
  `modulosPredeterminados`). Gerencia y clientes no.
- Pendiente a futuro: definir las copias (CC/CCO) y leer también los informes de
  otros laboratorios (hoy solo el PDF propio de AgroFresh).

Backend: `app/verificaciones.py` (+ `verificaciones_excel.py`), tablas `verif_*`
de la migración 0026. Frontend: `src/features/verificaciones/`,
`src/views/modules/lab/verificaciones/`.

**El cálculo está en los dos lados a propósito**: `verificaciones.py` decide y
es lo que se guarda; `features/verificaciones/lib/calculos.ts` pinta el
veredicto mientras se escribe. Los dos se prueban contra los MISMOS casos
(`tests/test_verificaciones.py` y `calculos.test.ts`) — si tocas uno, toca el
otro y sus pruebas.

**Un día se juzga con los criterios que regían ESE día.** Cada sección congela
sus criterios la primera vez que se guarda (`verif_registro.criterios`, JSONB,
migración 0040); cambiar una tolerancia en Criterios **no** reescribe días
pasados (antes sí lo hacía, y eso tumbó días aprobados cuando se movió el
output 19–22). Limpiar una sección suelta sus criterios. Los días guardados
antes de la 0040 se congelan con `scripts/congelar_criterios_verificaciones.py`.
El registro trae `criterios` y la pantalla los usa para pintar el día.

**El output del detector es SOLO REGISTRO** (decisión del laboratorio,
25-09-2026, migración 0041): se anota y se grafica en el histórico, pero no
tiene rango ni decide el veredicto (`resultado_output` = `Registrado`). No le
vuelvas a poner rango sin que el laboratorio lo pida.

---

## Carga de datos: Ingesta, Converter y pendientes

Las dos cargan directo a la base con `ingest._procesar_filas`: la Ingesta de
Datos por `/homogenizador-ingesta/confirmar`, el Converter por
`/ingest/confirmar`. Lo que no calza con Listados (Sold To, Ship To, Especie,
Variedad) **no se inserta**: queda en `pendiente_revision`, que se ve,
reintenta y descarta en **Ingesta de Datos → Filas pendientes**, sin subir
archivo. (Antes `/ingest/confirmar` dejaba todo ahí como "copia de trabajo" y
daba 409 mientras quedara una fila: ya no existe ese bloqueo.)

**Cada carga queda registrada** (migración 0042, tabla `carga_datos`): quién,
cuándo, Excel o PDF y el nombre del archivo. Todo lo que inserta lleva su
`carga_id` (solicitud, resultado, producto_aplicado y pendiente_revision; al
reintentar una pendiente conserva su carga). La pantalla de inicio de la
Ingesta muestra las últimas cargas con lo que tienen HOY y un botón
**Deshacer** que borra exactamente esa carga (`POST /ingest/cargas/{id}/deshacer`).
No deshace si otra carga agregó resultados a sus informes (409): primero se
deshace la otra. Lo cargado antes de la 0042 no tiene carga y no se puede
deshacer desde la pantalla. Sin la 0042 corrida se carga igual, sin registrar.

**El Sold To / Ship To se valida contra el listado del TIPO DE SERVICIO del informe** (migración 0055,
`solicitud.servicio`). El «Tipo Aplicación» del informe (Converter lo manda como `TIPO APP`; la Ingesta de Excel, de la
columna «Tipo Aplicación») decide el listado: **Actimist y Ecofog** usan el suyo (`cliente_actimist`/`planta_actimist`,
`cliente_ecofog`/`planta_ecofog`); **Línea de proceso y RYD**, el de siempre (`cliente`/`planta`). Lo de Actimist y Ecofog
se guarda con el nombre como texto (`sold_to_raw`/`ship_to_raw`, `planta_id` NULL: nunca se enlaza ni se crea una planta de
Línea de proceso) y `servicio` = `actimist`/`ecofog`; RYD se guarda con `servicio` = `ryd` y su planta de Línea de proceso;
`servicio` NULL = Línea de proceso (todo lo cargado antes). Si las tablas del servicio no existen (falta la 0049/0050) la fila
va a Filas pendientes: nunca cae en el listado de Línea de proceso. La memoria de Data Core (`mapeo_confirmado`) y el
aprendizaje de Sold To/Ship To solo valen para Línea de proceso; `POST /correcciones` recibe el `servicio` y valida el valor
contra el listado de ese servicio. En el Converter lo hace `servicioDe`/`listadoDe` (`cargarListadosDeServicio` lee
`/catalogo/{actimist|ecofog}/...`; si no se puede leer, el informe queda «fuera de catálogo», no cae en Línea de proceso). El
lector de Quiteca ahora lee «Tipo Aplicación :» (antes solo «Tratamiento :», que sigue valiendo para los informes antiguos).
Pruebas: `tests/test_servicio_listados.py`, `converterServicio.test.ts`. **Pendiente**: el panel de Ingesta de Excel
(homogenizador, vista previa) y Filas pendientes → sugerencias siguen sugiriendo desde Línea de proceso.

**Informes que ya existen (13-10-2026)**: al «Subir a la base de datos», el Converter mira la revisión previa (`/ingest/preview`,
`detalle[].ya_existia`) y, si algún N° de informe ya está cargado, pregunta: «Subir y actualizar los datos» (manda
`actualizar_existentes: true` a `/ingest/confirmar` → `_procesar_filas(actualizar=True)`: los datos del archivo reemplazan a los
guardados —un dato vacío nunca borra uno existente— y resultado/producto_aplicado se hacen `ON CONFLICT DO UPDATE`, conservando su
`carga_id`; **«Deshacer carga» no revierte lo actualizado**), «Sacarlos de la tanda» (los quita de la subida, de la tabla y de los PDF) o
Cancelar. Sin respuesta «actualizar» el comportamiento de siempre: solo se completa lo que falte. **Además, apenas se leen los PDF** (`revisarExistentes`, al final de `cargar`) se llama a `/ingest/preview` y cada informe que ya existe queda con la etiqueta «YA EXISTE» y un aviso amarillo con «Quitar los N que ya existen» / «Dejarlos (decido al subir)»; al subir se vuelve a preguntar. Pruebas:
`converterExistentes.test.ts`, `tests/test_ingest_actualizar_existentes.py`.

El Ship To se busca **solo entre las plantas de su Sold To**. Si el Excel trae
la ciudad ("SAN FERNANDO") vale la planta que la contiene, si es una sola
("DOLE PLANTA SAN FERNANDO", regla `contiene` de `homogenizador.py`, igual en
`converter.html`). "0" o "-" en esos cuatro campos es "sin dato". El Converter
lee Listados en vivo de la base al abrirse.

## Tres servicios: Línea de proceso, Actimist y Ecofog

**Ecofog es una copia de Actimist** (pedido del usuario, 05-10-2026): mismo formulario
(N° Cámara/N° Orden, Posición Muestreo libre y opcional, Gasto), mismas reglas de correo
(Jorge + Report Hub, referentes Carlos y Cristian: `PARA_SIN_LISTA_ECOFOG` y
`PERMANENTES_ECOFOG` parten iguales a los de Actimist y se pueden separar) y su propio
listado (`cliente_ecofog`/`planta_ecofog`, migración **0050**, que arranca como COPIA del
listado de Actimist) y su propia lista de distribución (`servicio: "ecofog"`). Todo lo que
es «Actimist y Ecofog» se pregunta con `es_servicio_con_listado` (`servicios.py`, espejo
`tieneListadoPropio` en `src/lib/servicio.ts`); las rutas del listado son
`/api/catalogo/{actimist|ecofog}/...`. **Falta**: Auditoría interna cuenta Ecofog como Línea de
proceso (no tiene dona propia); Ingesta, Converter y Report no lo leen (igual que Actimist).
Para que aparezca en el formulario hay que tener «Ecofog» en Tipos de aplicación (el
mantenedor lo guarda en R2; el valor por defecto ya lo trae, pero si ya hay un archivo
guardado se agrega a mano).

(Lo que sigue describe el diseño con Actimist; vale igual para Ecofog.)

Cada tipo de servicio tiene **su listado de Sold To / Ship To y su lista de
distribución**. Todo lo que existía antes es de **Línea de proceso**, que es el
valor por defecto: un contacto sin `servicio`, una solicitud sin «Tipo
Aplicación» o una RYD siguen exactamente igual. La regla vive en
`app/servicios.py` (`clave_servicio`, espejo en `src/lib/servicio.ts`; mismos
casos en `test_servicio_actimist.py` y `servicio.test.ts`).

- **Listado** (migración 0049): Línea de proceso = `cliente`/`planta` (sin
  cambios); Actimist = `cliente_actimist`/`planta_actimist`. Un cliente que está
  en los dos existe en las dos tablas, sin choque. Rutas `/api/catalogo/actimist/...`
  (sin la 0049 dan 503 con aviso). En **Listados**, Sold To y Ship To tienen el
  selector «Tipo de servicio»; Especie y Variedad son comunes. Actimist se carga
  con «Importar Excel» (muestra el plan y escribe solo al confirmar; nunca borra
  ni modifica) o con `scripts/cargar_listado_actimist.py`. Lee la dinámica del
  Planner tal cual: **una fila con Ship To y sin Sold To es del Sold To de más
  arriba** (la dinámica lo escribe solo una vez). Volver a importar completa lo
  que falte sin duplicar (son 320 Sold To y 747 Ship To).
- **Formulario**: el Sold To pide primero el Tipo de Aplicación y sale del
  listado de ese servicio; al cambiar de Actimist a otro (o al revés) se vacían
  Sold To y Ship To. Si el listado de Actimist no se puede leer, el campo lo
  avisa y Línea de proceso sigue igual.
- **Contactos**: cada contacto lleva `servicio` (vacío = Línea de proceso,
  `"actimist"`). `_contactos_resultado(..., servicio=)` filtra ANTES de todo, así
  que Actimist nunca cae en contactos ni respaldos de Línea de proceso. Editar un
  contacto desde Laboratorios no borra su `servicio` (`crud_router(conservar=)`).
- **Actimist sin lista**: Para = Jorge y el Report Hub (`PARA_SIN_LISTA_ACTIMIST`,
  sin Claudia); con lista del laboratorio, esos dos van en CCO. **Carlos Jiménez y
  Cristian Valenzuela** (`PERMANENTES_ACTIMIST`) van en Para de toda solicitud
  Actimist real (las de prueba no) y en copia de sus resultados. Toda solicitud
  Actimist sale hoy con el chip «Sin lista de distribución»: es lo esperado.
- **Listas de distribución** (Administración General): selector de servicio; cada
  panel lee, exporta, compara y guarda SOLO su servicio (`?servicio=`), y una
  planta nueva se crea en el listado de ese servicio.
- **Ingesta y Converter** ya buscan en el listado del tipo de servicio del informe (ver
  «Carga de datos»). **Report** muestra solo los servicios que el administrador principal
  encienda en Administración General → Funciones (ver abajo); de fábrica, solo Línea de proceso.

## Usuarios: tipo de cuenta, categorías y funciones sueltas (pedido del usuario, 13-10-2026)

Administración → Usuarios → formulario en tres pasos (Quién es · Tipo de cuenta · Qué puede hacer). **Sin migración**: todo viaja en las
listas que la cuenta ya tenía (`modulos`, `reportes`).
- **El tipo decide el alcance.** Administrador general (todo) y Gerencia (todo menos Auditoría interna, solo lectura) se ven marcados y
  bloqueados; Administrador de área, Analista y Muestreador parten de una **plantilla típica** (`modulosPredeterminados`) y se ajustan con
  casillas («Volver a lo típico» la restaura); **Cliente no tiene área**: se elige su Sold To / Ship To y **qué ve** (Report de laboratorio =
  módulo `reports` + `reportes: laboratorio`; Storage = módulo `storage`; informes Accu-Tab en su panel = `reportes: postventa`), y nunca lleva módulos internos
  (`MODULOS_CLIENTE` = reports, storage). Un cliente nunca abre el Report de Post Venta (`puedeVerReporte`). El servidor deduce el `area` que guarda de lo que ve (compatibilidad con
  el panel de inicio `tipo:cliente:<area>`) y descarta lo incoherente (`permisos_funciones.normalizar_cuenta`). Las cuentas de cliente
  antiguas, sin `reportes`, siguen viendo lo de su área (`vistaDeCliente`).
- **Catálogo por categoría** (`features/usuarios/catalogoPermisos.ts`, espejo de `app/permisos_funciones.py`): Data Core, Resultados y auditoría,
  AgroFresh Lab, Toma de muestras, Archivos; «Marcar todo» por categoría; los permisos cuelgan unos de otros (quitar al padre quita a los hijos).
  Abajo, **«Administración» bloqueada**: Usuarios, Listados, Laboratorios, Notificaciones, Administración General, Configuración de muestreo y las
  acciones del administrador principal: solo el administrador general, nunca se reparten (no existen como id). **Un módulo o sección nueva se agrega
  en `CATEGORIAS`** (y, si es una función suelta, en `FUNCIONES`/`MODULOS_VALIDOS` del backend).
- **Funciones sueltas** (ids en `modulos`; se asignan a propósito, marcar al padre no las da): `lab_criterios` («Modificar los criterios» de las
  verificaciones; nació en `lab_secciones.py`, 403 en `/api/verificaciones/config/*`), `verif_firmar` (firmar la revisión del día, además de admin general y admin de Cromatografía) y `toma_reanalisis` (crear reanálisis, además de
  admin general y admin de área). Admin general las tiene todas; gerencia y clientes ninguna. Guardas: `RequireFuncion` (front), `permisos_funciones.exigir`
  (back). Pruebas: `tests/test_permisos_funciones.py`, `catalogoPermisos.test.ts`, `permisos.test.ts`, `UsuarioForm.test.tsx`.

## Administración General → Funciones (qué muestra Report)

Pestaña «Funciones» (`views/admin/funciones/FuncionesPanel.tsx`, `app/funciones.py`, prefijo `/api/funciones`, solo
admin general para ver). **Report muestra SOLO los tipos de servicio encendidos**: Línea de proceso, Actimist, Ecofog y RYD,
con un botón «Mostrar / Ocultar» cada uno. **De fábrica solo Línea de proceso** (sin archivo = de fábrica, y un archivo
dañado nunca muestra de más). **Encender o apagar solo lo hace el administrador principal
(`jorge.sandoval@agrofresh.com`) con su contraseña, verificada en el servidor** (`PUT /report`, 403 si no es él o la
clave falla; nunca 401). Queda en `funciones.json` (`_config/`) y como cambio sensible en Actividad.
El filtro es `funciones.condicion_report(alias)` (`COALESCE(s.servicio,'') = ANY(...)`) y vive en un solo punto
(`reportes._filtro_alcance`: datos, resumen, Excel y BD) más `/reportes/clientes` y los contadores de `dashboard.py`;
vale para todos, clientes incluidos. **No** toca Auditoría interna, Solicitudes e informes ni Envío de informes: esos ven
todo. Sin la 0055 (`solicitud.servicio`) no se filtra nada y la pantalla avisa. Lo RYD cargado antes de la 0055 tiene
`servicio` NULL y sigue apareciendo como Línea de proceso **hasta que se corra `scripts/clasificar_servicio_solicitudes.py`**
(`--aplicar`; `app/clasificar_servicio.py`): deduce el servicio de lo viejo por la solicitud de Toma de muestras del informe
(su `referencia` = OT), si no por el «Tipo Aplicación» de sus productos, si no por `tipo_servicio` = Actimist (FOGGER); lo
que es Línea de proceso o no se puede deducir no se toca ni se pisa un servicio ya marcado. Lo que sube «Ingreso al
laboratorio» (`emitir.subir_bd`, que guarda todo como «Cromatografía») ahora también lleva su `servicio`. El filtro «Tipo de
servicio» (el campo viejo `tipo_servicio`: Cromatografía / Línea de proceso) **se quitó de la pantalla de Report**: mezclaba los
informes propios de AgroFresh. **Si agregas otra consulta que alimente Report, pásale
`funciones.condicion_report`.** Pruebas: `tests/test_servicio_listados.py`, `FuncionesPanel.test.tsx`.

## Correo de la solicitud: quién lo recibe

**RYD tiene su PROPIA lista de distribución** (cuarta opción en Administración General → Listas de
distribución; contactos con `servicio: "ryd"`, `clave_lista`/`lista_de_datos` en `servicios.py`,
`ListaDistribucion` en `src/lib/servicio.ts`). Comparte el **listado** de Sold To / Ship To de Línea
de proceso (sin migración; `clave_servicio("ryd")` sigue siendo Línea de proceso), pero sus contactos
nunca se cruzan con los de Línea: una solicitud RYD con la marca `respaldo_ryd` solo lee la lista RYD
(en el correo, PDF, JSON, chip «Sin lista» y Envío de informes). Las RYD sin la marca siguen leyendo la de Línea.

**Destinatarios fijos de Actimist, Ecofog y RYD** (`fijos_de_lista` en `servicios.py`; cada lista de
Administración General los muestra arriba, aunque no tenga plantas cargadas): **Actimist y Ecofog →
Para Carlos Jiménez y Cristian Valenzuela; RYD → Para Carla y Fran** (`ccaceres@` y `fgonzalez@agrofresh.com`);
en las tres, **Jorge y el Report Hub en Copia** (`COPIA_FIJA`), y si la planta tiene lista del cliente o del
laboratorio, sus correos se SUMAN al Para. En RYD no va nadie más del equipo Admin (ni Claudia). Vale en el
correo, PDF, JSON, chip «Sin lista» y Envío de informes (un informe sin lista del cliente va Para a los
referentes, no queda vacío). Una solicitud de **prueba** no escribe a los referentes: va Para a Jorge y el
Report Hub. **Solo para las solicitudes con la marca `respaldo_ryd`** (nombre histórico: hoy significa «creada
con las reglas nuevas de las listas»; se pone al crear y en reanálisis, y editar la conserva): las anteriores
siguen como eran (Actimist/Ecofog con Jorge y el Report Hub en Para y los referentes en copia; RYD leyendo la
lista de Línea de proceso con Claudia). Línea de proceso no cambió.
RYD tiene su PROPIA lista de contactos (`servicio: "ryd"`, `clave_lista`/`lista_de_datos`, tipo
`ListaDistribucion` en `src/lib/servicio.ts`) pero comparte el **listado** de plantas de Línea de proceso
(sin migración; `clave_servicio("ryd")` sigue siendo Línea de proceso). Sus contactos nunca se cruzan con
los de Línea.
**Esos destinatarios fijos se editan** en Administración General → Listas de distribución (botón «Editar» del recuadro «Siempre reciben»; solo admin general): `PUT`/`DELETE /api/listas-distribucion/fijos?servicio=` guarda en `listas_fijos.json` (`_config/`, `servicios.guardar_fijos`) y «Restaurar los originales» vuelve a los de fábrica (`fijos_originales`). `fijos_de_lista` es lo que lee TODO (correo, PDF, JSON, chip «Sin lista», Envío de informes), con una **memoria de 15 s por proceso** (se consulta por cada solicitud y viene de R2; el guardado la invalida, pero con 4 workers otro puede tardar hasta 15 s en verlo). Para no puede quedar vacío (cae a los de fábrica). **Ojo:** cambiarlos cambia también lo que se ve al reabrir solicitudes ya emitidas con la marca `respaldo_ryd` (igual que cambiar un contacto); los correos ya enviados no se reenvían. Las solicitudes de PRUEBA siguen yendo a Jorge y el Report Hub (`COPIA_FIJA`, constante). Línea de proceso no tiene fijos.
En **Envío de informes** un informe SIN Sold To / Ship To (RYD) toma los fijos de su tipo de servicio, y uno con planta pero sin correos cargados (Actimist, Ecofog, RYD) también (`plan_destinatarios`; `tests/test_fijos_editables.py`).
Pendiente: la columna de lista del Excel base (`columnas_base`) aún no distingue RYD ni la marca.

Los contactos de **Laboratorios → Contacto laboratorio** (`tipo: solicitud`)
llevan el campo `envio`: `para` (sin valor = `para`, como los antiguos), `cc` o
`bcc`. `contactos_de_solicitud_por_envio` los reparte; el creador de la
solicitud va siempre en CCO aparte. Nadie va dos veces (se deduplica sin
mayúsculas). **Los técnicos y comerciales SIEMPRE van** (`contactos_de_solicitud_de`),
tenga o no el laboratorio lista de distribución: los contactos `resultado_interno`
de la planta, el comercial en Copia y el técnico (y el admin Report Hub) en Copia
oculta (`tipo_copia`; el Excel maestro los carga así). Se buscan por planta, sin
importar la especie (`_contactos_resultado`). **Sin nadie en Para** (sin lista
de distribución), Para = Jorge y Claudia (`DESTINATARIOS_SIN_LISTA`) más los
admin del Report Hub (cargo «Admin»: `agrofreshreporthub@gmail.com`…), que
con lista van en CCO: **sin lista pasan de CCO a Para** (`_para_sin_lista`;
igual en el JSON y el PDF). Se actualizan con
`scripts/importar_contactos_resultado.py --sincronizar-internos` y se revisan con
`scripts/auditar_contactos_resultado.py`. La misma regla rige para «Destinatarios de resultados» del PDF y del JSON cuando el Ship To no tiene contacto de resultado a clientes. **Productos**: con **2 o más**, el Excel, el
PDF, el JSON y el correo dicen `MIXTO` (`producto_utilizado`); la lista real va
en `productos_lista` (`normalizar_productos`). Vale para todo tipo de servicio, y
**solo para las solicitudes creadas desde ese cambio**: llevan la marca
`mixto_desde_2` en sus datos (al crear, en prueba y reanálisis; editar la
conserva). Las anteriores, sin la marca, siguen con su regla (MIXTO desde 3) al
leerlas, editarlas y en su PDF (`test_productos_mixto.py`). No
confundir con `tipo_copia`, que es de los contactos de **resultados**.

**«Sin lista de distribución»** (chip morado en Toma de muestras → Solicitudes,
junto a Enviada/Pendiente, con su filtro): la solicitud cuyos **resultados** no
tienen a nadie del cliente en Para para su Sold To + Ship To + **especie**, o
sea que rige la regla de «solo Jorge y Claudia» (también si ellos dos son los
únicos cargados). Lo calcula `solicitud_sin_lista` con los contactos de hoy, no
se guarda. **No leas la configuración de contactos dentro de un bucle por
solicitud**: viene de R2 y el listado pasó a tardar 6 s; se lee una vez
(`_calculador_sin_lista`).

## Panel de inicio editable (Administración General → «Panel de inicio»)

El admin general arma, como un tablero, qué widgets ve cada **tipo de cuenta** o cada **cuenta en particular** en su Panel general
(pedido del usuario, 09-10-2026). Tablero de **12 columnas** (celdas cuadradas en el editor, filas de 72 px que crecen en la pantalla
real); la paleta de widgets va al costado, se arrastran al tablero (verde = cabe, rojo = no hay espacio y se dice con quién se pisa),
se mueven, se agrandan con la esquina (o botones, o Shift+flechas), «Acomodar» junta huecos, «Empezar con el panel de siempre» carga el
diseño de partida y «Restaurar el panel original» borra el diseño. **Sin migración**: se guarda en `panel_inicio.json` (`_config/`).
- **Claves** (`app/panel_inicio.py`): `usuario:<id>` gana a `tipo:<tipo>:<area>` y esa a `tipo:<tipo>`; sin diseño propio la cuenta ve su
  panel de siempre (`AdminGeneralDashboardView` / `AreaDashboardView` / `ClienteDashboardView`, que **no cambiaron**). Si el diseño no se
  puede leer, también: personalizar nunca deja a nadie sin panel. `DashboardView` pide `GET /api/panel-inicio/mio` (cualquier cuenta);
  editar (`GET/PUT/DELETE /config`) es solo admin general y queda como cambio sensible en Actividad.
- **Widgets** (`features/panelInicio/lib/catalogo.ts`, ids `grupo:nombre`): tarjetas de módulo (`modulo:<id>`, solo se dibujan a quien tenga
  el módulo), 4 indicadores (`kpi:*`), 5 paneles de actividad (`panel:*`) y, para clientes, `cliente:encabezado|reporte|accutab`. Se dibujan en
  `views/dashboard/PanelPersonalizado.tsx` con los MISMOS bloques del panel de siempre (`bloquesAdmin.tsx`). **Un widget nuevo se agrega en
  el catálogo, en `dibujar()` y, si es de cliente, con prefijo `cliente:`.** Las cuentas `cliente` solo reciben widgets `cliente:*` (el servidor los
  filtra al leer y rechaza guardar otros en un diseño de clientes).
- **Reglas de la grilla** en un solo lugar puro, `features/panelInicio/lib/grilla.ts`, espejo de `validar_piezas` (backend): 12 columnas, sin
  pisarse, sin salirse. Pruebas: `grilla.test.ts`, `tests/test_panel_inicio.py`, `PanelInicioEditor.test.tsx`.
- **Panel visual** (pedido del usuario, 09-10-2026): widgets gráficos nuevos `hero:bienvenida`, `carrusel:novedades`, `grafico:actividad|laboratorios|especies|verificaciones` y títulos por área `titulo:general|cromatografia|postventa|ryd|toma_muestras` (grupos «Destacados», «Gráficos», «Títulos por área»). Datos reales de `GET /api/dashboard/series` (solo interno, respeta Funciones). Dibujo en `views/dashboard/graficos.tsx`, lógica pura en `features/dashboard/lib/graficos.ts` (colores de serie en orden fijo validados, 4 + «Otras» gris). Los KPI de solicitudes llevan sparkline. «Empezar con el panel visual» (`BASE_VISUAL`) en el editor. Todos internos: un widget nuevo va en `catalogo.ts`, `dibujar()` y `TONO` del editor. Pruebas: `graficos.test.ts`, `test_panel_inicio.py`.
- **Widgets de cliente con datos propios (13-10-2026)**: `cliente:saludo` (saludo con el nombre de la planta + informes y resultados medidos), `cliente:ultimo_informe`, `cliente:informes_mes`, `cliente:especies`, `cliente:analitos` y `cliente:accesos`. Leen `GET /api/reportes/panel-cliente` (`reportes.panel_cliente`), acotado por la sesión con `_filtro_alcance` (nunca por parámetro; respeta Funciones). Código: `views/dashboard/graficosCliente.tsx`, hook `usePanelCliente`; `BASE_CLIENTE_CROMATOGRAFIA` los trae todos. Pruebas: `tests/test_panel_cliente.py` (cada consulta lleva el filtro de su planta), `graficosCliente.test.tsx`. **Un widget de cliente nuevo**: catálogo + `dibujar()` + `CON_DATOS_CLIENTE` si lee ese endpoint.
- **Pendiente**: más widgets de cliente (p. ej. resultados fuera de rango, cuando haya límites cargados) y el de Post Venta; el panel de un `admin_area` usa los
  mismos widgets internos (su `AreaDashboardView` no está partido en widgets); en el celular los widgets se apilan en orden de lectura.

## Indicadores de entrega (Auditoría interna) y fuera de rango (Report)

**Lead time y Cumplimiento** viven en «Solicitudes e informes» (`IndicadoresEntrega.tsx`,
lógica pura en `features/auditoriaInterna/lib/entrega.ts`; backend `app/entrega_indicadores.py`:
`GET /api/auditoria-interna/hitos`, `GET/PUT /plazos`). Cada número sale de fechas reales:
emitida (`solicitud_archivo.creado_en`), enviada al lab (`envio_solicitud_log` exitoso), informe
(`informe_auditoria.fecha_envio`, si no `subido_en`), Report (`carga_datos.creado_en`, unido por
`solicitud.nro_solicitud = informe.nro_informe`), cliente (`envio_informe_log` en modo producción,
enlazado por `archivo_solicitud`, **migración 0054**; los envíos anteriores no tienen enlace) y
**observado** (`informe_visto`, **migración 0057**: la primera vez que una cuenta `cliente` cargó sus
resultados en Report; lo anota `reportes.datos` vía `informe_visto.registrar`, que nunca lanza y solo cuenta
cuentas cliente; sin la 0057 no hay datos y el flujograma lo dice).
- **«Enviado al cliente» también se marca a mano** (pedido del usuario, 13-10-2026; migración **0058**, tabla
  `envio_cliente_manual`, `app/envio_cliente.py`, prefijo `/api/envio-cliente`): el hito `cliente` es la fecha MÁS ANTIGUA entre el
  envío real de «Envío de informes» y la marca manual. Dos puertas: en **Converter**, la casilla «Enviado al cliente» de cada informe
  (`enviado_cliente` en `POST /auditoria-interna/informes`; los que se suben SIN marcar abren un modal con su tipo de servicio y
  lista de distribución, `GET /envio-cliente/contexto?ot=`), y en **Solicitudes e informes**, seleccionar → «Marcar enviado al
  cliente» (fecha opcional) / «Quitar envío», con chip «Enviado al cliente» / «Sin envío a cliente» en la celda del informe y el
  filtro Estado «Informe sin envío a cliente». Sin la 0058 todo sigue y marcar responde 503. **«Reporte observado» se enciende cuando el informe
  ya está en Report** (disponible para el cliente; 13-10-2026, pedido del usuario: todo informe del sistema está en Report); además anota qué
  cuentas `cliente` lo abrieron (0057), pero ya no depende de eso.
- **Único supuesto (pedido del usuario, 12-10-2026): la recepción en el laboratorio se ESTIMA 24 horas
  después de emitida la solicitud** (`RECEPCION_ESTIMADA_DIAS = 1`; no sabemos cuándo retiran las muestras).
  Desde ahí corren TODOS los tiempos y plazos, **en días hábiles** (lunes a viernes, **sin feriados**: `diasHabiles`,
  con fracción). Un aviso amarillo «Estimado, no medido» lo dice a todos, arriba del bloque. Si algún día se
  piden feriados, va en `diasHabiles` (un solo punto).
- **Entregado** se define en la configuración: `concretado` (PDF + Report; por defecto) o `cliente`. Lead time = fin −
  recepción estimada (mediana y P90); las abiertas se informan aparte; las que tienen hitos antes de la emisión se excluyen.
- **Plazos en días hábiles por laboratorio Y por ANÁLISIS (13-10-2026: el Análisis —FSMA, Análisis de residuos en fruta, Cuantificación de patógenos—, NO el analito)** (`plazos_entrega.json`): claves `LAB` y `LAB|ANÁLISIS` (nombre en mayúsculas; `plazoDe` mira `sol.analisis`, que el backend deduce del catálogo del laboratorio; sin él cae a los analitos como antes)
  (`clavePlazoAnalisis`). A cada solicitud la rige su análisis MÁS LENTO: cada análisis pedido usa el suyo y, si no
  tiene, el general del laboratorio (`plazoDe`; `analisis` dice cuál fijó el plazo). Sin plazo cargado no se juzga,
  nunca se asume uno. **Los plazos guardados antes de este cambio estaban en días corridos y ahora se leen como
  hábiles: conviene revisarlos.**
- **(13-10-2026, pedido del usuario) Se quitaron de la pantalla el aviso amarillo «Estimado, no medido» y el panel «Configuración de plazos»**: los plazos y la definición de «entregado» siguen vigentes (`plazos_entrega.json`, `GET/PUT /plazos`) pero ya no hay dónde editarlos en la UI; no los vuelvas a poner sin que lo pidan. Lo que sigue describe cómo era:
- **La configuración (entregado + plazos) SOLO la ve el administrador general** (desplegable «Configuración de
  plazos», `puedeEditar`); los demás no ven ni el panel ni los inputs. Se quitaron a pedido: el «Cuello de
  botella», la tarjeta «Reglas del cálculo» visible para todos y el «Desglose por tramo»: **no los vuelvas a poner**.
- **Nitidez del flujograma**: los nodos encendidos van opacos, con borde sólido y texto oscuro; los pendientes, punteados. Ojo con el orden del CSS: `.nodo{opacity}` declarado después de `.on` lavaba todo el flujo (pasó el 13-10-2026). **Flujograma del lead time** (`FlujogramaLeadTime.tsx`, reemplaza al desglose por tramo): una sola columna **centrada**
  con los puntos de arriba hacia abajo (emitida → recepción estimada → en análisis con su plazo → informe recibido →
  [informe enviado al cliente | informe cargado al sistema, al mismo nivel] → reporte observado). **El detalle de un punto
  se abre en un modal** (`components/ui/Modal`; el usuario no quiso un panel al lado: «no todo es tan desabrido»), con la
  lista de solicitudes de ese punto (en «Reporte observado», qué clientes). Cada punto se enciende por sus hitos
  (`alcanzados`, `nodoActual`, `resumenFlujo`); con todas las solicitudes muestra cuántas llegaron y cuántas están hoy ahí, y
  con «Ver» una sola, su recorrido con fechas. Trae su propio filtro de laboratorio. Al costado derecho va **«Estado de cada solicitud»** (13-10-2026, pedido del usuario: nada de tabla abajo, que obliga a subir y bajar): tabla compacta (300 px) con TODAS las solicitudes (con o sin informe): solo el nombre de la OT, tres puntos (Inf./Cli./Rep.) y el plazo; el cliente y la planta salen al pasar el mouse. Buscador y filtros Todas / Sin informe / Pasaron su plazo / Sin enviar al cliente / Sin Report / Completas. **Al elegir una fila el flujograma se adapta** (nodos encendidos y fechas) y su encabezado muestra OT, Sold To, Ship To, fecha de solicitud y fecha de informe (cuadrito amarillo «Pendiente» si no hay); «← todas» lo suelta. **Ojo:** `.cuerpo` ya es una clase del nodo del flujo; la grilla de dos columnas se llama `.disposicion`. Bajo 1100 px se apila. El `onCerrar` del Modal tiene que ser
  estable (`useCallback`): si cambia en cada render, el modal vuelve a enfocarse solo.
- **Se quitó «Rango por laboratorio»** (la caja P25–P75): se veía mal y ya lo cubren las tarjetas «Informes vs.
  solicitudes por laboratorio» de arriba. **No lo vuelvas a poner.** **«Cumplimiento del entregable» quedó en un
  desplegable cerrado al final** (por laboratorio o por análisis, con sensibilidad): el usuario le restó importancia.
- **Cumplimiento del entregable, reestructurado (13-10-2026, `CumplimientoEntregable.tsx`)**: ya NO es un desplegable; responde en orden ¿Entregamos a tiempo? (cifra + reparto de todas las solicitudes), ¿cuánto nos pasamos? (atraso mediano/máximo, `atrasoDe` en `entrega.ts`), ¿dónde se incumple? (ranking peor→mejor por laboratorio o análisis), ¿mejora o empeora? (por mes de emisión) y las 5 más pasadas; la sensibilidad quedó como nota. Las tarjetas del gráfico por Sold To resaltan el top 3 (medalla) y su vista de tabla es propia (`TablaGrupoLaboratorio`).
- **(13-10-2026) Cumplimiento con la paleta de la marca** (verde #6dad3c = a tiempo, amarillo #e8c32e = tarde, rojo #b0271f = vencida) y un botón **«⚙ Pasos de la entrega»** dentro del mismo, **solo para el administrador general** (`puedeEditar`; `ConfiguracionEntrega.tsx`): qué cuenta como entregado y los plazos por laboratorio/análisis (`PUT /plazos`, ya exigía admin general). Es el único lugar donde se editan; el panel «Configuración de plazos» de antes sigue sin existir. **Los puntos del flujograma ya NO se tocan** (se quitó el modal de «solicitudes de este punto»: la tabla del costado es la que se usa). **«Pendientes de informe» (Informes vs. solicitudes por laboratorio) parte plegado.**
- **Lo que se mide son INFORMES, no solicitudes (13-10-2026, pedido del usuario)**: la solicitud existe apenas se crea; lo que se entrega (y puede atrasarse) es su informe. Los textos de Lead time, Cumplimiento y el flujograma hablan de «informes entregados / pendientes / atrasados» (los tres primeros puntos del flujo —emitida, recepción, en análisis— siguen siendo de la solicitud). El cálculo no cambió: se cuenta una unidad por OT, así que una OT con varios informes (uno por vial) cuenta una vez.
- **Quitado a pedido (13-10-2026)**: los subtítulos del gráfico «Análisis por cliente» (subtítulo de la tarjeta, leyenda de colores y la línea de resumen) y el pie del Cumplimiento (la fórmula con su globito y «Ver los informes que hay detrás»); las filas del ranking de cumplimiento ya no filtran nada. **No los vuelvas a poner.**
- **Cumplimiento** = a tiempo ÷ (a tiempo + tarde + vencidas sin entregar). «Aún en plazo» y «sin plazo» no cuentan.
- Pruebas: `entrega.test.ts` (corren igual en cualquier zona horaria), `IndicadoresEntrega.test.tsx`,
  `test_entrega_indicadores.py`, `test_informe_visto.py`.
**Fuera de rango** (`views/modules/reports/FueraDeRango.tsx`, lógica en `features/reportes/lib/fueraDeRango.ts`)
solo en la Vista por límite de control: criterio «Límite del analito» (límite residual; sin límite ≠ dentro)
o «Límite de control» (promedio ± σ, mín. 3 por analito); parte en el primero si hay límites cargados.
% = (sobre+bajo) ÷ evaluados; «Ver por» Analito / Cliente / Laboratorio / Servicio.

## Plan de entregables de los comerciales (en construcción)

Cada comercial (Labarca, Allende, Traverso, Suarez) tiene un Excel «Plan Servicio de Análisis & Entrega de Información»:
cliente (por planta) × servicio (Residuales, Patologías, Microbiología, Entrega de registros, FSMA) × semana (W41…W02 de la
temporada de cerezas 2026-27), con cuántos análisis se prometen. Hoy son 74 clientes y 4.322 análisis. **Lo leen
`app/plan_entregables.py` (tabla larga cliente × servicio × semana) y `app/plan_cruce.py` (cruce con las plantas)**, sin escribir
nada. Los TOTAL de esos Excel NO son confiables (Suarez: la suma se salta la primera semana; Traverso: totales escritos a mano;
Allende: totales que se saltan filas): **manda la suma de las semanas**, y `leer_plan` devuelve los `descuadres`.
**Los nombres del plan no son los de Listados** («DOLE LONTUE», «VERFRUT RAPEL» contra «SOCIEDAD AGRICOLA EL PORVENIR»…): solo 13 de 74
son iguales a un Ship To y ninguno a un Sold To. Por eso el cruce se acota a las plantas que la lista de distribución le asigna a
ese comercial y **solo propone**: una persona confirma el nombre oficial (`proponer` nunca da por buena una coincidencia que viene
solo del Sold To). **Pendiente** (decisiones del usuario sin responder): qué se compara contra el plan en el gráfico «Análisis e
informes por Sold To» (informes concretados o solicitudes), de qué laboratorio sale cada servicio, y la tabla en la base de datos
con su carga desde Administración General. Pruebas: `tests/test_plan_entregables.py`.

## Post Venta: informes de Accu-Tab (Trace + correo)

Toda carga (la manual de Trace o la automática del correo) termina con su **informe
PDF, que se genera solo** (`app/accutab_informe.py`: **el mismo informe que imprime Trace**, mismo
encabezado con logo, cajas Identificación/Registros/Datos/Rango y el gráfico único de pH y mV
con dos ejes — si cambias el informe de `trace.html`, cámbialo también ahí; si Trace adjunta el suyo se respeta). Quedan en disco
(`Storage/Accutab/<marca>/informe.pdf` + `registro.json`, lo que lee Post Venta) y en R2
**ordenados por cliente y fecha, no una carpeta por reporte**:
`accutab/mail/<CLIENTE>/<AAAA-MM-DD>/Informe <HH-MM-SS>.pdf` y, al lado,
`Datos <HH-MM-SS>/<archivos del equipo>`. En el correo el cliente sale del asunto sin el
contador «(1307)» (`cliente_desde_asunto`). `registro.json` guarda `r2_claves` para que
**borrar** una carga quite también lo de R2. Lo archivado antes de este orden
(`accutab/mail/<asunto>/`) queda como estaba. Reportes de Post Venta filtra por Sold To,
Ship To, **Posición de muestreo** (= «Ubicación del equipo» de Trace, `ubicacion`), equipo y
período; arriba de la lista de cargas hay una tabla **«Informes»** (fecha, Sold To, Ship To, posición, equipo, PDF: «Descargar PDF» o «Generar informe» si la carga no lo tiene, `POST /postventa/registros/{carpeta}/informe`) donde se **marcan varios y se eliminan** (`POST /postventa/registros/eliminar`).
La tabla «Informes» va **al final** de la pantalla y se pagina de a 10. Se quitó a pedido el conteo de cargas (tarjeta y contadores).
**Portal de cliente**: una cuenta `cliente` del área Post Venta ve «Tus informes Accu-Tab»
(`InformesAccutabCliente`: tarjetas por mes, «Ver informe» y «Descargar PDF», filtro de período y
posición). Backend: `router_cliente` de `postventa.py` (`/api/postventa/cliente/informes` y `/{carpeta}/pdf`,
incluido con `CON_SESION`, no `SOLO_AGROFRESH`): solo informes con PDF de SU cliente (y su Ship To si la
cuenta es de sucursal), sin tildes ni mayúsculas ni `_`; lo que pida por parámetro se descarta
(`alcance_de_datos`); un cliente sin cliente asignado no ve nada. Las cargas del correo se reconocen por
el asunto (`_cliente_de`). El resto de `/api/postventa` sigue cerrado a clientes.

## Storage: explorador y permisos por carpeta

`/modulos/storage` tiene un árbol lateral con tres espacios: **Archivos del
servidor** (disco, `STORAGE_DIR`), **Solicitudes** y **Accutab** (bucket R2),
búsqueda global en el encabezado (tecla `/`; `GET /storage/buscar`, disco y R2,
respeta permisos), vista de lista y cuadrícula, vista previa (imagen, PDF y
texto), favoritos (en el `localStorage` de cada persona) y avisos flotantes.
Gerencia mira todo pero no escribe (`solo_escribiente`).

**Qué se puede modificar en R2** lo decide `storage_r2.permitir` (y lo espeja
`puede` en `features/storage/lib/explorador.ts`; los dos se prueban con los
MISMOS casos: `tests/test_storage_r2.py` y `explorador.test.ts`, si tocas uno
toca el otro). La aplicación es dueña de parte del bucket, por eso:

- **Accutab** (`accutab/mail`): se administra entero, salvo su carpeta base.
- **Solicitudes** (`solicitudes`): se pueden crear, renombrar y mover
  **carpetas**. NO se sube nada (el reindexado tomaría archivos ajenos por
  solicitudes), NO se borra (se hace desde Toma de muestras, que limpia el
  índice) y NO se mueven archivos sueltos. La app encuentra cada solicitud por
  el NOMBRE de su archivo en cualquier subcarpeta y sus fotos por la carpeta
  donde está el Excel, así que mover carpetas enteras es seguro.
- **`_config`** no se toca nunca, y no se mueve entre Solicitudes y Accutab.
- Renombrar/mover una carpeta en R2 es copiar cada objeto y borrar el original
  (R2 no tiene carpetas: son prefijos; una vacía es un objeto de 0 bytes que
  termina en `/`).

**Permisos por carpeta** (migración 0043, `storage_permiso`; lógica en
`app/storage_permisos.py`, solo admin general los edita desde el panel
«Permisos»):

- Carpeta **sin filas = abierta** (la ve todo el que tenga el módulo Storage):
  aplicar la migración no cambia nada de lo que ya existe.
- Carpeta **con filas = restringida**: solo esas cuentas, más admin general y
  gerencia. Se aplica al listar Y al descargar/escribir (no basta esconderla).
- Las subcarpetas **heredan** la regla más cercana hacia arriba y solo pueden
  restringir más, nunca ampliar (`reglas_a_podar` lo mantiene al guardar y al
  mover).
- Renombrar/mover/borrar una carpeta acompaña su regla (`reubicar`).
- Controla lo que se ve en **Storage**; las solicitudes se siguen viendo desde
  Toma de muestras con los permisos de ese módulo.
- Sin la 0043 corrida, todo queda abierto y Storage funciona como antes.

**Storage tiene cinco entradas principales**: Archivos del servidor, Solicitudes,
Accutab, **Laboratorio AgroFresh** (una carpeta del disco con entrada propia,
`CARPETA_LABORATORIO` en `explorador.ts`) e **Informes** (R2, prefijo `informes/`).

**Informes** (`app/informes_storage.py`): cada PDF que se sube por Converter
(`POST /auditoria-interna/informes`, que ahora también recibe `fecha` y
`analisis`) y cada informe propio de cromatografía (`emitir._archivar_informe`)
quedan en `informes/<PLANTA>/<FECHA DE MUESTREO>/<TIPO DE SERVICIO>/<LABORATORIO>/<archivo>.pdf`.
Es independiente de Auditoría (`auditoria/`): dos copias, dos usos. La planta
es el Ship To; si dos clientes tienen un Ship To con el mismo nombre
(«CHILLAN») la carpeta lleva el cliente entre paréntesis, para no mezclar
informes de clientes (esta carpeta es la que algún día verá cada cliente).
Volver a pasar un informe lo **reemplaza** en su sitio (mismo nombre), no lo
duplica. Desde Storage solo se ven, descargan y borran (`storage_r2.permitir`,
espejo en `explorador.ts` con los mismos casos en los dos tests). Lo que
`_archivar_informe` guardó antes bajo `informes/<SOLD TO>/<fecha>/<folio>.pdf`
sigue ahí con ese orden viejo. **El prefijo `informes/` ya es de este espacio**:
la «Etapa 4» de Ingreso al laboratorio tiene que usar otra raíz o este mismo orden.
**Portal de cliente (13-10-2026)**: una cuenta `cliente` que entra a Storage ve SOLO la carpeta de su Ship To
(`app/informes_cliente.py`, prefijo `/api/informes-cliente`, `CON_SESION`; front `InformesClienteView` (13-10-2026: el MISMO explorador del personal —`ArbolCarpetas` + `Explorador`— sobre el espacio `ESPACIO_CLIENTE`, solo lectura: `operaciones()` lo apunta a `/informes-cliente/*` y `puedeEscribir=false`; sin favoritos ni búsqueda global),, que `StorageView` usa en vez
del explorador): una cuenta de sucursal ve su planta y una de Sold To las plantas de su cliente, resueltas con `carpeta_planta` (la misma
que crea las carpetas). Solo lista y baja PDF dentro de `informes/<su planta>/`; lo demás da 404 y un interno usa el Storage de siempre.
**Panel general de un cliente (13-10-2026)**: ya NO incrusta el Report (está en el menú); por defecto lleva el encabezado y `AccesosCliente` (tarjetas de Report y Storage; widget `cliente:accesos`, el panel lo arma el administrador y `cliente:reporte` sigue disponible en el editor). **Storage y Auditoría interna usan todo el ancho** (`.ancho` en `AppLayout`); la vista del cliente muestra carpetas como tarjetas en rejilla. Se quitó la insignia «Base de datos: pendiente» de la barra lateral. En **Report** una cuenta de cliente también ve en el encabezado su Ship To (o Sold To) y no le salen los filtros Sold To / Ship To
(`ReporteLaboratorioView` le pasa `clienteFijo`/`plantaFija`). Pruebas: `tests/test_informes_cliente.py`, `InformesClienteView.test.tsx`.

**Filtros de Solicitudes (Toma de muestras)**: Laboratorio, Sold To, Ship To,
Especie, Tipo de aplicación, Línea de proceso, Tipo muestra, Nombre muestreador
y Estado se marcan **de a varios** (`MultiSelectFiltro`; lógica pura en
`features/tomaMuestras/lib/filtrosSolicitudes.ts`). Dentro de un filtro vale
cualquiera de los marcados; entre filtros, todos. En Estado, Enviada/Pendiente
son alternativas y «Sin lista de distribución» se suma como condición.

**Toma de muestras → «Solicitudes e informes»** (antes «Solicitudes», `SolicitudesView`):
cuatro indicadores arriba que son también filtros de un clic (Solicitudes, Por enviar,
Esperando informe, Con informe; `resumenVistas`/`ESTADOS_DE_VISTA` en
`filtrosSolicitudes.ts`, cuentan con todos los filtros menos Estado), aviso amarillo si hay
informes «sin Report», una tarjeta con buscador + «Filtros» (panel plegable, se recuerda) +
Excel, chips de filtros activos (`chipsDeFiltros`), tabla con acciones de ícono (clic en la
fila abre la solicitud) y tarjetas en celular. El envío automático quedó abajo, plegado. Sin
gráficos a propósito. Bajo 1180 px el informe pasa a la columna Estado; bajo 760 px, tarjetas.
Los filtros **se acumulan** (`opcionesAcumuladas`: cada lista ofrece y cuenta solo lo que
queda con los demás filtros; lo marcado sigue aunque quede en 0) y **se guardan por cuenta**
en `localStorage` (`claveFiltrosGuardados`): vuelven al entrar de nuevo y **vencen a las 8 h**
del último cambio (`VIGENCIA_FILTROS_MS`, `leerFiltros` descarta lo vencido o dañado).

**Informe de cada solicitud** (columna Informe): el N°
de informe del laboratorio en un chip azul que abre el PDF en el visor; Estado filtra
también «Con informe» / «Sin informe» / «Informe sin Report» y el buscador encuentra por N° de informe.
Si hay PDF pero sus resultados no están en Report, el chip lleva al lado «Sin Report» (amarillo):
por eso «Con informe» puede dar más que el conteo de Report (filas en Ingesta → Filas pendientes). Backend:
`app/informes_solicitud.py` (`GET /toma-muestras/solicitudes-informes`, aparte del
listado: si falla, el listado sale igual; y `/solicitudes/{archivo}/informe/pdf`). Una
solicitud llega a su informe por el PDF de Converter con su OT (`informe_auditoria`) o
por los resultados de Report cuyo `referencia` es el OT (así llegan los propios de
AgroFresh, uno por vial). **No se adivina por parecido**. «En Report» = resultados con el OT en `referencia` **o** el N°
de informe de Converter como `solicitud.nro_solicitud` (así llega Quiteca; misma regla que
Auditoría interna; antes solo se miraba el OT y marcaba «Sin Report» de más). El PDF sale de auditoría o, si
no, de Storage → Informes (`ficha_informe._buscar_pdf`); sin PDF el visor lo avisa.
**Cada informe dice si su OT está bien cruzada** (`informes_solicitud.verificar`, campo
`verificacion` de `/solicitudes-informes`): ✓ en el chip = el informe trae impresa esa
misma OT («N° Solicitud: OT-…», la `referencia` en Report) y calzan planta, especie y fecha
de muestreo; **«OT por revisar»** (rojo) = el informe dice otra OT o algo no calza (el
motivo sale al pasar el mouse); **«OT sin confirmar»** (gris) = ya está en Report pero el
informe no trae la OT. Si aún no hay resultados en Report no se repite: basta «Sin Report».
Aviso rojo arriba + filtro Estado «OT por revisar» (`otPorRevisar` en `filtrosSolicitudes.ts`).
Solo interno, y un muestreador solo ve los de sus solicitudes.
**Quitar el informe de una solicitud** (botón ✕ punteado de la fila, solo en las que tienen informe; **solo el
administrador principal y con su contraseña, revisada TAMBIÉN en el servidor**: `confirmar_clave.exigir_principal_con_clave`,
403 si falla, nunca 401): `POST /toma-muestras/solicitudes/{archivo}/quitar-informe` (`informes_solicitud.quitar_informe`).
Borra TODO lo que trajo ese informe, para poder volver a subirlo con el Converter: el registro de Report con sus
resultados y productos (cascada), las filas pendientes con ese N° de informe, el registro de `informe_auditoria` y los PDF
(Auditoría y la copia de Storage → Informes; un PDF que no se pueda borrar de R2 se avisa y no deshace lo borrado). Los
informes se reconocen como en el listado (PDF de Converter con su OT, o Report con `referencia` = OT), nunca por
parecido. La solicitud de Toma de muestras no se toca y queda como cambio sensible en Actividad. **Si agregas otra
acción destructiva solo del principal, revisa la clave en el servidor con `confirmar_clave`.** Pruebas:
`tests/test_quitar_informe.py`, `SolicitudesView.quitarInforme.test.tsx`.
**Zip de PDF** (selección → «PDF (.zip)», `POST /toma-muestras/solicitudes/pdf-zip`): si al
menos una tiene informe con PDF, el zip lleva **`Solicitudes/`** e **`Informes/`**
(«OT-QUI0047 - Informe 2026-1885-PC.pdf»; `informes_solicitud.informes_para_zip`, nunca
lanza: si la base o R2 fallan, sale solo con las solicitudes). Sin informes, plano como antes.
Las cuentas `cliente` nunca reciben informes en el zip.

## Ingreso al laboratorio: estándar y fortificados

La tabla de **Ingreso al laboratorio** tiene dos pestañas (reemplazan a Todas / Con
muestra / Sin muestra): **Ingreso estándar** (la tabla de siempre, solicitudes cruzadas
con su muestra) e **Ingreso fortificados** (`TablaFortificados.tsx`): un fortificado no
tiene solicitud, se anota su **N° de fortificado** y el **peso extraído** (g, tal cual la
balanza) y el servidor pone la **fecha y hora de ingreso** (hora de Chile). Backend:
`app/fortificados.py` (`/api/fortificados`: listar, crear, corregir N°/peso; borrar solo
admin general y en pantalla solo la cuenta maestra con clave), tabla `fortificado`
(migración 0051; el N° no se repite sin importar mayúsculas). **«Descargar base (Excel)»**
(`/emitir/cromatografia/excel-con-muestra`) baja un libro de UNA hoja, **BD**: las solicitudes cruzadas y, debajo, los
fortificados (el servidor los lee de su propia tabla; llenan N° Muestra, Peso Muestra
Extraída, Fecha y Hora Recepción). Sin la 0051 la
descarga sigue saliendo (hoja vacía) y la pestaña avisa que falta la migración.

## Ingreso al laboratorio: corregir un cruce

En la tabla de solicitudes de **Ingreso al laboratorio** cada fila cruzada trae el
peso, un ícono 🖼️ que abre la foto de la muestra y el botón **Editar cruce**
(N° de muestra, peso y, si hace falta, cambiar la foto). Backend:
`PATCH /api/toma-muestras/solicitudes/{archivo}/cruce` (multipart, la foto es
opcional) → `indice_solicitudes.editar_cruce`: no toca la hora de recepción ni
quién cruzó, respeta que un N° de muestra no esté en dos solicitudes (409), exige
que ya haya cruce (409) y deja la acción `edicion_cruce` en el historial con el
antes y el después; la foto anterior se conserva, solo deja de ser la activa.
`/emitir/cromatografia/solicitudes` ahora devuelve `peso_muestra`, `unidad_peso`,
`cruzado_por_nombre` y `tiene_foto` (antes no traía el peso y la columna Peso salía
siempre «—»). **Las fotos se bajan con `FotoCruce`** (blob con el token): un
`<img src>` directo al backend no lleva la sesión y da 401.

**Segundo peso (muestra extraída, g)** (migración 0048, columnas `peso_extraido*` de
`solicitud_archivo`): se anota en la tabla de Ingreso de muestras apenas la fila está
cruzada (`PUT /toma-muestras/solicitudes/{archivo}/peso-extraido`, queda en
`lab_actividad`). La fila es verde tenue al cruzar y verde fuerte con el peso guardado.
Sale en «Descargar con muestra», en la BD de Report (`Peso Muestra Extraída (g)`, está en
`GENERALES_BASE`) y en el informe; la sección 2 (Resultados del GC) ya no lo pide, solo lo
lee. Descruzar lo borra. Sin la 0048 corrida todo sigue y el peso sale vacío (503 al guardar).
**Quitar muestra** (descruzar) y **Eliminar solicitud** son solo de
`jorge.sandoval@agrofresh.com`: botón de marco punteado que pide la contraseña
(`components/ui/EliminarConClave`, `/auth/verificar-clave`); el backend lo exige también.

## Observación de la solicitud: 50 caracteres, 500 en un ensayo

La observación del formulario de solicitud tiene tope de **50 caracteres**; una solicitud de **ensayo** admite hasta
**500**. Es ensayo la que tiene **Sold To AGROFRESH y Ship To ENSAYO** (sin importar mayúsculas ni tildes; «ENSAYOS» también
vale), **de cualquier tipo de servicio**: lo decide el Sold To / Ship To, no el Tipo Aplicación
(`toma_muestras.es_ensayo`/`tope_observacion`; espejo en `features/tomaMuestras/lib/observacion.ts`, usado por
`NuevaSolicitudView` con su contador: si cambias uno, cambia el otro y sus pruebas). Por eso hay que tener el Sold To
AGROFRESH con Ship To ENSAYO en el listado de cada servicio. El tope solo rige al **crear o editar** (`SolicitudIn`); al leer
(`Solicitud`) no se exige, así lo ya emitido no cambia ni sale del listado. El PDF la dibuja con `Paragraph` (envuelve y
sigue en una página). Pruebas: `tests/test_observacion_ensayo.py`, `observacion.test.ts`, `NuevaSolicitudView.test.tsx`.

## Solicitudes de prueba

Las pruebas llevan **su propia serie de folios**, `OTP-<prefijo><NNNN>` (OTP-DIAG0001,
OTP-QTC0001, OTP-ALS0001…), con el botón «+ Solicitud de prueba» de Toma de muestras →
Solicitudes. Es un correlativo por laboratorio que parte en 1 y sube sin tope
(`_siguiente_numero_prueba`: el siguiente al más alto `OTP-` de ese laboratorio). **No
gastan ni mueven el contador real**: las consultas del «tope» de los folios reales
excluyen `OTP-` (`numero_solicitud !~ '^OTP-'`), si no, muchas pruebas adelantarían el
siguiente folio real. (Antes usaban el «hueco» de folios bajo el primer real; se quitó:
ya no existe el «folio disponible».) Las pruebas viejas con folio `OT-…` conservan el suyo.

- Solo lo ve y lo usa **una cuenta**: `SOLICITUDES_PRUEBA_EMAIL` en el `.env`
  (por defecto `jorge.sandoval@agrofresh.com`, la misma que puede eliminar).
  `GET /solicitudes-prueba/estado` solo devuelve `{permitido}`.
- La marca es `es_prueba` dentro de `datos` (hoja `_data` del Excel + jsonb
  del índice): **no hay migración**, y sobrevive a editar y a reindexar.
- **Nunca se envían solas** (ni al crear ni al editar, aunque el envío
  automático esté prendido): se envían a mano desde el detalle con
  **«(PRUEBA)»** al inicio del asunto. El panel de envío trae la casilla
  **«Enviar solo a mí o a quien escriba (no a la lista real)»**, marcada por
  defecto (`solo_a_estos` en `EnvioSolicitudIn`): va solo a las direcciones
  escritas, o a quien aprieta enviar si no escribe ninguna, sin lista real, sin
  copias ni CCO, y **no marca la solicitud como enviada** (se puede repetir).
  Desmarcada, va a los contactos reales como antes. El backend rechaza
  `solo_a_estos` en una solicitud que no es de prueba (400).
- No notifican, no aparecen en el Ingreso al laboratorio (`emitir.py`) ni se
  les puede pedir reanálisis. En el listado llevan la etiqueta PRUEBA.

## Notificaciones: quién recibe qué

Cada notificación lleva su tipo en `metadata->>'tipo'` (`solicitud`,
`reanalisis`, `verificacion`, `descarga_gc`, `carga_datos`; sin tipo =
`anuncio`, los avisos escritos a mano). Lo que ve cada usuario lo decide
`notificacion_suscripcion` (migración 0039), que se edita en Administración →
Notificaciones → "Quién recibe qué". Sin fila, recibe lo de su perfil
(`tipos_predeterminados` en `app/notificaciones.py`); con la lista vacía no
tiene el módulo y no ve la campana. La `audiencia` solo se sigue mirando en los
avisos a mano. Las cuentas `cliente` no tienen acceso al router (403).
**Una notificación nueva tiene que llevar `metadata={"tipo": ...}`** y ese tipo
tiene que estar en `TIPOS`; si no, cae como `anuncio`.

La bandeja muestra la **hora** de cada notificación («Hoy, 14:32»; el detalle
trae fecha larga con segundos) y tiene un **buscador** como el de un correo:
`GET /api/notificaciones?q=...` busca en TODAS las visibles (no solo las 60
de la bandeja, tope 200), cada palabra debe aparecer en título, resumen,
cuerpo, `creado_por` o los valores de la metadata, sin importar mayúsculas ni
tildes. La normalización está en los dos lados (`normalizar_busqueda` en
`notificaciones.py` y `lib/formato.ts`, que además resalta lo encontrado): si
tocas una, toca la otra.

---

## Report: tablero y simulación

- Admin y cliente ven Report con el mismo encabezado con foto (`AreaHero`):
  la foto sigue a la especie filtrada. El admin entra por
  `ReporteLaboratorioView`; el cliente, por `ClienteDashboardView`.
- **Tablero de Report (residual)**: arriba «Informes de análisis» y **«Promedios
  por analito»** (un promedio por analito, cada uno con su color; nunca se
  mezclan). Luego un solo gráfico grande: **una columna por informe** (el eje
  muestra TODAS las fechas, cada una una sola vez, en la primera columna de ese día, con
  una línea de fondo suave que marca dónde empieza cada fecha; puntos grandes con aro; al
  pasar el mouse por una columna sale una **línea guía vertical** con la fecha arriba y un
  tooltip con todos los analitos de ese informe, y el clic abre el informe solo si se hace
  sobre un punto), los analitos
  uno sobre otro según su ppm y unidos por una **línea punteada negra**
  (`conectoresInforme`). Además cada analito lleva una **curva tenue de su mismo color** que une sus puntos de un informe al
  siguiente en orden de fecha (`lineasPorAnalito` en `ReporteView.tsx`, debajo de los
  puntos; salta los informes donde ese analito no vino). Es una spline **monótona**
  (`features/reportes/lib/curvaSuave.ts`): pasa por cada punto y nunca se sale de los
  valores (no baja de cero ni inventa picos); no la cambies por una spline común. **Nunca se promedia en ese gráfico.** Su título se arma
  solo con los filtros y parte con «Residuales» (`tituloGrafico`, ej. «Residuales
  - Dole Lontué - Actimist - Manzana - Fludioxonil»). El filtro de ingredientes
  parte con **todos** los analitos (vacío = todos). Abajo quedan solo «Informes
  por especie» (paleta verdes/amarillos de la marca, `colorEspecieMarca`) y
  «Promedio por ingrediente» (sin «ppm» en el título). Se **quitaron a pedido**:
  tarjeta de límites residuales, % de cumplimiento, distribución de valores,
  indicadores y solicitudes por cliente: no los vuelvas a poner. La vista por
  límite de control (Auditoría interna) conserva su tarjeta de límites.
- **Ficha del informe** (clic en un punto del gráfico de residuales): si todas las
  filas son de UNA solicitud y es personal interno (`puedeDescargarBd`, nunca cliente
  ni datos simulados), `DetalleObservacionesModal` abre `FichaInformeModal`: resultados
  con producto, dosis, límite y estado (Dentro/Sobre/Bajo/Sin límite; la cadena de
  límites está en `features/reportes/lib/estadoResultado.ts`, espejo de
  `limiteResidual`), «Datos del informe», carga de origen y una miniatura del PDF con
  «Ver» (visor grande) y «Descargar». Backend: `app/ficha_informe.py`
  (`GET /api/reportes/informe/{id}` y `/pdf`, `solo_interno`). El PDF se busca en
  `informe_auditoria` (N° de informe + laboratorio) y, si no, en `informes/<planta>/`
  de Storage por nombre (`elegir_clave`). Sin PDF guardado muestra el aviso. Con varias
  solicitudes (Diagnofruit) queda la tabla simple de antes.
- **«Simular 1.000 datos»** (solo admin, nunca en el portal de cliente):
  `features/reportes/lib/simulacion.ts`. Clientes «(Sim.)», ids negativos,
  límites ficticios. Vive solo en el estado de la pantalla: se pierde al
  salir, recargar o actualizar. Nunca va al backend.
- Post Venta (Accu-Tab) tiene arriba del detalle una vista general con filtros
  (cliente, equipo, período) e indicadores (`PostVentaResumen.tsx` +
  `features/postventa/lib/resumen.ts`). Los 4 gráficos que tuvo (pH, ORP,
  cargas por mes, por equipo) se **quitaron a pedido del usuario**: no los
  vuelvas a poner. pH y ORP, si vuelven a graficarse, van en gráficos separados.
  Por ahora solo para admin: mostrárselo a clientes exige filtrar las
  cargas por cliente en el backend.
- **Las dos bases en Excel comparten sus columnas generales** para poder cruzarlas:
  la BD de Report (`bd_excel.py`) y «Descargar con muestra» de Ingreso al laboratorio
  (`emitir.generar_excel_con_muestra`). **La única definición es `app/columnas_base.py`**
  (`GENERALES_BASE`, mismo nombre y orden en las dos; `CAMPOS_FUNGICIDAS`: Gasto, Código
  de Ensayo y N° Ensayo, que junto a Tipo Aplicación van tras los analitos en ambas).
  Si falta una columna, se agrega ahí y sale en las dos; cada descarga llena lo que tiene
  (la BD trae el **resultado** de cada analito; «con muestra» trae la **dosis** y un ✓ si
  se solicitó, sin resultados). Incluye N° Muestra, Fecha/Hora Recepción (el momento del
  cruce) y **la lista de distribución de resultados** (Para / CC / CCO, la misma regla del
  correo, el PDF y el JSON: `calculador_listas` lee la configuración una vez). Hay pruebas
  que comparan las dos cabeceras (`test_solicitud_excel.py`, `test_bd_excel.py`).
  **El formato de Solicitudes (matriz masiva) no cambió.**
- **«Descargar BD»** (solo personal interno, nunca en el portal de cliente ni
  sobre datos simulados): `POST /reportes/bd/excel`, código en `app/bd_excel.py`.
  Mismo formato que la matriz de Solicitudes (dos filas de encabezado, una fila
  por solicitud), pero en las columnas de analitos va el **resultado** en vez
  del ✓, y «<COD> Dosis» trae la dosis aplicada. Las columnas se **acotan a lo
  que hay en la descarga** (un laboratorio filtrado no arrastra los analitos de
  los otros). Los filtros de Report se aplican en el navegador, así que la
  pantalla manda los `solicitud_ids` que quedaron a la vista (`pedidoBd`); `null`
  = toda la base, **lista vacía = ninguna** (nunca «todas»). Con filtros puestos
  avisa antes (`DescargaBdDialogo`): «descargar BD filtrada» o «limpiar filtros y
  descargar BD completa»; el archivo filtrado lleva una hoja «Filtros aplicados».
  `ALIAS_CODIGO` une los códigos de la ingesta con los del catálogo de Toma de
  muestras (ECOLI/ECOLI100, HONG/HONGOS…); un analito sin columna cae en
  «Otros analitos», nunca se pierde.
  **Se completa con la solicitud de Toma de muestras** (`completar_fila`): la base
  no trae muestreador, tipo de muestra, línea, cámara, kilos, producto, email del
  solicitante, etc. Se unen por el N° de OT (`solicitud.referencia` =
  `solicitud_archivo.numero_solicitud`) y solo se rellena lo que la base dejó
  vacío. **Quiteca no manda el OT** (su N° Informe es `2026-1885-PC`, `referencia`
  queda vacía), así que sin OT se enlaza por parecido (`buscar_por_parecido`):
  misma fecha de muestreo, laboratorio, sucursal y especie, y **solo si la
  coincidencia es única** (dos muestras de la misma planta el mismo día = no se
  adivina, queda vacío). Lo definitivo es que el OT llegue con el resultado: el lector de Quiteca del
  Converter (`leerQuiteca` en `public/modules/converter.html`, con prueba en
  `converterQuiteca.test.ts`) ya lo lee de «N° Solicitud : OT-…», junto con la
  **Fecha de Análisis** (arriba de la tabla) y la **Fecha Informe** (al pie, con
  letras). Volver a subir un informe ya cargado completa esos tres datos si
  estaban vacíos (`ingest.py`, solo con COALESCE: nunca pisa un valor). Reglas del laboratorio: **Solicitante = AGROFRESH siempre**, Temporada =
  año de la muestra, Email Laboratorio = contactos del laboratorio (Para y CC)
  separados por «;», y **N° Orden vuelve a ser columna** (13-10-2026, pedido del usuario: las dos bases deben traer TODOS los campos de la solicitud; sale de la solicitud, porque en la base `nro_orden` de AgroFresh es el código del vial) y su `observacion` es el producto, así que en los informes propios manda la observación de la solicitud). Lo que no está en ningún lado
  queda vacío. Sin la tabla del índice (0020) la descarga sigue funcionando.
  La banda de fungicidas nombra solo los laboratorios presentes (`titulo_fungicidas`):
  «QUITECA — ANÁLISIS DE RESIDUOS DE FUNGICIDAS», o «QUITECA / AGROFRESH — …» si están los dos.

---

## Auditoría Interna (módulo nuevo)

`/modulos/auditoria-interna` es un hub con tres tarjetas (**todas las pantallas de Auditoría interna usan hasta 1840 px de ancho**, no los 1280 px del resto de la app: `AppLayout` pone la clase `.ancho` si la ruta empieza por `ROUTES.auditoriaInterna`; los paneles del gráfico por análisis usan `auto-fit` para repartirse todo el ancho):

| Pantalla | Qué es |
|---|---|
| Solicitudes e informes | Solicitudes emitidas (`solicitud_archivo`) vs informes recibidos: filtros ocultables (como Report), barras de **solicitudes por laboratorio** (apiladas por estado), **dos donas, una por tipo de servicio** (Actimist en azul, Línea de proceso en violeta; el estado se lee por el tono y los números van en la leyenda), gráfico **«Análisis por cliente»** (desde 13-10-2026: un panel por laboratorio Y por análisis —ALS · FSMA, Quiteca/AgroFresh · Análisis de residuos en fruta, Diagnofruit · Cuantificación de patógenos— con sus mejores clientes y el contador de análisis de cada uno; el análisis sale del catálogo del laboratorio: `auditoria_interna.analisis_de_solicitud`, campo `analisis` de `/solicitudes`, mismo criterio «primer análisis que incluya el analito» del checklist; `porLaboratorioYAnalisis`; SIN RYD y sin solicitudes sin Sold To), y una tabla (laboratorio · solicitud · informe · cliente/planta · tipo de análisis · analitos · estado)). Los filtros principales son Cliente y Sucursal (Ship To); los analitos son un desplegable con casilleros, punto de color y conteo, igual que «Ingrediente activo» de Report (`MultiSelectFiltro`). El ícono del informe muestra al pasar el mouse emitida / cargada / enviada. |
| Carpetas de auditoría | Navegador de la carpeta **`auditoria/`** dentro del bucket de siempre (`agrofresh-storage`): `<laboratorio>/<ship to>/<archivo>.pdf`. Las carpetas nacen con el primer PDF. En una carpeta se marcan uno, varios o todos los informes y se bajan juntos en un **.zip** (`POST /carpetas/zip`, tope 300 archivos / 400 MB). |
| Vista por límite de control | El gráfico que antes era una pestaña de Report. Es `ReporteView` con `vistaControl`; en Report ya no existe. |

- **El gráfico «Análisis por cliente» (antes «Análisis por laboratorio · top Sold To»; el título sigue al «Agrupar por»: «Análisis por Ship To», «…por especie», «…por tipo de servicio») (13-10-2026) es una lista por cliente** (`AnalisisPorCliente.tsx`, dentro de su `TarjetaGrafico` con los mismos filtros, botones Sold To/Ship To/Especie/Tipo de servicio, Top y «Ver tabla»): cada cliente hacia abajo, el que más análisis lleva primero, con residuales (AgroFresh y Quiteca), FSMA (= ALS) y FITO (= Diagnofruit), su total y las columnas **Entregables y %**, que quedan en «—» hasta que se cargue el **plan de entregables de los comerciales** (entregable = lo que cada comercial concretó de cada análisis para cada planta). Los clientes del listado (`/catalogo/clientes`, activos) sin ningún análisis salen apagados al final, detrás de un botón (solo agrupando por Sold To). Deja fuera RYD y las solicitudes sin Sold To. **Todos sus controles van en UNA línea** (filtros Sold To/Ship To/Especie/Tipo de servicio · Agrupar por · Mostrar Top · **Análisis**), y los botones **Residuales / FSMA / FITO** (13-10-2026) se prenden y apagan para ver solo lo que interesa (siempre queda uno prendido; `soloAnalisis` en `resumen.ts`: lo oculto se pone en cero, el total y el orden de cada cliente cuentan solo lo visible y los que se quedan sin nada salen; «clientes sin análisis» no cambia). Pruebas: `resumen.test.ts`, `AnalisisPorCliente.test.tsx`. Lógica pura: `porClienteResiduosFsmaFito` y `clientesSinAnalisis` en `resumen.ts`. **La tabla dinámica «Análisis por tipo de servicio y laboratorio» (antes «Análisis por mes»; `TablaDinamica`; el mes es su desglose) NO se toca: sigue donde estaba, junto a las donas** (un error del 13-10-2026 la había reemplazado). Los paneles por laboratorio y análisis (`GraficoAnalisisPorLaboratorio`) quedaron sin uso.
- **Permiso `auditoria_interna`**: solo el admin general y a quien él asigne.
  Gerencia NO lo ve (ni en el menú ni en el panel de inicio). Backend:
  `puede_auditoria` en `app/auditoria_interna.py`. Nótese que el prefijo es
  `/api/auditoria-interna`; `/api/auditoria` es la auditoría de homogenización
  de DataCore, otra cosa.
- **Editar** (fecha de envío, renombrar, borrar) es solo del admin general. La
  raíz del bucket no se puede borrar.
- **Cómo llegan los PDF**: Converter (`public/modules/converter.html`), al
  "Subir a la base de datos", sube además cada PDF a
  `POST /api/auditoria-interna/informes`. El PDF del laboratorio trae SU N° de
  informe, no el OT-xxxx: por eso Converter ofrece un desplegable "Solicitud
  (OT)" con sugerencia (laboratorio + planta + fecha de muestreo) que la
  persona confirma. También ahí se escribe a mano la fecha y hora de envío
  (opcional; se edita después).
  **Si el PDF trae la OT** («N° Solicitud: OT-…», Quiteca la escribe) **esa manda**:
  Converter la muestra fija («OT-… (del informe)», sin desplegable) y nunca adivina
  por planta y fecha, aunque la OT ya tenga otro informe; el servidor recibe
  `ot_informe` y la prefiere sobre `archivo_solicitud`. Adivinar dejó informes en la
  OT equivocada (2026-1878-PC en OT-QUI0039…; se corrigió con `corregir_ot_informe.py`).
  Pruebas: `converterAmarre.test.ts`, `TestOtDelInforme`.
- **Informes propios de AgroFresh (13-10-2026)**: no pasan por Converter, así que no tienen `informe_auditoria`; llegan a Report con el OT en `referencia`. `auditoria_interna.SQL_INFORME_EN_REPORT` los reconoce (en `/solicitudes` y en `/hitos`): cuentan como informe recibido y concretado (su `informe.id` es null). Antes salían como «Pendientes de informe». **Si agregas otra consulta que cuente informes por solicitud, reúsala.**
- **Fecha de envío a mano para informes propios (migración 0061, tabla `informe_fecha_manual`, una fila por `solicitud_archivo.archivo`)**: un informe de AgroFresh no tiene fila en `informe_auditoria`, así que no tenía dónde guardar su «Fecha y hora de envío». `entrega_indicadores.hitos` y `auditoria_interna.listar_solicitudes` la usan como fecha del informe (y del envío) solo si el informe no trae una propia; sin la tabla no cambia nada. La migración deja OT-AGF0050 en 30-09-2026 08:06 (hora de Chile). Para otra OT: insertar una fila igual.
- **Concretada** = tiene PDF guardado **y** sus resultados ya están en Report
  (`solicitud.nro_solicitud = informe_auditoria.nro_informe`). PDF sin Report
  se muestra aparte en las donas y los gráficos, y en la tabla como «Pendiente»
  con el aviso «PDF sin Report». **No hay nada de «demora de concretación»**: se
  quitó a propósito (no es relevante); no la vuelvas a agregar sin que lo pidan.
  El **tipo de análisis** de una solicitud es el «Tipo Aplicación» de su formulario
  (`datos.campos_laboratorio`: Actimist / Línea de proceso) y los **analitos** son
  `datos.analitos_solicitados`; `/solicitudes` los devuelve. En el gráfico por
  cliente, «informes» = informes **concretados**. La lógica (filtros, donas,
  clientes) es pura y se prueba en `features/auditoriaInterna/lib/`. El laboratorio `AGROFRESH` (propio) **sí entra** al panel y a
  las OT candidatas de Converter (antes se filtraba y su informe subido no se veía).
  Su «Tipo Aplicación» es **RYD**: es un tercer tipo de servicio (`TIPO_RYD`, naranjo)
  con su dona, su grupo en la tabla dinámica y su botón en el gráfico por cliente.
  **Las donas y la cifra de arriba muestran solo dos estados**: «Informes Recibidos»
  (concretadas) y «Solicitudes enviadas» (`ESTADOS_DONA`); el «PDF sin Report» no se
  muestra aparte, se suma a las enviadas. **El título de la tabla dinámica** lleva un
  campo por cada filtro del panel («Todos los clientes», «Todas las sucursales»…, o el
  valor elegido; `camposTituloTabla`).
- **El PDF de la solicitud de ALS y Diagnofruit no lleva la tabla «Analito solicitado /
  Dosis»**: la sección 3 solo nombra el análisis (`_LABS_SOLO_ANALISIS` en
  `toma_muestras_pdf.py`); los demás laboratorios la conservan. **Solo vale para las
  solicitudes creadas desde ese cambio**: llevan `pdf_solo_analisis: true` en sus datos
  (se pone al crear, también en prueba y reanálisis, y la edición lo conserva); las
  anteriores no lo tienen y se siguen dibujando con su tabla.
- **Administración General** (`/admin/administracion-general`, en el menú debajo de
  Notificaciones, **solo admin general**): tiene dos pestañas. **Correcciones del
  Converter** (ver abajo; las filas parten compactas y se agrandan con un clic):
  `GET /api/correcciones` exige admin general; ni quien tiene Auditoría interna lo
  ve. **Listas de distribución** (pestaña que abre por defecto; `app/listas_distribucion.py`,
  prefijo `/api/listas-distribucion`, solo admin general) es **una tabla dinámica**:
  una fila por planta y una columna por rol (Admin Report Hub, Comercial, Técnico) y
  por especie (correos del cliente; si todas las especies tienen la misma lista se ve
  una sola celda, «Separar por especie» la abre). Arriba, indicadores de cobertura y
  alertas que filtran la tabla (sin técnico, sin comercial, sin lista de cliente,
  fuera de Listados, copia mal puesta, plantas de Listados sin lista). **Todo cambio
  es una PROPUESTA sobre una celda** (`features/listasDistribucion/lib/tabla.ts`,
  lógica pura con pruebas): lo que sale de **importar** un Excel (acepta también la
  hoja «Informes Laboratorios-Pack Line» del maestro) queda en **amarillo** y se
  acepta (✓) o rechaza (✕) celda por celda; lo que se edita **a mano** (clic en la
  celda) queda en **verde**, ya aceptado. Nada se escribe hasta «Guardar»:
  `/aplicar` aplica solo lo aceptado y deja antes un respaldo
  `contactos_laboratorio_respaldo_<fecha>.json` junto al original. **Una celda vacía
  del Excel NO quita a nadie**; para sacar a alguien se quita su correo de la celda.
  **Plantas nuevas**: si el nombre no existe en Listados, la fila avisa y sugiere los
  nombres parecidos («Usar …»); «+ Agregar planta» y las nuevas del Excel se
  **crean también en Listados** (cliente y planta, con los códigos SAP si el Excel
  los trae; `asegurar_planta` reusa lo que ya existe sin duplicar) al guardar.
  `GET /estado` alimenta la tabla; `/excel` exporta; `/comparar` solo compara.
  **Plantas que el Excel ya no trae** (base actualizada con menos Sold To / Ship To):
  importar NUNCA las borra. `/comparar` devuelve `retiradas` y la pantalla muestra una
  tarjeta roja «N plantas del sistema no vienen en tu Excel» con una casilla por planta
  (todas desmarcadas) y «Marcar todas / Desmarcar todas». Las marcadas viajan como cambio
  `planta_quitar` y, al guardar (con respaldo), `aplicar` borra toda la lista de esa planta
  en ese servicio (cliente, comercial, técnico y admin); **Listados no se toca**. Un Excel
  sin filas no ofrece nada.
  **Cambiar el nombre de una planta** (el Excel trae el nombre bien escrito y Listados lo tiene mal, p. ej.
  LOSONJERA → LISONJERA): en la tarjeta «Planta nueva», junto a cada sugerencia, «Es la misma: cambiarle el
  nombre a «…»» (solo si esa planta ya tiene lista). Viaja como cambio `planta_renombrar` y va PRIMERO al
  guardar: cambia `planta.nombre` en Listados (mismo id, así Report y los códigos SAP la siguen; el cliente no se
  toca) y el `ship_to` de sus contactos en TODAS las listas que comparten ese listado (Línea de proceso y RYD
  juntas; Actimist y Ecofog cada una la suya), sin perder a nadie; lo que traía el Excel queda como propuestas
  amarillas sobre ella. Se rechaza si ya hay una planta con ese nombre (habría que fundir dos listas). **Ojo:**
  las solicitudes ya emitidas guardan el nombre viejo como texto, así que al reabrirlas su lista de
  distribución se busca por ese nombre y ya no la encuentra (cae en el respaldo); el respaldo de contactos
  anterior queda en `contactos_laboratorio_respaldo_<fecha>.json` y el nombre anterior en la respuesta (`renombradas`).
  Los cinco recuadros de cobertura de arriba explican qué cuentan en un globito que aparece suave al pasar
  el mouse, enfocar o tocar (`IndicadoresListas`; «Plantas con lista» compara con las plantas activas de
  Listados; el % de los otros cuatro se mide sobre las plantas con lista).
  Reemplaza a los scripts `importar_contactos_resultado.py` /
  `auditar_contactos_resultado.py` para el uso diario. El panel se mantiene montado al
  cambiar de pestaña para no perder cambios sin guardar.
- **Panel de Administración General** (pestañas **Resumen**, **Actividad** y **Seguimiento**, las
  primeras; solo admin general; `app/admin_panel.py`, prefijo `/api/admin-panel`;
  front en `views/admin/panel/` y `features/adminPanel/`). Tema **claro**, igual al resto de la app
  (las variables `--p-*` de `PanelAdmin.module.css` apuntan a los tokens de la app; no vuelvas al oscuro, se pidió
  expresamente). **Seguimiento** (`GET /api/admin-panel/seguimiento`, `SeguimientoPanel.tsx`): estado de cada cuenta
  interna (activa / en alza / en baja / nueva / dormida / nunca ingresó, `estado_persona`) contra el período
  anterior, días activos, mapa de calor día×hora (hora de Chile), adopción por módulo y matriz persona×módulo.
  Resumen: KPIs (usuarios activos, solicitudes, informes concretados %, días
  solicitud→informe por laboratorio, salud de datos 0–100 con sus descuentos a la
  vista), actividad por día, uso por módulo, actividad por persona, cambios
  sensibles / ingresos fallidos y «Requiere tu atención» (cada ítem lleva a su
  pantalla). Actividad: ranking de personas y, al elegir una, su ficha + historial
  filtrable. **La actividad de cada persona se ARMA uniendo tablas que ya
  existían** (`solicitud_archivo`, `envio_solicitud_log`, `carga_datos`,
  `lab_actividad`, `verif_seccion_lock`, `correccion_converter`,
  `informe_auditoria`) más `actividad_usuario` (migración 0047: accesos y fallidos,
  visitas por módulo y cambios sensibles: permisos, cuentas, clave reiniciada,
  solicitud eliminada). Cada fuente se lee aparte: si falta una migración el panel
  sigue con las demás. `actividad.registrar` **nunca lanza** (la bitácora no puede
  tumbar un login). Las visitas las manda `AppLayout` a `POST /api/actividad/visita`
  (el servidor no repite el mismo módulo en 10 min; clientes no se registran).
  Quien no tiene correo en la fuente (cargas de datos solo guardan el nombre) se
  une por nombre (`resolver_nombres`). Sin la 0047 no hay accesos/visitas/sensibles,
  pero el resto funciona. **Si agregas una acción nueva de una persona, anótala en
  una tabla y súmala a `leer_eventos`.** Pruebas: `tests/test_admin_panel.py`,
  `adminPanel.test.ts`.
- **El Converter aprende de las correcciones a mano** (`app/correcciones.py`,
  tabla `correccion_converter`, migración 0045). Los cuatro desplegables del
  catálogo son ahora un **buscador** (sin tildes ni mayúsculas, flechas y
  Enter). Al elegir a mano el valor oficial, el sistema guarda la asociación
  «texto del informe → valor oficial» y, si el mismo texto vuelve a llegar, lo
  corrige solo (se ve con la etiqueta «guardada»). El contexto importa: un Ship
  To se asocia dentro de SU Sold To y una Variedad dentro de SU Especie. Nunca se
  aplica a ciegas: solo si el valor guardado sigue siendo válido para ESE
  informe (`revisarCatalogo` en `converter.html`). Solo se aprende hacia valores
  que existen en Listados (el backend lo valida). El historial (quién, cuándo,
  cuántas veces se aplicó sola) se ve en Administración General; el admin general
  puede **olvidar** una asociación equivocada. Es independiente
  de `mapeo_confirmado` (la memoria de DataCore para la Ingesta de Excel): el
  Converter manda al backend los valores ya corregidos. Sin la 0045 el Converter
  sigue funcionando, sin memoria.
- Tabla `informe_auditoria` (migración 0044). **No hay nada que configurar**:
  por defecto los PDF van a `auditoria/` dentro de `R2_BUCKET`, con las mismas
  llaves de R2. El prefijo se agrega y se quita solo en `r2_auditoria.py`; lo
  que se guarda en la base es la ruta relativa (`Quiteca/Dole/x.pdf`). Solo si
  algún día se quiere un bucket aparte: `R2_AUDITORIA_BUCKET` (y, si el token es
  otro, `R2_AUDITORIA_ENDPOINT_URL/ACCESS_KEY_ID/SECRET_ACCESS_KEY`);
  `R2_AUDITORIA_PREFIJO` fija el prefijo a mano. Un fallo de R2 sale como 502
  con la causa (p. ej. 403 = el token no tiene permiso sobre el bucket).
  La primera versión creó un bucket `auditoria` aparte y el token no lo abría
  (403): la intención siempre fue una carpeta dentro de `agrofresh-storage`.

---

## Trampas conocidas (nos costaron tiempo)

- **Gmail no quita por IMAP la etiqueta de la carpeta abierta.** `accutab_mail_ingest.py`
  abre `ACCUTAB_PENDIENTE`; un `-X-GM-LABELS` sobre esa etiqueta responde OK y no hace
  nada, así que cada corrida volvía a subir todos los correos (`AGROFRESH_DEMO (1307)`,
  cientos de reportes repetidos en Post Venta). Ahora se saca con `\Deleted` + `EXPUNGE`
  (en una carpeta de etiqueta solo quita esa etiqueta) y cada correo queda anotado por su
  Message-ID en R2 `accutab/_control/procesados.json`: anotado = no se vuelve a subir.
  Tras desplegar el arreglo, la primera corrida va con `--solo-marcar`.

- **Un `transform` en un ancestro atrapa el `position: fixed`.** Las filas de
  Solicitudes se animaban con `transform` y el diálogo de Eliminar salía recortado
  dentro de la fila. `Modal` y `Dialogo` (Storage) se dibujan con `createPortal` en
  `document.body` (`Modal.test.tsx`); las animaciones de filas, solo con opacidad.
- **Finales de línea mezclados.** `emitir.py`, `toma_muestras.py` y
  `listados.py` son CRLF; otros son LF. Edítalos en binario con un patrón
  tolerante a `\r?\n`, o el reemplazo no calza.
- **Excel: tabla y autofiltro no conviven.** Una tabla de Excel ya trae su
  propio filtro. Si además se le pone `ws.auto_filter.ref` al mismo rango, el
  archivo sale roto: Excel lo abre pidiendo repararlo y pierde el formato. Lo
  mismo si dos tablas comparten nombre, si el rango no termina en la última
  fila escrita o si dos columnas de una tabla se llaman igual.
- **`Agrofresh` vs `AGROFRESH`.** La base (Ingest) guarda el laboratorio en
  capitalización de título; la configuración de la app usa mayúsculas. Compara
  siempre normalizando.
- **`app.routes` está vacío.** Esta versión de FastAPI envuelve lo que entra
  por `include_router`. Para enumerar rutas usa `app.openapi()["paths"]`.
- **jsdom no evalúa media queries.** Un elemento oculto por `@media` queda
  fuera del árbol de accesibilidad y `getByRole` no lo encuentra.
- **`100vh` en Chrome de Android** incluye la barra de direcciones. Usa `dvh`.
- **`1fr` no baja del ancho de su contenido.** Para que una celda de grilla
  encoja de verdad: `minmax(0, 1fr)` o `min-width: 0`.
- **`text-transform: uppercase` convierte «µL» en «ΜL»**, que se lee «ML»:
  mil veces más grande. En un registro de calibración eso es un error, no un
  detalle. Las unidades van en `<span className={styles.unidad}>`, que las
  deja como están.
- **Los encabezados HTTP no son UTF-8.** Un `Content-Disposition` con tildes
  llega roto al navegador. Se manda `filename*=UTF-8''…` (RFC 5987) con un
  `filename` sin tildes al lado; `client.ts` prefiere el primero.
- **Dos backends en el puerto 8000.** La tarea programada ya tiene uno en
  `127.0.0.1:8000`. Si además levantas uno a mano con `--host 0.0.0.0`,
  **Windows no da error** -son direcciones distintas- y quedan los dos vivos.
  El túnel Cloudflare va a `localhost`, o sea al de la tarea: el que arrancaste
  a mano no lo escucha nadie, y la pantalla sigue mostrando el código viejo.
  Síntoma: reinicias, y el frontend igual dice "El backend que está corriendo
  todavía no conoce este módulo" (un 404). Diagnóstico:
  `Get-NetTCPConnection -LocalPort 8000 -State Listen` -tiene que salir UNA
  línea-, y `(Invoke-RestMethod http://localhost:8000/openapi.json).paths.PSObject.Properties.Name`
  para ver qué rutas conoce de verdad el que responde. El arreglo es reiniciar
  la tarea, no arrancar otro proceso.
- **El laboratorio propio se llama `Agrofresh` en la base.** `Quiteca / AgroFresh`
  (el valor viejo de `mapeo.LABORATORIO_CATALOGO`) no existe en ningún lado: el
  catálogo de analitos solo tiene `Agrofresh` y `Quiteca` (7 cada uno) y la carga
  busca cada analito por (código, laboratorio) EXACTO; con otro nombre cae, con
  una advertencia, en el catálogo del primero que encuentra y mezcla los
  resultados de un mismo informe. Lo usan el informe propio de Converter y
  «Subir a la base» de emitir.py (`tests/test_subir_bd_laboratorio.py`).
- **La cámara del escáner no es solo Chrome/Android.** `BarcodeDetector` nativo
  solo existe ahí; en iPhone (Safari), Firefox y escritorio `EscanerCamara` usa
  el lector de respaldo de `detectorCodigos.ts` (paquete `barcode-detector`, ZXing
  en WebAssembly, empaquetado en la app y cargado solo cuando hace falta). El
  motor es más pesado: la lectura está limitada a un cuadro cada 150 ms. Para
  probarlo en Playwright: Chromium de Linux no trae el nativo, y la cámara
  falsa necesita `--use-fake-device-for-media-stream
  --use-file-for-fake-video-capture=x.y4m` (con `.mjpeg` no carga el archivo y
  da cuadros verdes), con el código sin escalar a medias.
- **Un 401 cierra la sesión.** `client.ts` toma cualquier 401 como «sesión
  vencida» y saca a la persona. Nunca respondas 401 por otra cosa: una clave de
  Gmail rechazada responde 503 (`correo._enviar_smtp`), si no, quien envía una
  solicitud queda fuera del sistema (`test_correo_error_gmail.py`).
- **Quitar la muestra con «» vacío.** `indice_solicitudes.cruzar` toma `""` o
  espacios igual que `None`; el resguardo de «solo el administrador principal»
  tiene que mirar el valor normalizado, no solo `is None`.
- **En Windows falta `tzdata`**: sin él `zoneinfo` no encuentra las zonas.
  Está declarado en `requirements.txt`.

---

## Estado y pendientes

Lo hecho hasta ahora está en el historial de la rama. Lo que **queda
pendiente**, en orden de importancia:

1. ~~El túnel Cloudflare~~ **resuelto**: `estado.ps1` lo reporta como servicio
   `Running` (25-09-2026), igual que el backend (tarea programada).
2. ~~Actimist/Ecofog en Ingesta, Converter y Report~~ **hecho** (Funciones, 0055). Queda: el panel de
   vista previa de la Ingesta de Excel y las sugerencias de Filas pendientes miran solo Línea de proceso.
3. **Etapa 4 del módulo AgroFresh Lab → Ingreso al laboratorio**: botón
   "Procesar" → modal con el listado de informes → guardar en R2 (ojo: `informes/`
   ya es el espacio Informes, con su orden planta/fecha/análisis/laboratorio) →
   tabla abajo para descargarlos todos o de a uno.
4. **`sembrar_catalogo_analitos.py --aplicar`** en el servidor: 14 analitos
   por crear. `DFN` hay que crearlo a mano (la app no conoce su nombre).
5. **Los límites residuales están vacíos.** Son decisión del laboratorio y se
   cargan en Report → Gestionar analitos. **Nunca los inventes.**
6. Diferidos por decisión del usuario: paginar `/api/reportes/datos` y migrar
   los ~14 mantenedores JSON a tablas.
7. Opcional: activar compresión gzip (una línea, ~96% menos de payload).
