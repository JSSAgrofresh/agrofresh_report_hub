# Servidor propio — AgroFresh Report Hub

Guía para mover el backend y la base de datos al equipo de la oficina, dejando
el frontend en Vercel.

## Por qué

| | Render + Neon | Servidor de la oficina |
|---|---|---|
| Primera carga del día | ~50 s (el servicio duerme) | inmediata |
| Ingest de 4.500 filas | 4,4 min | segundos |
| Memoria disponible | 512 MB | 32 GB |
| Archivos subidos | se borran al desplegar | disco real |
| Costo | límites del plan gratuito | ninguno |

El ingest tardaba minutos porque cada consulta cruzaba internet hasta Neon
(5–10 ms por vuelta). Contra un PostgreSQL en el mismo equipo son ~0,1 ms:
entre 50 y 100 veces más rápido. Y el error 500 al aprobar pendientes era el
contenedor quedándose sin memoria, algo que con 32 GB deja de existir.

## Arquitectura

```
Usuario → Vercel (frontend)
             │
             ▼
      Cloudflare (HTTPS)
             │  túnel saliente, sin abrir puertos
             ▼
   ┌─────────────────────────┐
   │  Equipo de la oficina   │
   │  backend + PostgreSQL   │
   └─────────────────────────┘
             │
             ▼
      Cloudflare R2 (respaldos)
```

El túnel es una conexión **saliente**: el equipo no queda expuesto a internet y
no hay que tocar el router ni el firewall.

## Antes de empezar

Instalar en el equipo, en este orden:

1. **PostgreSQL 16** — https://www.postgresql.org/download/windows/
   Anotar la contraseña del usuario `postgres`, se pide más adelante.
2. **Python 3.11** — https://www.python.org/downloads/
   Marcar **"Add python.exe to PATH"** durante la instalación.
3. **Git** — https://git-scm.com/download/win

Después, clonar el proyecto:

```powershell
New-Item -ItemType Directory -Force -Path C:\AgroFresh
cd C:\AgroFresh
git clone https://github.com/JSSAgrofresh/agrofresh_report_hub.git
```

> No se usa Docker Desktop a propósito: su licencia gratuita no cubre empresas
> del tamaño de AgroFresh. La instalación nativa evita ese problema y además
> tiene menos capas intermedias.

## Cómo se ejecuta un script

Si nunca corriste scripts de PowerShell, estos cuatro pasos son todo lo que hay
que saber.

**1. Abrir PowerShell como Administrador.** Botón de Windows → escribir
`powershell` → click derecho sobre "Windows PowerShell" → *Ejecutar como
administrador*. El título de la ventana tiene que decir `Administrador:`.

**2. Permitir la ejecución de scripts.** Windows bloquea los archivos `.ps1` por
defecto; sin esto, cualquier script falla con *"la ejecución de scripts está
deshabilitada en este sistema"*. Se hace **una sola vez** en el equipo:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Responder `S` cuando pregunta.

**3. Ir a la carpeta:**

```powershell
cd C:\AgroFresh\agrofresh_report_hub\deploy\windows
```

> Atajo: en el Explorador de Windows, click derecho sobre la carpeta →
> *Abrir en Terminal*, y ya queda parado ahí.

**4. Ejecutar:**

```powershell
.\0-revisar-que-tengo.ps1
```

El `.\` del principio es parte del comando: significa "en esta carpeta". Sin él,
PowerShell no encuentra el archivo. Escribiendo `.\0` y apretando **Tab** se
completa el nombre solo.

## Instalación

Los scripts se corren una sola vez, en orden, desde
`C:\AgroFresh\agrofresh_report_hub\deploy\windows` con **PowerShell como
Administrador**.

### 0. Ver qué hay hoy en el equipo

```powershell
.\0-revisar-que-tengo.ps1
```

Si ya se trabajó en local antes, es probable que exista un PostgreSQL con una
base del Report Hub de esa época. Este script no modifica nada: informa cuántos
datos tiene, si le faltan migraciones y recomienda si conviene seguir con ella o
traer la de Neon.

En general conviene traer la de Neon: tiene el esquema al día y los datos
cargados hoy. La base local se puede conservar renombrándola antes:

```powershell
psql -U postgres -c "ALTER DATABASE agrofresh RENAME TO agrofresh_viejo"
```

### 1. Traer los datos que ya están en Neon

```powershell
.\1-migrar-datos-desde-neon.ps1 -UrlNeon "postgresql://usuario:clave@host/db?sslmode=require"
```

La `UrlNeon` es la misma `DATABASE_URL` que hoy está configurada en Render.
Neon no se toca: el script solo lee. Al terminar informa cuántas solicitudes
quedaron migradas — ese número debe coincidir con el que muestra la app hoy.

### 2. Dejar el backend corriendo solo

```powershell
.\2-instalar-backend.ps1
```

Prepara Python, instala las dependencias y registra el arranque automático con
el equipo (sin que nadie tenga que iniciar sesión). Si el proceso se cae, se
reinicia solo al minuto.

La primera vez copia `env.produccion.ejemplo` a `backend\.env`. **Hay que
editarlo** con la contraseña real de PostgreSQL y las claves de R2 antes de
seguir. Después de editarlo:

```powershell
Stop-ScheduledTask  -TaskName "AgroFresh Report Hub - Backend"
Start-ScheduledTask -TaskName "AgroFresh Report Hub - Backend"
```

### 3. Publicarlo en internet

Requiere una cuenta de Cloudflare (gratis) con un dominio agregado.

```powershell
.\3-configurar-tunel.ps1 -Dominio "api.tudominio.com"
```

Se abre el navegador para autorizar la cuenta. Al terminar, el backend queda en
`https://api.tudominio.com` con certificado HTTPS válido.

**Después, en Vercel:** cambiar la variable de entorno que apunta a la API por
la nueva URL y volver a desplegar. Y en `backend\.env`, poner la URL de Vercel
en `CORS_ORIGINS`.

### 4. Programar los respaldos

```powershell
.\4-configurar-respaldos.ps1
```

Respaldo diario a las 22:00, 30 días de historial local y copia a R2 (90 días).
Este paso no es opcional: al dejar Neon, los respaldos pasan a ser
responsabilidad nuestra.

## Uso diario

```powershell
.\estado.ps1
```

Muestra en una pantalla si PostgreSQL, el backend, el túnel, las tareas y el
último respaldo están bien. Es lo primero que hay que correr si alguien avisa
que la app no funciona.

### Actualizar a una versión nueva

```powershell
cd C:\AgroFresh\agrofresh_report_hub
git pull
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Stop-ScheduledTask  -TaskName "AgroFresh Report Hub - Backend"
Start-ScheduledTask -TaskName "AgroFresh Report Hub - Backend"
```

### Respaldo manual antes de un cambio grande

```powershell
.\respaldar.ps1
```

### Restaurar un respaldo

```powershell
& "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" `
    --clean --if-exists --no-owner --no-acl `
    --username=postgres --dbname=agrofresh `
    C:\AgroFresh\respaldos\agrofresh-AAAAMMDD-HHMMSS.dump
```

## Configuración del equipo

Tres ajustes para que el servidor no se caiga solo:

1. **Que no se suspenda.** Configuración → Sistema → Inicio/apagado →
   *Suspender: Nunca*.
2. **Que Windows Update no lo reinicie en horario laboral.** Configuración →
   Windows Update → Opciones avanzadas → *Horas de actividad*.
3. **Que el disco no se llene.** `estado.ps1` muestra el espacio libre; los
   respaldos se limpian solos a los 30 días.

## Si algo falla

| Síntoma | Dónde mirar |
|---|---|
| La app no carga | `.\estado.ps1` |
| El backend no arranca | `C:\AgroFresh\logs\backend.log` |
| Los respaldos no corren | `C:\AgroFresh\logs\respaldos.log` |
| El túnel está caído | `Get-Service cloudflared` y `Restart-Service cloudflared` |
| Error de CORS en el navegador | `CORS_ORIGINS` en `backend\.env` debe tener la URL exacta de Vercel, sin barra final |

### Volver a Neon de urgencia

Si el equipo queda fuera de servicio y hay que operar ya, se puede volver a la
nube mientras se resuelve: poner `DATABASE_URL` de Neon en las variables de
Render y apuntar el frontend de vuelta a Render. Los datos que se hayan cargado
en el servidor local desde la migración no van a estar en Neon — para eso está
el respaldo diario en R2.

## Qué queda en la nube

- **Frontend en Vercel.** Gratis, con red global y sin mantenimiento.
- **R2.** Ahora guarda los respaldos de la base, fuera del equipo.
- **Resend.** Envío de correos.
- **Neon.** Se puede mantener como plan B, ya sin uso diario.
