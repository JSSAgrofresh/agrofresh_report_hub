# Backend — AgroFresh Report Hub

API local en FastAPI que conecta el módulo Ingest a Postgres. Hoy solo
expone lo necesario para probar la carga de datos; el resto (dashboards,
Audit, etc.) se agrega después.

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
