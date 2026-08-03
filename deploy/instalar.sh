#!/usr/bin/env bash
#
# Prepara una instancia EC2 recién creada (Ubuntu 22.04 o 24.04) y deja el
# servidor corriendo con HTTPS.
#
# Se ejecuta una sola vez, dentro de la instancia:
#
#     git clone https://github.com/JuanDavid-dev-lang/UTS_Nexus_Academico.git
#     cd UTS_Nexus_Academico/deploy
#     ./instalar.sh
#
# Es idempotente: volver a ejecutarlo no rompe nada ni regenera los secretos.

set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTORNO="$AQUI/.env"

echo "── UTS Nexus Académico · instalación del servidor ─────────────────"

# ── Docker ──────────────────────────────────────────────────────────────
# Se soportan las dos familias porque la imagen de la instancia no siempre es la
# que uno cree haber elegido: Amazon Linux y Ubuntu se parecen al entrar por SSH
# y solo se distinguen por el gestor de paquetes y el usuario por defecto.
if command -v dnf >/dev/null 2>&1; then
  FAMILIA="amazon"
elif command -v apt-get >/dev/null 2>&1; then
  FAMILIA="debian"
else
  echo "Sistema no reconocido: no encuentro ni dnf ni apt-get."
  exit 1
fi
echo "Sistema     : $FAMILIA"

command -v git >/dev/null 2>&1 || {
  echo "Instalando git…"
  [ "$FAMILIA" = "amazon" ] && sudo dnf install -y -q git || sudo apt-get install -y -qq git
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker…"
  if [ "$FAMILIA" = "amazon" ]; then
    # En Amazon Linux 2023 el script de get.docker.com no está soportado; el
    # paquete del repositorio sí, pero no trae el plugin de compose.
    sudo dnf install -y -q docker
    sudo systemctl enable --now docker
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -fsSL \
      "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  else
    curl -fsSL https://get.docker.com | sudo sh
  fi
  sudo usermod -aG docker "$USER" || true
  echo "   Docker instalado. Para usarlo sin sudo hay que reconectar por SSH;"
  echo "   mientras tanto este script sigue con sudo."
fi

DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# ── Dirección pública y nombre ──────────────────────────────────────────
# IMDSv2: las instancias nuevas rechazan la consulta sin token.
TOKEN=$(curl -fsS -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)

if [ -n "$TOKEN" ]; then
  IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
fi
IP="${IP:-$(curl -fsS https://api.ipify.org || true)}"

if [ -z "$IP" ]; then
  echo "No pude averiguar la IP pública. Pásala como argumento:  ./instalar.sh 52.1.2.3"
  IP="${1:-}"
  [ -z "$IP" ] && exit 1
fi

# sslip.io resuelve 52-1-2-3.sslip.io a 52.1.2.3 sin registrar nada.
DOMINIO="${DOMINIO:-$(echo "$IP" | tr '.' '-').sslip.io}"
echo "IP pública : $IP"
echo "Dominio    : $DOMINIO"

# ── Secretos ────────────────────────────────────────────────────────────
if [ -f "$ENTORNO" ]; then
  echo "Ya existe deploy/.env; se conserva. Borralo si querés empezar de cero."
else
  echo
  echo "Pegá la cadena de conexión de MongoDB Atlas (mongodb+srv://…):"
  read -r -s MONGO
  echo
  [ -z "$MONGO" ] && { echo "Sin MONGODB_URI no hay servidor."; exit 1; }

  # Los secretos se generan aquí y no se muestran: nadie tiene que copiarlos a
  # ningún sitio, así que no hay motivo para que aparezcan en una pantalla o en
  # el historial del terminal.
  ACCESO=$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-64)
  REFRESCO=$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-64)

  umask 077
  cat > "$ENTORNO" <<EOF
# Generado por instalar.sh. NO subir a git.
DOMINIO=$DOMINIO
MONGODB_URI=$MONGO
JWT_ACCESS_SECRET=$ACCESO
JWT_REFRESH_SECRET=$REFRESCO
# Orígenes autorizados. tauri.localhost es la app de escritorio empaquetada.
CLIENT_ORIGIN=https://$DOMINIO,http://tauri.localhost,https://tauri.localhost
RISK_SCAN_INTERVAL_MIN=60
EOF
  echo "Secretos generados en deploy/.env (permisos 600)."
fi

# ── Cortafuegos ─────────────────────────────────────────────────────────
# Amazon Linux no trae ufw y no hace falta: el grupo de seguridad de AWS ya
# filtra antes de que el paquete llegue a la instancia. En Ubuntu se activa
# como segunda barrera por si el grupo se abre de más algún día.
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp  >/dev/null 2>&1 || true
  sudo ufw allow 80/tcp  >/dev/null 2>&1 || true
  sudo ufw allow 443/tcp >/dev/null 2>&1 || true
  sudo ufw --force enable >/dev/null 2>&1 || true
  echo "Cortafuegos : abiertos 22, 80 y 443"
else
  echo "Cortafuegos : lo gestiona el grupo de seguridad de AWS"
fi

# El disco de 8 GB por defecto se llena construyendo estas imágenes. Se avisa
# antes de empezar, no cuando falle a mitad de la compilación.
LIBRES=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
echo "Disco libre : ${LIBRES} GB"
if [ "${LIBRES:-0}" -lt 6 ]; then
  echo "   Quedan menos de 6 GB. Liberá espacio con:  $DOCKER system prune -af"
fi

# ── Arranque ────────────────────────────────────────────────────────────
echo "Construyendo imágenes (la primera vez tarda varios minutos)…"
cd "$AQUI"
$DOCKER compose --env-file .env up -d --build

echo
echo "Esperando a que el servidor responda…"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 4 "https://$DOMINIO/health" >/dev/null 2>&1; then
    echo
    echo "════════════════════════════════════════════════════════════"
    echo "  Servidor arriba:  https://$DOMINIO"
    echo "  Estado:           https://$DOMINIO/health"
    echo "════════════════════════════════════════════════════════════"
    echo
    echo "Siguiente paso: sembrar los datos y CAMBIAR las contraseñas de demo."
    echo "  $DOCKER compose exec backend node dist/scripts/seed.js"
    exit 0
  fi
  sleep 5
done

echo "El servidor no respondió a tiempo. Mirá los registros con:"
echo "  $DOCKER compose logs --tail=80"
exit 1
