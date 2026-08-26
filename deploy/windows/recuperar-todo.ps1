param(
    [string]$RaizProyecto = "",
    [string]$ClavePostgres = "",
    [string]$DbUser = "postgres",
    [string]$DbName = "agrofresh",
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$PsqlExe = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
)

if (-not $RaizProyecto) {
    $RaizProyecto = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}
$carpetaBackend    = Join-Path $RaizProyecto "backend"
$carpetaMigrations = Join-Path $carpetaBackend "migrations"
$python            = Join-Path $carpetaBackend ".venv\Scripts\python.exe"
$seedScript        = Join-Path $carpetaBackend "scripts\importar_listados_excel.py"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  AgroFresh -- Recuperacion completa de BD" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Raiz proyecto : $RaizProyecto"
Write-Host "Backend       : $carpetaBackend"
Write-Host "Migraciones   : $carpetaMigrations"
Write-Host ""

if (-not $ClavePostgres) {
    $secure = Read-Host "Clave PostgreSQL (Enter = sin clave)" -AsSecureString
    $bstr   = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $ClavePostgres = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}
$env:PGPASSWORD = $ClavePostgres

Write-Host "Verificando conexion a PostgreSQL..." -NoNewline
$test = & $PsqlExe -U $DbUser -h $DbHost -p $DbPort -d $DbName -c "SELECT 1" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host " FALLO" -ForegroundColor Red
    Write-Host $test
    exit 1
}
Write-Host " OK" -ForegroundColor Green

Write-Host ""
Write-Host "Aplicando migraciones..." -ForegroundColor Yellow
$archivos = Get-ChildItem "$carpetaMigrations\*.sql" | Sort-Object Name
$errores  = 0

foreach ($archivo in $archivos) {
    Write-Host "  $($archivo.Name)..." -NoNewline
    $salida = & $PsqlExe -U $DbUser -h $DbHost -p $DbPort -d $DbName -v ON_ERROR_STOP=0 -f $archivo.FullName 2>&1
    $lineasError = $salida | Where-Object { $_ -match "ERROR" -and $_ -notmatch "ya existe|already exists|does not exist" }
    if ($lineasError) {
        Write-Host " ADVERTENCIA" -ForegroundColor Yellow
        $lineasError | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
        $errores++
    } else {
        Write-Host " OK" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Asegurando tablas criticas..." -NoNewline
$sqlSchema = Join-Path $carpetaBackend "scripts\recuperar_schema.sql"
& $PsqlExe -U $DbUser -h $DbHost -p $DbPort -d $DbName -f $sqlSchema 2>&1 | Out-Null
Write-Host " OK" -ForegroundColor Green

Write-Host ""
Write-Host "Sembrando catalogo de listados..." -NoNewline
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
    Write-Host " OMITIDO" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "Verificacion final de tablas..." -ForegroundColor Yellow
$tablas = @("lab.solicitud","lab.resultado","lab.producto_aplicado","lab.analito","lab.valor_lista","lab.pendiente_revision","lab.informe_config","lab.cliente","lab.planta")
$todoBien = $true
foreach ($tabla in $tablas) {
    $count = & $PsqlExe -U $DbUser -h $DbHost -p $DbPort -d $DbName -t -c "SELECT COUNT(*) FROM $tabla" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  $tabla : ERROR" -ForegroundColor Red
        $todoBien = $false
    } else {
        $n = ($count -join "").Trim()
        if ([int]$n -gt 0) {
            Write-Host "  $tabla : $n filas" -ForegroundColor Green
        } else {
            Write-Host "  $tabla : $n filas" -ForegroundColor DarkYellow
        }
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
if ($todoBien) {
    Write-Host "  Recuperacion completada." -ForegroundColor Green
    Write-Host "  Reinicia el backend:" -ForegroundColor White
    Write-Host "    Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force" -ForegroundColor Gray
    Write-Host "    cd backend" -ForegroundColor Gray
    Write-Host "    .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" -ForegroundColor Gray
} else {
    Write-Host "  Recuperacion con errores -- revisa los mensajes arriba." -ForegroundColor Red
}
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
