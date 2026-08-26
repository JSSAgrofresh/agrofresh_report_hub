param(
    [string]$RaizProyecto = ""
)

if (-not $RaizProyecto) {
    $RaizProyecto = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}

$scriptPath = Join-Path $RaizProyecto "deploy\windows\ejecutar-accutab-ingest.ps1"
$taskName   = "AgroFresh - AccuTab Ingest"

Write-Host ""
Write-Host "Registrando tarea programada: $taskName" -ForegroundColor Cyan
Write-Host "Script: $scriptPath"
Write-Host "Frecuencia: cada 1 hora"
Write-Host ""

$action  = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 9999)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$existente = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existente) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Tarea anterior eliminada." -ForegroundColor Yellow
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Ingesta automatica de correos AccuTab cada hora" -RunLevel Highest
Write-Host ""
Write-Host "Tarea registrada exitosamente." -ForegroundColor Green
Write-Host "Puedes verificarla en: Inicio > Programador de tareas > $taskName" -ForegroundColor White
Write-Host ""
