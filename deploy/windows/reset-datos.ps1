# =============================================================================
# RESET DE DATOS TRANSACCIONALES
#
# Elimina solicitudes, resultados, productos aplicados y pendientes de revision.
# El catalogo (clientes, plantas, analitos, especies) NO se toca.
#
# SIEMPRE pide la clave de PostgreSQL, sin importar el entorno.
# =============================================================================

$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
if (-not (Test-Path $psql)) {
    $psql = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty FullName
}
if (-not $psql) { Write-Error "No se encontro psql.exe"; exit 1 }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Red
Write-Host "  RESET DE DATOS - Esta accion NO se puede deshacer" -ForegroundColor Red
Write-Host "============================================================" -ForegroundColor Red
Write-Host ""
Write-Host "Se eliminaran TODAS las filas de:"
Write-Host "  - solicitud"
Write-Host "  - resultado"
Write-Host "  - producto_aplicado"
Write-Host "  - pendiente_revision"
Write-Host ""
Write-Host "Se conserva el catalogo: clientes, plantas, analitos, especies."
Write-Host ""

$confirmar = Read-Host "Escribe CONFIRMAR para continuar"
if ($confirmar -ne "CONFIRMAR") {
    Write-Host "Cancelado." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
$clave = Read-Host "Clave de PostgreSQL (usuario postgres)" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave)
)

Write-Host ""
Write-Host "Verificando conexion..." -ForegroundColor Cyan
$test = & $psql -h 127.0.0.1 -U postgres -d agrofresh -tAq -c "SELECT 1" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudo conectar. Revisa la clave o que PostgreSQL este corriendo." -ForegroundColor Red
    Remove-Item Env:\PGPASSWORD
    exit 1
}

Write-Host "Ejecutando reset..." -ForegroundColor Cyan
& $psql -h 127.0.0.1 -U postgres -d agrofresh -v ON_ERROR_STOP=1 -c "
SET search_path = lab, public;
TRUNCATE TABLE resultado, producto_aplicado, solicitud, pendiente_revision
RESTART IDENTITY CASCADE;
"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Reset completado. Base de datos lista para nueva carga." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERROR durante el reset. Revisa el mensaje anterior." -ForegroundColor Red
}

Remove-Item Env:\PGPASSWORD
