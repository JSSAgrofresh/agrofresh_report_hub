# ejecutar-integridad-nocturna.ps1
# Corre el análisis de integridad de datos (solicitudes contra informes) y guarda un log con fecha.
param(
    [string]$RaizProyecto = ""
)

if (-not $RaizProyecto) {
    $RaizProyecto = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}

$carpetaBackend = Join-Path $RaizProyecto "backend"
$python         = Join-Path $carpetaBackend ".venv\Scripts\python.exe"
$script         = Join-Path $carpetaBackend "scripts\integridad_nocturna.py"
$carpetaLogs    = Join-Path $RaizProyecto "logs"

if (-not (Test-Path $carpetaLogs)) {
    New-Item -ItemType Directory -Path $carpetaLogs | Out-Null
}

$fecha   = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $carpetaLogs "integridad_$fecha.log"

Push-Location $carpetaBackend
try {
    & $python $script 2>&1 | Tee-Object -FilePath $logFile
} finally {
    Pop-Location
}
