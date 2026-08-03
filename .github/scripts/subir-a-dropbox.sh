#!/usr/bin/env bash
#
# Sobrescribe en Dropbox el archivo al que apunta un enlace compartido.
#
#   subir-a-dropbox.sh <archivo-local> <enlace-compartido>
#
# Por qué sobrescribir y no subir un archivo nuevo: los botones de la página de
# descargas (repositorio `utsnexus.github.io`) llevan escrito un enlace concreto
# de Dropbox. Un enlace de Dropbox apunta a un archivo, no a "la última
# versión", así que subir el instalador nuevo al lado dejaría la página
# repartiendo la versión vieja hasta que alguien editara el HTML a mano. Al
# escribir encima del mismo archivo, el enlace no cambia y lo que entrega es lo
# recién compilado.
#
# El precio de esa decisión: el NOMBRE del archivo se queda con el de la primera
# subida (`…2.3.2…`) aunque dentro vaya la 2.4.0. Cambiarlo obliga a crear otro
# archivo, sacar su enlace y actualizarlo en la página y en el workflow.
#
# La ruta dentro de Dropbox no se escribe aquí: se le pregunta a la API por el
# propio enlace. Así no hay una ruta copiada a mano que se desincronice el día
# que alguien mueva la carpeta —si el archivo se movió, el enlace lo sigue.
#
# Variables necesarias (secretos del repositorio):
#   DROPBOX_APP_KEY / DROPBOX_APP_SECRET   de la app creada en developers.dropbox.com
#   DROPBOX_REFRESH_TOKEN                  token de refresco de la cuenta dueña
#
# Los tokens de acceso de Dropbox caducan a las cuatro horas, así que guardar
# uno como secreto no sirve: se pide uno nuevo en cada ejecución con el de
# refresco, que no caduca.
set -euo pipefail

archivo="${1:?Falta el archivo local}"
enlace="${2:?Falta el enlace compartido de Dropbox}"

# Sin credenciales se avisa y se sale bien.
#
# La release ya está publicada cuando esto corre. Tumbar el trabajo porque
# todavía nadie ha configurado Dropbox marcaría en rojo una publicación que
# salió perfecta, y a la tercera vez nadie mira los rojos. Con credenciales
# puestas sí se falla: ahí un error significa que algo se rompió.
faltan=''
for variable in DROPBOX_APP_KEY DROPBOX_APP_SECRET DROPBOX_REFRESH_TOKEN; do
  [ -z "${!variable:-}" ] && faltan="$faltan $variable"
done
if [ -n "$faltan" ]; then
  echo "::warning::Dropbox sin configurar (falta:$faltan). La release está publicada, pero la página de descargas sigue repartiendo el archivo anterior."
  exit 0
fi

if [ ! -f "$archivo" ]; then
  echo "::error::No existe el archivo $archivo"
  exit 1
fi

# `files/upload` de un solo golpe admite hasta 150 MB. Pasado ese tamaño hay que
# partirlo en una sesión de subida; se avisa aquí en vez de dejar que la API
# devuelva un error que no explica nada.
bytes=$(wc -c < "$archivo" | tr -d ' ')
if [ "$bytes" -gt 150000000 ]; then
  echo "::error::$archivo pesa $bytes bytes; por encima de 150 MB hay que usar upload_session."
  exit 1
fi

echo "Renovando el token de acceso de Dropbox…"
token=$(curl -sS --fail-with-body \
  -u "$DROPBOX_APP_KEY:$DROPBOX_APP_SECRET" \
  -d grant_type=refresh_token \
  -d "refresh_token=$DROPBOX_REFRESH_TOKEN" \
  https://api.dropbox.com/oauth2/token | jq -r '.access_token // empty')

if [ -z "$token" ]; then
  echo "::error::Dropbox no devolvió un token de acceso. Revisá la app y el token de refresco."
  exit 1
fi

echo "Resolviendo a qué archivo apunta el enlace…"
metadatos=$(curl -sS --fail-with-body \
  -X POST https://api.dropboxapi.com/2/sharing/get_shared_link_metadata \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg url "$enlace" '{url: $url}')")

ruta=$(printf '%s' "$metadatos" | jq -r '.path_lower // empty')
if [ -z "$ruta" ]; then
  # Sin `path_lower` el enlace no es de esta cuenta: se puede leer, pero no
  # escribir encima. Subir a una ruta inventada dejaría la página apuntando al
  # archivo viejo sin que nadie se enterara.
  echo "::error::El enlace no pertenece a esta cuenta de Dropbox; no se puede sobrescribir."
  printf '%s\n' "$metadatos"
  exit 1
fi

echo "Subiendo $(basename "$archivo") ($bytes bytes) sobre $ruta…"
# `--ascii-output`: la cabecera Dropbox-API-Arg tiene que ir en ASCII, y la ruta
# lleva tildes ("Académico"). Sin esto Dropbox responde 400 por la cabecera.
argumentos=$(jq -nca --arg ruta "$ruta" \
  '{path: $ruta, mode: "overwrite", autorename: false, mute: true}')

resultado=$(curl -sS --fail-with-body \
  -X POST https://content.dropboxapi.com/2/files/upload \
  -H "Authorization: Bearer $token" \
  -H "Dropbox-API-Arg: $argumentos" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @"$archivo")

printf 'Listo: %s (rev %s)\n' \
  "$(printf '%s' "$resultado" | jq -r '.path_display')" \
  "$(printf '%s' "$resultado" | jq -r '.rev')"
