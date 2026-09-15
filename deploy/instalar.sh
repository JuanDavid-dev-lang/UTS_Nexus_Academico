#!/usr/bin/env bash
#
# Prepara el entorno del servidor backend UTS Nexus Académico en Ubuntu Linux.
# Configura el usuario dedicado 'nexus', permisos en /srv/proyectos/nexus-backend
# y el servicio systemd para ejecución 24/7 con reinicio automático.
#
set -euo pipefail

DESTINO="/srv/proyectos/nexus-backend"

echo "── UTS Nexus Académico · Instalación del servidor en Producción ──"

# 1. Crear usuario del sistema si no existe
if ! id -u nexus >/dev/null 2>&1; then
  echo "Creando usuario de sistema 'nexus'..."
  sudo useradd -m -s /bin/bash -U nexus
fi

# 2. Directorio y permisos
sudo mkdir -p "$DESTINO"
sudo chown -R nexus:nexus "$DESTINO"
sudo chmod 750 "$DESTINO"

# 2b. El .env se mantiene a mano (actualizar.sh lo excluye del rsync). Si no
# existe, se deja la plantilla para rellenar: el servicio no arranca sin ella.
if [ ! -f "$DESTINO/.env" ]; then
  AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  sudo install -o nexus -g nexus -m 600 "$AQUI/.env.produccion.example" "$DESTINO/.env"
  echo "Plantilla copiada a $DESTINO/.env — rellena los secretos antes de arrancar."
fi

# 3. Permisos sudo mínimos para reiniciar servicio
sudo tee /etc/sudoers.d/nexus >/dev/null << 'EOF'
nexus ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nexus-backend*, /usr/bin/systemctl stop nexus-backend*, /usr/bin/systemctl start nexus-backend*, /usr/bin/systemctl status nexus-backend*, /usr/bin/systemctl is-active nexus-backend*, /usr/bin/journalctl -u nexus-backend*
EOF
sudo chmod 440 /etc/sudoers.d/nexus

# 4. Servicio systemd
sudo tee /etc/systemd/system/nexus-backend.service >/dev/null << 'EOF'
[Unit]
Description=UTS Nexus Academico Backend API
After=network.target

[Service]
Type=simple
User=nexus
Group=nexus
WorkingDirectory=/srv/proyectos/nexus-backend
EnvironmentFile=/srv/proyectos/nexus-backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5s
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
echo "Instalación completada. Despliega el código con ./deploy/actualizar.sh"
