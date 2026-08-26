# =============================================================================
# ARRANQUE DEL BACKEND
#
# Lo llama la tarea programada que crea 2-instalar-backend.ps1. No se ejecuta
# a mano salvo para probar (ver el log en C:\AgroFresh\logs\backend.log).
# =============================================================================

param(
    [string]$RaizProyecto = "",
    [int]$Puerto = 8000,
    [int]$Workers = 4
)

# Si no se pasa RaizProyecto, se auto-detecta como dos niveles arriba de este script
# (deploy\windows\ -> deploy\ -> raiz del proyecto)
if (-not $RaizProyecto) {
    $RaizProyecto = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}

$carpetaBackend = Join-Path $RaizProyecto "backend"
$python = Join-Path $carpetaBackend ".venv\Scripts\python.exe"

$carpetaLogs = Join-Path $RaizProyecto "logs"
New-Item -ItemType Directory -Force -Path $carpetaLogs | Out-Null
$log = Join-Path $carpetaLogs "backend.log"

# El log se rota al pasar los 50 MB para que no crezca sin control.
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 50MB)) {
    Move-Item $log (Join-Path $carpetaLogs "backend-$(Get-Date -Format 'yyyyMMdd-HHmmss').log") -Force
}

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] RaizProyecto=$RaizProyecto" |
    Out-File -Append -FilePath $log -Encoding utf8

Set-Location $carpetaBackend

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Arrancando backend en el puerto $Puerto ($Workers procesos)" |
    Out-File -Append -FilePath $log -Encoding utf8

# Solo escucha en localhost: al exterior se sale por el tunel de Cloudflare,
# asi que no hace falta -ni conviene- exponer el puerto en la red de la oficina.
& $python -m uvicorn app.main:app `
    --host 127.0.0.1 `
    --port $Puerto `
    --workers $Workers `
    --log-level info `
    *>> $log
