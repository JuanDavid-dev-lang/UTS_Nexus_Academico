#!/usr/bin/env node
/**
 * Las plataformas del producto, declaradas una sola vez.
 *
 * Antes esto no existía y se notaba de dos maneras. La primera: `subir-version`
 * y `comprobar-version` llevaban la misma lista de archivos copiada, y los dos
 * scripts advertían por escrito de que añadir uno a una y no a la otra rompe la
 * publicación —o la deja sin verificar— *después* de que alguien ya empujó la
 * etiqueta. Una advertencia repetida en dos sitios es la confesión de que el
 * dato tendría que estar en uno.
 *
 * La segunda: qué plataformas existen no estaba escrito en ningún lado. Se
 * deducía de los trabajos del workflow, de los `targets` de `tauri.conf.json` y
 * de una nota suelta sobre iOS al final de una guía. Con Windows y Android se
 * podía llevar en la cabeza; con Linux, y con macOS e iOS por delante, no.
 *
 * Aquí está todo: qué plataformas hay, cuáles se publican hoy, en qué formatos,
 * cómo se actualiza cada una, dónde declara su versión y —para las que aún no
 * salen— qué las bloquea exactamente.
 *
 *   node .github/scripts/plataformas.mjs          # la matriz, con la versión de cada una
 *   node .github/scripts/plataformas.mjs --json   # lo mismo para consumo del workflow
 *
 * Consumidores: `subir-version.mjs`, `comprobar-version.mjs` y
 * `componer-manifiesto.mjs`. Ninguno lleva ya lista propia.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Los dos clientes que declaran una versión, y dónde la declaran.
 *
 * Va aparte de las plataformas porque **un cliente sirve a varias**: el mismo
 * `desktop/` produce el instalador de Windows y los paquetes de Linux, así que
 * su versión se declara una vez y no una por sistema operativo. Modelarlo al
 * revés obligaría a deduplicar la lista de archivos en cada consumidor, que es
 * la copia que este archivo vino a quitar.
 *
 * Los patrones tienen tres grupos —lo de antes, la versión, lo de después— para
 * que `subir-version` pueda reescribir sin volver a analizar el archivo. Quien
 * solo quiera leerla usa el grupo 2.
 */
export const CLIENTES = {
  escritorio: {
    nombre: 'Escritorio (Tauri 2 + React 19)',
    directorio: 'desktop',
    versionEn: [
      ['desktop/package.json', /("version":\s*")([^"]+)(")/],
      ['desktop/src-tauri/tauri.conf.json', /("version":\s*")([^"]+)(")/],
      ['desktop/src-tauri/Cargo.toml', /^(version = ")([^"]+)(")/m],
    ],
    etapaEn: ['desktop/src/core/version.ts', /(ETAPA = ')([^']+)(')/],
  },
  movil: {
    nombre: 'Móvil (Flutter)',
    directorio: 'flutter_app',
    versionEn: [['flutter_app/pubspec.yaml', /^(version:\s*)([0-9]+\.[0-9]+\.[0-9]+)(\+\d+)/m]],
    etapaEn: ['flutter_app/lib/core/version.dart', /(etapa = ')([^']+)(')/],
    /**
     * El `versionCode` de Android sube SIEMPRE, aunque el número visible baje:
     * es lo que el sistema compara para dejar instalar el APK encima del
     * anterior. Bajarlo deja a los teléfonos ya instalados sin poder
     * actualizar, y sin ningún error que lo explique.
     */
    codigoDeVersionEn: ['flutter_app/pubspec.yaml', /^(version:\s*[^+]+\+)(\d+)()/m],
  },
};

/**
 * Un formato de distribución.
 *
 * `extension` es lo que permite a `componer-manifiesto` deducir la clave de un
 * asset por su nombre, sin depender de cómo bautice Tauri sus archivos en la
 * versión que toque. `clave` es la del manifiesto del actualizador, en el
 * formato `{os}-{arch}-{formato}` que busca `tauri-plugin-updater`; `alias` es
 * la clave corta `{os}-{arch}` a la que ese mismo plugin cae cuando no sabe en
 * qué formato está instalado. Solo un formato por sistema lleva `alias`, y es
 * el que funciona en más sitios.
 */

export const PLATAFORMAS = [
  {
    id: 'windows',
    nombre: 'Windows',
    estado: 'soportada',
    cliente: 'escritorio',
    arquitecturas: ['x86_64'],
    actualizacion: 'Actualizador de Tauri (firma minisign)',
    formatos: [
      {
        id: 'nsis',
        extension: '-setup.exe',
        clave: 'windows-x86_64-nsis',
        alias: 'windows-x86_64',
        etiqueta: 'Instalador (NSIS)',
      },
      { id: 'msi', extension: '.msi', clave: 'windows-x86_64-msi', etiqueta: 'Instalador (MSI)' },
    ],
  },
  {
    id: 'linux',
    nombre: 'Linux',
    estado: 'soportada',
    cliente: 'escritorio',
    arquitecturas: ['x86_64'],
    actualizacion: 'Actualizador de Tauri (firma minisign)',
    formatos: [
      {
        id: 'appimage',
        extension: '.AppImage',
        clave: 'linux-x86_64-appimage',
        // El alias va a la AppImage y no al .deb porque es el formato que corre
        // en cualquier distribución: si el actualizador no logra averiguar cómo
        // está instalada la aplicación, lo que le ofrezcamos tiene que
        // funcionar en el sitio donde esté.
        alias: 'linux-x86_64',
        etiqueta: 'AppImage (cualquier distribución)',
      },
      { id: 'deb', extension: '.deb', clave: 'linux-x86_64-deb', etiqueta: 'Debian, Ubuntu, Mint' },
      { id: 'rpm', extension: '.rpm', clave: 'linux-x86_64-rpm', etiqueta: 'Fedora, openSUSE, RHEL' },
    ],
  },
  {
    id: 'android',
    nombre: 'Android',
    estado: 'soportada',
    cliente: 'movil',
    arquitecturas: ['universal'],
    // No pasa por `latest.json`: el móvil consulta la API de Releases, descarga
    // el APK y se lo entrega al instalador del sistema. Por eso sus formatos no
    // llevan `clave`, y por eso el manifiesto no lo echa de menos.
    actualizacion: 'API de GitHub Releases + instalador de Android',
    formatos: [{ id: 'apk', extension: '.apk', etiqueta: 'APK firmado' }],
  },
  {
    id: 'macos',
    nombre: 'macOS',
    estado: 'planificada',
    cliente: 'escritorio',
    arquitecturas: ['aarch64', 'x86_64'],
    actualizacion: 'Actualizador de Tauri (firma minisign)',
    formatos: [
      { id: 'app', extension: '.app.tar.gz', clave: 'darwin-aarch64', etiqueta: 'Paquete de aplicación' },
      { id: 'dmg', extension: '.dmg', etiqueta: 'Imagen de disco' },
    ],
    bloqueo:
      'Compilar y firmar exige macOS con Xcode. El código del escritorio ya es portable; ' +
      'el trabajo pendiente es de máquina y de firma, no de reescritura.',
  },
  {
    id: 'ios',
    nombre: 'iOS',
    estado: 'planificada',
    cliente: 'movil',
    arquitecturas: ['aarch64'],
    // Distinta de las demás a propósito: en iOS no se instala nada fuera de la
    // tienda, así que el actualizador propio no se porta — se sustituye.
    actualizacion: 'App Store (el actualizador propio no aplica)',
    formatos: [{ id: 'ipa', extension: '.ipa', etiqueta: 'Paquete de App Store' }],
    bloqueo:
      'Falta la carpeta ios/ del proyecto Flutter, un Mac con Xcode para compilar y firmar, ' +
      'y el Apple Developer Program incluso para reparto interno.',
  },
];

// ── Consultas ───────────────────────────────────────────────────────────────

export const soportadas = () => PLATAFORMAS.filter(p => p.estado === 'soportada');

/** Los clientes que hoy se publican. Un cliente sin plataforma viva no cuenta. */
export const clientesActivos = () => [...new Set(soportadas().map(p => p.cliente))];

/**
 * Los archivos que declaran la versión, sin repetir.
 *
 * Windows y Linux comparten cliente, así que los tres archivos del escritorio
 * saldrían dos veces si no se deduplicara: `subir-version` los reescribiría dos
 * veces (inofensivo) y `comprobar-version` los listaría por duplicado en el
 * informe (confuso justo cuando algo va mal).
 */
export function archivosDeVersion() {
  const vistos = new Set();
  const salida = [];
  for (const cliente of clientesActivos()) {
    for (const [ruta, patron] of CLIENTES[cliente].versionEn) {
      if (vistos.has(ruta)) continue;
      vistos.add(ruta);
      salida.push([ruta, patron]);
    }
  }
  return salida;
}

/** Los archivos que declaran la etapa, que tienen que decir todos lo mismo. */
export const archivosDeEtapa = () => clientesActivos().map(c => CLIENTES[c].etapaEn);

/**
 * Las claves de `latest.json` que el actualizador puede pedir, por formato.
 *
 * Devuelve una entrada por clave —incluido el alias corto— para que
 * `componer-manifiesto` pueda comprobar que no falta ninguna. Una clave
 * ausente no da error en ningún sitio: el actualizador responde «ya tienes la
 * última versión» y lo sigue haciendo para siempre.
 */
export function clavesDeManifiesto() {
  const claves = [];
  for (const plataforma of soportadas()) {
    for (const formato of plataforma.formatos) {
      if (!formato.clave) continue;
      claves.push({ plataforma: plataforma.id, formato: formato.id, clave: formato.clave, extension: formato.extension });
      if (formato.alias) {
        claves.push({
          plataforma: plataforma.id,
          formato: formato.id,
          clave: formato.alias,
          extension: formato.extension,
          esAlias: true,
        });
      }
    }
  }
  return claves;
}

/**
 * Lee la versión declarada por un cliente, o `null` si no se encuentra.
 *
 * Devuelve `null` en vez de fallar porque quien la usa para *informar* —la
 * tabla de abajo— tiene que poder enseñar el hueco. Quien la usa para *decidir*
 * —`comprobar-version`— es el que convierte ese hueco en un fallo.
 */
export function versionDe(cliente, raiz = process.cwd()) {
  const [ruta, patron] = CLIENTES[cliente].versionEn[0];
  try {
    return readFileSync(join(raiz, ruta), 'utf8').match(patron)?.[2] ?? null;
  } catch {
    return null;
  }
}

// ── Informe ─────────────────────────────────────────────────────────────────

const verde = t => `\x1b[32m${t}\x1b[0m`;
const amarillo = t => `\x1b[33m${t}\x1b[0m`;
const tenue = t => `\x1b[2m${t}\x1b[0m`;
const negrita = t => `\x1b[1m${t}\x1b[0m`;

function imprimirMatriz() {
  console.log(`\n  ${negrita('Plataformas del producto')}\n`);

  for (const plataforma of PLATAFORMAS) {
    const publicada = plataforma.estado === 'soportada';
    const marca = publicada ? verde('●') : amarillo('○');
    const version = publicada ? (versionDe(plataforma.cliente) ?? '¿?') : '—';
    const estado = publicada ? 'soportada' : 'planificada';

    console.log(`  ${marca} ${negrita(plataforma.nombre.padEnd(10))} ${version.padEnd(10)} ${tenue(estado)}`);
    console.log(`    ${tenue('formatos    ')} ${plataforma.formatos.map(f => f.id).join(', ')}`);
    console.log(`    ${tenue('se actualiza')} ${plataforma.actualizacion}`);
    if (plataforma.bloqueo) console.log(`    ${tenue('bloqueo     ')} ${amarillo(plataforma.bloqueo)}`);
    console.log('');
  }

  const claves = clavesDeManifiesto().map(c => c.clave);
  console.log(`  ${tenue('Claves de latest.json:')} ${claves.join('  ')}\n`);
}

// Solo al ejecutarlo directamente; importarlo no imprime nada.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          plataformas: PLATAFORMAS.map(p => ({ ...p, version: p.estado === 'soportada' ? versionDe(p.cliente) : null })),
          claves: clavesDeManifiesto(),
        },
        // Los patrones son RegExp y no sobreviven a JSON.stringify; se omiten
        // porque el consumidor de --json es el workflow, que no reescribe
        // archivos.
        (clave, valor) => (valor instanceof RegExp ? undefined : valor),
        2,
      ),
    );
  } else {
    imprimirMatriz();
  }
}
