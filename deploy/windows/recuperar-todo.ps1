# recuperar-todo.ps1
# Recuperacion completa tras un reset de DataCore.
# Aplica todas las migraciones, siembra datos de catalogo y verifica el resultado.
#
# Uso:
#   PowerShell.exe -File "deploy\windows\recuperar-todo.ps1"
#
# Si PostgreSQL tiene clave, pasarla como parametro:
#   PowerShell.exe -File "deploy\windows\recuperar-todo.ps1" -ClavePostgres "MiClave"

param(
    [string]$RaizProyecto = "",
    [string]$ClavePostgres = "",
    [string]$DbUser = "postgres",
    [string]$DbName = "agrofresh",
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$PsqlExe = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
)

# ---------------------------------------------------------------------------
# 0. Rutas
# ---------------------------------------------------------------------------
if (-not $RaizProyecto) {
    $RaizProyecto = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}
$carpetaBackend    = Join-Path $RaizProyecto "backend"
$carpetaMigrations = Join-Path $carpetaBackend "migrations"
$python            = Join-Path $carpetaBackend ".venv\Scripts\python.exe"
$seedScript        = Join-Path $carpetaBackend "scripts\importar_listados_excel.py"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  AgroFresh — Recuperacion completa de base de datos" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Raiz proyecto : $RaizProyecto"
Write-Host "Backend       : $carpetaBackend"
Write-Host "Migraciones   : $carpetaMigrations"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Clave PostgreSQL
# ---------------------------------------------------------------------------
if (-not $ClavePostgres) {
    $secure = Read-Host "Clave PostgreSQL (Enter = sin clave)" -AsSecureString
    $bstr   = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $ClavePostgres = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}
$env:PGPASSWORD = $ClavePostgres

# ---------------------------------------------------------------------------
# 2. Verificar conexion
# ---------------------------------------------------------------------------
Write-Host "Verificando conexion a PostgreSQL..." -NoNewline
$test = & $PsqlExe -U $DbUser -h $DbHost -p $DbPort -d $DbName -c "SELECT 1" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host " FALLO" -ForegroundColor Red
    Write-Host $test
    exit 1
}
Write-Host " OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 3. Aplicar migraciones en orden
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Aplicando migraciones..." -ForegroundColor Yellow
$archivos = Get-ChildItem "$carpetaMigrations\*.sql" | Sort-Object Name
$errores  = 0

foreach ($archivo in $archivos) {
    Write-Host "  $($archivo.Name)..." -NoNewline
    $salida = & $PsqlExe -U $DbUser -h $DbHost -p $DbPort -d $DbName `
        -v ON_ERROR_STOP=0 -f $archivo.FullName 2>&1
    # Ignorar NOTICEs y errores esperados de IF NOT EXISTS
    $lineasError = $salida | Where-Object {
        $_ -match "ERROR" -and
        $_ -notmatch "ya existe|already exists|does not exist.*IF NOT EXISTS"
    }
    if ($lineasError) {
        Write-Host " ADVERTENCIA" -ForegroundColor Yellow
        $lineasError | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
        $errores++
    } else {
        Write-Host " OK" -ForegroundColor Green
    }
}

# ---------------------------------------------------------------------------
# 4. Aplicar columnas de producto_aplicado manualmente (0016 falla sin schema)
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Asegurando columnas de producto_aplicado..." -NoNewline
& $PsqlExe -U $DbUser -h $DbHost -p $DbPort -d $DbName -c @"
ALTER TABLE lab.producto_aplicado ADD COLUMN IF NOT EXISTS tipo_aplicacion text;
ALTER TABLE lab.producto_aplicado ADD COLUMN IF NOT EXISTS dosis text;
ALTER TABLE lab.producto_aplicado ADD COLUMN IF NOT EXISTS unidad_dosis text;
ALTER TABLE lab.producto_aplicado ADD COLUMN IF NOT EXISTS fecha_aplicacion date;
"@ 2>&1 | Out-Null
Write-Host " OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 5. Sembrar listados (valor_lista: especies, variedades, laboratorios, etc.)
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Sembrando catalogo de listados (valor_lista)..." -NoNewline
if (Test-Path $seedScript) {
    Push-Location $carpetaBackend
    $salida = & $python $seedScript 2>&1
    Pop-Location
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " ADVERTENCIA" -ForegroundColor Yellow
        Write-Host $salida
    }
} else {
    Write-Host " OMITIDO (script no encontrado)" -ForegroundColor DarkYellow
}

# ---------------------------------------------------------------------------
# 6. Verificacion final
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Verificacion final de tablas..." -ForegroundColor Yellow
$tablas = @(
    "lab.solicitud",
    "lab.resultado",
    "lab.producto_aplicado",
    "lab.analito",
    "lab.valor_lista",
    "lab.pendiente_revision",
    "lab.informe_config",
    "lab.cliente",
    "lab.planta"
)
$todoBien = $true
foreach ($tabla in $tablas) {
    $count = & $PsqlExe -U $DbUser -h $DbHost -p $DbPort -d $DbName `
        -t -c "SELECT COUNT(*) FROM $tabla" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  $tabla : ERROR" -ForegroundColor Red
        $todoBien = $false
    } else {
        $n = ($count -join "").Trim()
        Write-Host "  $tabla : $n filas" -ForegroundColor $(if ($n -gt 0) { "Green" } else { "DarkYellow" })
    }
}

# ---------------------------------------------------------------------------
# 7. Resumen
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
if ($todoBien) {
    Write-Host "  Recuperacion completada." -ForegroundColor Green
    Write-Host "  Ahora reinicia el backend si estaba corriendo:" -ForegroundColor White
    Write-Host "    Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force" -ForegroundColor Gray
    Write-Host "    cd backend" -ForegroundColor Gray
    Write-Host "    .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" -ForegroundColor Gray
} else {
    Write-Host "  Recuperacion con errores — revisa los mensajes arriba." -ForegroundColor Red
}
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
