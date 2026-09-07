#!/usr/bin/env bash
# Actualiza el servidor ya instalado: trae el código nuevo, reconstruye lo que
# cambió y espera a que responda.
#
# Se ejecuta EN LA INSTANCIA. Desde tu equipo, `conectar.ps1 -Actualizar` hace
# exactamente esto por SSH.
#
# No toca `deploy/.env`: los secretos los generó `instalar.sh` y no se vuelven a
# tocar. Si hiciera falta cambiar una variable, se edita ese archivo y se vuelve
# a lanzar este script.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/.." && pwd)"
ENTORNO="$AQUI/.env"

if [ ! -f "$ENTORNO" ]; then
  echo "No hay deploy/.env. Este script actualiza una instalación existente;"
  echo "para la primera vez, usa ./instalar.sh"
  exit 1
fi

# `docker compose` (plugin) o `docker-compose` (binario suelto): las dos formas
# siguen vivas según la distribución, y fallar por esto sería absurdo.
if docker compose version >/dev/null 2>&1; then
  DOCKER="docker"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER="docker-compose-legacy"
else
  echo "No encuentro Docker Compose. ¿Se instaló con ./instalar.sh?"
  exit 1
fi

compose() {
  if [ "$DOCKER" = "docker" ]; then
    docker compose --env-file "$ENTORNO" "$@"
  else
    docker-compose --env-file "$ENTORNO" "$@"
  fi
}

DOMINIO="$(grep -E '^DOMINIO=' "$ENTORNO" | head -1 | cut -d= -f2-)"

echo "── Código ──────────────────────────────────────────────────────────────"
cd "$RAIZ"
ANTES="$(git rev-parse --short HEAD)"
git pull --ff-only
DESPUES="$(git rev-parse --short HEAD)"

if [ "$ANTES" = "$DESPUES" ]; then
  echo "Ya estaba en $DESPUES. Se reconstruye igual, por si cambió .env."
else
  echo "$ANTES → $DESPUES"
fi

# El disco de 8 GB por defecto se llena con las capas viejas de las imágenes, y
# el fallo aparece a mitad de la compilación en vez de antes de empezar.
LIBRES=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
echo "Disco libre : ${LIBRES} GB"
if [ "${LIBRES:-0}" -lt 6 ]; then
  echo "   Quedan menos de 6 GB. Libera espacio con:  docker system prune -af"
fi

echo
echo "── Reconstruyendo ──────────────────────────────────────────────────────"
cd "$AQUI"
compose up -d --build

echo
echo "Esperando a que el servidor responda…"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 4 "https://$DOMINIO/health" >/dev/null 2>&1; then
    echo
    echo "════════════════════════════════════════════════════════════"
    echo "  Servidor arriba:  https://$DOMINIO"
    echo "  Versión:          $DESPUES"
    echo "════════════════════════════════════════════════════════════"
    exit 0
  fi
  sleep 5
done

echo "El servidor no respondió a tiempo. Mira los registros con:"
echo "  cd $AQUI && docker compose logs --tail=80 backend"
exit 1
