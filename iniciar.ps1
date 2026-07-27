# ==========================================================================
#  UTS Nexus Académico — Arranque end-to-end (Windows / PowerShell)
#
#  Instala dependencias, compila, siembra datos de demo, levanta el backend
#  y ejecuta el smoke test de los endpoints clave.
#
#  Uso:
#    powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
#    powershell -ExecutionPolicy Bypass -File .\iniciar.ps1 -SinSeed
#    powershell -ExecutionPolicy Bypass -File .\iniciar.ps1 -SoloSmoke
# ==========================================================================
param(
    [switch]$SinSeed,     # No re-sembrar la base
    [switch]$SoloSmoke    # Asumir servidor ya arrancado y solo probar
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"

function Paso($txt) { Write-Host "`n==> $txt" -ForegroundColor Cyan }

# --- Requisitos -----------------------------------------------------------
Paso "Verificando requisitos"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js no está instalado." }
Write-Host ("Node " + (node --version))

Set-Location $backend

if (-not (Test-Path ".env")) {
    Write-Host "No existe backend/.env — copiando desde .env.example" -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "IMPORTANTE: edita backend/.env y define MONGODB_URI (MongoDB Atlas) antes de continuar." -ForegroundColor Yellow
}

if ($SoloSmoke) {
    Paso "Ejecutando solo el smoke test"
    npm run smoke
    exit $LASTEXITCODE
}

# --- Dependencias ---------------------------------------------------------
if (-not (Test-Path "node_modules")) {
    Paso "Instalando dependencias del backend (npm install)"
    npm install
} else {
    Write-Host "Dependencias ya instaladas (omito npm install)."
}

# --- Build ----------------------------------------------------------------
Paso "Compilando backend (TypeScript)"
npm run build

# --- Seed -----------------------------------------------------------------
if (-not $SinSeed) {
    Paso "Sembrando datos de demo (npm run seed)"
    npm run seed
} else {
    Write-Host "Omito el seed (-SinSeed)."
}

# --- Arranque del servidor en segundo plano -------------------------------
Paso "Levantando el backend en segundo plano"
$server = Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $backend -PassThru -WindowStyle Minimized
Write-Host ("Servidor iniciado (PID " + $server.Id + "). API: http://localhost:4000 · Docs: http://localhost:4000/docs")

# --- Smoke test -----------------------------------------------------------
Paso "Ejecutando smoke test (espera a que el servidor responda)"
npm run smoke
$smoke = $LASTEXITCODE

Write-Host "`n--------------------------------------------------------------"
if ($smoke -eq 0) {
    Write-Host "TODO OK. El backend sigue corriendo (PID $($server.Id))." -ForegroundColor Green
} else {
    Write-Host "El smoke test reportó fallos. Revisa la ventana del servidor." -ForegroundColor Red
}
Write-Host "Para detener el backend:  Stop-Process -Id $($server.Id)"
Write-Host "Credenciales demo: docente@uts.edu.co / Uts12345!  ·  estudiante@uts.edu.co / Uts12345!"
Write-Host "--------------------------------------------------------------`n"
exit $smoke
