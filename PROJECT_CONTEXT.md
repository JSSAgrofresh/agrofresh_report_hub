# PROJECT_CONTEXT.md — AgroFresh Report Hub

Contexto completo del estado del proyecto para continuar desarrollo sin depender del
historial de conversación. Actualizado tras el módulo "Emitir reporte → Reporte análisis
cromatografía" (folio interno, subida a BD, descarga de historial en portal de cliente).

Rama de trabajo activa: `claude/react-vite-typescript-setup-7uzbv6` (se pushea directo, sin PR,
salvo que se pida explícitamente).

## 1. Qué es esto

Plataforma interna de AgroFresh Chile para unificar y analizar resultados de laboratorio
(residuos de pesticidas en fruta, principalmente) desde distintas fuentes (Excel nativo,
"Converter" para otros laboratorios, cromatografía propia), con:
- ETL/homogenización contra un catálogo maestro de clientes (Sold To) y sucursales (Ship To).
- Un módulo de reportería (`Report`) con gráficos, filtros y KPIs, tanto para uso interno
  (admin) como portal de cliente (cuentas acotadas a su propio Sold To/Ship To).
- Un módulo de emisión de informes de cromatografía (cruce manual solicitud↔resultado GC,
  export a Excel/PDF, subida a base de datos con folio interno).
- Un módulo de almacenamiento de archivos tipo file-manager (Storage).
- Un módulo de auditoría/staging de datos (DataCore) para corregir inconsistencias de
  homogenización sin tocar la base en vivo hasta "promover".

## 2. Stack

**Frontend**: React 19 + Vite + TypeScript (strict) + React Router 7 + Chart.js 4. CSS Modules
con design tokens (`src/styles/globals.css`). ESLint (flat config) + Prettier. Vitest + Testing
Library para pruebas.

**Backend**: Python 3.11+ / FastAPI + psycopg2 (pool) + PostgreSQL. Sin ORM — SQL directo con
`RealDictCursor`. `openpyxl` para Excel, `reportlab` para PDF.

**Auth**: **Stub de frontend únicamente**. No hay tabla `usuario` en la base de datos ni
autenticación real (cualquier contraseña funciona). Usuarios viven en `localStorage`
(`src/features/usuarios/api/usuariosStore.ts`, key `agrofresh.usuarios`), sembrados con un
`SEED` fijo. Roles: `admin_general`, `admin_area` (acotado a un área), `cliente` (acotado a
`clienteNombre` y opcionalmente `plantaNombre`). Esto es una limitación conocida — cuando se
aborde auth real, hay que migrar este modelo a la base de datos.

## 3. Cómo correr todo

```bash
# Backend
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # editar DB_* y STORAGE_DIR
.venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend (raíz del repo)
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:8000/api
npm install
npm run dev             # sirve en :5173
```

Login de prueba: `jorge.sandoval@agrofresh.com` (admin_general) o `cliente.demo@ejemplo.com`
(cliente, `clienteNombre: 'DOLE CHILE S.A.'`) — cualquier contraseña.

Comandos útiles: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

## 4. Base de datos

Postgres, todo en el schema `lab` (search_path=`lab,public` seteado a nivel de pool en
`backend/app/db.py`). **No existe un `schema_agrofresh.sql` base en el repo** — el schema se
fue construyendo incrementalmente; `backend/migrations/*.sql` son las migraciones aplicadas
en orden (0001 a 0008 al momento de este documento). Todas son idempotentes
(`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) excepto `0004_reset_datos_transaccionales.sql`,
que es **destructiva a propósito** (vacía datos transaccionales, nunca correrla sin confirmar).

### Tablas principales

- **`solicitud`** — una fila por muestra/análisis. Columnas clave: `nro_solicitud` (UNIQUE),
  `laboratorio`, `planta_id` (FK a `planta`, nullable), `sold_to_raw`/`ship_to_raw` (texto
  crudo, se homogeniza contra el catálogo antes de insertar), `especie`, `variedad`,
  `tipo_servicio`, fechas (`fecha_solicitud`, `fecha_muestreo`, `fecha_entrada`,
  `fecha_analisis`, `fecha_informe`), `semana_muestreo`/`mes`/`temporada` (calculados, no se
  confía en columnas crudas del Excel), `referencia`/`nro_orden` (campos libres reusados por
  el módulo Emitir para guardar el N° de solicitud original y el código de vial del GC),
  `origen` (`ingest` | `converter` | `emitir_cromatografia` | null para datos viejos),
  `vigente` (soft-delete, no implementado activamente todavía).
- **`resultado`** — long format, una fila por analito medido en una solicitud. `analito_id`
  (FK, nullable) + `analito_raw` (fallback si el código no está en el catálogo), `valor_num`,
  `valor_texto` (para "ND", "<L.C", etc). `UNIQUE(solicitud_id, analito_id)`.
- **`producto_aplicado`** — dosis de producto aplicado por analito/solicitud (línea de
  proceso). `UNIQUE(solicitud_id, analito_id)`.
- **`cliente`** / **`planta`** — catálogo maestro oficial de Sold To / Ship To
  (`cliente.nombre` UNIQUE, `planta` UNIQUE por `(cliente_id, nombre)`, ambas con `activo`).
  Es la ÚNICA fuente de verdad para nombres de cliente/sucursal — Ingest/Converter/Emitir
  homogenizan contra esto y **nunca auto-crean** cliente/planta nuevos sin que un humano
  confirme (ver `pendiente_revision` e `Emitir → subir-bd`).
- **`analito`** — catálogo de analitos por laboratorio (`UNIQUE(codigo, laboratorio)`),
  incluye límites residuales fijos (legado, ver `analito_limite` para el modelo real) y
  `limite_deteccion`/`limite_cuantificacion` (texto libre).
- **`analito_limite`** — límites por analito × especie × tipo_servicio (`''` = comodín
  "aplica a todo"). Es el modelo real de límites; reemplaza a los campos fijos de `analito`.
- **`pendiente_revision`** — bandeja de revisión de DataCore: filas de Ingest/Converter cuyo
  Sold To/Ship To/especie/etc. es una variante de mayúsculas/espacios de algo ya cargado
  (probable error de tipeo). Un valor genuinamente nuevo entra directo, sin pasar por acá.
- **`informe_config`** — fila única (id=1): nombre/cargo de "analizado por" y "aprobado por"
  para la firma del PDF de cromatografía, editable desde la app (botón "Configurar informe").
- **`informe_folio`** — correlativo diario (`fecha` PK, `siguiente`) para el folio interno
  `LAB-YYYYMMDD-NNN` que comparten el Excel y el PDF exportados desde Emitir, y el registro
  subido a la base (`solicitud.nro_solicitud`).
- **`equipo_accutab`** / **`lectura_accutab`** — para el módulo Postcosecha/Trace (área
  distinta a Cromatografía). Poco desarrollado en frontend todavía (ver §7).

### Convenciones de datos importantes

- `cliente`/`planta` son la fuente de verdad; `solicitud.sold_to_raw`/`ship_to_raw` son el
  texto crudo tal como llegó (se preservan aunque ya se haya resuelto `planta_id`), usado como
  fallback vía `COALESCE(c.nombre, s.sold_to_raw)` en las queries de `Report`.
- `semana_muestreo`/`mes` **siempre se calculan** desde la fecha real (`calcular_semana`,
  `calcular_mes` en `backend/app/mapeo.py`), nunca se confía en columnas crudas del Excel.
- Analitos de cromatografía (Quiteca/AgroFresh): `AZOX`, `DPA`, `FDL`, `IMZ`, `PYR`, `TBZ`,
  `TEBU`, unidad `ppm`, `laboratorio = 'Quiteca / AgroFresh'` (constante
  `mapeo.LABORATORIO_CATALOGO`).
- **Regla dura repetida en todo el sistema**: nunca se le muestra/exporta/inserta a un cliente
  o solicitud un resultado de un analito que no fue solicitado explícitamente. Se aplica tanto
  en el Excel de Emitir como en la subida a base de datos.

## 5. Backend — estructura y API (`backend/app/`)

Un router por dominio, todos registrados en `main.py`. `db.py` expone `conexion(escribir=bool)`
(contextmanager: commit si escribir y no hay excepción, rollback si `escribir=False` **siempre**
o si hay excepción) y `cursor_dict(conn)` (RealDictCursor). Patrón estándar en todo el backend:
`with conexion() as conn, cursor_dict(conn) as cur: ...`.

CORS: `expose_headers=["Content-Disposition"]` es necesario y ya está seteado — sin esto el
frontend no puede leer el nombre real de archivos generados (Excel/PDF) en descargas
cross-origin.

| Router | Prefijo | Qué hace |
|---|---|---|
| `ingest.py` | `/api/ingest` | Carga masiva desde Excel (nativo o "Converter"). `POST /preview` (rollback siempre), `POST /confirmar` (transacción real). Valida contra el catálogo oficial antes de insertar — si un valor no calza, va a `pendiente_revision` en vez de auto-crear cliente/planta. `GET/POST /pendientes*` para aprobar/descartar en lote desde DataCore. |
| `reportes.py` | `/api/reportes` | `GET /datos` (long format, filtrable por `cliente`/`planta` — es el que usa tanto el admin como el portal de cliente), `GET /datos/excel` (mismo filtro, descarga Excel — nuevo, para que el cliente se lleve su historial), `GET /resumen`, `GET /clientes`, CRUD de `/analitos` y `/limites`. |
| `catalogo.py` | `/api/catalogo` | CRUD de `cliente`/`planta` — el catálogo maestro oficial, editado desde "Listados" en el admin. |
| `auditoria.py` | `/api/auditoria` | DataCore: detecta inconsistencias de homogenización ya cargadas, trabaja sobre un schema `lab_staging` (copia), y solo aplica a producción vía `POST /promover` (requiere 0 inconsistencias pendientes; es un rename de schemas, sin downtime). |
| `storage.py` | `/api/storage` | File manager real sobre disco (`STORAGE_DIR`): listar, crear carpetas, subir, renombrar, mover, descargar, eliminar. Sanitiza nombres (`_nombre_seguro`) y resuelve la carpeta raíz (`_carpeta_raiz`). |
| `emitir.py` | `/api/emitir/cromatografia` | Ver §6 abajo — es el módulo más nuevo y complejo. |

Dependencias Python (`backend/requirements.txt`): fastapi, uvicorn, psycopg2-binary,
python-dotenv, pydantic v2, openpyxl, python-multipart, reportlab.

## 6. Módulo Emitir → Reporte análisis cromatografía (el más reciente, completo)

Flujo: el usuario sube el reporte de texto del GC (Agilent ChemStation), ve las solicitudes de
muestreo ya guardadas en Storage (carpeta `"Solicitud de Muestreo"`, archivos `.xls` que en
realidad son HTML), **cruza manualmente** (drag & drop) cada solicitud con el vial del GC que
le corresponde (el sistema NO adivina el cruce — el usuario dijo explícitamente que ellos son
quienes saben qué solicitud corresponde a qué resultado), y desde ahí puede exportar a Excel,
generar PDF(s), o subir el cruce a la base de datos real.

- **`gc_parser.py`** — parsea el texto plano del reporte GC (UTF-16LE con BOM). Extrae de la
  tabla "External Standard Report" (fixed-width, columnas ubicadas por los `|` de la línea
  separadora, no por whitespace-split). `NOMBRE_GC_A_CODIGO` mapea nombres del GC a códigos del
  catálogo (`"FLUDIOXONIL": "FDL"`, etc). `es_codigo_puro(codigo)` filtra curvas/blancos/QC
  (solo códigos tipo `GCNPD9826`, no `"GCNPD9775 LIMPIEZA..."`).
- **`solicitud_parser.py`** — los archivos de Storage son HTML-como-.xls (confirmado por xlrd
  fallando con `found b'<html'`). Parser propio con `html.parser`. `SolicitudMuestreo.campos`
  = dict con las ~44 columnas originales (`"N° Solicitud"`, `"Sold To (Nombre)"`,
  `"Ship To (Nombre)"`, `"Pirimetanil (PYR)"`, `"Resultado: Pirimetanil (PYR)"`, etc.);
  `.analitos_solicitados` = códigos extraídos de las columnas marcadas "Sí".
- **Validación de cruce (frontend)** — `validarCruce()` en `CromatografiaEmitirView.tsx`:
  regla EXACTA, el conjunto de analitos detectados (amount>0) debe ser idéntico al conjunto
  solicitado, sin excepción. Cualquier diferencia → fila roja ("⚠ Revisar"), bloquea exportar
  Excel/PDF/subir a BD. Fila verde solo si coincide exacto.
- **`POST /excel`** — reproduce el archivo de solicitud original (mismas ~44 columnas, mismo
  orden), rellenando solo las columnas `"Resultado: <analito>"` de los analitos efectivamente
  solicitados (chequeo server-side, no confía en lo que mande el frontend). Ahora incluye una
  columna `"N° Informe"` con el folio asignado.
- **`POST /informes-pdf`** — genera PDF con `reportlab` (A4, diseño sobrio: título de sección
  en verde + línea fina, color solo en el header de la tabla de resultados; logo en
  `src/assets/agrofresh-logo.png`). Un PDF si es 1 fila, ZIP si son varias. Incluye folio y
  bloque de firma (nombre/cargo desde `informe_config`).
- **`GET/PUT /config-informe`** — nombre/cargo de "analizado por"/"aprobado por", editable
  desde el botón "Configurar informe" en la UI (persiste para futuros PDFs hasta que se
  edite de nuevo — pensado para cuando cambia quién firma, ej. vacaciones).
- **`_asignar_folios(cur, cantidad)`** — helper interno: asigna N folios `LAB-YYYYMMDD-NNN`
  consecutivos de forma atómica contra `informe_folio` (correlativo diario). Compartido por
  `/excel`, `/informes-pdf` y `/subir-bd`.
- **`POST /subir-bd`** — el más nuevo: inserta cada fila cruzada como registro real en
  `solicitud`+`resultado`, con `nro_solicitud = folio` (no el N° de solicitud original — se
  preserva en `referencia`; el código de vial del GC se guarda en `nro_orden`).
  `laboratorio = 'Quiteca / AgroFresh'`, `tipo_servicio = 'Cromatografía'`. Resuelve
  `cliente_id`/`planta_id` contra el catálogo oficial (`cliente`/`planta`) — **si el Sold
  To/Ship To no calza exacto con algo ya cargado en Listados, rechaza esa fila con un mensaje
  claro** (nunca auto-crea). Protegido contra duplicados: dedup key = `(referencia, nro_orden,
  laboratorio)` — reintentar la misma solicitud+vial devuelve `estado: 'ya_existia'` sin
  duplicar. Respuesta es `list[FilaSubidaOut]` con `estado: 'creada'|'ya_existia'|'error'` por
  fila, mostrado en la UI debajo del botón.

**Gap conocido**: si `ship_to_raw` viene vacío (solicitud "Sold To only"), `planta_id` queda
`NULL` — el registro se crea pero no será visible en ningún filtro de portal de cliente
acotado por planta (mismo comportamiento que Ingest para este caso, no es un bug nuevo).

Frontend: `src/features/emitir/` (tipos + API), `src/views/modules/reports/cromatografia/`
(`CromatografiaEmitirView.tsx` es el canvas principal, `SolicitudFichaModal.tsx`,
`ConfiguracionInformeModal.tsx`).

## 7. Frontend — estado por módulo

Regla de dependencia (`README.md`): `views` → `features`+`components`; `features` →
`components`/`hooks`/`lib`/`services`/`types`; nunca al revés. Alias `@/` → `src/`.

**Completos y funcionales:**
- **Report** (`views/modules/reports/ReporteView.tsx`) — gráficos (Chart.js), filtros
  (cliente/planta/laboratorio/tipo_servicio/especie/ingrediente/semana/mes/rango de fechas
  con calendario custom), vista "límite residual" vs "límite de control" (± N desviaciones),
  KPIs, modal de detalle al hacer clic en un punto. Portal de cliente = mismo componente con
  `clienteFijo`/`plantaFija` fijos (filtros Cliente/Sucursal ocultos, datos acotados desde el
  backend). Botón "Descargar mi historial (Excel)" visible solo para cuentas de cliente.
  "Gestionar analitos" (matriz de límites por especie/tipo_servicio) visible para
  admin_general/admin_area.
- **Reports hub** — `ReportesHubView.tsx` (cards: Laboratorio, Post Venta, Emitir reporte) →
  `EmitirReporteHubView.tsx` (card: Reporte análisis cromatografía) →
  `CromatografiaEmitirView.tsx` (ver §6).
- **Ingest** — carga de Excel con preview/confirmar, muestra advertencias y pendientes.
- **Storage** — file manager completo (crear carpeta, navegar breadcrumbs, renombrar, mover
  con drag & drop, eliminar, subir).
- **DataCore** — UI de auditoría/staging (`DataCoreView.tsx`, 840 líneas): revisa
  inconsistencias, crea/descarta staging, corrige valores, aprueba/descarta pendientes,
  exporta, promueve a producción.
- **Admin → Usuarios** (`UsuariosView.tsx`) — CRUD de usuarios en localStorage (ver §2, no hay
  backend real).
- **Admin → Listados** (`ListadosView.tsx`) — CRUD del catálogo oficial `cliente`/`planta`.

**Placeholder / sin construir (`EstadoModulo` — "próximamente" o "en proceso"):**
- **Trace** (`TraceView.tsx`, 11 líneas) — módulo del área Postcosecha, no iniciado.
- **Converter** (`ConverterView.tsx`, 11 líneas) — existe como página HTML standalone separada
  mencionada en el backend README (`converter.html`) pero la vista React es un stub.
- **Post Venta** (`PostVentaView.tsx`) — explícitamente "En proceso de creación" por pedido
  del usuario, sin fecha definida para retomarlo.

## 8. Decisiones/convenciones de negocio importantes (no obvias desde el código)

- **Nunca auto-crear cliente/planta silenciosamente** desde ningún flujo de carga — es una
  regla que se rompió una vez (versión vieja de Ingest) y se corrigió explícitamente
  (`pendiente_revision`); se repitió el mismo criterio al construir `/emitir/subir-bd`.
- **El cruce solicitud↔resultado de cromatografía es 100% manual**, nunca automático por
  nombre de archivo o heurística — decisión explícita del usuario tras ver que era
  fundamentalmente indeterminable (el N° de solicitud no tiene relación con el código de vial
  del GC).
- **Nunca mostrar/exportar un resultado de un analito no solicitado** — aplica en Excel, PDF y
  ahora en la subida a BD (solo se insertan resultados de `analitos_solicitados`).
- El folio interno (`LAB-YYYYMMDD-NNN`) es la identidad "oficial" de un informe emitido —
  reemplaza al N° de solicitud original como `nro_solicitud` cuando se sube a la base, aunque
  el N° original se preserva en `referencia` para trazabilidad.
- Cuentas de cliente pueden ser por Sold To completo o por Ship To específico
  (`plantaNombre` opcional en `Usuario`) — pensado para clientes con varias plantas que
  quieren cuentas separadas por sucursal.
- El "Report" del cliente y el del admin son literalmente el mismo componente
  (`ReporteView.tsx`) parametrizado por props — no hay una vista separada para portal de
  cliente, evita duplicar lógica de gráficos/filtros.

## 9. Gaps/deuda técnica conocida a tener en cuenta

- **No hay autenticación real** — todo el modelo de usuarios/roles vive en `localStorage` del
  navegador. Cualquier trabajo de seguridad real requiere migrar esto a backend+DB primero.
- **No hay archivo de schema base versionado** — el schema completo de `lab` solo existe como
  el resultado acumulado de correr las migraciones en orden sobre una base vacía; no hay un
  `schema_agrofresh.sql` en el repo pese a que `backend/README.md` lo menciona (puede estar
  desactualizado o ese archivo vive fuera del repo).
- `backend/README.md` está desactualizado — no menciona Storage, Catálogo/Listados, Emitir, ni
  migraciones 0007/0008. Vale la pena regenerarlo si se retoma documentación.
- El módulo Trace/Postcosecha (`equipo_accutab`/`lectura_accutab`) tiene tablas en la base pero
  prácticamente nada de frontend — es candidato obvio para "el próximo módulo".
- Sandbox de desarrollo (si se sigue trabajando en un entorno similar a este) pierde procesos
  (postgres/uvicorn/vite) entre reinicios de contenedor — hay que relanzarlos manualmente cada
  vez (`service postgresql start`, `uvicorn app.main:app`, `npm run dev`).

## 10. Dónde mirar primero según lo que se vaya a construir

- **Nueva fuente de datos de laboratorio** → mirar `backend/app/mapeo.py` +
  `backend/app/ingest.py` (patrón de mapeo columna→campo + homogenización).
- **Nuevo tipo de informe/reporte emitible** → mirar `backend/app/emitir.py` +
  `backend/app/informe_pdf.py` como plantilla (parser de origen, validación de cruce, folio,
  export Excel/PDF, subida a BD con protección de duplicados).
- **Cambios al modelo de datos** → nueva migración numerada en `backend/migrations/`, con
  comentario de cabecera explicando el propósito y el comando `psql -f` para aplicarla; avisar
  al usuario que debe correrla en su base de Windows real (no se aplica sola).
- **Nueva vista de cliente/portal** → seguir el patrón `ReporteView.tsx` (props
  `clienteFijo`/`plantaFija` opcionales, mismo componente para admin y cliente).
