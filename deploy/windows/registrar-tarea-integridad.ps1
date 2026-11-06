# Registra la tarea programada que corre el análisis de integridad de datos cada noche (02:30).
# Requiere PowerShell como Administrador. Se ejecuta UNA vez.
param(
    [string]$RaizProyecto = "",
    [string]$Hora = "02:30"
)

if (-not $RaizProyecto) {
    $RaizProyecto = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}

$scriptPath = Join-Path $RaizProyecto "deploy\windows\ejecutar-integridad-nocturna.ps1"
$taskName   = "AgroFresh - Integridad de datos (noche)"

$action   = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger  = New-ScheduledTaskTrigger -Daily -At $Hora
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3)

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Tarea anterior eliminada." -ForegroundColor Yellow
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Compara las solicitudes con los informes de los laboratorios y guarda el resultado" -RunLevel Highest
Write-Host "Tarea registrada: $taskName (todos los dias a las $Hora)." -ForegroundColor Green
