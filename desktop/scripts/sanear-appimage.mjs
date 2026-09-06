#!/usr/bin/env node
/**
 * Quita de la AppImage las librerías que tienen que venir del sistema.
 *
 * # Por qué existe esto
 *
 * Una AppImage recién construida por Tauri **no arrancaba**: la ventana abría,
 * el marco se dibujaba y dentro no había nada. En el registro del sistema
 * quedaba un `WebKitWebProcess` abortando con
 *
 *     Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
 *
 * La causa no es la tarjeta gráfica —se reprodujo en una Intel integrada, sin
 * NVIDIA por ningún lado— ni ninguno de los conmutadores que suelen citarse
 * para esto: `WEBKIT_DISABLE_DMABUF_RENDERER`, `WEBKIT_DISABLE_COMPOSITING_MODE`
 * y `LIBGL_ALWAYS_SOFTWARE` se probaron los tres y ninguno cambió nada.
 *
 * La causa es que el empaquetador mete dentro `libwayland-client.so.0`. Esa
 * librería habla el protocolo del compositor que ya está corriendo en la
 * máquina, así que **tiene que ser la del sistema**. La AppImage se construye
 * en Ubuntu 22.04 (wayland 1.20) y al ejecutarse en un equipo con wayland 1.25
 * la suya tapa a la del host; el EGL de Mesa no puede inicializar la plataforma
 * wayland contra una biblioteca de cliente más vieja, devuelve
 * `EGL_BAD_PARAMETER`, y WebKit —que no tiene plan B— aborta.
 *
 * Se confirmó quitándola: con ella, ventana vacía; sin ella, la aplicación se
 * dibuja entera. Y no es una corazonada sobre qué quitar: `libwayland-client.so.0`
 * está en la **excludelist oficial de AppImage**, la lista de librerías que un
 * paquete portable no debe llevar nunca. Es la única de las 165 empaquetadas
 * que la incumple.
 *
 * # Qué hace
 *
 * Borra del AppDir las librerías de la lista de abajo y vuelve a empaquetar.
 * No descarga ninguna herramienta: reutiliza el *runtime* que la propia AppImage
 * ya trae delante del sistema de archivos comprimido, así que el resultado
 * arranca igual que el original y no se introduce una dependencia externa que
 * pueda cambiar bajo los pies de una publicación.
 *
 * Fuera de Linux, o si no hay ninguna AppImage construida, no hace nada.
 *
 *   node scripts/sanear-appimage.mjs
 *   node scripts/sanear-appimage.mjs --autoprueba
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(AQUI, '..', 'src-tauri', 'target', 'release', 'bundle', 'appimage');

/**
 * Librerías que no pueden viajar dentro de una AppImage.
 *
 * Es la intersección entre lo que el empaquetador de Tauri mete y la
 * **excludelist oficial de AppImage**. Hoy es una sola, y se comprueba en cada
 * ejecución: si mañana el empaquetador añadiera otra de la lista, se avisa en
 * vez de descubrirlo cuando alguien reporte una ventana en blanco.
 *
 * No se descarga la lista en tiempo de compilación a propósito. Una lista
 * remota convierte cada publicación en dependiente de que un repositorio ajeno
 * siga en pie y no haya cambiado; y lo que aquí importa no es tener las 52
 * entradas, es tener las que este empaquetador produce.
 */
const PROHIBIDAS = [
  // Habla el protocolo del compositor que ya corre en la máquina. Una versión
  // más vieja que la del sistema rompe la inicialización de EGL en Mesa y deja
  // la ventana en blanco. Es el fallo que originó este archivo.
  'libwayland-client.so.0',
];

/**
 * El resto de la excludelist oficial que este empaquetador **no** produce hoy.
 *
 * Están aquí para que, si algún día aparecieran en el AppDir, se detecten. No
 * se borran a ciegas: borrar una librería que la aplicación necesita de verdad
 * y que el sistema no tiene rompe el arranque de una forma peor que la que se
 * vino a arreglar. Ver `revisar()`.
 */
const VIGILADAS = [
  'libGL.so.1',
  'libEGL.so.1',
  'libGLdispatch.so.0',
  'libGLX.so.0',
  'libglapi.so.0',
  'libdrm.so.2',
  'libgbm.so.1',
  'libX11.so.6',
  'libxcb.so.1',
];

const rojo = t => `\x1b[31m${t}\x1b[0m`;
const verde = t => `\x1b[32m${t}\x1b[0m`;
const tenue = t => `\x1b[2m${t}\x1b[0m`;

/** El AppDir y la AppImage que dejó `tauri build`, o `null` si no hay. */
function localizarSalida() {
  if (!existsSync(BUNDLE)) return null;
  const entradas = readdirSync(BUNDLE);
  const appDir = entradas.find(nombre => nombre.endsWith('.AppDir'));
  const appImage = entradas.find(nombre => nombre.endsWith('.AppImage'));
  if (!appDir || !appImage) return null;
  return { appDir: join(BUNDLE, appDir), appImage: join(BUNDLE, appImage) };
}

/** Dónde empieza el sistema de archivos comprimido dentro de la AppImage. */
function desplazamientoDelRuntime(appImage) {
  const salida = execFileSync(appImage, ['--appimage-offset'], { encoding: 'utf8' });
  const bytes = Number(salida.trim());
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`La AppImage no devolvió un desplazamiento válido: «${salida.trim()}»`);
  }
  return bytes;
}

/** Copia los primeros `bytes` de la AppImage: es el runtime que la arranca. */
function extraerRuntime(appImage, bytes, destino) {
  const buffer = Buffer.alloc(bytes);
  const descriptor = openSync(appImage, 'r');
  try {
    const leidos = readSync(descriptor, buffer, 0, bytes, 0);
    if (leidos !== bytes) throw new Error(`Se esperaban ${bytes} bytes de runtime y se leyeron ${leidos}.`);
  } finally {
    closeSync(descriptor);
  }
  writeFileSync(destino, buffer);
}

/**
 * ¿Está `mksquashfs`?
 *
 * Se pregunta ejecutándolo y no mirando rutas fijas: vive en `/usr/bin` en
 * Debian y en `/usr/sbin` en Fedora, y una lista de rutas adivinadas convierte
 * «no lo encuentro» en un fallo de compilación falso justo después de diez
 * minutos compilando.
 */
function hayMksquashfs() {
  try {
    execFileSync('mksquashfs', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Las prohibidas presentes, y el aviso de las vigiladas que aparecieran. */
function revisar(appDir) {
  const lib = join(appDir, 'usr', 'lib');
  if (!existsSync(lib)) return { aBorrar: [], aVigilar: [] };
  const presentes = new Set(readdirSync(lib));
  return {
    aBorrar: PROHIBIDAS.filter(nombre => presentes.has(nombre)),
    aVigilar: VIGILADAS.filter(nombre => presentes.has(nombre)),
  };
}

function principal() {
  if (process.platform !== 'linux') return;

  const salida = localizarSalida();
  if (!salida) return;

  const { aBorrar, aVigilar } = revisar(salida.appDir);

  if (aVigilar.length > 0) {
    // No se borran solas: quitar una librería que la aplicación necesita y el
    // sistema no tiene rompe el arranque peor que el fallo original. Se avisa
    // para que alguien decida mirando.
    console.log(
      rojo(
        `\n  Aviso: el empaquetador metió librerías de la excludelist que antes no metía:\n` +
          aVigilar.map(n => `    · ${n}`).join('\n') +
          '\n  Revisa si hay que añadirlas a PROHIBIDAS en scripts/sanear-appimage.mjs.\n',
      ),
    );
  }

  if (aBorrar.length === 0) {
    console.log(tenue('  AppImage: nada que sanear.'));
    return;
  }

  if (!hayMksquashfs()) {
    // Se falla en vez de dejar pasar la AppImage sin sanear. Publicar una que
    // abre en blanco es peor que no publicar ninguna, y el síntoma no apunta a
    // este paso por ningún lado.
    console.error(
      rojo(
        '\n  Falta `mksquashfs` y la AppImage no se puede sanear.\n\n' +
          '    Debian/Ubuntu: sudo apt install squashfs-tools\n' +
          '    Fedora:        sudo dnf install squashfs-tools\n' +
          '    Arch:          sudo pacman -S squashfs-tools\n\n' +
          '  Sin este paso la AppImage abre con la ventana en blanco en cualquier\n' +
          '  equipo cuyo wayland sea más nuevo que el de la máquina de compilación.\n',
      ),
    );
    process.exit(1);
  }

  console.log(`\n  ${tenue('Saneando la AppImage')}`);
  for (const nombre of aBorrar) {
    rmSync(join(salida.appDir, 'usr', 'lib', nombre), { force: true });
    console.log(`  ${verde('−')} ${nombre} ${tenue('(tiene que venir del sistema)')}`);
  }

  const tamanoAntes = statSync(salida.appImage).size;
  const desplazamiento = desplazamientoDelRuntime(salida.appImage);
  const runtime = `${salida.appImage}.runtime`;
  const sistemaDeArchivos = `${salida.appImage}.squashfs`;

  extraerRuntime(salida.appImage, desplazamiento, runtime);

  // Los mismos parámetros con los que se empaquetó la original: zstd y bloques
  // de 128 KiB. No es indiferente — con `gzip` el archivo pasa de 78 a 86 MB, y
  // esos 8 MB los paga cada persona que la descarga. Se comprobó leyendo el
  // superbloque de la AppImage recién construida, no suponiéndolo.
  //
  // `xz` daría unos 70 MB y aun así no se usa: una AppImage se descomprime
  // **en cada arranque**, y ahí xz es bastante más lento que zstd. Ocho megas
  // una sola vez valen menos que un arranque lento todos los días.
  //
  // La reserva a gzip es por si `mksquashfs` viniera compilado sin zstd, cosa
  // que pasa en distribuciones antiguas: el runtime lee los dos formatos, así
  // que más vale una AppImage grande que una compilación rota.
  const comprimir = compresor =>
    execFileSync(
      'mksquashfs',
      [salida.appDir, sistemaDeArchivos, '-root-owned', '-noappend', '-comp', compresor, '-b', '131072'],
      { stdio: 'pipe' },
    );

  try {
    comprimir('zstd');
  } catch {
    console.log(`  ${tenue('· mksquashfs sin zstd; se comprime con gzip (la AppImage saldrá más grande)')}`);
    rmSync(sistemaDeArchivos, { force: true });
    comprimir('gzip');
  }

  execFileSync('sh', ['-c', `cat "${runtime}" "${sistemaDeArchivos}" > "${salida.appImage}"`]);
  execFileSync('chmod', ['+x', salida.appImage]);
  rmSync(runtime, { force: true });
  rmSync(sistemaDeArchivos, { force: true });

  // La firma anterior ya no vale: el empaquetador firma la AppImage durante la
  // compilación y acabamos de sustituir el archivo. Dejarla sería peor que no
  // tener ninguna — el actualizador comprueba la firma contra el contenido, no
  // encontraría correspondencia y **rechazaría la actualización por
  // manipulada**, que es un fallo que solo aparece el día que alguien pulsa el
  // botón. Se borra para que el paso de firmado de la publicación la rehaga.
  const firma = `${salida.appImage}.sig`;
  if (existsSync(firma)) {
    rmSync(firma, { force: true });
    console.log(`  ${verde('−')} ${firma.split('/').pop()} ${tenue('(firma del archivo anterior; hay que rehacerla)')}`);
  }

  const tamanoDespues = statSync(salida.appImage).size;
  const mb = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  console.log(`  ${verde('✓')} Reempaquetada: ${mb(tamanoAntes)} → ${mb(tamanoDespues)}\n`);
}

// ── Autoprueba ──────────────────────────────────────────────────────────────

function autoprueba() {
  const fallos = [];
  const afirmar = (condicion, mensaje) => !condicion && fallos.push(mensaje);

  // Lo que de verdad se puede romper sin que se note: que la librería culpable
  // desaparezca de la lista en una edición descuidada. Sin ella este script no
  // hace nada y la AppImage vuelve a abrir en blanco, sin ningún error.
  afirmar(
    PROHIBIDAS.includes('libwayland-client.so.0'),
    'libwayland-client.so.0 tiene que estar en PROHIBIDAS: es la que deja la ventana en blanco.',
  );
  afirmar(PROHIBIDAS.length > 0, 'PROHIBIDAS no puede quedar vacía.');
  afirmar(
    !PROHIBIDAS.some(nombre => VIGILADAS.includes(nombre)),
    'Una librería no puede estar a la vez en PROHIBIDAS y en VIGILADAS: se borraría y se avisaría de ella.',
  );
  afirmar(
    PROHIBIDAS.every(nombre => /^lib.+\.so(\.\d+)*$/.test(nombre)),
    'Los nombres de PROHIBIDAS tienen que ser nombres de fichero de librería, no rutas ni comodines.',
  );

  if (fallos.length > 0) {
    console.error(rojo('\n✖ Autoprueba de sanear-appimage:\n'));
    for (const fallo of fallos) console.error(`  · ${fallo}`);
    console.error('');
    process.exit(1);
  }
  console.log(verde('✓ Autoprueba de sanear-appimage: la lista de exclusión está sana.'));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--autoprueba')) autoprueba();
  else principal();
}
