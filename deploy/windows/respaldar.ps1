# =============================================================================
# RESPALDO DE LA BASE
#
# Lo llama la tarea diaria que crea 4-configurar-respaldos.ps1. Tambien sirve
# para hacer un respaldo manual antes de un cambio grande:
#   .\respaldar.ps1
# =============================================================================

param(
    [string]$BaseLocal = "agrofresh",
    [string]$UsuarioLocal = "postgres",
    [string]$CarpetaPg = "",
    [string]$CarpetaDestino = "C:\AgroFresh\respaldos",
    [int]$DiasQueSeGuardan = 30
)

$ErrorActionPreference = "Stop"

$carpetaLogs = "C:\AgroFresh\logs"
New-Item -ItemType Directory -Force -Path $carpetaLogs, $CarpetaDestino | Out-Null
$log = Join-Path $carpetaLogs "respaldos.log"

function Escribir($mensaje, $color = "White") {
    $linea = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $mensaje"
    $linea | Out-File -Append -FilePath $log -Encoding utf8
    Write-Host $mensaje -ForegroundColor $color
}

. (Join-Path $PSScriptRoot "_comun.ps1")

# Este script corre de madrugada sin nadie delante, asi que la contrasena sale
# del .env del backend -la misma que usa la aplicacion- y no del teclado.
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) "backend\.env"
if (Test-Path $envFile) {
    $linea = Select-String -Path $envFile -Pattern '^\s*DB_PASSWORD\s*=' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($linea) { $env:PGPASSWORD = ($linea.Line -split '=', 2)[1].Trim() }
}

try {
    $CarpetaPg = Buscar-CarpetaPg $CarpetaPg
    if (-not $CarpetaPg) { throw "No se encontro PostgreSQL en este equipo." }

    $pgDump = Join-Path $CarpetaPg "pg_dump.exe"
    if (-not (Test-Path $pgDump)) { throw "No se encontro pg_dump en $CarpetaPg" }

    $archivo = Join-Path $CarpetaDestino "agrofresh-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"

    Escribir "Respaldando la base '$BaseLocal'..."
    & $pgDump --format=custom --no-owner --no-acl `
        --username=$UsuarioLocal --dbname=$BaseLocal --file=$archivo
    if ($LASTEXITCODE -ne 0) { throw "pg_dump devolvio el codigo $LASTEXITCODE" }

    $tamano = [math]::Round((Get-Item $archivo).Length / 1MB, 1)
    Escribir "Respaldo listo: $(Split-Path $archivo -Leaf) ($tamano MB)" "Green"

    # Copia fuera del equipo: si R2 esta configurado en el .env del backend, se
    # sube ahi. Sin esto, un disco roto se lleva la base y todos los respaldos.
    $envFile = Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) "backend\.env"
    if (Test-Path $envFile) {
        $subidor = Join-Path $PSScriptRoot "subir-respaldo-a-r2.py"
        $python = Join-Path (Split-Path $envFile -Parent) ".venv\Scripts\python.exe"
        if ((Test-Path $subidor) -and (Test-Path $python)) {
            Escribir "Subiendo copia a Cloudflare R2..."
            & $python $subidor $archivo
            if ($LASTEXITCODE -eq 0) { Escribir "Copia en la nube lista." "Green" }
            else { Escribir "No se pudo subir a R2 (el respaldo local si quedo guardado)." "Yellow" }
        }
    }

    # Limpieza: se borran los respaldos mas viejos que la ventana configurada.
    $limite = (Get-Date).AddDays(-$DiasQueSeGuardan)
    $viejos = Get-ChildItem -Path $CarpetaDestino -Filter "agrofresh-*.dump" |
        Where-Object { $_.LastWriteTime -lt $limite }
    if ($viejos) {
        $viejos | Remove-Item -Force
        Escribir "Borrados $($viejos.Count) respaldos con mas de $DiasQueSeGuardan dias."
    }

    $total = (Get-ChildItem -Path $CarpetaDestino -Filter "agrofresh-*.dump").Count
    Escribir "Respaldos guardados en total: $total" "Green"

} catch {
    Escribir "ERROR: $_" "Red"
    Limpiar-PasswordPg
    exit 1
} finally {
    Limpiar-PasswordPg
}
