#!/usr/bin/env node
/**
 * Sube la versión en todos los sitios donde vive, de una vez.
 *
 * Ya existía `comprobar-version.mjs`, que **detecta** que los archivos no dicen
 * lo mismo. Este es la otra mitad: el que hace que no lleguen a divergir. Sin
 * él, publicar era editar seis archivos a mano y acordarse de dos ficheros de
 * bloqueo, y el historial dice cómo acaba eso — `Cargo.toml` se quedó en 2.3.5
 * mientras el resto iba por 2.5.0 durante dos publicaciones, y hay un commit
 * entero dedicado a «sincronizar package-lock.json y Cargo.lock».
 *
 * Qué archivos toca **no se decide aquí**: sale de `plataformas.mjs`, que es el
 * registro de plataformas del producto. Antes esta lista vivía copiada aquí y
 * en `comprobar-version.mjs`, y los dos avisaban por escrito de que añadir un
 * archivo a una y no a la otra rompe la publicación. Ahora hay un solo sitio,
 * así que no hay nada que sincronizar.
 *
 * Un número de versión mal puesto no rompe nada visiblemente: la aplicación
 * arranca igual. Lo que rompe es la única pregunta que importa cuando algo
 * falla en una sala de cómputo —«¿qué versión tiene este equipo?»— y para
 * entonces ya no se puede corregir, porque una release publicada no se edita.
 *
 *   node .github/scripts/subir-version.mjs patch     # 1.0.0 → 1.0.1
 *   node .github/scripts/subir-version.mjs minor     # 1.0.0 → 1.1.0
 *   node .github/scripts/subir-version.mjs major     # 1.0.0 → 2.0.0
 *   node .github/scripts/subir-version.mjs 1.4.2     # a un número concreto
 *   node .github/scripts/subir-version.mjs --check   # ¿está todo alineado?
 *
 * El `versionCode` de Android **siempre sube**, aunque el número visible baje:
 * es lo que compara el sistema para dejar instalar el APK encima del anterior.
 * Bajarlo deja a los teléfonos ya instalados sin poder actualizar, sin ningún
 * error que lo explique.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { archivosDeVersion, CLIENTES } from './plataformas.mjs';

const raiz = process.cwd();
const ruta = archivo => join(raiz, archivo);
const leer = archivo => readFileSync(ruta(archivo), 'utf8');

/**
 * Archivos que declaran la versión, con el patrón que la encuentra.
 *
 * Sale del registro de plataformas, ya deduplicado: Windows y Linux comparten
 * el cliente de escritorio, así que sus tres archivos son los mismos tres.
 */
const ARCHIVOS = archivosDeVersion();

/** Dónde vive el `versionCode` de Android, y qué patrón lo encuentra. */
const [CODIGO_ARCHIVO, CODIGO_PATRON] = CLIENTES.movil.codigoDeVersionEn;

const rojo = t => `\x1b[31m${t}\x1b[0m`;
const verde = t => `\x1b[32m${t}\x1b[0m`;
const tenue = t => `\x1b[2m${t}\x1b[0m`;

function extraer(archivo, patron) {
  const encontrado = leer(archivo).match(patron);
  if (!encontrado) {
    console.error(rojo(`\n  No encuentro la versión en ${archivo}.\n`));
    process.exit(1);
  }
  return encontrado[2];
}

function versionActual() {
  const valores = ARCHIVOS.map(([archivo, patron]) => [archivo, extraer(archivo, patron)]);
  const distintas = [...new Set(valores.map(([, v]) => v))];
  return { valores, distintas };
}

function siguiente(actual, salto) {
  if (/^\d+\.\d+\.\d+$/.test(salto)) return salto;
  const [mayor, menor, parche] = actual.split('.').map(Number);
  if (salto === 'major') return `${mayor + 1}.0.0`;
  if (salto === 'minor') return `${mayor}.${menor + 1}.0`;
  if (salto === 'patch') return `${mayor}.${menor}.${parche + 1}`;
  console.error(rojo(`\n  No entiendo «${salto}». Usa: patch | minor | major | X.Y.Z\n`));
  process.exit(1);
}

// ── --check ─────────────────────────────────────────────────────────────────
const argumento = process.argv[2];

if (!argumento || argumento === '--help' || argumento === '-h') {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].replace(/^\/\*\*|^ \* ?/gm, ''));
  process.exit(0);
}

if (argumento === '--check') {
  const { valores, distintas } = versionActual();
  console.log(`\n  \x1b[1mVersión declarada\x1b[0m\n`);
  for (const [archivo, version] of valores) {
    console.log(`  ${distintas.length === 1 ? verde('✓') : rojo('✗')} ${version.padEnd(10)} ${tenue(archivo)}`);
  }
  const codigo = leer(CODIGO_ARCHIVO).match(CODIGO_PATRON)?.[2];
  console.log(`  ${verde('✓')} ${String(codigo).padEnd(10)} ${tenue('versionCode de Android')}`);
  if (distintas.length > 1) {
    console.error(rojo('\n  Los archivos no dicen lo mismo. Corrige con:  node .github/scripts/subir-version.mjs <versión>\n'));
    process.exit(1);
  }
  console.log(verde('\n  Todo alineado.\n'));
  process.exit(0);
}

// ── Subida ──────────────────────────────────────────────────────────────────
const { valores, distintas } = versionActual();
if (distintas.length > 1) {
  console.error(rojo('\n  Los archivos de versión no dicen lo mismo. Alinéalos antes de subir:\n'));
  for (const [archivo, version] of valores) console.error(`    ${version.padEnd(10)} ${archivo}`);
  console.error('');
  process.exit(1);
}

const actual = distintas[0];
const nueva = siguiente(actual, argumento);

console.log(`\n  ${actual} → \x1b[1m${nueva}\x1b[0m\n`);

for (const [archivo, patron] of ARCHIVOS) {
  const contenido = leer(archivo);
  writeFileSync(ruta(archivo), contenido.replace(patron, (_, antes, __, despues) => `${antes}${nueva}${despues}`));
  console.log(`  ${verde('✓')} ${archivo}`);
}

// El versionCode sube SIEMPRE, sin mirar si la versión visible subió o bajó.
const pubspec = leer(CODIGO_ARCHIVO);
const codigoActual = Number(pubspec.match(CODIGO_PATRON)[2]);
writeFileSync(
  ruta(CODIGO_ARCHIVO),
  pubspec.replace(CODIGO_PATRON, (_, antes) => `${antes}${codigoActual + 1}`),
);
console.log(`  ${verde('✓')} versionCode de Android: ${codigoActual} → ${codigoActual + 1}`);

/**
 * Ficheros de bloqueo.
 *
 * Van aquí y no en un paso manual porque son exactamente lo que se olvida: no
 * los edita nadie a mano, así que no están en la lista mental de «archivos de
 * versión», y su desajuste no da error hasta que CI compila.
 */
const bloqueos = [
  ['package-lock.json de escritorio', 'npm', ['install', '--package-lock-only', '--ignore-scripts'], 'desktop'],
  ['Cargo.lock', 'cargo', ['update', '--workspace', '--offline'], 'desktop/src-tauri'],
];

for (const [nombre, orden, argumentos, directorio] of bloqueos) {
  try {
    execFileSync(orden, argumentos, { cwd: ruta(directorio), stdio: 'pipe' });
    console.log(`  ${verde('✓')} ${nombre}`);
  } catch {
    // No es fatal: `cargo` puede no estar instalado en la máquina de quien
    // sube la versión. Se avisa para que no se descubra en CI.
    console.log(`  ${rojo('!')} ${nombre} ${tenue('no se pudo regenerar — hazlo antes de etiquetar')}`);
  }
}

console.log(`
  Falta:
    · Describir el cambio en el CHANGELOG, si lo hay.
    · Revisar la etapa en desktop/src/core/version.ts y flutter_app/lib/core/version.dart.
    · git commit && git tag v${nueva} && git push --tags

  Comprueba antes:  node .github/scripts/comprobar-version.mjs v${nueva}
`);
