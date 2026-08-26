#!/usr/bin/env node
/**
 * Comprueba que todos los sitios donde vive la versión digan lo mismo, y de
 * paso resuelve la etiqueta de la etapa para que el workflow no la repita.
 *
 * Existe porque la guía pedía dos `grep` a ojo antes de publicar, y eso ya se
 * saltó una vez: `Cargo.toml` se quedó en 2.3.5 mientras el resto iba por
 * 2.5.0, así que durante dos publicaciones el ejecutable declaraba una versión
 * que no era la suya. No rompe la actualización —nadie mira ese número para
 * decidir—, pero convierte «¿qué versión tiene este equipo?» en una pregunta
 * sin respuesta fiable, que es justo lo que hace falta saber cuando algo falla
 * en una sala de cómputo.
 *
 * Corre en CI antes de compilar. Falla la publicación entera si algo no casa:
 * una release mal numerada no se puede corregir, solo se puede reemplazar.
 *
 *   node .github/scripts/comprobar-version.mjs            # solo coherencia
 *   node .github/scripts/comprobar-version.mjs v2.15.0    # y que case con la etiqueta
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();
const leer = ruta => readFileSync(join(raiz, ruta), 'utf8');

/** Saca el primer grupo de captura, o falla diciendo dónde miró. */
function extraer(ruta, patron) {
  const encontrado = leer(ruta).match(patron);
  if (!encontrado) throw new Error(`No encuentro la versión en ${ruta} (patrón ${patron}).`);
  return encontrado[1];
}

// Los cinco que deciden la publicación, más el `versionCode` de Android.
const fuentes = [
  ['desktop/package.json', /"version":\s*"([^"]+)"/],
  ['desktop/src-tauri/tauri.conf.json', /"version":\s*"([^"]+)"/],
  ['desktop/src-tauri/Cargo.toml', /^version = "([^"]+)"/m],
  ['flutter_app/pubspec.yaml', /^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\+\d+/m],
];

const versiones = fuentes.map(([ruta, patron]) => [ruta, extraer(ruta, patron)]);
const distintas = [...new Set(versiones.map(([, version]) => version))];

const problemas = [];

if (distintas.length > 1) {
  problemas.push(
    'Los archivos de versión no dicen lo mismo:\n' +
      versiones.map(([ruta, version]) => `    ${version.padEnd(10)} ${ruta}`).join('\n'),
  );
}

const version = versiones[0][1];

// El versionCode de Android tiene que crecer SIEMPRE, aunque el número visible
// baje: es lo que el sistema compara para dejar instalar el APK encima.
const versionCode = Number(extraer('flutter_app/pubspec.yaml', /^version:\s*[^+]+\+(\d+)/m));
if (!Number.isInteger(versionCode) || versionCode < 1) {
  problemas.push(`El versionCode de Android no es un entero válido: ${versionCode}`);
}

// La etapa: dos archivos que tienen que coincidir. El nombre de la release lo
// deriva el workflow de aquí, así que ya no hay un tercer sitio que actualizar.
const etapaEscritorio = extraer('desktop/src/core/version.ts', /ETAPA = '([^']+)'/);
const etapaMovil = extraer('flutter_app/lib/core/version.dart', /etapa = '([^']+)'/);
if (etapaEscritorio !== etapaMovil) {
  problemas.push(
    `La etapa no coincide: escritorio dice "${etapaEscritorio}" y móvil "${etapaMovil}".`,
  );
}

const ETIQUETAS = {
  'pre-release': 'Pre-release',
  alfa: 'Alfa',
  beta: 'Beta',
  estable: '',
};
if (!(etapaEscritorio in ETIQUETAS)) {
  problemas.push(
    `Etapa desconocida: "${etapaEscritorio}". Las válidas son ${Object.keys(ETIQUETAS).join(', ')}.`,
  );
}

// Contra la etiqueta empujada, cuando la hay.
const etiqueta = process.argv[2];
if (etiqueta) {
  const esperada = etiqueta.replace(/^v/, '');
  if (esperada !== version) {
    problemas.push(
      `La etiqueta ${etiqueta} no coincide con los archivos, que dicen ${version}. ` +
        'Publicar así deja una release cuyo nombre miente sobre lo que instala.',
    );
  }
}

if (problemas.length > 0) {
  console.error('\n✖ La versión no está lista para publicar:\n');
  for (const problema of problemas) console.error(`  · ${problema}\n`);
  process.exit(1);
}

const etiquetaEtapa = ETIQUETAS[etapaEscritorio];
const nombre = etiquetaEtapa ? `${etiquetaEtapa} ${version}` : version;

console.log(`✓ Versión coherente: ${nombre}  ·  versionCode ${versionCode}`);

// Para el workflow: el nombre de la release sale de aquí y no de una cadena
// escrita a mano en el YAML, que era el tercer sitio que había que acordarse
// de cambiar al pasar de etapa.
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\netapa=${etapaEscritorio}\netiqueta=${etiquetaEtapa}\nnombre=${nombre}\n`,
  );
}
