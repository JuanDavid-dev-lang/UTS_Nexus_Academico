#!/usr/bin/env bash
# ==========================================================================
#  UTS Nexus Académico — Lanzador de la app de escritorio (macOS)
#
#  El `.bat` de este sistema: doble clic en Finder y se abre en la Terminal.
#  Misma estrategia que `abrir_escritorio.bat` y `abrir_escritorio.sh`:
#
#   1) Verifica que el backend esté compilado (la app lo arranca sola).
#   2) Reinstala dependencias si package.json cambió desde la última vez.
#   3) Recompila si el código fuente es más nuevo que la aplicación.
#   4) Abre la aplicación.
#
#  Existe aparte del `.sh` porque en macOS `npm run desktop:build` no sirve
#  tal cual, y falla de dos maneras que no se leen como lo que son:
#
#   - Sin la clave privada del actualizador, `tauri build` termina en error
#     al firmar —hay clave pública y no privada—, después de haber compilado
#     todo. Aquí la clave se usa si está y, si no, se compila sin los
#     archivos del actualizador.
#   - El `.dmg` lo coloca un AppleScript que le pide a Finder que ordene los
#     iconos, y desde una Terminal sin permiso de Automatización falla sin
#     decir por qué. Con `CI=true` el empaquetador de Tauri se lo salta, que es
#     lo mismo que hace GitHub Actions.
#
#  Uso:
#    ./abrir_escritorio_mac.command              normal (recomendado)
#    ./abrir_escritorio_mac.command rapido       abre la app existente sin comprobar
#    ./abrir_escritorio_mac.command recompilar   fuerza una compilación
#    ./abrir_escritorio_mac.command universal    compila Intel + Apple Silicon,
#                                                como la publicación
#
#  Para probar el actualizador hace falta la clave privada (la misma de
#  `TAURI_SIGNING_PRIVATE_KEY` en GitHub). El lanzador la busca en la variable
#  de entorno o en ~/.tauri/uts-nexus-updater.key; con ella genera también el
#  `.app.tar.gz` firmado que descarga el actualizador. Ver
#  docs/PUBLICAR_VERSION.md, «Probar la versión de macOS».
# ==========================================================================
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

MODO="${1:-normal}"

# Finder abre la Terminal con un PATH mínimo, sin lo que añade el perfil del
# usuario. Node y Rust se instalan en el directorio del usuario (en un Mac
# Intel Homebrew ya no tiene binarios precompilados, así que van con los
# instaladores oficiales), y sin estas rutas el lanzador diría que no están.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

if [ "$MODO" = "universal" ]; then
  OBJETIVO="universal-apple-darwin"
  DESTINO="desktop/src-tauri/target/universal-apple-darwin/release"
else
  OBJETIVO=""
  DESTINO="desktop/src-tauri/target/release"
fi
APP="$DESTINO/bundle/macos/UTS Nexus Académico.app"
BINARIO="$APP/Contents/MacOS/uts-nexus-desktop"

verde()  { printf '\033[32m%s\033[0m\n' "$1"; }
rojo()   { printf '\033[31m%s\033[0m\n' "$1"; }
aviso()  { printf '[i] %s\n' "$1"; }
error()  { rojo "[ERROR] $1"; echo; read -r -p "Pulsa Intro para cerrar..." _ 2>/dev/null || true; exit 1; }

echo
echo "======================================================================"
echo "  UTS Nexus Académico  -  Aplicación de Escritorio (macOS)"
echo "======================================================================"
echo

[ "$(uname -s)" = "Darwin" ] || error "Este lanzador es para macOS. En Linux usa ./abrir_escritorio.sh"

# ── Modo rápido ───────────────────────────────────────────────────────────
if [ "$MODO" = "rapido" ]; then
  if [ -x "$BINARIO" ]; then
    aviso "Modo rápido: se abre la aplicación existente sin comprobar si está al día."
    open "$APP"
    exit 0
  fi
  aviso "No hay aplicación compilada todavía; el modo rápido no aplica."
  echo
fi

command -v node >/dev/null 2>&1 || error "Node.js no está instalado. En un Mac Intel usa el instalador oficial de https://nodejs.org/ (Homebrew compila desde fuente)."

# ── 1) El backend debe estar compilado ────────────────────────────────────
if [ ! -f "backend/dist/server.js" ]; then
  aviso "El backend no está compilado. Compilando ahora..."
  ( cd backend && { [ -d node_modules ] || npm install; } && npm run build )
  [ -f "backend/dist/server.js" ] || error "Falló la compilación del backend."
  verde "[OK] Backend compilado."
  echo
fi

# ── 2) Dependencias del frontend ──────────────────────────────────────────
if [ ! -d "desktop/node_modules" ] || [ "desktop/package.json" -nt "desktop/node_modules" ]; then
  aviso "Hay dependencias nuevas o sin instalar. Instalando..."
  ( cd desktop && npm install )
  [ -d "desktop/node_modules" ] || error "Falló la instalación de dependencias."
  verde "[OK] Dependencias al día."
  echo
fi

# ── 3) ¿Hay que compilar? ─────────────────────────────────────────────────
COMPILAR=0
if [ "$MODO" = "recompilar" ] || [ "$MODO" = "universal" ]; then
  aviso "Compilación forzada por parámetro."
  COMPILAR=1
elif [ ! -x "$BINARIO" ]; then
  aviso "La aplicación no está compilada todavía. Hay que compilarla."
  COMPILAR=1
else
  CAMBIADO=$(find desktop/src desktop/src-tauri/src desktop/package.json \
    desktop/src-tauri/Cargo.toml desktop/src-tauri/tauri.conf.json \
    desktop/src-tauri/tauri.macos.conf.json \
    -newer "$BINARIO" -print -quit 2>/dev/null)
  if [ -n "$CAMBIADO" ]; then
    aviso "El código fuente cambió después de la última compilación."
    aviso "Se recompila para que veas la versión actual."
    COMPILAR=1
  else
    verde "[OK] La aplicación está al día."
  fi
fi

# ── 4) Compilar ───────────────────────────────────────────────────────────
if [ "$COMPILAR" = "1" ]; then
  echo
  command -v cargo >/dev/null 2>&1 || error "Rust no está instalado. Instálalo con:
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  xcode-select -p >/dev/null 2>&1 || error "Faltan las herramientas de línea de órdenes de Xcode. Instálalas con: xcode-select --install"

  ARGS=()
  if [ -n "$OBJETIVO" ]; then
    # Los dos objetivos de Rust. Sin el de la otra arquitectura, la
    # compilación universal falla a la mitad con un error sobre `core`.
    for t in aarch64-apple-darwin x86_64-apple-darwin; do
      rustup target list --installed 2>/dev/null | grep -qx "$t" || rustup target add "$t" || error "No se pudo añadir el objetivo $t de Rust."
    done
    ARGS+=(--target "$OBJETIVO")
  fi

  # La clave privada del actualizador: si está, el paquete sale firmado y con
  # su `.app.tar.gz`, igual que el de la publicación. Si no, se compila sin
  # los archivos del actualizador en vez de fallar al final.
  CLAVE_ARCHIVO="$HOME/.tauri/uts-nexus-updater.key"
  if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -f "$CLAVE_ARCHIVO" ]; then
    export TAURI_SIGNING_PRIVATE_KEY="$(cat "$CLAVE_ARCHIVO")"
    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
  fi
  if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
    verde "[OK] Clave del actualizador encontrada: el paquete sale firmado."
  else
    aviso "Sin clave del actualizador: se compila sin el .app.tar.gz firmado."
    aviso "La app abre y funciona; lo único que no se puede probar es instalar"
    aviso "una actualización con ella. Ver docs/PUBLICAR_VERSION.md."
    ARGS+=(-c '{"bundle":{"createUpdaterArtifacts":false}}')
  fi

  aviso "Compilando la aplicación nativa."
  aviso "La primera vez tarda ~10 minutos (universal, el doble); las siguientes, mucho menos."
  echo
  # `tauri build` y no `desktop:build`: el script encadena el saneado de la
  # AppImage de Linux, que aquí no hace nada, y así los argumentos van a Tauri.
  ( cd desktop && CI=true npx tauri build ${ARGS[@]+"${ARGS[@]}"} ) || error "La compilación falló."

  [ -x "$BINARIO" ] || error "La compilación no generó la aplicación."
  echo
  verde "[OK] Compilación terminada."
fi

echo
echo "----------------------------------------------------------------------"
echo " Credenciales de demo:"
echo "   Administrador : admin@uts.edu.co / (la que genere el seed)"
echo "   Docente       : docente@uts.edu.co / (la que genere el seed)"
echo "----------------------------------------------------------------------"
echo
echo " Paquetes (para instalar en otro Mac):"
echo "   $DESTINO/bundle/dmg/     (.dmg — arrastrar a Aplicaciones)"
echo "   $DESTINO/bundle/macos/   (.app, y .app.tar.gz + .sig si había clave)"
echo

verde "[OK] Abriendo la aplicación... (la app arranca el backend por su cuenta)"
open "$APP"
