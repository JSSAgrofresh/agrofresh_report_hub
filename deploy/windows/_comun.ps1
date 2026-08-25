# =============================================================================
# FUNCIONES COMPARTIDAS
#
# No se ejecuta directo: los demas scripts lo cargan con dot-source.
# =============================================================================

function Buscar-CarpetaPg {
    <#
    .SYNOPSIS
    Devuelve la carpeta bin de PostgreSQL, o $null si no la encuentra.
    La version instalada varia entre equipos (16, 17, 18...), asi que se busca
    la mas nueva en vez de fijar una en el codigo.
    #>
    param([string]$Preferida = "")

    if ($Preferida -and (Test-Path (Join-Path $Preferida "psql.exe"))) {
        return $Preferida
    }

    $raiz = "C:\Program Files\PostgreSQL"
    if (Test-Path $raiz) {
        $versiones = Get-ChildItem $raiz -Directory -ErrorAction SilentlyContinue |
            Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending
        foreach ($v in $versiones) {
            $bin = Join-Path $v.FullName "bin"
            if (Test-Path (Join-Path $bin "psql.exe")) { return $bin }
        }
    }

    # Ultimo recurso: que este en el PATH.
    $cmd = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($cmd) { return (Split-Path $cmd.Source -Parent) }

    return $null
}

function Pedir-PasswordPg {
    <#
    .SYNOPSIS
    Pide la contrasena una sola vez y la deja en PGPASSWORD, que es la variable
    que psql y pg_dump leen solos. Sin esto, cada consulta la vuelve a pedir.
    Vive solo en este proceso de PowerShell y se borra al cerrarlo.
    #>
    param([string]$Usuario = "postgres")

    if ($env:PGPASSWORD) { return }

    $segura = Read-Host "Contrasena de PostgreSQL (usuario '$Usuario')" -AsSecureString
    $puntero = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    try {
        $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($puntero)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero)
    }
}

function Limpiar-PasswordPg {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

function Leer-Escalar {
    <#
    .SYNOPSIS
    Ejecuta una consulta que devuelve un solo valor y lo entrega limpio.
    psql puede escribir avisos junto al resultado, asi que se descarta todo lo
    que no sea la linea del dato -de ahi venia el error al convertir a entero-.
    #>
    param(
        [string]$Psql,
        [string]$Usuario,
        [string]$Base,
        [string]$Sql,
        [string]$Servidor = "localhost"
    )

    # -h explicito: sin el, psql elige el metodo de conexion segun el sistema y
    # la autenticacion puede fallar aunque la contrasena sea correcta.
    $salida = & $Psql -h $Servidor -U $Usuario -d $Base -tAc $Sql 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }

    # El @() exterior es obligatorio: con un solo resultado, Where-Object
    # devuelve el string suelto y [-1] indexaria su ultimo CARACTER en vez de
    # la ultima linea ("solicitud" -> "d").
    $lineas = @(@($salida) | Where-Object { $null -ne $_ -and $_.ToString().Trim() -ne "" })
    if ($lineas.Count -eq 0) { return $null }

    return $lineas[-1].ToString().Trim()
}
