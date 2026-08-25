# =============================================================================
# ESTADO DEL SERVIDOR
#
# Revision rapida de que todo este funcionando. Es el primer comando a correr
# cuando alguien reporta que "la pagina no anda".
#
#   .\estado.ps1
# =============================================================================

param(
    [int]$Puerto = 8000,
    [string]$BaseLocal = "agrofresh",
    [string]$UsuarioLocal = "postgres",
    [string]$CarpetaPg = ""
)

. (Join-Path $PSScriptRoot "_comun.ps1")
$CarpetaPg = Buscar-CarpetaPg $CarpetaPg

function Estado($etiqueta, $ok, $detalle = "") {
    $simbolo = if ($ok) { "OK  " } else { "FALLA" }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1,-28} {2}" -f $simbolo, $etiqueta, $detalle) -ForegroundColor $color
}

Write-Host "`n=== AgroFresh Report Hub - estado del servidor ===`n" -ForegroundColor Cyan

# 1. PostgreSQL
$svcPg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
Estado "PostgreSQL" ($svcPg -and $svcPg.Status -eq "Running") $(if ($svcPg) { $svcPg.Status } else { "no instalado" })

# 2. Datos
# Se lee del .env del backend, que es donde vive la contrasena: asi este
# diagnostico corre sin pedir nada por teclado (la tarea programada lo usa).
$psql = if ($CarpetaPg) { Join-Path $CarpetaPg "psql.exe" } else { $null }
if ($psql -and (Test-Path $psql)) {
    $envFile = Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) "backend\.env"
    if (Test-Path $envFile) {
        $linea = Select-String -Path $envFile -Pattern '^\s*DB_PASSWORD\s*=' -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($linea) { $env:PGPASSWORD = ($linea.Line -split '=', 2)[1].Trim() }
    }
    $n = Leer-Escalar $psql $UsuarioLocal $BaseLocal "SET search_path=lab,public; SELECT count(*) FROM solicitud"
    Limpiar-PasswordPg
    Estado "Base de datos" ($null -ne $n) $(if ($n) { "$n solicitudes" } else { "sin acceso" })
} else {
    Estado "Base de datos" $false "no se encontro psql"
}

# 3. Backend
try {
    $salud = Invoke-RestMethod -Uri "http://localhost:$Puerto/api/salud" -TimeoutSec 5
    Estado "Backend (local)" ($salud.estado -eq "ok") "puerto $Puerto"
} catch {
    Estado "Backend (local)" $false "no responde en el puerto $Puerto"
}

# 4. Tunel
$svcCf = Get-Service -Name "cloudflared" -ErrorAction SilentlyContinue
Estado "Tunel a internet" ($svcCf -and $svcCf.Status -eq "Running") $(if ($svcCf) { $svcCf.Status } else { "no instalado" })

# 5. Tareas programadas
foreach ($t in @("AgroFresh Report Hub - Backend", "AgroFresh Report Hub - Respaldo diario")) {
    $tarea = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    $etiqueta = ($t -split " - ")[1]
    Estado "Tarea: $etiqueta" ($tarea -and $tarea.State -ne "Disabled") $(if ($tarea) { $tarea.State } else { "no registrada" })
}

# 6. Ultimo respaldo
$ultimo = Get-ChildItem -Path "C:\AgroFresh\respaldos" -Filter "agrofresh-*.dump" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($ultimo) {
    $horas = [math]::Round(((Get-Date) - $ultimo.LastWriteTime).TotalHours, 1)
    $tamano = [math]::Round($ultimo.Length / 1MB, 1)
    # Mas de 48 h sin respaldo significa que la tarea diaria no esta corriendo.
    Estado "Ultimo respaldo" ($horas -lt 48) "hace $horas h ($tamano MB)"
} else {
    Estado "Ultimo respaldo" $false "no hay ninguno"
}

# 7. Recursos
$os = Get-CimInstance Win32_OperatingSystem
$ramLibre = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$disco = Get-PSDrive C
$discoLibre = [math]::Round($disco.Free / 1GB, 1)
$diasPrendido = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1)

Write-Host "`n  RAM libre:      $ramLibre GB de $ramTotal GB"
Write-Host "  Disco libre:    $discoLibre GB"
Write-Host "  Encendido hace: $diasPrendido dias"
Write-Host ""
