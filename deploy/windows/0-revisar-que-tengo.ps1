# =============================================================================
# 0. QUE HAY HOY EN ESTE EQUIPO?
#
# Antes de migrar nada: revisa si ya existe un PostgreSQL con datos del Report
# Hub de cuando se trabajaba en local, cuanto tiene y si le faltan migraciones.
# Con eso decide si conviene seguir desde esa base o traer la de Neon.
#
# No modifica nada: solo lee e informa.
#
# Uso:
#   .\0-revisar-que-tengo.ps1
# =============================================================================

param(
    [string]$UsuarioLocal = "postgres",
    [string]$CarpetaPg = ""
)

. (Join-Path $PSScriptRoot "_comun.ps1")

Write-Host "`n=== Que hay hoy en este equipo ===`n" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------
$svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $svc) {
    Write-Host "PostgreSQL no esta instalado en este equipo." -ForegroundColor Yellow
    Write-Host "Instalalo desde https://www.postgresql.org/download/windows/ y volve a correr esto.`n"
    exit 0
}
Write-Host "PostgreSQL: $($svc.Name) - $($svc.Status)" -ForegroundColor Green

$CarpetaPg = Buscar-CarpetaPg $CarpetaPg
if (-not $CarpetaPg) {
    Write-Host "`nNo se encontro psql.exe. Pasa la ruta con -CarpetaPg.`n" -ForegroundColor Red
    exit 1
}
Write-Host "            $CarpetaPg" -ForegroundColor DarkGray
$psql = Join-Path $CarpetaPg "psql.exe"

# Una sola vez para todo el script, en vez de una por consulta.
Write-Host ""
Pedir-PasswordPg $UsuarioLocal

try {
    # -----------------------------------------------------------------------
    # Bases existentes
    # -----------------------------------------------------------------------
    $bases = & $psql -U $UsuarioLocal -d postgres -tAc `
        "SELECT datname FROM pg_database WHERE datistemplate = false" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nNo se pudo conectar. Revisa la contrasena.`n" -ForegroundColor Red
        exit 1
    }

    $listaBases = @($bases) | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -ne "" }

    Write-Host "`nBases de datos en este equipo:" -ForegroundColor Cyan
    $listaBases | Where-Object { $_ -ne "postgres" } | ForEach-Object { Write-Host "   - $_" }

    $base = $listaBases | Where-Object { $_ -match "agrofresh" } | Select-Object -First 1
    if (-not $base) {
        Write-Host "`nNo hay ninguna base del Report Hub todavia." -ForegroundColor Yellow
        Write-Host "Camino recomendado: traer la de Neon con .\1-migrar-datos-desde-neon.ps1`n"
        exit 0
    }

    # -----------------------------------------------------------------------
    # Esquemas: el codigo espera las tablas dentro de 'lab'
    # -----------------------------------------------------------------------
    Write-Host "`n--- Contenido de '$base' ---`n" -ForegroundColor Cyan

    $esquemas = & $psql -U $UsuarioLocal -d $base -tAc `
        "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'" 2>$null
    $listaEsq = @($esquemas) | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -ne "" }
    Write-Host "   Esquemas: $($listaEsq -join ', ')`n"

    $tablas = @("solicitud", "resultado", "producto_aplicado", "cliente", "analito", "valor_lista")
    $vacia = $true
    foreach ($t in $tablas) {
        $n = Leer-Escalar $psql $UsuarioLocal $base "SET search_path=lab,public; SELECT count(*) FROM $t"
        $etiqueta = $t.PadRight(20)
        if ($null -eq $n) {
            Write-Host "   $etiqueta tabla ausente" -ForegroundColor Red
        } else {
            $cifra = ("{0:N0}" -f [int]$n).PadLeft(10)
            Write-Host "   $etiqueta $cifra filas"
            if ([int]$n -gt 0) { $vacia = $false }
        }
    }

    $ultima = Leer-Escalar $psql $UsuarioLocal $base `
        "SET search_path=lab,public; SELECT COALESCE(max(fecha_entrada)::text,'sin datos') FROM solicitud"
    if ($ultima) { Write-Host "`n   Dato mas reciente: $ultima" }

    # -----------------------------------------------------------------------
    # Migraciones: esta al dia con lo que espera el codigo de hoy?
    # -----------------------------------------------------------------------
    Write-Host "`n--- Migraciones aplicadas ---`n" -ForegroundColor Cyan

    # Cada una es una marca de una migracion concreta: si falta, el codigo
    # actual se cae contra esta base.
    $chequeos = @(
        @{ N = "0006"; Que = "pendiente_revision"; Sql = "SELECT to_regclass('lab.pendiente_revision')" },
        @{ N = "0011"; Que = "valor_lista";        Sql = "SELECT to_regclass('lab.valor_lista')" },
        @{ N = "0014"; Que = "mapeo_confirmado";   Sql = "SELECT to_regclass('lab.mapeo_confirmado')" },
        @{ N = "0016"; Que = "producto_aplicado.dosis"; Sql = "SELECT 1 FROM information_schema.columns WHERE table_schema='lab' AND table_name='producto_aplicado' AND column_name='dosis'" }
    )

    $faltan = @()
    foreach ($c in $chequeos) {
        $r = Leer-Escalar $psql $UsuarioLocal $base $c.Sql
        $marca = ($c.N + "  " + $c.Que)
        if ($r) {
            Write-Host "   [OK   ] $marca" -ForegroundColor Green
        } else {
            Write-Host "   [FALTA] $marca" -ForegroundColor Red
            $faltan += $c.N
        }
    }

    # -----------------------------------------------------------------------
    # Recomendacion
    # -----------------------------------------------------------------------
    Write-Host "`n=== Que conviene hacer ===`n" -ForegroundColor Cyan

    $nSolicitudes = Leer-Escalar $psql $UsuarioLocal $base "SET search_path=lab,public; SELECT count(*) FROM solicitud"

    if ($vacia -or $faltan.Count -gt 0) {
        if ($vacia) {
            Write-Host "La base '$base' existe pero esta vacia: no hay datos que conservar." -ForegroundColor Yellow
        } else {
            Write-Host "A esta base le faltan migraciones ($($faltan -join ', ')): el codigo de hoy" -ForegroundColor Yellow
            Write-Host "no funciona contra ella tal como esta."
        }
        Write-Host "`nTrae la de Neon, que ya tiene el esquema al dia y los datos cargados hoy:`n" -ForegroundColor White
        Write-Host '   .\1-migrar-datos-desde-neon.ps1 -UrlNeon "postgresql://..."' -ForegroundColor White
        if (-not $vacia) {
            Write-Host "`nEsta base local no se borra sin avisar: el script pregunta antes. Si"
            Write-Host "queres conservarla igual, renombrala primero:`n"
            $sugerencia = 'psql -U postgres -c "ALTER DATABASE ' + $base + ' RENAME TO ' + $base + '_viejo"'
            Write-Host "   $sugerencia" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "Esta base esta al dia con las migraciones y tiene $nSolicitudes solicitudes." -ForegroundColor Green
        Write-Host "`nCompara ese numero con el que muestra la app en produccion hoy:"
        Write-Host "  - Si coincide, podes seguir con esta base: salta directo al paso 2."
        Write-Host "  - Si en produccion hay mas, trae la de Neon con el paso 1."
    }
    Write-Host ""

} finally {
    Limpiar-PasswordPg
}
