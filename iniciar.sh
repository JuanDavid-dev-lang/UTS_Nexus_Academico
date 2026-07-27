#!/usr/bin/env bash
# ==========================================================================
#  UTS Nexus Académico — Arranque end-to-end (Linux / macOS / Git Bash)
#
#  Instala dependencias, compila, siembra datos de demo, levanta el backend
#  y ejecuta el smoke test de los endpoints clave.
#
#  Uso:
#    ./iniciar.sh            # todo el flujo
#    ./iniciar.sh --sin-seed # no re-sembrar
#    ./iniciar.sh --solo-smoke
# ==========================================================================
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
SIN_SEED=0
SOLO_SMOKE=0
for arg in "$@"; do
  case "$arg" in
    --sin-seed) SIN_SEED=1 ;;
    --solo-smoke) SOLO_SMOKE=1 ;;
  esac
done

paso() { printf "\n==> %s\n" "$1"; }

paso "Verificando requisitos"
command -v node >/dev/null 2>&1 || { echo "Node.js no está instalado."; exit 1; }
echo "Node $(node --version)"

cd "$BACKEND"

if [ ! -f ".env" ]; then
  echo "No existe backend/.env — copiando desde .env.example"
  cp .env.example .env
  echo "IMPORTANTE: edita backend/.env y define MONGODB_URI (Atlas) antes de continuar."
fi

if [ "$SOLO_SMOKE" = "1" ]; then
  paso "Ejecutando solo el smoke test"
  npm run smoke
  exit $?
fi

if [ ! -d "node_modules" ]; then
  paso "Instalando dependencias del backend (npm install)"
  npm install
else
  echo "Dependencias ya instaladas (omito npm install)."
fi

paso "Compilando backend (TypeScript)"
npm run build

if [ "$SIN_SEED" != "1" ]; then
  paso "Sembrando datos de demo (npm run seed)"
  npm run seed
else
  echo "Omito el seed (--sin-seed)."
fi

paso "Levantando el backend en segundo plano"
npm start >/tmp/uts-nexus-backend.log 2>&1 &
SERVER_PID=$!
echo "Servidor iniciado (PID $SERVER_PID). API: http://localhost:4000 · Docs: http://localhost:4000/docs"
echo "Logs: /tmp/uts-nexus-backend.log"

paso "Ejecutando smoke test (espera a que el servidor responda)"
set +e
npm run smoke
SMOKE=$?
set -e

echo ""
echo "--------------------------------------------------------------"
if [ "$SMOKE" = "0" ]; then
  echo "TODO OK. El backend sigue corriendo (PID $SERVER_PID)."
else
  echo "El smoke test reportó fallos. Revisa /tmp/uts-nexus-backend.log"
fi
echo "Para detener el backend:  kill $SERVER_PID"
echo "Credenciales demo: docente@uts.edu.co / (la que genere el seed)  ·  estudiante@uts.edu.co / (la que genere el seed)"
echo "--------------------------------------------------------------"
exit $SMOKE
