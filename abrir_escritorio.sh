#!/usr/bin/env bash
# ==========================================================================
#  UTS Nexus Académico — Lanzador de la app de escritorio (Linux / macOS)
#
#  Equivalente de `abrir_escritorio.bat`. Misma estrategia, y existe por el
#  mismo motivo:
#
#   1) Verifica que el backend esté compilado (la app lo arranca sola).
#   2) Reinstala dependencias si package.json cambió desde la última vez.
#   3) Recompila si el código fuente es más nuevo que el ejecutable.
#   4) Abre la aplicación.
#
#  Los pasos 2 y 3 no son comodidad. Abrir un binario viejo es el peor fallo
#  posible: la app arranca, no da ningún error, y muestra una versión anterior
#  del programa. Quien lo usa no tiene forma de darse cuenta, y quien lo depura
#  pierde la tarde mirando código que no es el que se está ejecutando.
#
#  Uso:
#    ./abrir_escritorio.sh              comportamiento normal (recomendado)
#    ./abrir_escritorio.sh rapido       abre el binario existente sin comprobar
#    ./abrir_escritorio.sh recompilar   fuerza una compilación
# ==========================================================================
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

MODO="${1:-normal}"

# `mainBinaryName` de `tauri.linux.conf.json`. En macOS y en un árbol anterior a
# ese archivo el binario conserva el nombre del paquete de Cargo, así que se
# prueban los dos: un lanzador que no encuentra el ejecutable recién compilado
# se lee como «la compilación falló», que es justo lo que no pasó.
DESTINO="desktop/src-tauri/target/release"
BINARIO=""
for candidato in "$DESTINO/uts-nexus-academico" "$DESTINO/uts-nexus-desktop"; do
  [ -x "$candidato" ] && BINARIO="$candidato" && break
done

verde()  { printf '\033[32m%s\033[0m\n' "$1"; }
rojo()   { printf '\033[31m%s\033[0m\n' "$1"; }
aviso()  { printf '[i] %s\n' "$1"; }
error()  { rojo "[ERROR] $1"; exit 1; }

echo
echo "======================================================================"
echo "  UTS Nexus Académico  -  Aplicación de Escritorio"
echo "======================================================================"
echo

# ── Modo rápido ───────────────────────────────────────────────────────────
if [ "$MODO" = "rapido" ]; then
  if [ -n "$BINARIO" ]; then
    aviso "Modo rápido: se abre el ejecutable existente sin comprobar si está al día."
    exec "$BINARIO"
  fi
  aviso "No hay ejecutable todavía; el modo rápido no aplica."
  echo
fi

# ── 1) El backend debe estar compilado ────────────────────────────────────
if [ ! -f "backend/dist/server.js" ]; then
  aviso "El backend no está compilado. Compilando ahora..."
  command -v node >/dev/null 2>&1 || error "Node.js no está instalado o no está en el PATH. Instálalo desde https://nodejs.org/"
  ( cd backend && { [ -d node_modules ] || npm install; } && npm run build )
  [ -f "backend/dist/server.js" ] || error "Falló la compilación del backend."
  verde "[OK] Backend compilado."
  echo
fi

# ── 2) Dependencias del frontend ──────────────────────────────────────────
#
# Si package.json cambió después de la última instalación falta alguna
# dependencia, y la compilación fallaría con un import sin resolver: un error
# bastante más difícil de leer que este aviso.
#
# La comparación es `-nt` sobre node_modules, que en Linux y macOS existe y es
# fiable. El `.bat` necesita un script de PowerShell aparte para lo mismo porque
# `cmd` no sabe comparar fechas.
if [ ! -d "desktop/node_modules" ] || [ "desktop/package.json" -nt "desktop/node_modules" ]; then
  aviso "Hay dependencias nuevas o sin instalar. Instalando..."
  ( cd desktop && npm install )
  [ -d "desktop/node_modules" ] || error "Falló la instalación de dependencias."
  verde "[OK] Dependencias al día."
  echo
fi

# ── 3) ¿Hay que compilar? ─────────────────────────────────────────────────
COMPILAR=0
if [ "$MODO" = "recompilar" ]; then
  aviso "Compilación forzada por parámetro."
  COMPILAR=1
elif [ -z "$BINARIO" ]; then
  aviso "El ejecutable no existe todavía. Hay que compilarlo."
  COMPILAR=1
else
  # Cualquier fuente más nuevo que el binario. `-newer` compara mtime, que es lo
  # que cambia al editar; el `-quit` para en el primero y no recorre el árbol
  # entero por gusto.
  CAMBIADO=$(find desktop/src desktop/src-tauri/src desktop/package.json \
    desktop/src-tauri/Cargo.toml desktop/src-tauri/tauri.conf.json \
    desktop/src-tauri/tauri.linux.conf.json \
    -newer "$BINARIO" -print -quit 2>/dev/null)
  if [ -n "$CAMBIADO" ]; then
    aviso "El código fuente cambió después de la última compilación."
    aviso "Se recompila para que veas la versión actual."
    COMPILAR=1
  else
    verde "[OK] El ejecutable está al día."
  fi
fi

# ── 4) Compilar ───────────────────────────────────────────────────────────
if [ "$COMPILAR" = "1" ]; then
  echo
  if ! command -v cargo >/dev/null 2>&1; then
    if [ -x "$HOME/.cargo/bin/cargo" ]; then
      export PATH="$HOME/.cargo/bin:$PATH"
    else
      rojo "[ERROR] Rust no está instalado."
      echo "        Instálalo con:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
      echo
      echo "        Y las dependencias de compilación de tu distribución:"
      echo "          Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev \\"
      echo "                           libayatana-appindicator3-dev librsvg2-dev libxdo-dev \\"
      echo "                           libssl-dev libdbus-1-dev patchelf squashfs-tools \\"
      echo "                           build-essential"
      echo "          Fedora:        sudo dnf install webkit2gtk4.1-devel gtk3-devel \\"
      echo "                           libappindicator-gtk3-devel librsvg2-devel libxdo-devel \\"
      echo "                           openssl-devel dbus-devel patchelf squashfs-tools \\"
      echo "                           gcc gcc-c++ make"
      echo "          Arch:          sudo pacman -S webkit2gtk-4.1 gtk3 libappindicator-gtk3 \\"
      echo "                           librsvg xdotool openssl dbus patchelf squashfs-tools \\"
      echo "                           base-devel"
      exit 1
    fi
  fi

  aviso "Compilando la aplicación nativa."
  aviso "La primera vez tarda ~10 minutos; las siguientes, mucho menos."
  echo
  ( cd desktop && npm run desktop:build ) || error "La compilación falló."

  for candidato in "$DESTINO/uts-nexus-academico" "$DESTINO/uts-nexus-desktop"; do
    [ -x "$candidato" ] && BINARIO="$candidato" && break
  done
  [ -n "$BINARIO" ] || error "La compilación no generó el ejecutable."
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
echo " Paquetes (para instalar en otro equipo):"
echo "   $DESTINO/bundle/appimage/  (.AppImage — cualquier distribución)"
echo "   $DESTINO/bundle/deb/       (.deb — Debian, Ubuntu, Mint)"
echo "   $DESTINO/bundle/rpm/       (.rpm — Fedora, openSUSE, RHEL)"
echo

verde "[OK] Abriendo la aplicación... (la app arranca el backend por su cuenta)"
exec "$BINARIO"
