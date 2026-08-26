# ejecutar-accutab-ingest.ps1
# Corre el worker de ingesta AccuTab y guarda log con fecha.
# Programar en Task Scheduler con: PowerShell.exe -File "ruta\ejecutar-accutab-ingest.ps1"

param(
    [string]$RaizProyecto = ""
)

if (-not $RaizProyecto) {
    $RaizProyecto = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}

$carpetaBackend = Join-Path $RaizProyecto "backend"
$python         = Join-Path $carpetaBackend ".venv\Scripts\python.exe"
$script         = Join-Path $carpetaBackend "scripts\accutab_mail_ingest.py"
$carpetaLogs    = Join-Path $RaizProyecto "logs"

if (-not (Test-Path $carpetaLogs)) {
    New-Item -ItemType Directory -Path $carpetaLogs | Out-Null
}

$fecha   = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $carpetaLogs "accutab_ingest_$fecha.log"

Write-Host "Iniciando ingesta AccuTab — $(Get-Date)"
Write-Host "Log: $logFile"

Push-Location $carpetaBackend
try {
    & $python $script 2>&1 | Tee-Object -FilePath $logFile
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($exitCode -eq 0) {
    Write-Host "Ingesta completada sin errores."
} elseif ($exitCode -eq 2) {
    Write-Host "Ingesta completada con algunos errores. Revisa: $logFile"
} else {
    Write-Host "Ingesta fallida (codigo $exitCode). Revisa: $logFile"
}

exit $exitCode
