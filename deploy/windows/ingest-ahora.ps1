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
$logFile = Join-Path $carpetaLogs "accutab_manual_$fecha.log"

Write-Host "" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  AccuTab -- Ingesta manual" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Push-Location $carpetaBackend
try {
    & $python $script 2>&1 | Tee-Object -FilePath $logFile
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
if ($exitCode -eq 0) {
    Write-Host "  Ingesta completada sin errores." -ForegroundColor Green
} elseif ($exitCode -eq 2) {
    Write-Host "  Ingesta con algunos errores." -ForegroundColor Yellow
    Write-Host "  Log: $logFile" -ForegroundColor Gray
} else {
    Write-Host "  Ingesta fallida." -ForegroundColor Red
    Write-Host "  Log: $logFile" -ForegroundColor Gray
}
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
