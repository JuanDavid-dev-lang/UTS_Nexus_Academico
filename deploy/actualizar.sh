#!/usr/bin/env bash
# ==============================================================================
#  UTS Nexus Académico — Despliegue y actualización en producción (Nodo 1)
# ==============================================================================
#
#  Sincroniza el código del backend con el servidor central, compila TypeScript,
#  reinicia el servicio systemd y verifica la sonda de salud pública.
#
#  La versión web no va aquí: vive en Vercel (https://utsnexusweb.ciaiuts.com),
#  se compila y despliega sola desde `desktop/` en cada push. Lo único que este
#  servidor necesita de ella es su origen en `CLIENT_ORIGIN`.
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
\
  -e "ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
  "$RAIZ/backend/" "$USUARIO@$SERVIDOR:$DESTINO/"

# Aparte y con su propio --delete: el de arriba borraría la web, que no está en
# backend/, y este quita los recursos de una compilación anterior.
rsync -avz --delete \
  -e "ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
  "$RAIZ/desktop/dist-web/" "$USUARIO@$SERVIDOR:$DESTINO/web/"

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
  echo "  Web:     https://utsnexusweb.ciaiuts.com (Vercel)"
  echo "════════════════════════════════════════════════════════════"
else
  echo "Advertencia: El endpoint público tardó en responder. Revisa la conectividad del túnel."
fi
