# Abre una sesión en el servidor, o lo actualiza sin abrir nada.
#
#   .\conectar.ps1                # entra por SSH
#   .\conectar.ps1 -Actualizar    # trae el código nuevo y reconstruye, y sale
#   .\conectar.ps1 -Registros     # enseña los últimos registros del backend
#
# La clave y la dirección tienen valor por defecto porque son siempre las
# mismas; se cambian con -Clave y -Servidor cuando haga falta.
#
# El usuario NO se adivina a ojo: Amazon Linux entra como `ec2-user` y Ubuntu
# como `ubuntu`, y equivocarse responde `Permission denied (publickey)` — el
# mismo mensaje que si la clave estuviera mal. Este script prueba los dos y dice
# cuál funcionó, que es media hora de no saber qué está pasando.

[CmdletBinding()]
param(
  [string]$Servidor = '3.14.147.55',
  [string]$Clave = "$HOME\.ssh\nexus-ec2.pem",
  [string]$Usuario = '',
  [switch]$Actualizar,
  [switch]$Registros
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Clave)) {
  Write-Host "No encuentro la clave en: $Clave" -ForegroundColor Red
  Write-Host "Pasa la ruta con:  .\conectar.ps1 -Clave C:\ruta\a\Nexus.pem"
  exit 1
}

# OpenSSH de Windows rechaza una clave que otros usuarios puedan leer, y el
# mensaje ("UNPROTECTED PRIVATE KEY FILE") no dice cómo arreglarlo.
$acl = Get-Acl $Clave
$ajenos = $acl.Access | Where-Object {
  $_.IdentityReference -notmatch [regex]::Escape($env:USERNAME) -and
  $_.IdentityReference -notmatch 'SYSTEM|Administrators|Administradores'
}
if ($ajenos) {
  Write-Host "La clave es legible por otros usuarios. Lo arreglo…" -ForegroundColor Yellow
  icacls $Clave /inheritance:r /grant:r "$($env:USERNAME):R" | Out-Null
}

function Invoke-Servidor {
  param([string]$Cuenta, [string]$Orden)
  $destino = "$Cuenta@$Servidor"
  if ($Orden) {
    ssh -i $Clave -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $destino $Orden
  } else {
    ssh -i $Clave -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $destino
  }
  return $LASTEXITCODE
}

# ── Qué se va a ejecutar allí ────────────────────────────────────────────────
$orden = ''
if ($Actualizar) {
  $orden = 'cd ~/UTS_Nexus_Academico/deploy && chmod +x actualizar.sh && ./actualizar.sh'
} elseif ($Registros) {
  $orden = 'cd ~/UTS_Nexus_Academico/deploy && docker compose --env-file .env logs --tail=80 backend'
}

# ── Qué cuenta ───────────────────────────────────────────────────────────────
$cuentas = if ($Usuario) { @($Usuario) } else { @('ec2-user', 'ubuntu') }

foreach ($cuenta in $cuentas) {
  Write-Host "Conectando como $cuenta@$Servidor…" -ForegroundColor Cyan

  # Una prueba muda primero: así, si la cuenta es la equivocada, no se abre una
  # sesión a medias ni se ejecuta media actualización.
  ssh -i $Clave -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 `
      -o BatchMode=yes "$cuenta@$Servidor" 'true' 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  $cuenta no entra. Probando la siguiente…" -ForegroundColor DarkGray
    continue
  }

  Invoke-Servidor -Cuenta $cuenta -Orden $orden | Out-Null
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Ninguna cuenta entró ($($cuentas -join ', '))." -ForegroundColor Red
Write-Host "Comprueba que la instancia esté encendida y que el grupo de seguridad"
Write-Host "de AWS permita el puerto 22 desde tu IP actual — cambia sola con la red."
exit 1
