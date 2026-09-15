# Abre una sesión en el servidor de producción, o lo actualiza sin abrir nada.
#
#   .\conectar.ps1                # entra por SSH a nexus@10.11.9.36
#   .\conectar.ps1 -Actualizar    # ejecuta la actualización remota del backend
#   .\conectar.ps1 -Registros     # enseña los últimos registros del backend
#

[CmdletBinding()]
param(
  [string]$Servidor = '10.11.9.36',
  [string]$Usuario = 'nexus',
  [switch]$Actualizar,
  [switch]$Registros
)

$ErrorActionPreference = 'Stop'

if ($Actualizar) {
  Write-Host "Ejecutando actualización en $Usuario@$Servidor..." -ForegroundColor Cyan
  ssh -o StrictHostKeyChecking=accept-new "$Usuario@$Servidor" "/srv/proyectos/nexus-backend/actualizar.sh"
} elseif ($Registros) {
  Write-Host "Consultando registros del backend en $Servidor..." -ForegroundColor Cyan
  ssh -o StrictHostKeyChecking=accept-new "$Usuario@$Servidor" "sudo journalctl -u nexus-backend -n 80 --no-pager"
} else {
  Write-Host "Conectando como $Usuario@$Servidor..." -ForegroundColor Cyan
  ssh -o StrictHostKeyChecking=accept-new "$Usuario@$Servidor"
}
