#!/usr/bin/env node
/**
 * Comprueba que todos los sitios donde vive la versión digan lo mismo, y de
 * paso resuelve la etiqueta de la etapa para que el workflow no la repita.
 *
 * Qué archivos son y qué plataformas hay sale de `plataformas.mjs`. Este script
 * no lleva lista propia: llevarla era tener la misma copiada en dos sitios que
 * podían discrepar.
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
import { archivosDeEtapa, archivosDeVersion, CLIENTES, clavesDeManifiesto, soportadas } from './plataformas.mjs';

const raiz = process.cwd();
const leer = ruta => readFileSync(join(raiz, ruta), 'utf8');

/**
 * Saca la versión, o falla diciendo dónde miró.
 *
 * Los patrones del registro tienen tres grupos —lo de antes, el valor, lo de
 * después— porque `subir-version` reescribe con ellos. Aquí solo se lee, así
 * que interesa el segundo.
 */
function extraer(ruta, patron) {
  const encontrado = leer(ruta).match(patron);
  if (!encontrado) throw new Error(`No encuentro la versión en ${ruta} (patrón ${patron}).`);
  return encontrado[2];
}

/**
 * Los archivos que deciden la publicación, sacados del registro de plataformas.
 *
 * Esta lista estuvo copiada aquí y en `subir-version.mjs`, y las dos avisaban
 * por escrito de que añadir un archivo a una y no a la otra deja el nuevo sin
 * verificar o hace fallar la publicación con la etiqueta ya empujada. Ahora hay
 * un solo sitio donde declararlo: `plataformas.mjs`.
 */
const fuentes = archivosDeVersion();

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
const versionCode = Number(extraer(...CLIENTES.movil.codigoDeVersionEn));
if (!Number.isInteger(versionCode) || versionCode < 1) {
  problemas.push(`El versionCode de Android no es un entero válido: ${versionCode}`);
}

// La etapa: un archivo por cliente activo, y todos tienen que decir lo mismo. El
// nombre de la release lo deriva el workflow de aquí, así que ya no hay un
// tercer sitio que actualizar. Sale del registro para que un cliente nuevo
// —macOS, iOS— entre en la comprobación sin tocar este archivo.
const etapas = archivosDeEtapa().map(([ruta, patron]) => [ruta, extraer(ruta, patron)]);
const etapaEscritorio = etapas[0][1];
if (new Set(etapas.map(([, etapa]) => etapa)).size > 1) {
  problemas.push(
    'La etapa no coincide entre clientes:\n' +
      etapas.map(([ruta, etapa]) => `    ${etapa.padEnd(12)} ${ruta}`).join('\n'),
  );
}

/**
 * Toda plataforma soportada que se actualice por `latest.json` tiene que
 * declarar sus claves.
 *
 * Sin clave, `componer-manifiesto` no sabe que esa plataforma existe y publica
 * un manifiesto sin ella. Eso no da error en ninguna parte: el actualizador de
 * quien la tenga instalada responde «ya tienes la última versión» y lo sigue
 * haciendo para siempre. Es exactamente la clase de fallo que no se ve en un
 * diff, así que se comprueba aquí, antes de compilar.
 */
const clavesDeclaradas = clavesDeManifiesto();
for (const plataforma of soportadas()) {
  if (!plataforma.actualizacion.includes('Tauri')) continue;
  const tiene = clavesDeclaradas.some(clave => clave.plataforma === plataforma.id);
  if (!tiene) {
    problemas.push(
      `${plataforma.nombre} se actualiza con el actualizador de Tauri pero no declara ninguna ` +
        'clave de latest.json en plataformas.mjs.',
    );
  }
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
console.log(
  `  Plataformas: ${soportadas()
    .map(p => `${p.nombre} (${p.formatos.map(f => f.id).join('/')})`)
    .join('  ·  ')}`,
);

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
