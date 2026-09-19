#!/usr/bin/env bash
# ==============================================================================
#  UTS Nexus Académico — Despliegue y actualización en producción (Nodo 1)
# ==============================================================================
#
#  Sincroniza el código del backend con el servidor central, compila TypeScript,
#  reinicia el servicio systemd y verifica la sonda de salud pública.
#
#  Uso:
#    ./deploy/actualizar.sh
#    ./deploy/actualizar.sh [IP_SERVIDOR]
# ==============================================================================
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
SERVIDOR="${1:-10.11.9.36}"
USUARIO="nexus"
DESTINO="/srv/proyectos/nexus-backend"

echo "── 1. Sincronizando código hacia $USUARIO@$SERVIDOR:$DESTINO ──"
rsync -avz --delete \
  --exclude="node_modules" \
  --exclude="dist" \
  --exclude=".git" \
  --exclude=".env" \
  --exclude="uploads" \
  --exclude="actualizar.sh" \
  -e "ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
  "$RAIZ/backend/" "$USUARIO@$SERVIDOR:$DESTINO/"

echo "── 2. Ejecutando compilación y reinicio en el servidor ──"
ssh -o StrictHostKeyChecking=accept-new "$USUARIO@$SERVIDOR" "$DESTINO/actualizar.sh"

echo "── 3. Verificando endpoint público vía Cloudflare ──"
if curl -fsS --max-time 5 "https://nexusback.ciaiuts.com/health" >/dev/null 2>&1; then
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  Despliegue verificado en producción exitosamente"
  echo "  API:     https://nexusback.ciaiuts.com"
  echo "  Health:  https://nexusback.ciaiuts.com/health"
  echo "  Docs:    https://nexusback.ciaiuts.com/docs"
  echo "════════════════════════════════════════════════════════════"
else
  echo "Advertencia: El endpoint público tardó en responder. Revisa la conectividad del túnel."
fi
