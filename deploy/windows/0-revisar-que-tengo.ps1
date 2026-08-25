# =============================================================================
# 0. ¿QUÉ HAY HOY EN ESTE EQUIPO?
#
# Antes de migrar nada: revisa si ya existe un PostgreSQL con datos del Report
# Hub de cuando se trabajaba en local, cuánto tiene y si le faltan migraciones.
# Con eso decide si conviene seguir desde esa base o traer la de Neon.
#
# No modifica nada: solo lee e informa.
#
# Uso:
#   .\0-revisar-que-tengo.ps1
# =============================================================================

param(
    [string]$UsuarioLocal = "postgres",
    [string]$CarpetaPg = "C:\Program Files\PostgreSQL\16\bin"
)

Write-Host "`n=== Qué hay hoy en este equipo ===`n" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------
$svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $svc) {
    Write-Host "PostgreSQL no está instalado en este equipo." -ForegroundColor Yellow
    Write-Host "Instalalo desde https://www.postgresql.org/download/windows/ y volvé a correr esto.`n"
    exit 0
}
Write-Host "PostgreSQL: $($svc.Name) — $($svc.Status)" -ForegroundColor Green

$psql = Join-Path $CarpetaPg "psql.exe"
if (-not (Test-Path $psql)) {
    # La versión instalada puede no ser la 16: se busca la carpeta real.
    $encontrado = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($encontrado) {
        $CarpetaPg = Join-Path $encontrado.FullName "bin"
        $psql = Join-Path $CarpetaPg "psql.exe"
        Write-Host "         (usando $CarpetaPg)" -ForegroundColor DarkGray
    }
}
if (-not (Test-Path $psql)) {
    Write-Host "`nNo se encontró psql.exe. Pasá la ruta con -CarpetaPg.`n" -ForegroundColor Red
    exit 1
}

Write-Host "`nSe va a pedir la contraseña del usuario '$UsuarioLocal'.`n" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Bases existentes
# ---------------------------------------------------------------------------
$bases = & $psql -U $UsuarioLocal -tAc "SELECT datname FROM pg_database WHERE datistemplate = false" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "No se pudo conectar. Revisá la contraseña.`n" -ForegroundColor Red
    exit 1
}

Write-Host "Bases de datos en este equipo:" -ForegroundColor Cyan
$bases -split "`n" | Where-Object { $_ -and $_ -ne "postgres" } | ForEach-Object {
    Write-Host "   - $_"
}

$base = ($bases -split "`n" | Where-Object { $_ -match "agrofresh" } | Select-Object -First 1)
if (-not $base) {
    Write-Host "`nNo hay ninguna base del Report Hub todavía." -ForegroundColor Yellow
    Write-Host "Camino recomendado: traer la de Neon con .\1-migrar-datos-desde-neon.ps1`n"
    exit 0
}

# ---------------------------------------------------------------------------
# Contenido de la base encontrada
# ---------------------------------------------------------------------------
Write-Host "`n--- Contenido de '$base' ---`n" -ForegroundColor Cyan

function Contar($tabla) {
    $n = & $psql -U $UsuarioLocal -d $base -tAc "SET search_path=lab,public; SELECT count(*) FROM $tabla" 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return [int]$n
}

$tablas = @("solicitud", "resultado", "producto_aplicado", "cliente", "analito", "valor_lista")
foreach ($t in $tablas) {
    $n = Contar $t
    if ($null -eq $n) {
        Write-Host ("   {0,-20} tabla ausente" -f $t) -ForegroundColor Red
    } else {
        Write-Host ("   {0,-20} {1,10:N0} filas" -f $t, $n)
    }
}

$ultima = & $psql -U $UsuarioLocal -d $base -tAc "SET search_path=lab,public; SELECT COALESCE(max(fecha_entrada)::text,'sin datos') FROM solicitud" 2>$null
Write-Host "`n   Dato más reciente: $ultima"

# ---------------------------------------------------------------------------
# Migraciones: ¿está al día con lo que espera el código de hoy?
# ---------------------------------------------------------------------------
Write-Host "`n--- Migraciones aplicadas ---`n" -ForegroundColor Cyan

# Cada una es una marca de una migración concreta: si falta, el código actual
# se cae contra esta base.
$chequeos = @(
    @{ N = "0006"; Que = "pendiente_revision";  Sql = "SELECT to_regclass('lab.pendiente_revision')" },
    @{ N = "0011"; Que = "valor_lista";         Sql = "SELECT to_regclass('lab.valor_lista')" },
    @{ N = "0014"; Que = "mapeo_confirmado";    Sql = "SELECT to_regclass('lab.mapeo_confirmado')" },
    @{ N = "0016"; Que = "producto_aplicado.dosis"; Sql = "SELECT 1 FROM information_schema.columns WHERE table_schema='lab' AND table_name='producto_aplicado' AND column_name='dosis'" }
)

$faltan = @()
foreach ($c in $chequeos) {
    $r = & $psql -U $UsuarioLocal -d $base -tAc $c.Sql 2>$null
    $ok = $r -and $r.Trim() -ne ""
    if ($ok) {
        Write-Host ("   [OK   ] {0}  {1}" -f $c.N, $c.Que) -ForegroundColor Green
    } else {
        Write-Host ("   [FALTA] {0}  {1}" -f $c.N, $c.Que) -ForegroundColor Red
        $faltan += $c.N
    }
}

# ---------------------------------------------------------------------------
# Recomendación
# ---------------------------------------------------------------------------
Write-Host "`n=== Qué conviene hacer ===`n" -ForegroundColor Cyan

$nSolicitudes = Contar "solicitud"

if ($faltan.Count -gt 0) {
    Write-Host "A esta base le faltan migraciones ($($faltan -join ', ')): el código de hoy" -ForegroundColor Yellow
    Write-Host "no funciona contra ella tal como está.`n"
    Write-Host "Lo más simple y seguro es traer la de Neon, que ya tiene el esquema al día" -ForegroundColor White
    Write-Host "y los datos cargados hoy:`n"
    Write-Host '   .\1-migrar-datos-desde-neon.ps1 -UrlNeon "postgresql://..."' -ForegroundColor White
    Write-Host "`nEsta base local no se borra: el script pregunta antes de tocar nada, y si"
    Write-Host "querés conservarla, renombrala primero:`n"
    Write-Host "   psql -U postgres -c ""ALTER DATABASE $base RENAME TO ${base}_viejo""" -ForegroundColor DarkGray
} else {
    Write-Host "Esta base está al día con las migraciones y tiene $nSolicitudes solicitudes." -ForegroundColor Green
    Write-Host "`nCompará ese número con el que muestra la app en producción hoy:"
    Write-Host "  - Si coincide, podés seguir con esta base: saltá directo al paso 2."
    Write-Host "  - Si en producción hay más, traé la de Neon con el paso 1."
}
Write-Host ""
