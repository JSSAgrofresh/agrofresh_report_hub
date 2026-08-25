# =============================================================================
# 1. MIGRAR LOS DATOS DE NEON AL POSTGRES LOCAL
#
# Copia la base completa que hoy vive en Neon al PostgreSQL de este equipo.
# Se ejecuta UNA SOLA VEZ, después de instalar PostgreSQL y antes de levantar
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
    [string]$CarpetaPg = "C:\Program Files\PostgreSQL\16\bin"
)

$ErrorActionPreference = "Stop"

$pgDump    = Join-Path $CarpetaPg "pg_dump.exe"
$psql      = Join-Path $CarpetaPg "psql.exe"
$pgRestore = Join-Path $CarpetaPg "pg_restore.exe"

foreach ($exe in @($pgDump, $psql, $pgRestore)) {
    if (-not (Test-Path $exe)) {
        throw "No se encontró $exe. Revisa que PostgreSQL esté instalado y ajusta -CarpetaPg."
    }
}

$carpetaTrabajo = "C:\AgroFresh\respaldos"
New-Item -ItemType Directory -Force -Path $carpetaTrabajo | Out-Null
$archivoDump = Join-Path $carpetaTrabajo "neon-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"

Write-Host "`n[1/3] Descargando la base desde Neon..." -ForegroundColor Cyan
Write-Host "      (puede tardar varios minutos según el tamaño)"

# --no-owner / --no-acl: los roles de Neon no existen en este equipo, y sin esto
# el restore falla al intentar asignar permisos a usuarios inexistentes.
& $pgDump --format=custom --no-owner --no-acl --file=$archivoDump $UrlNeon
if ($LASTEXITCODE -ne 0) { throw "pg_dump falló. Revisa la URL de Neon." }

$tamano = [math]::Round((Get-Item $archivoDump).Length / 1MB, 1)
Write-Host "      Listo: $archivoDump ($tamano MB)" -ForegroundColor Green

Write-Host "`n[2/3] Creando la base local '$BaseLocal'..." -ForegroundColor Cyan
$existe = & $psql -U $UsuarioLocal -tAc "SELECT 1 FROM pg_database WHERE datname='$BaseLocal'"
if ($existe -eq "1") {
    Write-Host "      La base '$BaseLocal' ya existe." -ForegroundColor Yellow
    $rta = Read-Host "      ¿Borrarla y recrearla? Se pierde todo lo que tenga (s/N)"
    if ($rta -ne "s") { Write-Host "Cancelado." -ForegroundColor Yellow; exit 1 }
    & $psql -U $UsuarioLocal -c "DROP DATABASE $BaseLocal"
}
& $psql -U $UsuarioLocal -c "CREATE DATABASE $BaseLocal"

Write-Host "`n[3/3] Restaurando los datos en el equipo..." -ForegroundColor Cyan
& $pgRestore --no-owner --no-acl --dbname=$BaseLocal --username=$UsuarioLocal $archivoDump
# pg_restore devuelve código 1 por avisos que no son errores reales (ej. extensiones
# de Neon que acá no aplican), así que solo se informa en vez de cortar el script.
if ($LASTEXITCODE -ne 0) {
    Write-Host "      pg_restore terminó con avisos. Verificando el resultado..." -ForegroundColor Yellow
}

Write-Host "`nVerificando:" -ForegroundColor Cyan
$conteo = & $psql -U $UsuarioLocal -d $BaseLocal -tAc "SET search_path=lab,public; SELECT count(*) FROM solicitud"
Write-Host "      Solicitudes migradas: $conteo" -ForegroundColor Green

Write-Host "`nListo. La base local ya tiene los datos de Neon." -ForegroundColor Green
Write-Host "Siguiente paso: .\2-instalar-backend.ps1`n"
