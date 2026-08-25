# =============================================================================
# 4. RESPALDOS AUTOMATICOS DIARIOS
#
# Al dejar Neon, los respaldos pasan a ser responsabilidad nuestra. Este script
# programa un respaldo diario de la base completa y, si R2 esta configurado,
# sube una copia a la nube - para que un problema con este equipo (disco,
# robo, incendio) no se lleve los datos.
#
# Requiere PowerShell como Administrador. Se ejecuta UNA SOLA VEZ.
#
# Uso:
#   .\4-configurar-respaldos.ps1
# =============================================================================

param(
    [string]$Hora = "22:00",
    [int]$DiasQueSeGuardan = 30
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script necesita PowerShell abierto como Administrador."
}

$nombreTarea = "AgroFresh Report Hub - Respaldo diario"
$scriptRespaldo = Join-Path $PSScriptRoot "respaldar.ps1"

Unregister-ScheduledTask -TaskName $nombreTarea -Confirm:$false -ErrorAction SilentlyContinue

$accion = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptRespaldo`" -DiasQueSeGuardan $DiasQueSeGuardan"

$disparador = New-ScheduledTaskTrigger -Daily -At $Hora

# StartWhenAvailable: si el equipo estaba apagado a esa hora, el respaldo se
# hace apenas vuelve a encenderse, en vez de saltarse el dia.
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$identidad = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $nombreTarea -Action $accion -Trigger $disparador `
    -Settings $opciones -Principal $identidad `
    -Description "Respaldo diario de la base del Report Hub." | Out-Null

Write-Host "`nRespaldo programado todos los dias a las $Hora." -ForegroundColor Green
Write-Host "Se guardan los ultimos $DiasQueSeGuardan dias en C:\AgroFresh\respaldos`n"

Write-Host "Probando el respaldo ahora..." -ForegroundColor Cyan
& $scriptRespaldo -DiasQueSeGuardan $DiasQueSeGuardan
