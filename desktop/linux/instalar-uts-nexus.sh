#!/usr/bin/env bash
# ==========================================================================
#  UTS Nexus Académico — Instalador y desinstalador para Linux
#
#  Para la AppImage. El `.deb` y el `.rpm` ya los instala el centro de
#  software del sistema, con su propia ventana; la AppImage no se instala en
#  ninguna parte, y ahí está el problema que resuelve este archivo: se
#  descarga, se queda en Descargas, hay que acordarse de darle permiso de
#  ejecución y no aparece en el menú de aplicaciones. Quien no vive en un
#  terminal la abre una vez y no vuelve a encontrarla.
#
#  Lo que hace, sin pedir la contraseña de administrador:
#
#    · si no encuentra la aplicación en el equipo, la descarga (la última
#      versión publicada, unos 80 MB)
#    · copia la AppImage a ~/.local/share/uts-nexus-academico/
#    · le da permiso de ejecución
#    · saca el icono de dentro de la propia AppImage
#    · escribe la entrada del menú (.desktop) con su StartupWMClass
#    · deja un enlace en ~/.local/bin para poder abrirla escribiendo su nombre
#
#  Todo en el directorio del usuario a propósito: instalar en /usr exige
#  contraseña, y una AppImage no la necesita para nada. Desinstalar es borrar
#  esos cuatro sitios, y este mismo archivo lo hace.
#
#  Uso:
#    ./instalar-uts-nexus.sh                 abre la ventana
#    ./instalar-uts-nexus.sh --instalar RUTA instala esa AppImage, sin preguntar
#    ./instalar-uts-nexus.sh --desinstalar   desinstala, sin preguntar
#    ./instalar-uts-nexus.sh --texto         fuerza el modo de terminal
# ==========================================================================
set -uo pipefail

APP_ID='uts-nexus-academico'
APP_NOMBRE='UTS Nexus Académico'
APP_COMENTARIO='Notas, asistencia y riesgo académico'

# `StartupWMClass` tiene que ser exactamente el nombre del binario: GTK toma el
# WM_CLASS de argv[0]. Si no coincide, GNOME y KDE no atan la ventana abierta a
# su lanzador — sale un segundo icono genérico en la barra y «anclar al panel»
# ancla el que no abre nada. Es el mismo valor que `uts-nexus.desktop.hbs`.
WM_CLASS='uts-nexus-academico'

DIR_APP="${XDG_DATA_HOME:-$HOME/.local/share}/$APP_ID"
DIR_LANZADORES="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DIR_ICONOS="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
DIR_BIN="$HOME/.local/bin"

DESTINO_APPIMAGE="$DIR_APP/$APP_ID.AppImage"
DESTINO_LANZADOR="$DIR_LANZADORES/$APP_ID.desktop"
DESTINO_ICONO="$DIR_ICONOS/$APP_ID.png"
DESTINO_ENLACE="$DIR_BIN/$APP_ID"

# Datos del usuario. NO se borran salvo que lo pida expresamente: desinstalar
# una aplicación y perder de paso la sesión y los ajustes es una sorpresa cara.
DIR_ESTADO="${XDG_STATE_HOME:-$HOME/.local/state}/$APP_ID"
DIR_DATOS_TAURI="${XDG_DATA_HOME:-$HOME/.local/share}/co.edu.uts.nexus.academico"
DIR_CONFIG_TAURI="${XDG_CONFIG_HOME:-$HOME/.config}/co.edu.uts.nexus.academico"

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Con qué se dibuja ─────────────────────────────────────────────────────
# zenity en GNOME y derivados, kdialog en KDE. Se elige el que haya, y si no
# hay ninguno se sigue por terminal en vez de fallar: un instalador que no
# arranca porque falta un paquete de diálogos es peor que uno con preguntas
# escritas.
IU='texto'
if [ "${1:-}" != '--texto' ]; then
  if command -v zenity >/dev/null 2>&1; then IU='zenity'
  elif command -v kdialog >/dev/null 2>&1; then IU='kdialog'
  fi
fi

# `printf %b` expande los «\n» del texto: zenity y kdialog los pintarían
# literales en medio de la frase. Se hace aquí, en un solo sitio, y no en cada
# llamada.
msg_info() {
  local t; t="$(printf '%b' "$1")"
  case "$IU" in
    zenity)  zenity --info --width=420 --title="$APP_NOMBRE" --text="$t" 2>/dev/null ;;
    kdialog) kdialog --title "$APP_NOMBRE" --msgbox "$t" 2>/dev/null ;;
    *)       printf '\n%s\n\n' "$t" ;;
  esac
}

msg_error() {
  local t; t="$(printf '%b' "$1")"
  case "$IU" in
    zenity)  zenity --error --width=420 --title="$APP_NOMBRE" --text="$t" 2>/dev/null ;;
    kdialog) kdialog --title "$APP_NOMBRE" --error "$t" 2>/dev/null ;;
    *)       printf '\n[error] %s\n\n' "$t" >&2 ;;
  esac
}

# Lee una línea del usuario y la deja en stdout.
#
# `< /dev/tty` a secas no vale: sin terminal de control —lanzado desde el
# gestor de archivos, o con la entrada redirigida— ese dispositivo no existe,
# `read` falla, y con `set -u` la variable sin asignar mata el script. Eso
# abortaba la desinstalación **después** de haber borrado la aplicación y antes
# de decir que había terminado.
leer_respuesta() {
  local aviso="$1" r=''
  printf '%s ' "$aviso" >&2
  # Se intenta abrir y NO se comprueba con `[ -r /dev/tty ]`: ese test da
  # verdadero en entornos donde abrirlo falla igualmente, y entonces el error
  # sale por pantalla y la respuesta se pierde — que es como una pregunta con
  # respuesta por defecto «no» se contesta sola.
  if ! read -r r < /dev/tty 2>/dev/null; then
    read -r r || true
  fi
  printf '%s' "$r"
}

# Devuelve 0 si el usuario dice que sí.
pregunta() {
  local t; t="$(printf '%b' "$1")"
  case "$IU" in
    zenity)  zenity --question --width=420 --title="$APP_NOMBRE" --text="$t" 2>/dev/null ;;
    kdialog) kdialog --title "$APP_NOMBRE" --yesno "$t" 2>/dev/null ;;
    *)
      local r; r="$(leer_respuesta "$t [s/N]")"
      [ "${r,,}" = 's' ] || [ "${r,,}" = 'si' ] || [ "${r,,}" = 'sí' ]
      ;;
  esac
}

# Escribe en stdout: instalar | desinstalar | reinstalar | cancelar
elegir_accion() {
  local instalado="$1" respuesta

  if [ "$instalado" = 'si' ]; then
    case "$IU" in
      zenity)
        # `$'…'` y no "…\n…": este `--text` no pasa por `pregunta()`, así que
        # el salto hay que darlo ya expandido o zenity pinta «\n» literal.
        respuesta=$(zenity --list --radiolist --width=460 --height=260 \
          --title="$APP_NOMBRE" \
          --text=$'Ya está instalado en este equipo.\n¿Qué querés hacer?' \
          --column='' --column='Acción' --column='Qué hace' \
          TRUE  'Reinstalar'   'Sustituye la aplicación por esta versión' \
          FALSE 'Desinstalar'  'La quita del menú y borra la aplicación' \
          --print-column=2 2>/dev/null)
        ;;
      kdialog)
        respuesta=$(kdialog --title "$APP_NOMBRE" --radiolist \
          'Ya está instalado. ¿Qué querés hacer?' \
          Reinstalar 'Sustituir por esta versión' on \
          Desinstalar 'Quitarlo del equipo' off 2>/dev/null)
        ;;
      *)
        printf 'Ya está instalado.\n  1) Reinstalar\n  2) Desinstalar\n  3) Cancelar\n' >&2
        respuesta="$(leer_respuesta 'Opción [1]:')"
        case "${respuesta:-1}" in 1) respuesta='Reinstalar';; 2) respuesta='Desinstalar';; *) respuesta='';; esac
        ;;
    esac
  else
    if pregunta "Se va a instalar $APP_NOMBRE para tu usuario.\n\nNo hace falta contraseña de administrador: todo va dentro de tu carpeta personal.\n\n¿Continuamos?"; then
      respuesta='Instalar'
    else
      respuesta=''
    fi
  fi

  case "$respuesta" in
    Instalar)    echo 'instalar' ;;
    Reinstalar)  echo 'reinstalar' ;;
    Desinstalar) echo 'desinstalar' ;;
    *)           echo 'cancelar' ;;
  esac
}

# ── Conseguir la AppImage ─────────────────────────────────────────────────
# Este archivo es lo que se descarga desde la página, así que tiene que poder
# traerse la aplicación él solo: pedirle a alguien que además busque y baje un
# segundo archivo de 80 MB es la mitad de un instalador.
#
# El orden es: lo que ya esté en el equipo, después la descarga, y el selector
# de archivos solo como último recurso. Al revés, quien ya la tiene descargada
# la bajaría otra vez.

REPO_RELEASES='JuanDavid-dev-lang/UTS_Nexus_Releases'
# Respaldo si la API de GitHub no responde: el archivo de Dropbox que el
# publicador de versiones sobrescribe en su sitio, el mismo que enlaza la
# página. No caduca al salir una versión nueva.
RESPALDO='https://www.dropbox.com/scl/fi/rdx81u2hlplteru4ixhq6/UTS-Nexus-Academico-Linux.AppImage?rlkey=32kwf13t7n6bbzw2f2roq208y&dl=1'

descargador() {
  if command -v curl >/dev/null 2>&1; then echo 'curl'
  elif command -v wget >/dev/null 2>&1; then echo 'wget'
  fi
}

# La dirección de la AppImage de la última versión publicada.
url_ultima_appimage() {
  local api="https://api.github.com/repos/$REPO_RELEASES/releases/latest" json=''
  case "$(descargador)" in
    curl) json="$(curl -fsSL --max-time 20 "$api" 2>/dev/null)" ;;
    wget) json="$(wget -qO- --timeout=20 "$api" 2>/dev/null)" ;;
  esac

  # `grep` y `sed` y no `jq`: jq no viene instalado de serie en ninguna de las
  # distribuciones a las que va esto, y no vale la pena pedirlo por un campo.
  local url
  url="$(printf '%s' "$json" |
         grep -o '"browser_download_url"[^,]*\.AppImage"' |
         head -1 | sed 's/.*"\(https[^"]*\)"$/\1/')"

  [ -n "$url" ] && echo "$url" || echo "$RESPALDO"
}

descargar_appimage() {
  local destino="$1" url
  url="$(url_ultima_appimage)"

  case "$(descargador)" in
    curl) curl -fL --retry 2 --connect-timeout 20 -o "$destino" "$url" >/dev/null 2>&1 ;;
    wget) wget -q --tries=3 --timeout=20 -O "$destino" "$url" >/dev/null 2>&1 ;;
    *)    return 1 ;;
  esac
}

# Descarga con una barra que late. No se puede dar el porcentaje sin analizar
# la salida de curl, y una barra parada durante ochenta megas se lee como que
# el instalador se colgó.
descargar_con_ventana() {
  local destino="$1"

  if [ "$IU" = 'zenity' ]; then
    local marca; marca="$(mktemp)"
    ( descargar_appimage "$destino"; echo "$?" > "$marca" ) |
      zenity --progress --pulsate --auto-close --no-cancel --width=420 \
             --title="$APP_NOMBRE" --text='Descargando la aplicación (unos 80 MB)…' 2>/dev/null
    local estado; estado="$(cat "$marca" 2>/dev/null)"
    rm -f "$marca"
    [ "${estado:-1}" = '0' ]
  else
    printf 'Descargando la aplicación (unos 80 MB)…\n' >&2
    descargar_appimage "$destino"
  fi
}

conseguir_appimage() {
  local candidato
  for candidato in "$AQUI"/*.AppImage "$HOME"/Descargas/*UTS*.AppImage \
                   "$HOME"/Downloads/*UTS*.AppImage; do
    [ -f "$candidato" ] && { echo "$candidato"; return 0; }
  done

  if [ -n "$(descargador)" ] &&
     pregunta 'No encontré la aplicación en este equipo.\n\n¿La descargo ahora? Son unos 80 MB y se baja la última versión publicada.'; then
    local temporal="${TMPDIR:-/tmp}/$APP_ID-descarga.AppImage"
    if descargar_con_ventana "$temporal" && [ -s "$temporal" ]; then
      echo "$temporal"
      return 0
    fi
    rm -f "$temporal"
    msg_error 'No se pudo descargar. Comprobá tu conexión, o descargá la AppImage a mano y volvé a abrir este instalador.'
    return 1
  fi

  case "$IU" in
    zenity)
      candidato=$(zenity --file-selection --title='Elegí la AppImage descargada' \
        --file-filter='AppImage | *.AppImage' 2>/dev/null) || return 1
      ;;
    kdialog)
      candidato=$(kdialog --title 'Elegí la AppImage descargada' \
        --getopenfilename "$HOME" '*.AppImage' 2>/dev/null) || return 1
      ;;
    *)
      candidato="$(leer_respuesta 'Ruta de la AppImage:')"
      ;;
  esac

  [ -f "$candidato" ] && echo "$candidato"
}

# ── Icono ─────────────────────────────────────────────────────────────────
# Se saca de dentro de la propia AppImage, no de un archivo aparte: así el
# icono es siempre el de la versión que se está instalando y no puede quedarse
# desfasado. Si falla no se aborta nada — la aplicación queda instalada con el
# icono genérico, que es un defecto de aspecto y no de funcionamiento.
extraer_icono() {
  local appimage="$1" temporal
  temporal="$(mktemp -d)" || return 1

  (
    cd "$temporal" || exit 1
    "$appimage" --appimage-extract '*.DirIcon' >/dev/null 2>&1 ||
      "$appimage" --appimage-extract >/dev/null 2>&1
  )

  local origen
  origen="$(find "$temporal/squashfs-root" -maxdepth 1 -name '.DirIcon' -type f 2>/dev/null | head -1)"
  if [ -z "$origen" ]; then
    origen="$(find "$temporal/squashfs-root" -path '*apps*' -name '*.png' -type f 2>/dev/null |
              sort -r | head -1)"
  fi

  if [ -n "$origen" ]; then
    install -Dm644 "$origen" "$DESTINO_ICONO" 2>/dev/null
  fi

  rm -rf "$temporal"
  [ -f "$DESTINO_ICONO" ]
}

escribir_lanzador() {
  mkdir -p "$DIR_LANZADORES"
  cat > "$DESTINO_LANZADOR" <<LANZADOR
[Desktop Entry]
Type=Application
Name=$APP_NOMBRE
Comment=$APP_COMENTARIO
Exec=$DESTINO_APPIMAGE
Icon=$APP_ID
Categories=Education;Office;
Terminal=false
StartupNotify=true
StartupWMClass=$WM_CLASS
Keywords=UTS;notas;calificaciones;asistencia;academico;académico;docente;universidad;
LANZADOR
  chmod 644 "$DESTINO_LANZADOR"
}

refrescar_menu() {
  command -v update-desktop-database >/dev/null 2>&1 &&
    update-desktop-database "$DIR_LANZADORES" >/dev/null 2>&1
  command -v gtk-update-icon-cache >/dev/null 2>&1 &&
    gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1
  return 0
}

# ── Instalar ──────────────────────────────────────────────────────────────
# El cuerpo escribe el avance en stdout con el formato de `zenity --progress`:
# un número suelto es el porcentaje y una línea con `#` delante es el texto.
# Así el mismo código sirve para la barra y para el terminal.
instalar_cuerpo() {
  local appimage="$1"

  echo '10' ; echo '# Copiando la aplicación…'
  mkdir -p "$DIR_APP" || { echo '# No se pudo crear la carpeta'; return 1; }
  install -m755 "$appimage" "$DESTINO_APPIMAGE" || return 1

  echo '45' ; echo '# Sacando el icono…'
  extraer_icono "$DESTINO_APPIMAGE" || true

  echo '70' ; echo '# Añadiéndola al menú…'
  escribir_lanzador || return 1

  echo '85' ; echo '# Dejando el atajo del terminal…'
  mkdir -p "$DIR_BIN"
  ln -sf "$DESTINO_APPIMAGE" "$DESTINO_ENLACE"

  echo '95' ; echo '# Refrescando el menú…'
  refrescar_menu

  echo '100'
}

instalar() {
  local appimage="$1"

  if [ ! -f "$appimage" ]; then
    msg_error "No encontré la AppImage:\n$appimage"
    return 1
  fi

  local salida estado
  if [ "$IU" = 'zenity' ]; then
    salida="$(mktemp)"
    ( instalar_cuerpo "$appimage"; echo "estado:$?" > "$salida" ) |
      zenity --progress --width=420 --auto-close --no-cancel \
             --title="$APP_NOMBRE" --text='Preparando…' 2>/dev/null
    estado="$(sed -n 's/^estado://p' "$salida")"
    rm -f "$salida"
  else
    instalar_cuerpo "$appimage" | sed -n 's/^# //p'
    estado="${PIPESTATUS[0]}"
  fi

  # La descarga temporal ya está copiada en su sitio: dejarla sería olvidar
  # ochenta megas en /tmp de alguien. Solo se borra la que bajó este script,
  # nunca un archivo que el usuario tuviera guardado.
  case "$appimage" in
    "${TMPDIR:-/tmp}/$APP_ID-descarga.AppImage") rm -f "$appimage" ;;
  esac

  if [ "${estado:-1}" != '0' ]; then
    msg_error 'No se pudo completar la instalación.'
    return 1
  fi

  # `~/.local/bin` no está en el PATH de todas las distribuciones. Se avisa en
  # vez de tocar el perfil del usuario: un instalador que edita .bashrc por su
  # cuenta es una sorpresa desagradable, y el atajo del terminal es un extra —
  # el menú ya funciona.
  local nota=''
  case ":$PATH:" in
    *":$DIR_BIN:"*) nota="\n\nDesde el terminal: $APP_ID" ;;
    *) nota="\n\nEl atajo de terminal quedó en $DESTINO_ENLACE, que no está en tu PATH. Para usarlo, añadí esa carpeta al PATH." ;;
  esac

  msg_info "Instalado.\n\nYa aparece en el menú de aplicaciones como «$APP_NOMBRE».$nota"
}

# ── Desinstalar ───────────────────────────────────────────────────────────
desinstalar() {
  if [ ! -e "$DESTINO_APPIMAGE" ] && [ ! -e "$DESTINO_LANZADOR" ]; then
    msg_info 'No está instalado en este equipo.'
    return 0
  fi

  rm -f "$DESTINO_LANZADOR" "$DESTINO_ICONO" "$DESTINO_ENLACE"
  rm -rf "$DIR_APP"
  refrescar_menu

  # Los datos van en una pregunta aparte y la respuesta por defecto es NO.
  # Aquí dentro está la sesión guardada y los ajustes; borrarlos «de paso» al
  # desinstalar para reinstalar una versión nueva obligaría a volver a entrar
  # sin que nadie lo hubiera pedido.
  local hay_datos='no'
  for d in "$DIR_ESTADO" "$DIR_DATOS_TAURI" "$DIR_CONFIG_TAURI"; do
    [ -e "$d" ] && hay_datos='si'
  done

  if [ "$hay_datos" = 'si' ] &&
     pregunta '¿Borrar también tus datos locales?\n\nSon la sesión guardada y los ajustes de la aplicación. Las notas y la asistencia están en el servidor y no se tocan.\n\nSi vas a reinstalar, respondé que no.'; then
    rm -rf "$DIR_ESTADO" "$DIR_DATOS_TAURI" "$DIR_CONFIG_TAURI"
  fi

  # La sesión también puede estar en el llavero del sistema (gnome-keyring,
  # KWallet). Un script no debería hurgar ahí, así que se dice en vez de
  # hacerlo a medias y en silencio.
  msg_info "Desinstalado.\n\nSi guardaste la sesión en el llavero del sistema, la entrada «$APP_ID» sigue ahí; se borra desde la aplicación de contraseñas del escritorio."
}

# ── Entrada ───────────────────────────────────────────────────────────────
case "${1:-}" in
  --desinstalar)
    desinstalar
    exit $?
    ;;
  --instalar)
    ruta="${2:-}"
    [ -z "$ruta" ] && { echo 'Falta la ruta de la AppImage.' >&2; exit 1; }
    instalar "$ruta"
    exit $?
    ;;
  --ayuda|-h|--help)
    sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

instalado='no'
[ -f "$DESTINO_APPIMAGE" ] && instalado='si'

case "$(elegir_accion "$instalado")" in
  instalar|reinstalar)
    appimage="$(conseguir_appimage)" || { msg_info 'Cancelado.'; exit 0; }
    [ -z "$appimage" ] && { msg_error 'No elegiste ningún archivo.'; exit 1; }
    instalar "$appimage"
    ;;
  desinstalar)
    desinstalar
    ;;
  *)
    exit 0
    ;;
esac
