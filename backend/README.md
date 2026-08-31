# Backend — AgroFresh Report Hub

API local en FastAPI que conecta los módulos Ingest y Report a Postgres.
Audit todavía no está integrado.

## Instalación (Windows, PowerShell)

Necesitas Python 3.11+ instalado.

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Configuración

```powershell
copy .env.example .env
```

Edita `.env` con los datos reales de tu Postgres (host, puerto, nombre de
la base, usuario, contraseña). Si Postgres corre en tu misma máquina con
la instalación por defecto, probablemente solo tengas que completar
`DB_PASSWORD`.

Asegúrate de haber corrido `schema_agrofresh.sql` contra esa base antes
(crea el schema `lab` con todas las tablas).

Además, para que el módulo Report pueda guardar límites residuales por
analito, corre una vez la migración:

```powershell
psql -U postgres -d tu_base -f migrations\0001_analito_limites.sql
```

Es segura de repetir (usa `ADD COLUMN IF NOT EXISTS`), así que si no estás
seguro de si ya la corriste, córrela de nuevo sin problema.

Si ya habías cargado datos con una versión anterior del backend, la
columna `semana_muestreo` puede tener el valor crudo (y poco confiable)
de la columna "SEMANA" del Excel en vez de calcularse desde la fecha de
entrada. Para recalcularla en lo que ya cargaste:

```powershell
psql -U postgres -d tu_base -f migrations\0002_recalcular_semana.sql
```

También es segura de repetir — puedes correrla cuantas veces quieras.

Por último, para tener el catálogo completo de clientes y sus sucursales
(incluye clientes que todavía no tienen muestras cargadas), corre:

```powershell
psql -U postgres -d tu_base -f migrations\0003_clientes_sucursales.sql
```

Es un upsert por nombre — no toca ni duplica lo que ya exista, así que
también es segura de repetir.

Para soportar límites por especie y tipo de servicio (un mismo analito puede
tener un límite distinto en Cereza que en Manzana-Actimist, por ejemplo), y
para tener el catálogo real de Quiteca/AgroFresh cargado con los límites que
ya conocemos, corre:

```powershell
psql -U postgres -d tu_base -f migrations\0005_analito_limites_por_especie_servicio.sql
```

Crea la tabla `analito_limite`, agrega `limite_cuantificacion` a `analito`, y
siembra (upsert) los límites reales de "Línea de Proceso" y "Actimist". También
es segura de repetir.

Para que Ingest/Converter dejen de auto-crear cliente/sucursal silenciosos
cuando traen un valor que no está en el catálogo real (y en vez de eso la
fila quede en "Pendientes de revisión" dentro de DataCore), corre:

```powershell
psql -U postgres -d tu_base -f migrations\0006_pendientes_revision.sql
```

Crea la tabla `pendiente_revision` y agrega la columna `origen` a `solicitud`
(de dónde vino cada una: `ingest` o `converter`, nulo para lo cargado antes).
Sin esta migración, Ingest y Converter dejan de poder crear solicitudes
nuevas -el INSERT ahora siempre incluye `origen`-, así que hay que correrla
antes de usarlos.

### ⚠ `0004_reset_datos_transaccionales.sql` — script destructivo, no es una migración de rutina

A diferencia de las demás, esta NO se corre como parte de la instalación
normal. Vacía `solicitud`, `resultado`, `producto_aplicado`, `planta`,
`cliente` y las tablas de Accu-Tab (`RESTART IDENTITY CASCADE`) — borra todos
los datos cargados hasta ahora. No toca `analito` ni `analito_limite` (el
catálogo y los límites sobreviven). Solo correr a propósito cuando se quiera
partir de cero con los datos de ingesta/reportería, nunca sin confirmar antes.

## Arrancar

```powershell
uvicorn app.main:app --reload --port 8000
```

Debería quedar escuchando en `http://localhost:8000`. Prueba que responda:

```powershell
curl http://localhost:8000/api/salud
```

## Conectar el frontend

En la raíz del proyecto (no en `backend/`), en tu archivo `.env`:

```
VITE_API_BASE_URL=http://localhost:8000/api
```

Reinicia `npm run dev` después de cambiar el `.env` para que tome la
variable.

## Cómo funciona la carga de Ingest

- **Vista previa** (`POST /api/ingest/preview`): nunca escribe en la base,
  pase lo que pase — hace rollback siempre. Devuelve exactamente qué se
  crearía: cuántas solicitudes, clientes y plantas nuevas, productos
  aplicados, resultados, y advertencias (analitos que no calzaron con el
  catálogo, campos que no se pudieron convertir a número, etc.).
- **Confirmar** (`POST /api/ingest/confirmar`): hace la escritura real, en
  una sola transacción — si algo falla a mitad de camino, no queda nada a
  medias.
- Las solicitudes que ya existen (mismo `nro_solicitud`) se omiten, nunca
  se sobreescriben. Si necesitas actualizar una solicitud existente, por
  ahora hay que hacerlo a mano en la base — lo dejamos así a propósito
  para no pisar datos sin querer.

## Cómo funciona Report

- `GET /api/reportes/datos`: trae todos los resultados de la base en
  formato largo (una fila por analito medido), para que el frontend arme
  los gráficos y filtros. Es de solo lectura.
- `GET/POST/PUT/DELETE /api/reportes/analitos`: catálogo de analitos,
  incluidos los límites residuales editables (mínimo/central/máximo). Los
  límites de *control* no se guardan en ninguna parte — se calculan al
  vuelo como promedio ± N desviaciones estándar sobre lo que esté
  filtrado en pantalla.
- Borrar un analito que ya tiene resultados o aplicaciones cargadas
  devuelve un error 409 explicando que hay que desactivarlo en vez de
  eliminarlo (el catálogo tiene una columna `activo` para eso).
- El frontend refresca esta data solo, 4 veces al día (08:00, 12:00,
  16:00 y 20:00), además del botón manual "Actualizar" que refresca al
  tiro sin esperar la hora programada.

## Autenticación y permisos

La API está cerrada: sin sesión, ningún endpoint responde. Antes el login
aceptaba cualquier contraseña no vacía y los permisos vivían solo en el
navegador, así que la API entera respondía a quien supiera su URL.

### Cómo se guarda cada cosa

- **Contraseñas**: nunca se guardan. Se guarda el resultado de pasarlas por
  scrypt (`app/seguridad.py`), con una sal distinta para cada una. Robar la
  base no es robar las contraseñas.
- **Sesiones**: en la tabla `sesion`, y de cada una se guarda la *huella*
  del token, no el token. Son sesiones del servidor y no JWT porque cerrar
  sesión, expulsar a alguien o revocar todo tras un incidente tiene que ser
  un `DELETE`, no esperar a que venza una firma.
- **El padrón de cuentas**: tabla `usuario`. Antes era `usuarios.json` en
  R2; un archivo que se lee y reescribe entero pierde el cambio del primero
  cuando dos administradores editan a la vez, y ahora lo que se perdería son
  permisos y contraseñas.

### Quién ve qué

- La sesión se exige **a nivel de router**, en `main.py`, en un solo lugar.
  Un router nuevo que se agregue a esa lista nace protegido: con 131
  endpoints, basta olvidar una anotación para dejar la base abierta.
- Las cuentas tipo `cliente` solo alcanzan `reportes_router`. Todo lo demás
  —cargar datos, catálogos, solicitudes, correos, el padrón— les responde
  403.
- Qué cliente ve una sesión lo decide `alcance_de_datos` (`app/auth.py`), y
  **nunca** el parámetro `?cliente=` que manda el navegador. Antes se le
  creía a ese parámetro: una cuenta de Dole lo editaba en la barra de
  direcciones y veía Agricom. `tests/test_alcance_datos.py` falla si alguien
  afloja esa regla.

### Puesta en marcha

Después de aplicar `migrations/0019_usuarios_y_sesiones.sql`:

```
cd backend
python scripts/migrar_usuarios_a_bd.py            # vista previa
python scripts/migrar_usuarios_a_bd.py --aplicar  # mueve el padrón desde usuarios.json
python scripts/clave.py jorge.sandoval@agrofresh.com
```

Las cuentas migradas quedan **sin contraseña**: existen, pero no pueden
entrar hasta que alguien les asigne una. `clave.py` la pide por teclado y no
la muestra — lo que se escribe en la línea de comandos queda en el historial
de la terminal.

Desde ahí, las contraseñas se manejan en el sistema: crear una cuenta
devuelve una contraseña de un solo uso que hay que dictarle a su dueño, y
esa persona tiene que cambiarla antes de entrar a ninguna parte.

### CORS

`CORS_ORIGINS` (variable de entorno, separada por comas) tiene que listar los
dominios reales del frontend. Antes había además un comodín
`https://*.vercel.app`, que dejaba llamar a esta API desde cualquier deploy
de cualquier persona en Vercel.

### Pruebas

```
cd backend
python -m pytest                 # todo lo que no necesita base
python -m pytest -v              # con Postgres configurado, corre también la integración
```

Sin Postgres a mano, las pruebas que lo necesitan se saltan solas en vez de
fallar. En el servidor sí hay base, y ahí corren las 378.
