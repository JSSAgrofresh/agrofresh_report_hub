# AgroFresh Report Hub — contexto para Claude

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
- **No crees PR** salvo que se pida explícitamente.

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
| `scripts/reintentar_pendientes_ingesta.py` | Reprocesa las filas pendientes y descarta las que siguen sin Ship To válido (respaldo en `logs/`) |
| `deploy/windows/respaldar.ps1` | Respaldo manual de la base |

Hay ~9 scripts en `backend/scripts/` que fueron migraciones de una sola vez
(`migrar_folios_ot`, `homogenizar_*`, `reparar_variedades`, `vincular_*`,
`importar_listados_excel`, `diagnostico_filtros_report`,
`migrar_usuarios_a_bd`). Ya cumplieron: no se vuelven a correr.

---

## Cómo verificar (importante)

Este proyecto no se da por listo con "debería funcionar":

- **Backend**: `cd backend && python -m pytest -q`. Hay ~600 tests. Los que
  necesitan Postgres se saltan solos si no hay base.
- **Frontend**: `npx vitest run`, `npm run build`, `npm run lint`.
  Los tipos se revisan con `npm run build` (o `npm run typecheck`), que corre
  `tsc -b`. **`npx tsc --noEmit` no sirve**: no mira los archivos de test, así
  que un error de tipos ahí pasa limpio acá y bota el deploy de Vercel.
  El lint tiene **14 errores de línea base preexistentes** (casi todos
  `set-state-in-effect`); si salen 14, está bien. Si salen 15, algo nuevo lo rompió.
- En backend hay **4 tests que ya fallan** en la rama (`test_alcance_datos`,
  `test_envio_solicitud_correo`, `test_resultados_ship_to`,
  `test_verificaciones::test_detector_con_metodo_equivocado`) y
  `test_correo_error_gmail.py` no importa. Corre `pytest tests` (no la raíz:
  `scripts/borrar_lab_test.py` se recoge y corta la corrida).
- **Cambios visuales**: se comprueban en un navegador real con Playwright
  (`executablePath: '/opt/pw-browsers/chromium'`), no solo con tests.
- Al escribir un test para un bug, **rompe el arreglo a propósito** y confirma
  que el test falla. Un test que pasa siempre no prueba nada.

---

## AgroFresh Lab tiene dos módulos adentro

`/modulos/agrofresh-lab` es un **hub** (dos tarjetas), no una pantalla:

| Módulo | Ruta | Qué es |
|---|---|---|
| Ingreso al laboratorio | `/modulos/agrofresh-lab/ingreso` | Lo de siempre: recibir la muestra, cruzarla con su solicitud y subir el resultado del GC. No cambió. |
| Verificaciones diarias | `/modulos/agrofresh-lab/verificaciones` | REG-03: reemplaza el Excel con macros del control diario de equipos. |

Los dos comparten el permiso `agrofresh_lab`; editar los criterios
(`/verificaciones/criterios`) sí exige admin general.

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

El Ship To se busca **solo entre las plantas de su Sold To**. Si el Excel trae
la ciudad ("SAN FERNANDO") vale la planta que la contiene, si es una sola
("DOLE PLANTA SAN FERNANDO", regla `contiene` de `homogenizador.py`, igual en
`converter.html`). "0" o "-" en esos cuatro campos es "sin dato". El Converter
lee Listados en vivo de la base al abrirse.

## Correo de la solicitud: quién lo recibe

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
`scripts/auditar_contactos_resultado.py`. La misma regla rige para «Destinatarios de resultados» del PDF y del JSON cuando el Ship To no tiene contacto de resultado a clientes. **Productos**: con más de 2, el Excel, el
PDF, el JSON y el correo dicen `MIXTO` (`producto_utilizado`); la lista real va
en `productos_lista` (`normalizar_productos`). No
confundir con `tipo_copia`, que es de los contactos de **resultados**.

**«Sin lista de distribución»** (chip morado en Toma de muestras → Solicitudes,
junto a Enviada/Pendiente, con su filtro): la solicitud cuyos **resultados** no
tienen a nadie del cliente en Para para su Sold To + Ship To + **especie**, o
sea que rige la regla de «solo Jorge y Claudia» (también si ellos dos son los
únicos cargados). Lo calcula `solicitud_sin_lista` con los contactos de hoy, no
se guarda. **No leas la configuración de contactos dentro de un bucle por
solicitud**: viene de R2 y el listado pasó a tardar 6 s; se lee una vez
(`_calculador_sin_lista`).

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
Pendiente: que cada cliente vea sus informes (hoy Storage no es accesible a
cuentas `cliente`).

**Filtros de Solicitudes (Toma de muestras)**: Laboratorio, Sold To, Ship To,
Especie, Tipo de aplicación, Línea de proceso, Tipo muestra, Nombre muestreador
y Estado se marcan **de a varios** (`MultiSelectFiltro`; lógica pura en
`features/tomaMuestras/lib/filtrosSolicitudes.ts`). Dentro de un filtro vale
cualquiera de los marcados; entre filtros, todos. En Estado, Enviada/Pendiente
son alternativas y «Sin lista de distribución» se suma como condición.

## Solicitudes de prueba

Al borrar las solicitudes de prueba del arranque, el contador de folios de
cada laboratorio no volvió atrás (`folio_solicitud_laboratorio` solo avanza):
las reales empezaron en QUITECA 18 y AGF 50. Ese hueco (1..17 y 1..49) se usa
para **solicitudes de prueba**, con el botón «+ Solicitud de prueba» de
Toma de muestras → Solicitudes.

- Solo lo ve y lo usa **una cuenta**: `SOLICITUDES_PRUEBA_EMAIL` en el `.env`
  (por defecto `jorge.sandoval@agrofresh.com`, la misma que puede eliminar).
- Toman el folio libre **más bajo** del hueco; el límite no está escrito a
  mano: es el folio real más bajo del laboratorio, menos uno. Lleno el hueco,
  409. No tocan el contador real.
- La marca es `es_prueba` dentro de `datos` (hoja `_data` del Excel + jsonb
  del índice): **no hay migración**, y sobrevive a editar y a reindexar.
- **Nunca se envían solas** (ni al crear ni al editar, aunque el envío
  automático esté prendido): se envían a mano desde el detalle, a los
  contactos reales, con **«(PRUEBA)»** al inicio del asunto.
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
  mezclan). Luego un solo gráfico grande: **una columna por informe** (la fecha
  se repite tantas veces como informes haya ese día, en vertical), los analitos
  uno sobre otro según su ppm y unidos por una **línea punteada negra**
  (`conectoresInforme`). **Nunca se promedia en ese gráfico.** Su título se arma
  solo con los filtros y parte con «Residuales» (`tituloGrafico`, ej. «Residuales
  - Dole Lontué - Actimist - Manzana - Fludioxonil»). El filtro de ingredientes
  parte con **todos** los analitos (vacío = todos). Abajo quedan solo «Informes
  por especie» (paleta verdes/amarillos de la marca, `colorEspecieMarca`) y
  «Promedio por ingrediente» (sin «ppm» en el título). Se **quitaron a pedido**:
  tarjeta de límites residuales, % de cumplimiento, distribución de valores,
  indicadores y solicitudes por cliente: no los vuelvas a poner. La vista por
  límite de control (Auditoría interna) conserva su tarjeta de límites.
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
  separados por «;», y **N° Orden ya no existe**. Lo que no está en ningún lado
  queda vacío. Sin la tabla del índice (0020) la descarga sigue funcionando.
  La banda de fungicidas nombra solo los laboratorios presentes (`titulo_fungicidas`):
  «QUITECA — ANÁLISIS DE RESIDUOS DE FUNGICIDAS», o «QUITECA / AGROFRESH — …» si están los dos.

---

## Auditoría Interna (módulo nuevo)

`/modulos/auditoria-interna` es un hub con tres tarjetas:

| Pantalla | Qué es |
|---|---|
| Solicitudes e informes | Solicitudes emitidas (`solicitud_archivo`) vs informes recibidos: filtros ocultables (como Report), barras de **solicitudes por laboratorio** (apiladas por estado), **dos donas, una por tipo de servicio** (Actimist en azul, Línea de proceso en violeta; el estado se lee por el tono y los números van en la leyenda), barras de **análisis vs informes por cliente** con botón Ambos / Actimist / Línea de proceso, y una tabla (laboratorio · solicitud · informe · cliente/planta · tipo de análisis · analitos · estado)). Los filtros principales son Cliente y Sucursal (Ship To); los analitos son un desplegable con casilleros, punto de color y conteo, igual que «Ingrediente activo» de Report (`MultiSelectFiltro`). El ícono del informe muestra al pasar el mouse emitida / cargada / enviada. |
| Carpetas de auditoría | Navegador de la carpeta **`auditoria/`** dentro del bucket de siempre (`agrofresh-storage`): `<laboratorio>/<ship to>/<archivo>.pdf`. Las carpetas nacen con el primer PDF. En una carpeta se marcan uno, varios o todos los informes y se bajan juntos en un **.zip** (`POST /carpetas/zip`, tope 300 archivos / 400 MB). |
| Vista por límite de control | El gráfico que antes era una pestaña de Report. Es `ReporteView` con `vistaControl`; en Report ya no existe. |

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
- **Concretada** = tiene PDF guardado **y** sus resultados ya están en Report
  (`solicitud.nro_solicitud = informe_auditoria.nro_informe`). PDF sin Report
  se muestra aparte en las donas y los gráficos, y en la tabla como «Pendiente»
  con el aviso «PDF sin Report». **No hay nada de «demora de concretación»**: se
  quitó a propósito (no es relevante); no la vuelvas a agregar sin que lo pidan.
  El **tipo de análisis** de una solicitud es el «Tipo Aplicación» de su formulario
  (`datos.campos_laboratorio`: Actimist / Línea de proceso) y los **analitos** son
  `datos.analitos_solicitados`; `/solicitudes` los devuelve. En el gráfico por
  cliente, «informes» = informes **concretados**. La lógica (filtros, donas,
  clientes) es pura y se prueba en `features/auditoriaInterna/lib/`. El laboratorio `AGROFRESH` (propio) no entra al panel: su
  resultado llega por el GC, no por un informe externo.
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
  Reemplaza a los scripts `importar_contactos_resultado.py` /
  `auditar_contactos_resultado.py` para el uso diario. El panel se mantiene montado al
  cambiar de pestaña para no perder cambios sin guardar.
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
- **En Windows falta `tzdata`**: sin él `zoneinfo` no encuentra las zonas.
  Está declarado en `requirements.txt`.

---

## Estado y pendientes

Lo hecho hasta ahora está en el historial de la rama. Lo que **queda
pendiente**, en orden de importancia:

1. ~~El túnel Cloudflare~~ **resuelto**: `estado.ps1` lo reporta como servicio
   `Running` (25-09-2026), igual que el backend (tarea programada).
2. **Etapa 4 del módulo AgroFresh Lab → Ingreso al laboratorio**: botón
   "Procesar" → modal con el listado de informes → guardar en R2 (ojo: `informes/`
   ya es el espacio Informes, con su orden planta/fecha/análisis/laboratorio) →
   tabla abajo para descargarlos todos o de a uno.
3. **`sembrar_catalogo_analitos.py --aplicar`** en el servidor: 14 analitos
   por crear. `DFN` hay que crearlo a mano (la app no conoce su nombre).
4. **Los límites residuales están vacíos.** Son decisión del laboratorio y se
   cargan en Report → Gestionar analitos. **Nunca los inventes.**
5. Diferidos por decisión del usuario: paginar `/api/reportes/datos` y migrar
   los ~14 mantenedores JSON a tablas.
6. Opcional: activar compresión gzip (una línea, ~96% menos de payload).
