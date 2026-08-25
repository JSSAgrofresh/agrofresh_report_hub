# =============================================================================
# 3. PUBLICAR EL BACKEND EN INTERNET CON CLOUDFLARE TUNNEL
#
# El túnel abre una conexión SALIENTE desde este equipo hacia Cloudflare, así
# que no hay que abrir puertos ni pedirle nada al router de la oficina, y el
# equipo nunca queda expuesto directamente a internet. El certificado HTTPS
# lo pone Cloudflare.
#
# Requiere PowerShell como Administrador y una cuenta de Cloudflare (gratis).
#
# Uso:
#   .\3-configurar-tunel.ps1 -Dominio "api.tudominio.com"
# =============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Dominio,

    [string]$NombreTunel = "agrofresh-report-hub",
    [int]$Puerto = 8000
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script necesita PowerShell abierto como Administrador."
}

Write-Host "`n[1/5] Instalando cloudflared..." -ForegroundColor Cyan
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    Write-Host "      Ya estaba instalado." -ForegroundColor Green
} else {
    winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw "Falló la instalación. Instalá cloudflared a mano desde https://github.com/cloudflare/cloudflared/releases" }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
}

Write-Host "`n[2/5] Conectando con tu cuenta de Cloudflare..." -ForegroundColor Cyan
Write-Host "      Se va a abrir el navegador: entrá y autorizá el dominio.`n" -ForegroundColor Yellow
cloudflared tunnel login
if ($LASTEXITCODE -ne 0) { throw "Falló el login en Cloudflare." }

Write-Host "`n[3/5] Creando el túnel '$NombreTunel'..." -ForegroundColor Cyan
$existentes = cloudflared tunnel list 2>&1 | Out-String
if ($existentes -match [regex]::Escape($NombreTunel)) {
    Write-Host "      El túnel ya existía, se reutiliza." -ForegroundColor Yellow
} else {
    cloudflared tunnel create $NombreTunel
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el túnel." }
}

Write-Host "`n[4/5] Escribiendo la configuración..." -ForegroundColor Cyan
$carpetaCf = Join-Path $env:USERPROFILE ".cloudflared"
$credencial = Get-ChildItem -Path $carpetaCf -Filter "*.json" |
    Where-Object { $_.Name -ne "cert.pem" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $credencial) { throw "No se encontró el archivo de credenciales del túnel en $carpetaCf" }

$idTunel = [System.IO.Path]::GetFileNameWithoutExtension($credencial.Name)

# ingress: todo lo que llegue al dominio se reenvía al backend local. La regla
# http_status:404 del final es obligatoria para cloudflared (caso por defecto).
$config = @"
tunnel: $idTunel
credentials-file: $($credencial.FullName)

ingress:
  - hostname: $Dominio
    service: http://localhost:$Puerto
  - service: http_status:404
"@

$rutaConfig = Join-Path $carpetaCf "config.yml"
$config | Out-File -FilePath $rutaConfig -Encoding utf8 -Force
Write-Host "      Guardada en $rutaConfig" -ForegroundColor Green

Write-Host "`n[5/5] Publicando el dominio e instalando el servicio..." -ForegroundColor Cyan
cloudflared tunnel route dns $NombreTunel $Dominio

cloudflared service uninstall 2>&1 | Out-Null
cloudflared service install
if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar el servicio." }
Start-Service cloudflared -ErrorAction SilentlyContinue

Write-Host "`nListo. El backend queda publicado en:" -ForegroundColor Green
Write-Host "   https://$Dominio`n" -ForegroundColor White

Write-Host "Falta un último paso, fuera de este equipo:" -ForegroundColor Yellow
Write-Host "  1. En Vercel, cambiá la variable del frontend que apunta a la API"
Write-Host "     por  https://$Dominio  y volvé a desplegar."
Write-Host "  2. En backend\.env, poné la URL de Vercel en CORS_ORIGINS.`n"
