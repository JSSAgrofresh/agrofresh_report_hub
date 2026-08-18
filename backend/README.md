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
