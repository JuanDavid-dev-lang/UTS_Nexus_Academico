#!/usr/bin/env node
/**
 * Compone el `latest.json` que consulta el actualizador de escritorio.
 *
 * Lo hacía `tauri-action` con `includeUpdaterJson`, y con una sola plataforma
 * funcionaba. Con dos deja de funcionar, y de la peor manera: **`tauri-action`
 * no fusiona un manifiesto que ya exista** — borra el asset y sube el suyo,
 * construido solo con lo que compiló ese trabajo. Windows y Linux compilan en
 * trabajos distintos, así que el segundo en terminar dejaría al primero sin
 * actualizaciones.
 *
 * Y ese fallo no se ve. El manifiesto existe, la release está completa, los
 * instaladores están ahí. Lo único que pasa es que a la mitad de los equipos el
 * botón de actualizar les responde «ya tienes la última versión», y lo seguirá
 * haciendo en la siguiente publicación, y en la siguiente. Nadie abre un
 * `latest.json` a mirar qué claves trae.
 *
 * Por eso el manifiesto tiene un dueño: este script. Lee los assets ya
 * publicados en la release, empareja cada archivo con su `.sig`, deduce la
 * clave por la extensión —según el registro de `plataformas.mjs`— y **falla si
 * falta alguna**.
 *
 *   node .github/scripts/componer-manifiesto.mjs \
 *     --version 1.0.4 --assets assets.json --salida latest.json
 *
 *   node .github/scripts/componer-manifiesto.mjs --autoprueba
 *
 * `assets.json` es lo que devuelve `gh api .../releases/tags/vX` en su campo
 * `assets`: objetos con `name` y `browser_download_url`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { clavesDeManifiesto } from './plataformas.mjs';

const rojo = t => `\x1b[31m${t}\x1b[0m`;
const verde = t => `\x1b[32m${t}\x1b[0m`;
const tenue = t => `\x1b[2m${t}\x1b[0m`;

/**
 * El asset que corresponde a una extensión.
 *
 * Se descartan los `.sig` **antes** de comparar: `algo.AppImage.sig` termina en
 * `.sig`, no en `.AppImage`, así que el orden no cambia el resultado — pero
 * dejarlo explícito evita que un formato futuro cuya extensión acabe en `.sig`
 * (no existe hoy, y no es motivo para confiar en que no exista mañana) se cuele
 * como si fuera el paquete.
 */
function assetPara(assets, extension) {
  return assets.find(asset => !asset.name.endsWith('.sig') && asset.name.endsWith(extension));
}

/**
 * Arma el manifiesto. Puro: no descarga nada ni toca el disco.
 *
 * Las firmas llegan ya resueltas en `firmas` (nombre del asset → contenido del
 * `.sig`) para que la autoprueba pueda ejercitar todo el emparejamiento sin
 * red. Lo que se equivoca aquí no es la descarga, es qué clave lleva cada
 * archivo.
 */
export function componer({ version, notas = '', fecha, assets, firmas }) {
  const plataformas = {};
  const faltantes = [];
  const encontrados = [];

  for (const declarada of clavesDeManifiesto()) {
    const asset = assetPara(assets, declarada.extension);

    if (!asset) {
      // El alias no se reclama por su cuenta: comparte archivo con su formato,
      // así que si falta, ya lo denunció la clave larga. Contarlo dos veces
      // convertiría un paquete ausente en dos errores.
      if (!declarada.esAlias) faltantes.push(`${declarada.clave} (ningún asset termina en ${declarada.extension})`);
      continue;
    }

    const firma = firmas.get(`${asset.name}.sig`);
    if (!firma) {
      if (!declarada.esAlias) faltantes.push(`${declarada.clave} (${asset.name} está sin firmar)`);
      continue;
    }

    plataformas[declarada.clave] = { signature: firma.trim(), url: asset.browser_download_url };
    if (!declarada.esAlias) encontrados.push(`${declarada.clave} → ${asset.name}`);
  }

  return {
    manifiesto: {
      version,
      notes: notas,
      pub_date: fecha ?? new Date().toISOString(),
      platforms: plataformas,
    },
    faltantes,
    encontrados,
  };
}

// ── Autoprueba ──────────────────────────────────────────────────────────────

/**
 * La comprobación viaja dentro del script, como el `--check` de los otros dos.
 *
 * `.github/scripts/` no tiene carpeta de pruebas y no merece una cuarta —las
 * tres que hay viven junto al código que cubren, y este código no es de ningún
 * cliente—. Lo que se afirma aquí es lo que de verdad se puede romper sin que
 * se note: que cada extensión acabe en la clave que le toca.
 */
function autoprueba() {
  const fallos = [];
  const afirmar = (condicion, mensaje) => {
    if (!condicion) fallos.push(mensaje);
  };

  const nombres = [
    'UTS Nexus Académico_1.0.4_x64-setup.exe',
    'UTS Nexus Académico_1.0.4_x64_en-US.msi',
    'UTS Nexus Academico_1.0.4_amd64.AppImage',
    'UTS Nexus Academico_1.0.4_amd64.deb',
    'UTS Nexus Academico-1.0.4-1.x86_64.rpm',
    'uts-nexus-academico-v1.0.4.apk',
    'latest.json',
  ];
  const assets = nombres.map(name => ({ name, browser_download_url: `https://ejemplo/${name}` }));
  const firmas = new Map(nombres.map(name => [`${name}.sig`, `firma-de-${name}\n`]));

  const { manifiesto, faltantes } = componer({
    version: '1.0.4',
    notas: 'Notas',
    fecha: '2026-09-06T00:00:00Z',
    assets,
    firmas,
  });

  afirmar(faltantes.length === 0, `No debería faltar nada y faltan: ${faltantes.join(', ')}`);

  const esperadas = {
    'windows-x86_64-nsis': 'x64-setup.exe',
    'windows-x86_64': 'x64-setup.exe',
    'windows-x86_64-msi': 'en-US.msi',
    'linux-x86_64-appimage': 'amd64.AppImage',
    'linux-x86_64': 'amd64.AppImage',
    'linux-x86_64-deb': 'amd64.deb',
    'linux-x86_64-rpm': 'x86_64.rpm',
  };
  for (const [clave, sufijo] of Object.entries(esperadas)) {
    const entrada = manifiesto.platforms[clave];
    afirmar(Boolean(entrada), `Falta la clave ${clave}.`);
    afirmar(entrada?.url.endsWith(sufijo), `${clave} debería apuntar a ...${sufijo} y apunta a ${entrada?.url}.`);
    afirmar(entrada?.signature.startsWith('firma-de-'), `${clave} no lleva la firma de su archivo.`);
    // Una firma con el salto de línea final rompe la verificación de minisign:
    // el actualizador compara la cadena tal cual llega.
    afirmar(!/\s$/.test(entrada?.signature ?? 'x'), `${clave} lleva espacio en blanco al final de la firma.`);
  }

  // El APK no entra: el móvil no consulta el manifiesto, consulta la API de
  // Releases. Si algún día se colara aquí, sería una clave que nadie lee.
  afirmar(
    !Object.values(manifiesto.platforms).some(entrada => entrada.url.endsWith('.apk')),
    'El APK no debe aparecer en el manifiesto.',
  );

  // Un instalador sin su `.sig` tiene que denunciarse, no publicarse a medias:
  // el actualizador rechaza una entrada sin firma válida, así que colarla
  // equivale a no tenerla, pero sin aviso.
  const sinFirmaLinux = new Map([...firmas].filter(([nombre]) => !nombre.includes('.deb')));
  const parcial = componer({ version: '1.0.4', assets, firmas: sinFirmaLinux, fecha: 'x' });
  afirmar(
    parcial.faltantes.some(f => f.startsWith('linux-x86_64-deb')),
    'Un .deb sin firma tiene que salir en la lista de faltantes.',
  );
  afirmar(!('linux-x86_64-deb' in parcial.manifiesto.platforms), 'Un .deb sin firma no debe entrar al manifiesto.');

  // Y una plataforma entera ausente, igual.
  const sinLinux = assets.filter(a => !/\.(AppImage|deb|rpm)$/.test(a.name));
  const soloWindows = componer({ version: '1.0.4', assets: sinLinux, firmas, fecha: 'x' });
  afirmar(
    soloWindows.faltantes.length === 3,
    `Sin los tres paquetes de Linux deberían faltar 3 claves y faltan ${soloWindows.faltantes.length}.`,
  );

  if (fallos.length > 0) {
    console.error(rojo('\n✖ La autoprueba del manifiesto falló:\n'));
    for (const fallo of fallos) console.error(`  · ${fallo}`);
    console.error('');
    process.exit(1);
  }
  console.log(verde('✓ Autoprueba del manifiesto: emparejamiento y firmas correctos.'));
}

// ── Línea de órdenes ────────────────────────────────────────────────────────

function argumento(nombre) {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice === -1 ? undefined : process.argv[indice + 1];
}

async function principal() {
  if (process.argv.includes('--autoprueba')) return autoprueba();

  const version = argumento('version');
  const rutaAssets = argumento('assets');
  const salida = argumento('salida') ?? 'latest.json';
  const rutaNotas = argumento('notas-archivo');
  const fecha = argumento('fecha');
  const permitirFaltantes = process.argv.includes('--permitir-faltantes');

  if (!version || !rutaAssets) {
    console.error(rojo('\n  Faltan argumentos. Uso:\n'));
    console.error('    componer-manifiesto.mjs --version X.Y.Z --assets assets.json [--salida latest.json]');
    console.error('    componer-manifiesto.mjs --autoprueba\n');
    process.exit(1);
  }

  const assets = JSON.parse(readFileSync(rutaAssets, 'utf8'));
  const notas = rutaNotas ? readFileSync(rutaNotas, 'utf8') : '';

  // Las firmas se descargan de la propia release. Son públicas —el manifiesto
  // que las usa también lo es— así que no hace falta token.
  const firmas = new Map();
  for (const asset of assets) {
    if (!asset.name.endsWith('.sig')) continue;
    const respuesta = await fetch(asset.browser_download_url);
    if (!respuesta.ok) {
      console.error(rojo(`  No se pudo descargar ${asset.name}: HTTP ${respuesta.status}`));
      process.exit(1);
    }
    firmas.set(asset.name, await respuesta.text());
  }

  const { manifiesto, faltantes, encontrados } = componer({ version, notas, fecha, assets, firmas });

  console.log('');
  for (const linea of encontrados) console.log(`  ${verde('✓')} ${linea}`);
  for (const linea of faltantes) console.log(`  ${rojo('✗')} ${linea}`);

  if (faltantes.length > 0 && !permitirFaltantes) {
    console.error(
      rojo(
        '\n  El manifiesto está incompleto. Publicarlo así deja a quien tenga esos formatos\n' +
          '  instalados sin actualizaciones, sin ningún error que se lo diga: el botón le\n' +
          '  responderá «ya tienes la última versión» en esta publicación y en las siguientes.\n' +
          '  Si la publicación parcial es deliberada, repite con --permitir-faltantes.\n',
      ),
    );
    process.exit(1);
  }

  if (Object.keys(manifiesto.platforms).length === 0) {
    console.error(rojo('\n  El manifiesto no tiene ninguna plataforma. No se publica.\n'));
    process.exit(1);
  }

  writeFileSync(salida, `${JSON.stringify(manifiesto, null, 2)}\n`);
  console.log(`\n  ${verde('✓')} ${salida} ${tenue(`(${Object.keys(manifiesto.platforms).length} claves)`)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await principal();
}
