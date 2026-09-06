/**
 * Mete las credenciales del puente con UniPlanner en `backend/.env`.
 *
 * Existe por una razón concreta: la clave privada de una cuenta de servicio
 * lleva saltos de línea, y en un `.env` tienen que ir **escapados como `\n` y
 * entre comillas**. Pegarla a mano del JSON es el error habitual —lo dice el
 * propio `.env.example` y lo repite el comentario de `shared/push.ts`— y su
 * síntoma no es un fallo al arrancar: es una firma que Google rechaza, un log
 * que nadie mira y un canal que no manda nada.
 *
 * No imprime la clave. Solo dice qué escribió y en qué archivo.
 *
 * Uso:  node configurar-uniplanner.mjs ~/Descargas/uniplanner-xxxx.json
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const envPath = join(aqui, '.env');
const ejemploPath = join(aqui, '.env.example');

const RESET = '\x1b[0m';
const color = (c, t) => `\x1b[${c}m${t}${RESET}`;
const rojo = (t) => color(31, t);
const verde = (t) => color(32, t);
const gris = (t) => color(90, t);

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.log(`
  ${rojo('Falta el archivo JSON de la cuenta de servicio.')}

  Uso:  node configurar-uniplanner.mjs <ruta-al-json>

  El JSON se descarga del proyecto de UniPlanner en Google Cloud:
  IAM y administración › Cuentas de servicio › Claves › Agregar clave.
`);
  process.exit(1);
}

let credenciales;
try {
  credenciales = JSON.parse(readFileSync(resolve(jsonPath), 'utf8'));
} catch (err) {
  console.log(`\n  ${rojo('No se pudo leer el JSON:')} ${err.message}\n`);
  process.exit(1);
}

const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = credenciales;

const faltan = [
  !projectId && 'project_id',
  !clientEmail && 'client_email',
  !privateKey && 'private_key',
].filter(Boolean);

if (faltan.length > 0) {
  console.log(`
  ${rojo(`Al JSON le faltan campos: ${faltan.join(', ')}`)}

  ¿Es una clave de cuenta de servicio? Un archivo de configuración de app web
  de Firebase se parece pero no sirve: no lleva clave privada.
`);
  process.exit(1);
}

if (!privateKey.includes('BEGIN PRIVATE KEY')) {
  console.log(`\n  ${rojo('El campo private_key no parece una clave privada.')}\n`);
  process.exit(1);
}

// Aviso, no error: puede ser deliberado apuntar a otro proyecto.
if (!/uniplanner/i.test(projectId)) {
  console.log(
    `\n  ${gris(`Aviso: el proyecto es «${projectId}», que no parece el de UniPlanner.`)}`,
  );
}

if (!existsSync(envPath)) {
  if (!existsSync(ejemploPath)) {
    console.log(`\n  ${rojo('No existe backend/.env ni backend/.env.example.')}\n`);
    process.exit(1);
  }
  copyFileSync(ejemploPath, envPath);
  console.log(`\n  ${gris('No existía backend/.env: se creó desde .env.example.')}`);
}

const original = readFileSync(envPath, 'utf8');

/** Escribe (o reemplaza) una variable conservando el resto del archivo. */
function establecer(texto, clave, valor) {
  const linea = `${clave}=${valor}`;
  const patron = new RegExp(`^${clave}=.*$`, 'm');
  return patron.test(texto) ? texto.replace(patron, linea) : `${texto.trimEnd()}\n${linea}\n`;
}

let actualizado = original;
actualizado = establecer(actualizado, 'UNIPLANNER_PROJECT_ID', projectId);
actualizado = establecer(actualizado, 'UNIPLANNER_CLIENT_EMAIL', clientEmail);
// Los saltos reales pasan a `\n` literales y todo va entre comillas: es lo que
// `shared/env.ts` espera y lo que dotenv sabe leer en una sola línea.
actualizado = establecer(
  actualizado,
  'UNIPLANNER_PRIVATE_KEY',
  `"${privateKey.replace(/\n/g, '\\n')}"`,
);

writeFileSync(envPath, actualizado);
try {
  chmodSync(envPath, 0o600);
} catch {
  // En Windows no aplica; no es motivo para fallar.
}

console.log(`
  ${verde('Listo.')} Se escribieron tres variables en backend/.env:

    UNIPLANNER_PROJECT_ID    ${projectId}
    UNIPLANNER_CLIENT_EMAIL  ${clientEmail}
    UNIPLANNER_PRIVATE_KEY   ${gris(`(${privateKey.length} caracteres, no se imprime)`)}

  ${gris('La clave de cada universidad NO va aquí: sale de su perfil')}
  ${gris('institucional en la base. Ver docs/UNIPLANNER.md.')}

  Ahora:  npm run check:env   y reinicia el backend.
  Borra el JSON descargado cuando termines: es una credencial.
`);
