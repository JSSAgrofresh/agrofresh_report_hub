# =============================================================================
# 1. MIGRAR LOS DATOS DE NEON AL POSTGRES LOCAL
#
# Copia la base completa que hoy vive en Neon al PostgreSQL de este equipo.
# Se ejecuta UNA SOLA VEZ, despues de instalar PostgreSQL y antes de levantar
# el backend. Neon queda intacto: esto solo lee.
#
# Uso:
#   .\1-migrar-datos-desde-neon.ps1 -UrlNeon "postgresql://usuario:clave@host/db?sslmode=require"
# =============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$UrlNeon,

    [string]$BaseLocal = "agrofresh",
    [string]$UsuarioLocal = "postgres",
    [string]$CarpetaPg = ""
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "_comun.ps1")

$CarpetaPg = Buscar-CarpetaPg $CarpetaPg
if (-not $CarpetaPg) {
    throw "No se encontro PostgreSQL. Revisa que este instalado, o pasa la ruta con -CarpetaPg."
}
Write-Host "Usando PostgreSQL de: $CarpetaPg" -ForegroundColor DarkGray

$pgDump    = Join-Path $CarpetaPg "pg_dump.exe"
$psql      = Join-Path $CarpetaPg "psql.exe"
$pgRestore = Join-Path $CarpetaPg "pg_restore.exe"

foreach ($exe in @($pgDump, $psql, $pgRestore)) {
    if (-not (Test-Path $exe)) {
        throw "No se encontro $exe. Revisa la instalacion de PostgreSQL."
    }
}

# La contrasena local se pide una vez y viaja en PGPASSWORD, que psql y
# pg_restore leen solos. La de Neon va dentro de la propia UrlNeon.
Pedir-PasswordPg $UsuarioLocal

$carpetaTrabajo = "C:\AgroFresh\respaldos"
New-Item -ItemType Directory -Force -Path $carpetaTrabajo | Out-Null
$archivoDump = Join-Path $carpetaTrabajo "neon-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"

Write-Host "`n[1/3] Descargando la base desde Neon..." -ForegroundColor Cyan
Write-Host "      (puede tardar varios minutos segun el tamano)"

# Neon expone dos puntos de conexion: el pooler (PgBouncer) y el directo. El
# pooler no soporta las sentencias que pg_dump necesita para leer el esquema y
# puede devolver un dump incompleto sin avisar, asi que se usa el directo.
if ($UrlNeon -match '-pooler\.') {
    $UrlNeon = $UrlNeon -replace '-pooler\.', '.'
    Write-Host "      Se detecto el pooler en la URL: se usa la conexion directa." -ForegroundColor Yellow
}

# --no-owner / --no-acl: los roles de Neon no existen en este equipo, y sin esto
# el restore falla al intentar asignar permisos a usuarios inexistentes.
& $pgDump --format=custom --no-owner --no-acl --file=$archivoDump $UrlNeon
if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo. Revisa la URL de Neon." }

$tamano = [math]::Round((Get-Item $archivoDump).Length / 1MB, 1)
Write-Host "      Listo: $archivoDump ($tamano MB)" -ForegroundColor Green

# Un dump puede venir con la estructura completa y ninguna fila, y pg_dump no
# devuelve error en ese caso. No alcanza con contar las lineas que salen: la
# mayoria son cabeceras SQL. Las filas de verdad son las que van entre el
# "COPY ... FROM stdin;" y el "\." que lo cierra.
function Contar-FilasEnDump($dump, $tabla) {
    $salida = & $pgRestore --data-only --table=$tabla -f - $dump 2>$null
    $n = 0
    $dentroDelCopy = $false
    foreach ($linea in @($salida)) {
        if (-not $dentroDelCopy) {
            if ($linea -match '^COPY .+ FROM stdin;') { $dentroDelCopy = $true }
            continue
        }
        if ($linea -match '^\\\.') { $dentroDelCopy = $false; continue }
        $n++
    }
    return $n
}

# Se miran varias tablas, no solo solicitud: es normal que este vacia mientras
# las filas esperan aprobacion en pendiente_revision, y exigirle datos
# rechazaria una migracion perfectamente buena.
$totalFilas = 0
foreach ($t in @("solicitud", "resultado", "pendiente_revision", "cliente")) {
    $n = Contar-FilasEnDump $archivoDump $t
    Write-Host ("      " + $t.PadRight(20) + ("{0:N0}" -f $n).PadLeft(10) + " filas en el dump")
    $totalFilas += $n
}
if ($totalFilas -eq 0) {
    throw ("El dump trae la estructura pero ninguna fila. Revisa que la URL apunte a la base " +
           "correcta y que el usuario tenga permisos de lectura sobre el esquema lab.")
}

Write-Host "`n[2/3] Creando la base local '$BaseLocal'..." -ForegroundColor Cyan
$existe = Leer-Escalar $psql $UsuarioLocal "postgres" "SELECT 1 FROM pg_database WHERE datname='$BaseLocal'"
if ($existe -eq "1") {
    $cuantas = Leer-Escalar $psql $UsuarioLocal $BaseLocal "SET search_path=lab,public; SELECT count(*) FROM solicitud"
    if ($cuantas) {
        Write-Host "      La base '$BaseLocal' ya existe y tiene $cuantas solicitudes." -ForegroundColor Yellow
    } else {
        Write-Host "      La base '$BaseLocal' ya existe (sin datos del Report Hub)." -ForegroundColor Yellow
    }
    $rta = Read-Host "      Borrarla y recrearla? Se pierde todo lo que tenga (s/N)"
    if ($rta -ne "s") { Write-Host "Cancelado." -ForegroundColor Yellow; exit 1 }
    & $psql -h 127.0.0.1 -U $UsuarioLocal -d postgres -c "DROP DATABASE $BaseLocal"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo borrar la base. Cerra pgAdmin u otras conexiones abiertas y proba de nuevo." }
}
& $psql -h 127.0.0.1 -U $UsuarioLocal -d postgres -c "CREATE DATABASE $BaseLocal"
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la base '$BaseLocal'." }

Write-Host "`n[3/3] Restaurando los datos en el equipo..." -ForegroundColor Cyan
& $pgRestore -h 127.0.0.1 --no-owner --no-acl --dbname=$BaseLocal --username=$UsuarioLocal $archivoDump
# pg_restore devuelve codigo 1 por avisos que no son errores reales (ej. extensiones
# de Neon que aca no aplican), asi que solo se informa en vez de cortar el script.
if ($LASTEXITCODE -ne 0) {
    Write-Host "      pg_restore termino con avisos. Verificando el resultado..." -ForegroundColor Yellow
}

Write-Host "`nVerificando lo que quedo en el equipo:" -ForegroundColor Cyan

$restaurado = 0
$pendientes = 0
foreach ($t in @("solicitud", "resultado", "producto_aplicado", "cliente", "analito", "pendiente_revision")) {
    $n = Leer-Escalar $psql $UsuarioLocal $BaseLocal "SET search_path=lab,public; SELECT count(*) FROM $t"
    if ($null -eq $n) {
        Write-Host ("      " + $t.PadRight(20) + "     tabla ausente") -ForegroundColor Red
        continue
    }
    Write-Host ("      " + $t.PadRight(20) + ("{0:N0}" -f [int]$n).PadLeft(10) + " filas") -ForegroundColor Green
    $restaurado += [int]$n
    if ($t -eq "pendiente_revision") { $pendientes = [int]$n }
}

if ($restaurado -eq 0) {
    Limpiar-PasswordPg
    throw "Las tablas quedaron vacias: se restauro la estructura pero no los datos. Revisa los avisos de arriba."
}

Limpiar-PasswordPg

Write-Host "`nListo. La base local ya es un espejo de Neon." -ForegroundColor Green
Write-Host "Comprobalo contra la app en produccion: los numeros deben coincidir.`n" -ForegroundColor White

if ($pendientes -gt 0) {
    Write-Host "Nota: hay $pendientes filas esperando en pendiente_revision." -ForegroundColor Yellow
    Write-Host "Es lo que quedo sin aprobar en la nube, donde el proceso se quedaba sin memoria."
    Write-Host "Desde este equipo se puede aprobar sin ese limite, una vez levantado el backend.`n"
}

Write-Host "Siguiente paso: .\2-instalar-backend.ps1`n"
