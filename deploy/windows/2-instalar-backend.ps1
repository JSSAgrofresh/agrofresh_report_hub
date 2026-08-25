# =============================================================================
# 2. INSTALAR EL BACKEND COMO SERVICIO DE WINDOWS
#
# Prepara el entorno de Python, instala las dependencias y deja el backend
# arrancando solo cada vez que el equipo se enciende (aunque nadie inicie
# sesion). Se ejecuta UNA SOLA VEZ.
#
# Requiere PowerShell como Administrador.
#
# Uso:
#   .\2-instalar-backend.ps1
# =============================================================================

param(
    [string]$RaizProyecto = "C:\AgroFresh\agrofresh_report_hub",
    [int]$Puerto = 8000,
    # 4 procesos en paralelo: aprovecha el CPU sin agotar el limite de
    # conexiones de PostgreSQL (cada proceso abre hasta 10).
    [int]$Workers = 4
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script necesita PowerShell abierto como Administrador."
}

$carpetaBackend = Join-Path $RaizProyecto "backend"
if (-not (Test-Path $carpetaBackend)) {
    throw "No se encontro $carpetaBackend. Clona el repositorio ahi primero, o ajusta -RaizProyecto."
}

Write-Host "`n[1/4] Creando el entorno de Python..." -ForegroundColor Cyan
$venv = Join-Path $carpetaBackend ".venv"
if (-not (Test-Path $venv)) {
    python -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Fallo la creacion del entorno. Esta Python 3.11 instalado y en el PATH?" }
}
$python = Join-Path $venv "Scripts\python.exe"

Write-Host "[2/4] Instalando dependencias..." -ForegroundColor Cyan
& $python -m pip install --upgrade pip --quiet
& $python -m pip install -r (Join-Path $carpetaBackend "requirements.txt") --quiet
if ($LASTEXITCODE -ne 0) { throw "Fallo la instalacion de dependencias." }

Write-Host "[3/4] Verificando la configuracion..." -ForegroundColor Cyan
$envFile = Join-Path $carpetaBackend ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "      No existe backend\.env - copiando la plantilla." -ForegroundColor Yellow
    Copy-Item (Join-Path $PSScriptRoot "env.produccion.ejemplo") $envFile
    Write-Host "      IMPORTANTE: edita $envFile con la contrasena real antes de seguir." -ForegroundColor Yellow
}

Write-Host "[4/4] Registrando el arranque automatico..." -ForegroundColor Cyan

# Se usa el Programador de tareas (nativo de Windows) en vez de un servicio
# clasico: no requiere instalar nada extra, arranca sin que nadie inicie
# sesion y se reintenta solo si el proceso se cae.
$nombreTarea = "AgroFresh Report Hub - Backend"
$scriptInicio = Join-Path $PSScriptRoot "iniciar-backend.ps1"

Unregister-ScheduledTask -TaskName $nombreTarea -Confirm:$false -ErrorAction SilentlyContinue

$accion = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptInicio`" -RaizProyecto `"$RaizProyecto`" -Puerto $Puerto -Workers $Workers"

$disparador = New-ScheduledTaskTrigger -AtStartup

$opciones = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

# SYSTEM: arranca con el equipo, sin depender de que un usuario inicie sesion.
$identidad = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $nombreTarea -Action $accion -Trigger $disparador `
    -Settings $opciones -Principal $identidad `
    -Description "API del Report Hub. Arranca con el equipo y se reinicia sola si se cae." | Out-Null

Write-Host "      Tarea registrada." -ForegroundColor Green

Write-Host "`nArrancando el backend ahora..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $nombreTarea
Start-Sleep -Seconds 8

try {
    $salud = Invoke-RestMethod -Uri "http://localhost:$Puerto/api/salud" -TimeoutSec 10
    Write-Host "`n  Backend respondiendo en http://localhost:$Puerto (estado: $($salud.estado))" -ForegroundColor Green
} catch {
    Write-Host "`n  El backend todavia no responde." -ForegroundColor Yellow
    Write-Host "  Revisa el log: C:\AgroFresh\logs\backend.log" -ForegroundColor Yellow
}

Write-Host "`nSiguiente paso: .\3-configurar-tunel.ps1`n"
