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
  El lint tiene **16 errores de línea base preexistentes** (casi todos
  `set-state-in-effect`); si salen 16, está bien. Si salen 17, algo nuevo lo rompió.
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
mayúsculas). Se necesita al menos un Para: solo copias = error 400. No
confundir con `tipo_copia`, que es de los contactos de **resultados**.

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
- **En Windows falta `tzdata`**: sin él `zoneinfo` no encuentra las zonas.
  Está declarado en `requirements.txt`.

---

## Estado y pendientes

Lo hecho hasta ahora está en el historial de la rama. Lo que **queda
pendiente**, en orden de importancia:

1. ~~El túnel Cloudflare~~ **resuelto**: `estado.ps1` lo reporta como servicio
   `Running` (25-09-2026), igual que el backend (tarea programada).
2. **Etapa 4 del módulo AgroFresh Lab → Ingreso al laboratorio**: botón
   "Procesar" → modal con el listado de informes → guardar en R2 bajo
   `informes/<fecha>/` → tabla abajo para descargarlos todos o de a uno.
3. **`sembrar_catalogo_analitos.py --aplicar`** en el servidor: 14 analitos
   por crear. `DFN` hay que crearlo a mano (la app no conoce su nombre).
4. **Los límites residuales están vacíos.** Son decisión del laboratorio y se
   cargan en Report → Gestionar analitos. **Nunca los inventes.**
5. Diferidos por decisión del usuario: paginar `/api/reportes/datos` y migrar
   los ~14 mantenedores JSON a tablas.
6. Opcional: activar compresión gzip (una línea, ~96% menos de payload).
