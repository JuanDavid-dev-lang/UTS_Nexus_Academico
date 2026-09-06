/**
 * Verificador de configuración — UTS Nexus Académico
 *
 * Revisa backend/.env y reporta qué falta o está mal, SIN imprimir secretos.
 * Los valores sensibles se muestran enmascarados, así que la salida se puede
 * pegar en un chat o en un ticket sin filtrar credenciales.
 *
 * Uso:  node check-env.mjs        (desde la carpeta backend/)
 *       npm run check:env
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '.env');

const RESET = '\x1b[0m';
const paint = (code, text) => `\x1b[${code}m${text}${RESET}`;
const red = (t) => paint(31, t);
const green = (t) => paint(32, t);
const yellow = (t) => paint(33, t);
const dim = (t) => paint(2, t);

const problems = [];
const warnings = [];

if (!existsSync(envPath)) {
  console.log(red('\n  No existe backend/.env\n'));
  console.log('  Solución:  copy .env.example .env\n');
  process.exit(1);
}

/** Parseo mínimo: KEY=valor, ignorando comentarios y líneas vacías. */
const env = {};
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const index = trimmed.indexOf('=');
  if (index === -1) continue;
  env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
}

/**
 * Oculta un valor por completo.
 *
 * Mostrar los extremos sería cómodo para reconocerlo, pero en un secreto de 16
 * caracteres eso filtra más de un tercio. Para verificar la configuración basta
 * con saber que existe y cuánto mide.
 */
function hide(value) {
  if (!value) return dim('(vacía)');
  return '•'.repeat(Math.min(value.length, 24));
}

/** Para datos no secretos (un usuario de base de datos): extremos visibles. */
function mask(value) {
  if (!value) return dim('(vacía)');
  if (value.length <= 4) return '•'.repeat(value.length);
  return `${value.slice(0, 2)}${'•'.repeat(Math.min(value.length - 3, 16))}${value.slice(-1)}`;
}

/** De una URI de Mongo solo interesa el host: usuario y clave se ocultan. */
function describeMongoUri(uri) {
  const match = /^mongodb(\+srv)?:\/\/(?:([^:@]+)(?::[^@]*)?@)?([^/?]+)(?:\/([^?]*))?/.exec(uri);
  if (!match) return null;
  return {
    srv: Boolean(match[1]),
    user: match[2] ?? null,
    host: match[3],
    database: match[4] || null,
  };
}

console.log(`\n  ${paint(1, 'Verificación de backend/.env')}\n`);

// ── MONGODB_URI ─────────────────────────────────────────────────────────────
const mongo = env.MONGODB_URI;
if (!mongo) {
  console.log(`  ${red('✗')} MONGODB_URI          ${dim('no definida')}`);
  problems.push(
    'MONGODB_URI no está definida. El servidor arranca y /health responde 200,\n' +
      '    pero cualquier consulta falla a los 10 s con un timeout de Mongoose.\n' +
      '    Añade:  MONGODB_URI=mongodb+srv://usuario:clave@cluster.mongodb.net/uts_nexus',
  );
} else {
  const parsed = describeMongoUri(mongo);
  if (!parsed) {
    console.log(`  ${red('✗')} MONGODB_URI          ${dim('formato no reconocido')}`);
    problems.push('MONGODB_URI no parece una cadena de conexión válida de MongoDB.');
  } else {
    console.log(`  ${green('✓')} MONGODB_URI          host: ${parsed.host}`);
    console.log(`    ${dim(`usuario: ${parsed.user ? mask(parsed.user) : '(sin usuario)'} · base: ${parsed.database ?? '(por defecto)'}`)}`);
    if (!parsed.database) {
      warnings.push(
        'La URI no especifica base de datos. Mongoose usará "test".\n' +
          '    Añade el nombre al final:  .../uts_nexus',
      );
    }
  }
}

// ── Secretos JWT ────────────────────────────────────────────────────────────
const DEFAULTS = { JWT_ACCESS_SECRET: 'dev-access', JWT_REFRESH_SECRET: 'dev-refresh' };

for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  const value = env[key];
  if (!value) {
    console.log(`  ${red('✗')} ${key.padEnd(20)} ${dim('no definida')}`);
    problems.push(
      `${key} no está definida. El backend usará el valor por defecto "${DEFAULTS[key]}",\n` +
        '    que es público: cualquiera podría firmar tokens válidos.',
    );
    continue;
  }

  const short = value.length < 32;
  console.log(
    `  ${short ? yellow('!') : green('✓')} ${key.padEnd(20)} ${hide(value)} ${dim(`(${value.length} caracteres)`)}`,
  );

  if (value === DEFAULTS[key]) {
    problems.push(`${key} tiene el valor por defecto del código. Cámbialo por uno propio.`);
  } else if (short) {
    warnings.push(`${key} tiene ${value.length} caracteres. Se recomiendan 32 o más.`);
  }
}

if (env.JWT_SECRET && !env.JWT_ACCESS_SECRET) {
  problems.push(
    'Existe JWT_SECRET pero el código lee JWT_ACCESS_SECRET (shared/env.ts).\n' +
      '    Renómbrala, o los tokens se firmarán con el secreto por defecto.',
  );
}

// ── CORS ────────────────────────────────────────────────────────────────────
const origin = env.CLIENT_ORIGIN;
if (!origin) {
  console.log(`  ${green('✓')} CLIENT_ORIGIN        ${dim('no definida → por defecto "*"')}`);
} else if (origin === '*') {
  console.log(`  ${green('✓')} CLIENT_ORIGIN        *`);
} else {
  console.log(`  ${red('✗')} CLIENT_ORIGIN        ${origin}`);
  problems.push(
    `CLIENT_ORIGIN está fijada a "${origin}".\n` +
      '    La app de escritorio NO se sirve desde ahí: su origen es http://tauri.localhost\n' +
      '    y el servidor de desarrollo usa http://localhost:5183. El login fallará con un\n' +
      '    error que dice "sin conexión" y nunca menciona CORS.\n' +
      '    Para uso local:  CLIENT_ORIGIN=*   (el backend solo escucha en 127.0.0.1)',
  );
}

// ── Resto (no sensible) ─────────────────────────────────────────────────────
const port = env.PORT || '4000';
console.log(`  ${green('✓')} PORT                 ${port}${env.PORT ? '' : dim(' (por defecto)')}`);

const scan = Number(env.RISK_SCAN_INTERVAL_MIN ?? 0);
console.log(
  `  ${green('✓')} RISK_SCAN_INTERVAL   ${scan === 0 ? dim('0 (escaneo automático desactivado)') : `${scan} min`}`,
);

const aiEnabled = !['0', 'false', 'no', ''].includes((env.AI_ENABLED ?? '1').toLowerCase());
console.log(
  `  ${green('✓')} IA local             ${aiEnabled ? `activa · ${env.AI_MODEL ?? 'llama3.1:8b'} en ${env.AI_BASE_URL ?? 'http://localhost:11434'}` : dim('desactivada (modo reglas)')}`,
);

/** Tareas periódicas: un 0 no es un fallo, pero sí conviene verlo escrito. */
const tareas = [
  ['CLASS_REMINDER_INTERVAL_MIN', 1, 'recordatorios de clase'],
  ['ACTIVITY_DUE_INTERVAL_MIN', 15, 'avisos de vencimiento de actividades'],
  ['ATTENDANCE_PATTERN_INTERVAL_MIN', 0, 'patrones de inasistencia'],
];
for (const [clave, porDefecto, descripcion] of tareas) {
  const valor = env[clave] === undefined ? porDefecto : Number(env[clave]);
  const texto = valor > 0 ? `${valor} min` : dim(`0 (${descripcion}: desactivado)`);
  console.log(`  ${green('✓')} ${clave.padEnd(20).slice(0, 20)} ${texto}`);
}

// ── Seguridad del despliegue ────────────────────────────────────────────────
// Estas tres son las que convirtieron un despliegue distraído en un problema
// real: el guardián de producción colgaba de `NODE_ENV`, así que olvidarla
// dejaba secretos de juguete, sin límite de login y con el código de
// recuperación viajando en la respuesta.
const esProd = (env.NODE_ENV ?? '') === 'production';
console.log(
  `  ${esProd ? green('✓') : yellow('!')} NODE_ENV             ${env.NODE_ENV ?? dim('(sin declarar → development)')}`,
);
if (!esProd && mongo) {
  warnings.push(
    'Hay MONGODB_URI pero NODE_ENV no es "production".\n' +
      '    Los secretos JWT se validan igualmente (el arranque falla si son los de\n' +
      '    desarrollo), pero CORS queda en "*" y el formato del log es el de dev.',
  );
}

const trustProxy = env.TRUST_PROXY === undefined ? esProd : ['1', 'true', 'yes'].includes(env.TRUST_PROXY.toLowerCase());
console.log(
  `  ${green('✓')} TRUST_PROXY          ${trustProxy ? 'sí (hay un proxy inverso delante)' : dim('no (el backend recibe directo)')}`,
);

if (env.ALLOW_DEV_RECOVERY_CODE && ['1', 'true', 'yes'].includes(env.ALLOW_DEV_RECOVERY_CODE.toLowerCase())) {
  console.log(`  ${yellow('!')} ALLOW_DEV_RECOVERY   ${yellow('encendida')}`);
  if (esProd) {
    problems.push(
      'ALLOW_DEV_RECOVERY_CODE está encendida en producción. El código nunca se\n' +
        '    devuelve ahí (hay una segunda comprobación), pero no tiene nada que hacer\n' +
        '    en este archivo: quítala.',
    );
  } else {
    warnings.push(
      'ALLOW_DEV_RECOVERY_CODE devuelve el código de recuperación en la respuesta\n' +
        '    de /auth/recovery/request cuando no hay SMTP. Cómodo en local; quítala\n' +
        '    antes de exponer este servidor a nadie más.',
    );
  }
}

const mlSecret = env.ML_SHARED_SECRET;
const mlUrl = env.ML_BASE_URL ?? 'http://127.0.0.1:8100';
const mlLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(mlUrl);
console.log(
  `  ${green('✓')} ML_SHARED_SECRET     ${mlSecret ? `${hide(mlSecret)} ${dim(`(${mlSecret.length} caracteres)`)}` : dim('(vacía)')}`,
);
if (!mlSecret && !mlLocal) {
  problems.push(
    `ML_BASE_URL apunta a ${mlUrl}, que no es la máquina local, y no hay\n` +
      '    ML_SHARED_SECRET. El servicio de ML expone POST /train —reentrena el modelo\n' +
      '    que decide qué estudiantes salen en rojo— y /vision/*, que acepta archivos.\n' +
      '    Pon el mismo valor aquí y en el entorno del servicio de Python.',
  );
}

// ── Puente con UniPlanner ───────────────────────────────────────────────────
//
// Se informa aunque esté apagado, y esa es la gracia: «no hay insignias en la
// lista de clase» y «el puente no está configurado» se ven igual desde fuera,
// y sin esta línea la única forma de distinguirlos era leer el log de arranque.
const upProyecto = env.UNIPLANNER_PROJECT_ID;
const upCorreo = env.UNIPLANNER_CLIENT_EMAIL;
const upClave = env.UNIPLANNER_PRIVATE_KEY;
const upCompleto = Boolean(upProyecto && upCorreo && upClave);
const upParcial = !upCompleto && Boolean(upProyecto || upCorreo || upClave);

console.log(
  `  ${upCompleto ? green('✓') : upParcial ? red('✗') : green('✓')} Puente UniPlanner    ${
    upCompleto
      ? `${upProyecto} · ${upCorreo}`
      : upParcial
        ? red('incompleto')
        : dim('apagado (sin credenciales)')
  }`,
);

if (upParcial) {
  const faltan = [
    !upProyecto && 'UNIPLANNER_PROJECT_ID',
    !upCorreo && 'UNIPLANNER_CLIENT_EMAIL',
    !upClave && 'UNIPLANNER_PRIVATE_KEY',
  ].filter(Boolean);
  problems.push(
    `El puente con UniPlanner tiene unas credenciales y otras no: falta ${faltan.join(', ')}.\n` +
      '    A medias no funciona, y el fallo no se ve al arrancar: la lista de clase\n' +
      '    aparece sin insignias, igual que si estuviera apagado a propósito.\n' +
      '    Ponlas con:  npm run configurar:uniplanner -- <ruta-al-json>',
  );
} else if (upCompleto && upClave && !upClave.includes('BEGIN PRIVATE KEY')) {
  problems.push(
    'UNIPLANNER_PRIVATE_KEY no parece una clave privada. Si la pegaste a mano,\n' +
      '    tiene que ir entre comillas y con los saltos escapados como \\n. Usa\n' +
      '    `npm run configurar:uniplanner` y evítate el problema: el síntoma de\n' +
      '    pegarla mal no es un error al arrancar, es una firma que Google rechaza.',
  );
}

if (upCompleto && ['1', 'true', 'yes'].includes((env.UNIPLANNER_SOLO_VERIFICADOS ?? '0').toLowerCase())) {
  warnings.push(
    'UNIPLANNER_SOLO_VERIFICADOS está encendida y todavía no hay ningún proceso\n' +
      '    que confirme una matrícula, así que no se enviará ni un aviso.',
  );
}

// ── Claves desconocidas: casi siempre son erratas ───────────────────────────
// La lista tiene que cubrir TODO lo que lee `shared/env.ts`. Incompleta, este
// aviso convierte una configuración correcta en una advertencia falsa, y una
// advertencia que siempre aparece deja de leerse — que es justo cuando se cuela
// la errata que esto existía para detectar.
const KNOWN = new Set([
  'MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL', 'CLIENT_ORIGIN', 'PORT', 'HOST', 'NODE_ENV',
  'RISK_SCAN_INTERVAL_MIN',
  'AI_BASE_URL', 'AI_MODEL', 'AI_ENABLED',
  'ML_BASE_URL', 'ML_ENABLED', 'ML_SHARED_SECRET',
  'TRUST_PROXY', 'ALLOW_DEV_RECOVERY_CODE',
  'CAMPUS_UTC_OFFSET_MIN', 'CLASS_REMINDER_INTERVAL_MIN',
  'ACTIVITY_DUE_INTERVAL_MIN', 'ATTENDANCE_PATTERN_INTERVAL_MIN',
  'TELEMETRY_RETENTION_DAYS', 'ANNOUNCEMENT_PUBLISH_INTERVAL_MIN',
  'FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY',
  'UNIPLANNER_PROJECT_ID', 'UNIPLANNER_CLIENT_EMAIL', 'UNIPLANNER_PRIVATE_KEY',
  'UNIPLANNER_SOLO_VERIFICADOS',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
  'RELEASES_REPO', 'RELEASE_CHECK_INTERVAL_H',
  // No la lee `shared/env.ts` sino el script de siembra, que la toma de
  // `process.env`. Sin esta entrada, declararla salta como si fuera una errata.
  'SEED_PASSWORD',
]);
const unknown = Object.keys(env).filter((key) => !KNOWN.has(key));
if (unknown.length > 0) {
  console.log(`\n  ${yellow('!')} Variables que el backend no lee: ${unknown.join(', ')}`);
  warnings.push(
    'Esas variables se ignoran. Suele ser una errata en el nombre; revisa shared/env.ts.',
  );
}

// ── Resumen ─────────────────────────────────────────────────────────────────
console.log('');
if (problems.length > 0) {
  console.log(`  ${red(`${problems.length} problema(s) que impiden usar la app:`)}\n`);
  problems.forEach((text, index) => console.log(`  ${index + 1}. ${text}\n`));
}
if (warnings.length > 0) {
  console.log(`  ${yellow(`${warnings.length} advertencia(s):`)}\n`);
  warnings.forEach((text, index) => console.log(`  ${index + 1}. ${text}\n`));
}
if (problems.length === 0 && warnings.length === 0) {
  console.log(`  ${green('Todo correcto. La configuración está lista.')}\n`);
}

process.exit(problems.length > 0 ? 1 : 0);
