/**
 * Suite E2E de UTS Nexus Académico.
 *
 * Recorre el flujo académico completo contra la aplicación REAL —el mismo
 * `app.ts` que sirve en producción— sobre una base de datos aislada que se
 * crea, se usa y se borra en la misma ejecución.
 *
 * ── Por qué no hay dependencias nuevas ────────────────────────────────────
 *
 * Un runner de HTTP (supertest) y un Mongo efímero (mongodb-memory-server)
 * habrían sido lo cómodo, pero los dos resuelven problemas que aquí ya están
 * resueltos: Node trae `fetch` desde la v18 y el proyecto ya sabe levantar su
 * propio servidor. `mongodb-memory-server` además descarga un binario de
 * ~100 MB en el `npm install` de todo el mundo, incluido quien nunca correrá
 * esta suite. Se usa **si está instalado** y, si no, la URI la pone quien
 * ejecuta. Añadir una herramienta que duplica algo que ya funciona es
 * precisamente lo que el proyecto evita.
 *
 * ── Aislamiento ───────────────────────────────────────────────────────────
 *
 *  - La base es una propia, con nombre único por ejecución, y se **borra al
 *    terminar** pase lo que pase. Nunca toca datos reales.
 *  - Se niega a arrancar contra una URI de Atlas: un `mongodb+srv://` en
 *    `E2E_MONGODB_URI` es casi seguro un despiste, y el precio del despiste es
 *    borrar la base de la institución.
 *  - Correo y push quedan apagados solos (sin `SMTP_HOST` ni `FCM_*` no se
 *    envía nada), y el servicio ML se desactiva con `ML_ENABLED=0`, así que el
 *    riesgo se calcula con el motor de reglas: determinista y sin red.
 *  - Los datos son deterministas: mismos códigos, mismas notas, mismas fechas.
 *    Nada de aleatorio, nada de `Date.now()` en lo que se compara.
 *
 * Uso:
 *   npm run test:e2e
 *   E2E_MONGODB_URI="mongodb://127.0.0.1:27017" npm run test:e2e
 */
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';

// ── Configuración del entorno de prueba, ANTES de importar nada del app ────
//
// `shared/env.ts` lee `process.env` al importarse. Si estas variables se
// pusieran después, el proceso arrancaría con la configuración de desarrollo
// —incluida la MONGODB_URI real— y la suite escribiría donde no debe.
const SUFIJO = randomBytes(4).toString('hex');
const BASE_URI = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const NOMBRE_BD = `uts_e2e_${SUFIJO}`;

if (/mongodb\+srv:\/\//i.test(BASE_URI)) {
  console.error(
    '\n⛔ E2E_MONGODB_URI apunta a un clúster remoto (mongodb+srv). La suite ' +
      'borra la base al terminar, así que solo acepta una instancia local.\n',
  );
  process.exit(1);
}

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = `${BASE_URI.replace(/\/+$/, '')}/${NOMBRE_BD}`;
process.env.JWT_ACCESS_SECRET = `e2e-access-${SUFIJO}-${'x'.repeat(32)}`;
process.env.JWT_REFRESH_SECRET = `e2e-refresh-${SUFIJO}-${'y'.repeat(32)}`;
// Sin ML: el riesgo se calcula con reglas puras, que es lo que hace la prueba
// determinista. Con el servicio arriba, un modelo reentrenado cambiaría el
// nivel de un estudiante y la suite empezaría a fallar sin que nada se rompa.
process.env.ML_ENABLED = '0';
process.env.AI_ENABLED = '0';
// Ninguna tarea periódica: una pasada del escáner a mitad de la suite
// crearía notificaciones que las comprobaciones no esperan.
process.env.RISK_SCAN_INTERVAL_MIN = '0';
process.env.CLASS_REMINDER_INTERVAL_MIN = '0';
process.env.ACTIVITY_DUE_INTERVAL_MIN = '0';
process.env.ATTENDANCE_PATTERN_INTERVAL_MIN = '0';
process.env.RELEASE_CHECK_INTERVAL_H = '0';
// Correo y push ya están apagados sin sus variables; se deja explícito.
delete process.env.SMTP_HOST;
delete process.env.FCM_PROJECT_ID;

const mongoose = (await import('mongoose')).default;
const { app } = await import('../app.js');
const { UserModel } = await import('../models/user.model.js');
const bcrypt = (await import('bcryptjs')).default;
const { asegurarPerfilesIniciales } = await import('../shared/institutions-bootstrap.js');

// ── Utilidades de la suite ────────────────────────────────────────────────

let pasadas = 0;
let fallidas = 0;
const fallos: string[] = [];

function ok(nombre: string, condicion: boolean, detalle = ''): boolean {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✅ ${nombre}`);
  } else {
    fallidas += 1;
    const linea = `${nombre}${detalle ? ` — ${detalle}` : ''}`;
    fallos.push(linea);
    console.log(`  ❌ ${linea}`);
  }
  return condicion;
}

function seccion(titulo: string): void {
  console.log(`\n${titulo}`);
}

let base = '';

type Respuesta = { status: number; json: any; bytes: number; tipo: string };

async function pedir(
  metodo: string,
  ruta: string,
  opciones: { token?: string; body?: unknown; crudo?: boolean } = {},
): Promise<Respuesta> {
  const res = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}),
    },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });

  const tipo = res.headers.get('content-type') ?? '';

  if (opciones.crudo) {
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, json: buffer, bytes: buffer.length, tipo };
  }

  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, bytes: 0, tipo };
}

const get = (ruta: string, token?: string) => pedir('GET', ruta, { token });
const post = (ruta: string, body: unknown, token?: string) =>
  pedir('POST', ruta, { token, body });
const put = (ruta: string, body: unknown, token?: string) =>
  pedir('PUT', ruta, { token, body });
const del = (ruta: string, token?: string) => pedir('DELETE', ruta, { token });
const patch = (ruta: string, body: unknown, token?: string) =>
  pedir('PATCH', ruta, { token, body });

/** Contraseña fija: la suite es determinista y esta base se borra al terminar. */
const CLAVE = 'Prueba-E2E-2026!';

async function login(email: string): Promise<string> {
  const res = await post('/auth/login', { email, password: CLAVE });
  return res.json?.accessToken ?? '';
}

// ── Datos deterministas ───────────────────────────────────────────────────

const PERIODO = '2026-1';
const ESTUDIANTES = [
  { code: 'E2E-1001', fullName: 'Ana Prueba Uno', email: 'e2e1@uts.edu.co', program: 'Sistemas' },
  { code: 'E2E-1002', fullName: 'Bruno Prueba Dos', email: 'e2e2@uts.edu.co', program: 'Sistemas' },
  { code: 'E2E-1003', fullName: 'Carla Prueba Tres', email: 'e2e3@uts.edu.co', program: 'Sistemas' },
];

/**
 * Notas por estudiante, elegidas para que el resultado sea previsible:
 * la primera aprueba con holgura, la segunda raspa y la tercera reprueba y
 * entra en riesgo alto. Sin esa gradación, la comprobación de riesgo pasaría
 * por casualidad.
 */
const NOTAS: Record<string, number> = { 'E2E-1001': 4.5, 'E2E-1002': 3.2, 'E2E-1003': 1.5 };

async function main() {
  console.log(`\n🧪 Suite E2E de UTS Nexus Académico`);
  console.log(`   Base de datos aislada: ${NOMBRE_BD}\n`);

  await mongoose.connect(process.env.MONGODB_URI!);
  // Lo mismo que hace `server.ts` al arrancar: UTS, UIS y UDES existen antes
  // de la primera petición, así que el registro tiene qué ofrecer.
  await asegurarPerfilesIniciales();

  // El servidor escucha en un puerto que elige el sistema (`0`): dos suites en
  // paralelo, o una suite mientras alguien tiene `npm run dev` levantado, no
  // pueden chocar por el 4000.
  const servidor: Server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const puerto = (servidor.address() as { port: number }).port;
  base = `http://127.0.0.1:${puerto}/api/v1`;

  try {
    await ejecutar(puerto);
  } finally {
    // La limpieza va en `finally`: una prueba que falla no puede dejar una
    // base huérfana por cada ejecución.
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
    await new Promise<void>(resolve => servidor.close(() => resolve()));
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${pasadas} comprobaciones correctas · ${fallidas} fallidas`);
  if (fallos.length > 0) {
    console.log('\n  Fallos:');
    for (const fallo of fallos) console.log(`   · ${fallo}`);
  }
  console.log('');
  process.exit(fallidas > 0 ? 1 : 0);
}

async function ejecutar(puerto: number) {
  // ── 0. Semilla mínima de cuentas ────────────────────────────────────────
  // Se crean directamente en la base y no por `/auth/register`, que exige un
  // ADMIN ya existente: el primer administrador no puede crearse a sí mismo
  // por HTTP, y montar esa excepción solo para la prueba sería probar algo
  // que en producción no ocurre.
  const hash = await bcrypt.hash(CLAVE, 10);
  await UserModel.create([
    { email: 'e2e-admin@uts.edu.co', passwordHash: hash, fullName: 'Admin E2E', role: 'ADMIN' },
    { email: 'e2e-docente@uts.edu.co', passwordHash: hash, fullName: 'Docente E2E', role: 'PROFESSOR' },
    { email: 'e2e-otro@uts.edu.co', passwordHash: hash, fullName: 'Otro Docente E2E', role: 'PROFESSOR' },
  ]);

  seccion('1) Disponibilidad y autenticación');
  const salud = await fetch(`http://127.0.0.1:${puerto}/health`);
  ok('GET /health responde', salud.ok);

  const admin = await login('e2e-admin@uts.edu.co');
  const docente = await login('e2e-docente@uts.edu.co');
  const otroDocente = await login('e2e-otro@uts.edu.co');
  ok('Login de ADMIN', admin.length > 0);
  ok('Login de PROFESSOR', docente.length > 0);

  const malaClave = await post('/auth/login', {
    email: 'e2e-admin@uts.edu.co',
    password: 'no-es-la-clave',
  });
  ok('Contraseña incorrecta → 401', malaClave.status === 401, `status ${malaClave.status}`);

  const sinSesion = await get('/students');
  ok('Listado sin token → 401', sinSesion.status === 401, `status ${sinSesion.status}`);

  // ── 2. Materia y grupo ──────────────────────────────────────────────────
  seccion('2) Materia y grupo');
  const perfilDocente = await get('/auth/me', docente);
  const docenteId = String(perfilDocente.json?.user?.id ?? perfilDocente.json?.user?._id ?? '');
  ok('El perfil del docente trae su id', docenteId.length > 0);

  const materia = await post(
    '/subjects',
    {
      name: 'Cálculo E2E',
      code: 'E2E-CAL',
      credits: 4,
      period: PERIODO,
      professorId: docenteId,
      // Con programa declarado: es lo que decide qué coordinación la ve.
      programa: 'ING_SISTEMAS',
    },
    admin,
  );
  const subjectId = String(materia.json?.item?._id ?? '');
  ok('POST /subjects crea la materia', materia.status === 201 && subjectId.length > 0,
    JSON.stringify(materia.json).slice(0, 120));

  const materiaInvalida = await post('/subjects', { name: '' }, admin);
  ok('Materia sin datos → 400', materiaInvalida.status === 400, `status ${materiaInvalida.status}`);

  const grupo = await post(
    '/groups',
    { name: 'Grupo E2E', subjectId, period: PERIODO, professorId: docenteId },
    admin,
  );
  const groupId = String(grupo.json?.item?._id ?? '');
  ok('POST /groups crea el grupo', grupo.status === 201 && groupId.length > 0,
    JSON.stringify(grupo.json).slice(0, 120));

  // ── 3. Estudiantes y matrícula ──────────────────────────────────────────
  seccion('3) Estudiantes y matrícula');
  const alta = await post('/enrollments/bulk', { groupId, students: ESTUDIANTES }, docente);
  ok('POST /enrollments/bulk crea y matricula', alta.status === 201 && alta.json?.count === 3,
    JSON.stringify(alta.json).slice(0, 120));

  const listado = await get(`/students?subjectId=${subjectId}`, docente);
  const alumnos = (listado.json?.items ?? []) as { _id: string; code: string }[];
  ok('El docente ve a sus 3 matriculados', alumnos.length === 3, `vio ${alumnos.length}`);

  const ajenos = await get(`/students?subjectId=${subjectId}`, otroDocente);
  ok(
    'Otro docente NO ve esa lista',
    (ajenos.json?.items ?? []).length === 0,
    `vio ${(ajenos.json?.items ?? []).length}`,
  );

  const porId = new Map(alumnos.map(a => [a.code, a._id]));

  // ── 4. Notas ────────────────────────────────────────────────────────────
  seccion('4) Registro masivo de notas');
  /*
   * LOS TRES componentes de cada corte, no solo el parcial.
   *
   * Con solo `PARCIALES` la nota del corte sale 4.5 × 0.6 = 2.7 —el motor
   * aplica la rúbrica 30/60/10 y los componentes vacíos aportan cero—, así que
   * una prueba que esperara 4.5 estaría comprobando una fórmula equivocada.
   * Calificando los tres, la nota del corte coincide con la nota puesta y el
   * consolidado sale `completo`, que es lo que hace verificable la fotografía.
   */
  const COMPONENTES = ['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION'] as const;
  for (const corte of [1, 2, 3] as const) {
    for (const componente of COMPONENTES) {
      const respuesta = await post(
        '/grades/bulk',
        {
          groupId,
          corte,
          componentType: componente,
          labels: ['Nota'],
          filas: ESTUDIANTES.map(e => ({
            studentId: porId.get(e.code),
            scores: [NOTAS[e.code]],
          })),
        },
        docente,
      );
      ok(
        `Notas del corte ${corte} · ${componente}`,
        respuesta.status === 200 || respuesta.status === 201,
        JSON.stringify(respuesta.json).slice(0, 140),
      );
    }
  }

  const notaAjena = await post(
    '/grades/bulk',
    {
      groupId,
      corte: 1,
      componentType: 'PARCIALES',
      labels: ['Parcial'],
      filas: [{ studentId: porId.get('E2E-1001'), scores: [5] }],
    },
    otroDocente,
  );
  ok('Otro docente no puede calificar ese grupo → 403',
    notaAjena.status === 403, `status ${notaAjena.status}`);

  // ── 5. Asistencia ───────────────────────────────────────────────────────
  seccion('5) Registro de asistencia');
  // Tres clases con fechas fijas. La tercera estudiante falta a todas: es lo
  // que la empuja a riesgo alto de forma previsible.
  const FECHAS = ['2026-02-03', '2026-02-10', '2026-02-17'];
  for (const fecha of FECHAS) {
    const respuesta = await post(
      '/attendance/bulk',
      {
        subjectId,
        groupId,
        teacherId: docenteId,
        period: PERIODO,
        date: `${fecha}T14:00:00.000Z`,
        durationMinutes: 90,
        registros: ESTUDIANTES.map(e => ({
          studentId: porId.get(e.code),
          present: e.code !== 'E2E-1003',
          lateMinutes: e.code === 'E2E-1002' ? 15 : 0,
        })),
      },
      docente,
    );
    ok(`Asistencia del ${fecha}`, respuesta.status === 200 || respuesta.status === 201,
      JSON.stringify(respuesta.json).slice(0, 140));
  }

  // ── 6. Consolidado ──────────────────────────────────────────────────────
  seccion('6) Consolidado y riesgo');
  const consolidado = await get(`/grades/consolidado?period=${PERIODO}`, docente);
  // Los nombres son los del contrato real (`notaFinal`, `aprobado`), no los
  // ingleses del cliente de escritorio. Leer un campo que no existe devuelve
  // `undefined`, y `!undefined` es `true`: una comprobación mal nombrada pasa
  // sola y deja de proteger nada.
  const filas = (consolidado.json?.items ?? []) as {
    code: string;
    notaFinal: number;
    aprobado: boolean;
  }[];
  ok('El consolidado trae las 3 filas', filas.length === 3, `trajo ${filas.length}`);

  // Con los tres componentes en 4.5, la rúbrica 30/60/10 devuelve 4.5 en cada
  // corte y 4.5 en la final. Comprobar el número exacto —y no solo «aprueba»—
  // es lo que hace que un cambio de pesos rompa la prueba en vez de cambiar
  // notas en silencio.
  const uno = filas.find(f => f.code === 'E2E-1001');
  ok('La nota final la calcula el backend con la rúbrica 30/60/10',
    Boolean(uno && uno.aprobado && Math.abs(uno.notaFinal - 4.5) < 0.05),
    JSON.stringify(uno).slice(0, 160));

  const tres = filas.find(f => f.code === 'E2E-1003');
  ok('Quien saca 1.5 aparece reprobando',
    Boolean(tres && tres.aprobado === false && tres.notaFinal < 3),
    JSON.stringify(tres).slice(0, 160));

  const riesgos = await get('/analytics/risks', docente);
  const enRiesgo = (riesgos.json?.items ?? []) as { code?: string; level: string }[];
  ok('El escáner de riesgo detecta al menos un caso alto',
    enRiesgo.some(r => r.level === 'HIGH' || r.level === 'ALTO'),
    JSON.stringify(enRiesgo).slice(0, 200));

  // ── 7. Actividades ──────────────────────────────────────────────────────
  seccion('7) Actividades');
  const actividad = await post(
    '/activities',
    {
      title: 'Taller E2E',
      subjectId,
      groupId,
      period: PERIODO,
      dueAt: '2026-03-01T23:59:00.000Z',
      weight: 0.2,
    },
    docente,
  );
  const activityId = String(actividad.json?.item?._id ?? '');
  ok('POST /activities crea la actividad', actividad.status === 201 && activityId.length > 0,
    JSON.stringify(actividad.json).slice(0, 140));

  // La fecha límite ya pasó respecto al reloj real, así que el estado derivado
  // tiene que ser LATE. Es lo que comprueba que `LATE` NO está guardado.
  const leida = await get(`/activities/${activityId}`, docente);
  ok('El estado LATE lo deriva el servidor, no está guardado',
    leida.json?.item?.estado === 'LATE' && leida.json?.item?.status === 'OPEN',
    JSON.stringify(leida.json?.item).slice(0, 160));

  const cierreActividad = await post(`/activities/${activityId}/cierre`, {}, docente);
  ok('El docente puede cerrar su actividad',
    cierreActividad.json?.item?.estado === 'CLOSED', JSON.stringify(cierreActividad.json).slice(0, 140));

  const reapertura = await post(`/activities/${activityId}/reapertura`, {}, docente);
  ok('Un docente NO puede reabrirla → 403', reapertura.status === 403, `status ${reapertura.status}`);

  const ajena = await get(`/activities/${activityId}`, otroDocente);
  ok('Otro docente no accede a la actividad → 403', ajena.status === 403, `status ${ajena.status}`);

  // ── 8. Intervención ─────────────────────────────────────────────────────
  seccion('8) Intervención sobre riesgo');
  const intervencion = await patch(
    '/analytics/risks/intervencion',
    {
      studentId: porId.get('E2E-1003'),
      subjectId,
      period: PERIODO,
      estado: 'CONTACTADO',
      nota: 'Contactada por E2E.',
    },
    docente,
  );
  ok('Se registra la intervención', intervencion.status === 200 || intervencion.status === 201,
    JSON.stringify(intervencion.json).slice(0, 140));

  // ── 9. Reportes ─────────────────────────────────────────────────────────
  seccion('9) Reportes generados');
  const pdf = await pedir('GET', `/reports/pdf/consolidado?period=${PERIODO}`, {
    token: docente,
    crudo: true,
  });
  // La firma de un PDF son los cinco primeros bytes. Un 200 con un JSON de
  // error dentro también sería 200: sin mirar el contenido, la prueba pasaría
  // con un archivo que no se puede abrir.
  const esPdf = pdf.status === 200 && (pdf.json as Buffer).subarray(0, 5).toString() === '%PDF-';
  ok('El PDF sale con firma %PDF- y contenido', esPdf && pdf.bytes > 1000,
    `status ${pdf.status}, ${pdf.bytes} bytes`);

  const excel = await pedir('GET', `/reports/excel/consolidado?period=${PERIODO}`, {
    token: docente,
    crudo: true,
  });
  // Un .xlsx es un ZIP: empieza por `PK`.
  const esZip = excel.status === 200 && (excel.json as Buffer).subarray(0, 2).toString() === 'PK';
  ok('El Excel sale con firma PK y contenido', esZip && excel.bytes > 1000,
    `status ${excel.status}, ${excel.bytes} bytes`);

  // ── 10. Cierre del periodo ──────────────────────────────────────────────
  seccion('10) Cierre del periodo');
  const cierreSinPermiso = await post(`/periods/${PERIODO}/cierre`, {}, docente);
  ok('Un docente no puede cerrar el periodo → 403',
    cierreSinPermiso.status === 403, `status ${cierreSinPermiso.status}`);

  const periodoInvalido = await post('/periods/2026-9/cierre', {}, admin);
  ok('Un periodo con forma inválida → 400',
    periodoInvalido.status === 400, `status ${periodoInvalido.status}`);

  const cierre = await post(`/periods/${PERIODO}/cierre`, {}, admin);
  ok('ADMIN cierra el periodo', cierre.status === 200 && cierre.json?.state === 'CLOSED',
    JSON.stringify(cierre.json).slice(0, 160));
  ok('La fotografía cubre las 3 filas del consolidado', cierre.json?.registros === 3,
    `registros ${cierre.json?.registros}`);

  const recierre = await post(`/periods/${PERIODO}/cierre`, {}, admin);
  ok('Cerrar dos veces → 409', recierre.status === 409, `status ${recierre.status}`);

  // ── 11. Bloqueo de escrituras ───────────────────────────────────────────
  seccion('11) Bloqueo de escrituras tras el cierre');
  const notaTardia = await post(
    '/grades/bulk',
    {
      groupId,
      corte: 1,
      componentType: 'TRABAJOS',
      labels: ['Tardío'],
      filas: [{ studentId: porId.get('E2E-1001'), scores: [5] }],
    },
    docente,
  );
  ok('Una nota en periodo cerrado → 409', notaTardia.status === 409,
    `status ${notaTardia.status}: ${JSON.stringify(notaTardia.json).slice(0, 120)}`);

  const asistenciaTardia = await post(
    '/attendance/bulk',
    {
      subjectId,
      groupId,
      teacherId: docenteId,
      period: PERIODO,
      date: '2026-02-24T14:00:00.000Z',
      durationMinutes: 90,
      registros: [{ studentId: porId.get('E2E-1001'), present: true }],
    },
    docente,
  );
  ok('Asistencia en periodo cerrado → 409', asistenciaTardia.status === 409,
    `status ${asistenciaTardia.status}`);

  const matriculaTardia = await post(
    '/enrollments',
    { studentId: porId.get('E2E-1001'), groupId },
    docente,
  );
  ok('Matrícula en periodo cerrado → 409', matriculaTardia.status === 409,
    `status ${matriculaTardia.status}`);

  // La decisión documentada: actividades y horarios SIGUEN editables.
  const actividadTrasCierre = await post(
    '/activities',
    { title: 'Posterior al cierre', subjectId, groupId, period: PERIODO, dueAt: '2026-04-01T12:00:00.000Z' },
    docente,
  );
  ok('Una actividad SÍ se puede crear con el periodo cerrado',
    actividadTrasCierre.status === 201, `status ${actividadTrasCierre.status}`);

  // ── 12. Fotografía ──────────────────────────────────────────────────────
  seccion('12) Fotografía académica');
  const foto = await get(`/periods/${PERIODO}/fotografia`, docente);
  const congelado = (foto.json?.items ?? []) as { code: string; notaFinal: number }[];
  ok('La fotografía devuelve las 3 filas congeladas', congelado.length === 3,
    `trajo ${congelado.length}`);
  ok('Conserva la nota final calculada al cerrar',
    congelado.some(f => f.code === 'E2E-1001' && Math.abs(f.notaFinal - 4.5) < 0.05),
    JSON.stringify(congelado).slice(0, 200));

  const fotoAjena = await get(`/periods/${PERIODO}/fotografia`, otroDocente);
  ok('Otro docente no ve esa fotografía',
    (fotoAjena.json?.items ?? []).length === 0,
    `vio ${(fotoAjena.json?.items ?? []).length}`);

  // ── 13. Auditoría ───────────────────────────────────────────────────────
  seccion('13) Auditoría');
  const auditoriaSinPermiso = await get('/audit', docente);
  ok('Un docente no lee la auditoría → 403',
    auditoriaSinPermiso.status === 403, `status ${auditoriaSinPermiso.status}`);

  const auditoria = await get('/audit?limit=50', admin);
  const registros = (auditoria.json?.items ?? []) as { action: string }[];
  ok('ADMIN lee la auditoría', auditoria.status === 200 && registros.length > 0,
    `${registros.length} registros`);
  ok('El cierre del periodo quedó auditado',
    registros.some(r => r.action === 'period.close'),
    registros.map(r => r.action).slice(0, 12).join(', '));

  const serializado = JSON.stringify(auditoria.json);
  ok('Ninguna contraseña viaja en la auditoría',
    !serializado.includes(CLAVE) && !serializado.includes('passwordHash":"$2'),
    'se encontró material sensible en la respuesta');

  // ── 14. Historial del estudiante ────────────────────────────────────────
  seccion('14) Historial del estudiante');
  const historial = await get(`/students/${porId.get('E2E-1003')}/historial`, docente);
  const eventos = (historial.json?.items ?? []) as { type: string }[];
  ok('El historial lo arma el backend', historial.status === 200 && eventos.length > 0,
    `${eventos.length} eventos`);
  for (const tipo of ['MATRICULA', 'NOTA', 'ASISTENCIA', 'CIERRE_PERIODO']) {
    ok(`Incluye hechos de tipo ${tipo}`, eventos.some(e => e.type === tipo),
      [...new Set(eventos.map(e => e.type))].join(', '));
  }

  const historialAjeno = await get(`/students/${porId.get('E2E-1003')}/historial`, otroDocente);
  ok('Otro docente no accede al historial → 403',
    historialAjeno.status === 403, `status ${historialAjeno.status}`);

  const historialInexistente = await get('/students/000000000000000000000000/historial', admin);
  ok('Historial de un id inexistente → lista vacía, no error',
    historialInexistente.status === 200 && (historialInexistente.json?.items ?? []).length === 0,
    `status ${historialInexistente.status}`);

  // ── 15. Centro de salud ─────────────────────────────────────────────────
  seccion('15) Centro de salud');
  const saludSinPermiso = await get('/system/health', docente);
  ok('Un docente no ve el estado profundo → 403',
    saludSinPermiso.status === 403, `status ${saludSinPermiso.status}`);

  const estado = await get('/system/health', admin);
  ok('ADMIN ve el estado del sistema', estado.status === 200,
    JSON.stringify(estado.json).slice(0, 140));
  ok('Declara la fuente del riesgo (reglas, con ML apagado)',
    estado.json?.riesgo?.fuente === 'rules', JSON.stringify(estado.json?.riesgo));
  ok('Lista las tareas periódicas', Array.isArray(estado.json?.tareas) && estado.json.tareas.length > 0);

  const saludSerializada = JSON.stringify(estado.json);
  ok('No filtra la cadena de conexión ni secretos',
    !saludSerializada.includes('mongodb://') &&
      !saludSerializada.includes(process.env.JWT_ACCESS_SECRET!),
    'se encontró material sensible en el estado del sistema');

  // ── 16. Telemetría ──────────────────────────────────────────────────────
  seccion('16) Telemetría de clientes');
  const reporte = await post(
    '/telemetry/errores',
    {
      client: 'desktop',
      appVersion: '9.9.9',
      route: '/notas',
      category: 'render',
      message: 'Fallo al pintar la nota del estudiante 1098765432',
    },
    docente,
  );
  ok('Un cliente reporta su error', reporte.status === 201, `status ${reporte.status}`);

  const repetido = await post(
    '/telemetry/errores',
    {
      client: 'desktop',
      appVersion: '9.9.9',
      route: '/notas',
      category: 'render',
      message: 'Fallo al pintar la nota del estudiante 1098765432',
    },
    docente,
  );
  ok('El mismo error se deduplica en vez de duplicarse',
    repetido.json?.signature === reporte.json?.signature && repetido.json?.occurrences === 2,
    JSON.stringify(repetido.json));

  const errores = await get('/telemetry/errores', admin);
  const guardados = (errores.json?.items ?? []) as { message: string }[];
  ok('Administración lee los errores', errores.status === 200 && guardados.length === 1,
    `${guardados.length} registros`);
  ok('La cédula del mensaje quedó enmascarada',
    guardados.every(e => !e.message.includes('1098765432')),
    guardados.map(e => e.message).join(' | '));

  // ── 17. Reapertura con traza ────────────────────────────────────────────
  seccion('17) Reapertura del periodo');
  const reaperturaSinMotivo = await post(`/periods/${PERIODO}/reapertura`, { motivo: 'corto' }, admin);
  ok('Reabrir sin motivo suficiente → 400',
    reaperturaSinMotivo.status === 400, `status ${reaperturaSinMotivo.status}`);

  const reabierto = await post(
    `/periods/${PERIODO}/reapertura`,
    { motivo: 'Corrección de acta solicitada por coordinación académica.' },
    admin,
  );
  ok('ADMIN reabre el periodo', reabierto.status === 200 && reabierto.json?.item?.state === 'OPEN',
    JSON.stringify(reabierto.json).slice(0, 140));
  ok('La reapertura queda registrada con su traza', reabierto.json?.item?.reaperturas === 1,
    `reaperturas ${reabierto.json?.item?.reaperturas}`);

  const fotoTrasReapertura = await get(`/periods/${PERIODO}/fotografia`, admin);
  ok('La fotografía anterior NO se borró al reabrir',
    (fotoTrasReapertura.json?.items ?? []).length === 3,
    `quedaron ${(fotoTrasReapertura.json?.items ?? []).length}`);

  const notaTrasReapertura = await post(
    '/grades/bulk',
    {
      groupId,
      corte: 1,
      componentType: 'TRABAJOS',
      labels: ['Corrección'],
      filas: [{ studentId: porId.get('E2E-1001'), scores: [5] }],
    },
    docente,
  );
  ok('Con el periodo reabierto se vuelve a poder escribir',
    notaTrasReapertura.status === 200 || notaTrasReapertura.status === 201,
    `status ${notaTrasReapertura.status}`);

  // ── 18. Autorregistro de docentes ───────────────────────────────────────
  //
  // Es la única puerta por la que entra una cuenta sin que exista antes, y no
  // tenía ninguna comprobación de punta a punta: todo lo que la protege —el
  // interruptor, el estado PENDIENTE, la revisión humana— se podía relajar sin
  // que nada se rompiera. Lo que se recorre aquí es el camino completo:
  // cerrado, abierto, solicitud, login negado, aprobación, login concedido.
  seccion('18) Autorregistro de docentes');

  const SOLICITUD = {
    cedula: '1098765432',
    nombres: 'Elena',
    apellidos: 'Registro E2E',
    sede: 'BUCARAMANGA',
    facultad: 'NATURALES_INGENIERIAS',
    niveles: ['TECNOLOGICO'],
    programas: ['TEC_DESARROLLO_SISTEMAS'],
    email: 'e2e-nueva@uts.edu.co',
    password: CLAVE,
  };

  const catalogo = await get('/registro/catalogo');
  ok('El catálogo se sirve sin sesión', catalogo.status === 200,
    `status ${catalogo.status}`);
  ok('El registro nace cerrado', catalogo.json?.abierto === false,
    `abierto ${catalogo.json?.abierto}`);

  const cerrado = await post('/registro', SOLICITUD);
  ok('Con el registro cerrado la solicitud → 403', cerrado.status === 403,
    `status ${cerrado.status}`);

  const abrirSinSerAdmin = await patch('/registro/estado', { abierto: true }, docente);
  ok('Un docente no puede abrir el registro → 403', abrirSinSerAdmin.status === 403,
    `status ${abrirSinSerAdmin.status}`);

  const abierto = await patch('/registro/estado', { abierto: true }, admin);
  ok('ADMIN abre el registro', abierto.status === 200 && abierto.json?.abierto === true,
    JSON.stringify(abierto.json).slice(0, 120));

  const claveFloja = await post('/registro', { ...SOLICITUD, password: 'segura123' });
  ok('Una contraseña por debajo de la política → 400', claveFloja.status === 400,
    `status ${claveFloja.status}`);

  // El programa es de la otra facultad: es la comprobación que impide que un
  // docente acabe adscrito a una carrera que no dicta.
  const adscripcionImposible = await post('/registro', {
    ...SOLICITUD,
    facultad: 'SOCIOECONOMICAS',
  });
  ok('Un programa de otra facultad → 400', adscripcionImposible.status === 400,
    `status ${adscripcionImposible.status}`);

  const enviada = await post('/registro', SOLICITUD);
  ok('La solicitud se acepta', enviada.status === 201,
    JSON.stringify(enviada.json).slice(0, 140));

  const repetida = await post('/registro', SOLICITUD);
  ok('El mismo correo dos veces → 409', repetida.status === 409,
    `status ${repetida.status}`);

  const loginPendiente = await post('/auth/login', {
    email: SOLICITUD.email,
    password: CLAVE,
  });
  ok('Una cuenta pendiente no puede entrar → 403', loginPendiente.status === 403,
    `status ${loginPendiente.status}`);
  // El estado es lo que permite al cliente mostrar el texto en vez del «no
  // tienes permisos» genérico de cualquier otro 403.
  ok('El 403 declara el estado de la solicitud', loginPendiente.json?.estado === 'PENDIENTE',
    `estado ${loginPendiente.json?.estado}`);

  const cola = await get('/registro/solicitudes', admin);
  const pendiente = (cola.json?.items ?? []).find(
    (item: any) => item?.userId?.email === SOLICITUD.email,
  );
  ok('La solicitud aparece en la cola de la administración', Boolean(pendiente),
    `${(cola.json?.items ?? []).length} en cola`);

  const colaAjena = await get('/registro/solicitudes', docente);
  ok('Un docente no ve la cola → 403', colaAjena.status === 403,
    `status ${colaAjena.status}`);

  const aprobada = await patch(
    `/registro/solicitudes/${pendiente?._id}`,
    { decision: 'APROBADO' },
    admin,
  );
  ok('ADMIN aprueba la solicitud',
    aprobada.status === 200 && aprobada.json?.item?.estado === 'APROBADO',
    JSON.stringify(aprobada.json).slice(0, 140));

  const loginAprobado = await post('/auth/login', {
    email: SOLICITUD.email,
    password: CLAVE,
  });
  ok('Ya aprobada, la cuenta entra', loginAprobado.status === 200,
    `status ${loginAprobado.status}`);

  // Rechazar tiene que cortar lo que ya estaba abierto: si solo cambiara el
  // estado, la sesión en curso seguiría sirviendo hasta caducar.
  const rechazada = await patch(
    `/registro/solicitudes/${pendiente?._id}`,
    { decision: 'RECHAZADO', motivo: 'La cédula no coincide con la del acta.' },
    admin,
  );
  ok('ADMIN rechaza la solicitud', rechazada.status === 200,
    `status ${rechazada.status}`);

  const loginRechazado = await post('/auth/login', {
    email: SOLICITUD.email,
    password: CLAVE,
  });
  ok('Rechazada, la cuenta deja de entrar → 403', loginRechazado.status === 403,
    `status ${loginRechazado.status}`);
  ok('El motivo del rechazo llega en el mensaje',
    String(loginRechazado.json?.message ?? '').includes('no coincide'),
    String(loginRechazado.json?.message ?? '').slice(0, 100));

  const refrescoRechazado = await post('/auth/refresh', {
    refreshToken: loginAprobado.json?.refreshToken ?? 'x',
  });
  ok('La sesión abierta antes del rechazo ya no se renueva → 401',
    refrescoRechazado.status === 401, `status ${refrescoRechazado.status}`);

  // ── 19. Coordinación y secretaría ───────────────────────────────────────
  //
  // Las dos cosas que hay que ver aquí y no en una prueba de dominio: que el
  // acotado por carrera llega hasta la consulta real, y que una sesión de
  // secretaría recibe 403 al escribir aunque la ruta acepte a coordinación.
  seccion('19) Alcance por programa y solo lectura');

  const claveHash = await bcrypt.hash(CLAVE, 10);
  await UserModel.create([
    {
      email: 'e2e-coordinacion@uts.edu.co',
      passwordHash: claveHash,
      fullName: 'Coordinación E2E',
      role: 'COORDINATOR',
      programas: ['ING_SISTEMAS'],
    },
    {
      email: 'e2e-secretaria@uts.edu.co',
      passwordHash: claveHash,
      fullName: 'Secretaría E2E',
      role: 'SECRETARY',
      programas: ['ING_SISTEMAS'],
    },
    {
      email: 'e2e-coordinacion-ajena@uts.edu.co',
      passwordHash: claveHash,
      fullName: 'Coordinación de otra carrera E2E',
      role: 'COORDINATOR',
      programas: ['ING_CIVIL'],
    },
  ]);

  const coordinacion = await login('e2e-coordinacion@uts.edu.co');
  const secretaria = await login('e2e-secretaria@uts.edu.co');
  const coordinacionAjena = await login('e2e-coordinacion-ajena@uts.edu.co');

  const panorama = await get(`/coordinacion/materias?period=${PERIODO}`, coordinacion);
  const materiasVistas: { subjectId?: string }[] = panorama.json?.items ?? [];
  ok('Coordinación ve la materia de su programa',
    panorama.status === 200 && materiasVistas.some(item => item.subjectId === subjectId),
    JSON.stringify(panorama.json).slice(0, 140));

  const panoramaAjeno = await get(`/coordinacion/materias?period=${PERIODO}`, coordinacionAjena);
  const ajenas: { subjectId?: string }[] = panoramaAjeno.json?.items ?? [];
  ok('Coordinación de otra carrera no la ve',
    panoramaAjeno.status === 200 && !ajenas.some(item => item.subjectId === subjectId),
    JSON.stringify(panoramaAjeno.json).slice(0, 140));

  const notasAjenas = await get(`/grades?subjectId=${subjectId}`, coordinacionAjena);
  ok('Pedir las notas de otra carrera devuelve vacío, no un error',
    notasAjenas.status === 200 && (notasAjenas.json?.items ?? []).length === 0,
    `status ${notasAjenas.status}`);

  const notasSecretaria = await get(`/grades?subjectId=${subjectId}`, secretaria);
  ok('Secretaría lee las notas de su programa',
    notasSecretaria.status === 200 && (notasSecretaria.json?.items ?? []).length > 0,
    `status ${notasSecretaria.status}`);

  const exportacion = await get(`/coordinacion/export.xlsx?period=${PERIODO}`, secretaria);
  ok('Secretaría exporta (exportar es leer)', exportacion.status === 200,
    `status ${exportacion.status}`);

  const escrituraSecretaria = await post(
    '/students',
    { code: 'E2E-SEC', fullName: 'No debería crearse', program: 'Ingeniería de Sistemas' },
    secretaria,
  );
  ok('Secretaría escribiendo → 403', escrituraSecretaria.status === 403,
    `status ${escrituraSecretaria.status}`);

  const usuariosParaSecretaria = await get('/usuarios', secretaria);
  ok('El personal es solo de ADMIN → 403', usuariosParaSecretaria.status === 403,
    `status ${usuariosParaSecretaria.status}`);

  const usuariosParaAdmin = await get('/usuarios?role=SECRETARY', admin);
  ok('ADMIN lista el personal',
    usuariosParaAdmin.status === 200 && (usuariosParaAdmin.json?.items ?? []).length > 0,
    `status ${usuariosParaAdmin.status}`);

  // Alta desde Configuracion. Lo que hay que ver aqui es que la cuenta creada
  // pueda entrar: `POST /usuarios` no firma ningun token, asi que si la
  // contrasena no quedara bien guardada nada lo delataria hasta el primer login.
  const nueva = await post(
    '/usuarios',
    {
      email: 'e2e-nueva-coordinacion@uts.edu.co',
      password: 'ClaveNueva2026',
      fullName: 'Coordinación creada desde Configuración',
      role: 'COORDINATOR',
      institutionId: 'uts',
      programas: ['ING_SISTEMAS'],
    },
    admin,
  );
  ok('ADMIN crea una cuenta de coordinación',
    nueva.status === 201 && nueva.json?.item?.role === 'COORDINATOR',
    JSON.stringify(nueva.json).slice(0, 140));
  ok('La cuenta nace con sus carreras asignadas',
    (nueva.json?.item?.programas ?? []).includes('ING_SISTEMAS'),
    JSON.stringify(nueva.json?.item?.programas));

  // Un área es la carrera completa: se manda una y se guardan sus dos títulos.
  const porArea = await post(
    '/usuarios',
    {
      email: 'e2e-area@uts.edu.co',
      password: 'ClaveNueva2026',
      fullName: 'Coordinación por área',
      institutionId: 'uts',
      role: 'COORDINATOR',
      areas: ['AREA_SISTEMAS'],
    },
    admin,
  );
  const programasDelArea: string[] = porArea.json?.item?.programas ?? [];
  ok('Elegir un área guarda los dos ciclos de la carrera',
    porArea.status === 201 &&
      programasDelArea.includes('TEC_DESARROLLO_SISTEMAS') &&
      programasDelArea.includes('ING_SISTEMAS'),
    JSON.stringify(programasDelArea));
  ok('El área vuelve marcada como completa',
    (porArea.json?.item?.areas ?? []).some(
      (a: { id: string; completa: boolean }) => a.id === 'AREA_SISTEMAS' && a.completa,
    ),
    JSON.stringify(porArea.json?.item?.areas));

  const areaInventada = await post(
    '/usuarios',
    {
      email: 'e2e-area-mala@uts.edu.co',
      password: 'ClaveNueva2026',
      institutionId: 'uts',
      fullName: 'Área inventada',
      role: 'COORDINATOR',
      areas: ['AREA_QUE_NO_EXISTE'],
    },
    admin,
  );
  ok('Un área fuera del catálogo → 400', areaInventada.status === 400,
    `status ${areaInventada.status}`);

  const loginNueva = await post('/auth/login', {
    email: 'e2e-nueva-coordinacion@uts.edu.co',
    password: 'ClaveNueva2026',
  });
  ok('La cuenta creada entra con su contraseña', loginNueva.status === 200,
    `status ${loginNueva.status}`);

  const claveDebilDeAlta = await post(
    '/usuarios',
    { email: 'e2e-floja@uts.edu.co', password: 'corta', fullName: 'Clave floja', role: 'SECRETARY' },
    admin,
  );
  ok('Una contraseña que no cumple la política → 400', claveDebilDeAlta.status === 400,
    `status ${claveDebilDeAlta.status}`);

  const correoRepetido = await post(
    '/usuarios',
    {
      email: 'e2e-nueva-coordinacion@uts.edu.co',
      institutionId: 'uts',
      password: 'OtraClave2026',
      fullName: 'Repetida',
      role: 'SECRETARY',
    },
    admin,
  );
  ok('Correo ya usado → 409', correoRepetido.status === 409, `status ${correoRepetido.status}`);

  // ── Cambio de la propia contrasena ──────────────────────────────────────
  //
  // Lo que hay que ver aqui: que cerrar las demas sesiones es de verdad (el
  // refresh viejo deja de servir) y que quien lo pide NO se queda fuera.
  const sesionVieja = await post('/auth/login', {
    email: 'e2e-nueva-coordinacion@uts.edu.co',
    password: 'ClaveNueva2026',
  });
  const tokenVivo = String(sesionVieja.json?.accessToken ?? '');
  const refrescoViejo = String(sesionVieja.json?.refreshToken ?? '');

  const claveMal = await post(
    '/auth/password',
    { currentPassword: 'la-que-no-es', newPassword: 'OtraClave2026' },
    tokenVivo,
  );
  ok('Contraseña actual equivocada → 401', claveMal.status === 401, `status ${claveMal.status}`);

  const mismaClave = await post(
    '/auth/password',
    { currentPassword: 'ClaveNueva2026', newPassword: 'ClaveNueva2026' },
    tokenVivo,
  );
  ok('Repetir la misma contraseña → 400', mismaClave.status === 400,
    `status ${mismaClave.status}`);

  const cambio = await post(
    '/auth/password',
    { currentPassword: 'ClaveNueva2026', newPassword: 'TerceraClave2026' },
    tokenVivo,
  );
  ok('Cambia su propia contraseña',
    cambio.status === 200 && String(cambio.json?.accessToken ?? '').length > 0,
    `status ${cambio.status}`);

  const refrescoRevocado = await post('/auth/refresh', { refreshToken: refrescoViejo });
  ok('El refresh anterior al cambio ya no sirve → 401', refrescoRevocado.status === 401,
    `status ${refrescoRevocado.status}`);

  const refrescoNuevo = await post('/auth/refresh', {
    refreshToken: String(cambio.json?.refreshToken ?? ''),
  });
  ok('Quien cambió la contraseña sigue dentro', refrescoNuevo.status === 200,
    `status ${refrescoNuevo.status}`);

  const loginNuevaClave = await post('/auth/login', {
    email: 'e2e-nueva-coordinacion@uts.edu.co',
    password: 'TerceraClave2026',
  });
  ok('Entra con la contraseña nueva', loginNuevaClave.status === 200,
    `status ${loginNuevaClave.status}`);

  const secretariaCambia = await post(
    '/auth/password',
    { currentPassword: CLAVE, newPassword: 'ClaveSecretaria2026' },
    secretaria,
  );
  ok('Secretaría cambia la suya pese a ser de solo lectura',
    secretariaCambia.status === 200, `status ${secretariaCambia.status}`);

  const estudianteDirecto = await post(
    '/usuarios',
    { email: 'e2e-est@uts.edu.co', password: 'ClaveNueva2026', fullName: 'Est', role: 'STUDENT' },
    admin,
  );
  ok('Una cuenta de estudiante no se crea aquí → 400', estudianteDirecto.status === 400,
    `status ${estudianteDirecto.status}`);

  // ── 20. Perfiles institucionales ────────────────────────────────────────
  seccion('20) Perfiles institucionales');

  const activas = await get('/instituciones/activas', docente);
  const slugsActivas = (activas.json?.items ?? []).map((i: any) => i.institutionId).sort();
  ok('UTS, UIS y UDES existen al arrancar sin ejecutar nada',
    JSON.stringify(slugsActivas) === JSON.stringify(['udes', 'uis', 'uts']),
    JSON.stringify(slugsActivas));

  const catalogoInst = await get('/registro/catalogo');
  ok('El catálogo del registro lista las instituciones activas',
    (catalogoInst.json?.instituciones ?? []).length === 3,
    `${(catalogoInst.json?.instituciones ?? []).length} instituciones`);

  const utsPerfil = await get('/instituciones/uts', admin);
  ok('UTS conserva los ponderados del motor (30/60/10 y 33/33/34)',
    utsPerfil.status === 200 &&
      JSON.stringify(utsPerfil.json?.item?.configuracionAcademica?.cortes?.map((c: any) => c.peso)) ===
        JSON.stringify([0.33, 0.33, 0.34]) &&
      JSON.stringify(utsPerfil.json?.item?.configuracionAcademica?.componentes?.map((c: any) => c.peso)) ===
        JSON.stringify([0.3, 0.6, 0.1]),
    JSON.stringify(utsPerfil.json?.item?.configuracionAcademica).slice(0, 160));
  ok('Los docentes existentes quedaron vinculados a las UTS',
    Number(utsPerfil.json?.item?.docentes ?? 0) >= 1, `docentes ${utsPerfil.json?.item?.docentes}`);

  const udesPerfil = await get('/instituciones/udes', admin);
  ok('UDES nace sin ponderados: los fija un administrador',
    udesPerfil.status === 200 && udesPerfil.json?.item?.configuracionAcademica === null,
    JSON.stringify(udesPerfil.json?.item?.configuracionAcademica));

  const crearComoDocente = await post(
    '/instituciones',
    { institutionId: 'unab', nombre: 'Universidad Autónoma de Bucaramanga', sigla: 'UNAB' },
    docente,
  );
  ok('Un docente no crea instituciones → 403', crearComoDocente.status === 403,
    `status ${crearComoDocente.status}`);

  const sinNombre = await post('/instituciones', { institutionId: 'x1', nombre: '  ', sigla: 'X1' }, admin);
  ok('Sin nombre → 400', sinNombre.status === 400, `status ${sinNombre.status}`);

  const siglaMala = await post(
    '/instituciones',
    { institutionId: 'unab', nombre: 'Universidad Autónoma de Bucaramanga', sigla: 'U N!' },
    admin,
  );
  ok('Sigla inválida → 400', siglaMala.status === 400, `status ${siglaMala.status}`);

  const duplicadaPorTildes = await post(
    '/instituciones',
    { institutionId: 'uts2', nombre: 'UNIDADES TECNOLOGICAS DE SANTANDER', sigla: 'UTS2' },
    admin,
  );
  ok('El mismo nombre sin tildes ni mayúsculas → 409', duplicadaPorTildes.status === 409,
    `status ${duplicadaPorTildes.status}`);

  const idDuplicado = await post(
    '/instituciones',
    { institutionId: 'uis', nombre: 'Otra con el mismo id', sigla: 'OTRA' },
    admin,
  );
  ok('Identificador duplicado → 409', idDuplicado.status === 409, `status ${idDuplicado.status}`);

  const coincidencias = await get(
    `/instituciones/coincidencias?nombre=${encodeURIComponent('Universidad de Santander UDES')}&sigla=USA`,
    admin,
  );
  ok('Antes de crear se advierte del parecido con UDES',
    (coincidencias.json?.items ?? []).some((c: any) => c.perfil?.institutionId === 'udes'),
    JSON.stringify(coincidencias.json?.items ?? []).slice(0, 160));

  const creada = await post(
    '/instituciones',
    {
      institutionId: 'unab',
      nombre: 'Universidad Autónoma de Bucaramanga',
      sigla: 'unab',
      aliases: ['Autónoma de Bucaramanga', 'Autonoma de Bucaramanga'],
    },
    admin,
  );
  ok('ADMIN crea una universidad nueva → 201', creada.status === 201, JSON.stringify(creada.json).slice(0, 140));
  ok('La sigla se guarda en mayúsculas y los alias sin repetidos',
    creada.json?.item?.sigla === 'UNAB' && (creada.json?.item?.aliases ?? []).length === 1,
    JSON.stringify(creada.json?.item?.aliases));

  const porAlias = await post(
    '/instituciones',
    { institutionId: 'autonoma', nombre: 'Autonoma de Bucaramanga', sigla: 'ADB' },
    admin,
  );
  ok('Un alias registrado impide crear el duplicado → 409', porAlias.status === 409,
    `status ${porAlias.status}`);

  const catalogoConNueva = await get('/registro/catalogo');
  ok('La universidad nueva aparece en el selector del registro sin tocar nada más',
    (catalogoConNueva.json?.instituciones ?? []).some((i: any) => i.institutionId === 'unab'),
    `${(catalogoConNueva.json?.instituciones ?? []).length} instituciones`);

  const pesosMal = await put(
    '/instituciones/unab/configuracion',
    {
      cortes: [{ numero: 1, nombre: 'Único', peso: 0.5 }],
      componentes: [{ id: 'PARCIALES', nombre: 'Parciales', peso: 1 }],
      notaMinima: 0, notaMaxima: 5, notaAprobacion: 3,
    },
    admin,
  );
  ok('Ponderados que no suman 100 % → 400', pesosMal.status === 400,
    `status ${pesosMal.status} ${pesosMal.json?.message ?? ''}`);

  const configurada = await put(
    '/instituciones/unab/configuracion',
    {
      cortes: [
        { numero: 1, nombre: 'Primer corte', peso: 0.5 },
        { numero: 2, nombre: 'Segundo corte', peso: 0.5 },
      ],
      componentes: [
        { id: 'TALLERES', nombre: 'Talleres', peso: 0.4 },
        { id: 'EXAMEN', nombre: 'Examen', peso: 0.6 },
      ],
      notaMinima: 0, notaMaxima: 5, notaAprobacion: 3,
    },
    admin,
  );
  ok('ADMIN configura cortes y ponderados de la nueva',
    configurada.status === 200 && configurada.json?.item?.configuracionAcademica?.cortes?.length === 2,
    `status ${configurada.status}`);

  const configComoDocente = await put(
    '/instituciones/uts/configuracion',
    { cortes: [], componentes: [], notaMinima: 0, notaMaxima: 5, notaAprobacion: 3 },
    docente,
  );
  ok('Un docente no toca la configuración institucional → 403', configComoDocente.status === 403,
    `status ${configComoDocente.status}`);

  // Registro con una institución que no existe: queda como solicitud.
  const solicitudOtra = await post('/registro', {
    ...SOLICITUD,
    cedula: '1098765433',
    email: 'e2e-otra-universidad@uts.edu.co',
    institucionSolicitada: 'Universidad Pontificia Bolivariana',
  });
  ok('Registro con institución escrita a mano → 201', solicitudOtra.status === 201,
    JSON.stringify(solicitudOtra.json).slice(0, 120));

  const solicitudPorAlias = await post('/registro', {
    ...SOLICITUD,
    cedula: '1098765434',
    email: 'e2e-por-alias@uts.edu.co',
    institucionSolicitada: 'autonoma de bucaramanga',
  });
  ok('Escribir un alias vincula a la institución existente → 201', solicitudPorAlias.status === 201,
    `status ${solicitudPorAlias.status}`);

  const inexistente = await post('/registro', {
    ...SOLICITUD,
    cedula: '1098765435',
    email: 'e2e-inexistente@uts.edu.co',
    institutionId: 'no-existe',
  });
  ok('Un institutionId que no existe → 400', inexistente.status === 400, `status ${inexistente.status}`);

  const solicitudes = await get('/instituciones/solicitudes', admin);
  const pendienteUpb = (solicitudes.json?.items ?? []).find(
    (s: any) => s.email === 'e2e-otra-universidad@uts.edu.co',
  );
  ok('La institución pedida aparece en las solicitudes pendientes',
    Boolean(pendienteUpb) && pendienteUpb.institucionSolicitada === 'Universidad Pontificia Bolivariana',
    `${(solicitudes.json?.items ?? []).length} solicitudes`);
  ok('La que coincidió con un alias no queda pendiente',
    !(solicitudes.json?.items ?? []).some((s: any) => s.email === 'e2e-por-alias@uts.edu.co'));

  const docentesUnab = await get('/instituciones/unab/docentes', admin);
  ok('La institución lista a sus docentes vinculados',
    (docentesUnab.json?.items ?? []).some((d: any) => d.email === 'e2e-por-alias@uts.edu.co'),
    `${(docentesUnab.json?.items ?? []).length} docentes`);

  const creadaDesdeSolicitud = await post(
    `/instituciones/solicitudes/${pendienteUpb?.id}/crear`,
    { institutionId: 'upb', nombre: 'Universidad Pontificia Bolivariana', sigla: 'UPB' },
    admin,
  );
  ok('Crear el perfil desde la solicitud la vincula en el mismo paso',
    creadaDesdeSolicitud.status === 201 && creadaDesdeSolicitud.json?.docente?.institucionSolicitada === null,
    JSON.stringify(creadaDesdeSolicitud.json).slice(0, 160));

  const cambioDocente = await patch(
    `/instituciones/docentes/${pendienteUpb?.id}`,
    { institutionId: 'unab' },
    admin,
  );
  ok('ADMIN cambia la institución de un docente', cambioDocente.status === 200,
    `status ${cambioDocente.status}`);

  const borrarConDocentes = await del('/instituciones/unab', admin);
  ok('Eliminar una institución con docentes → 409', borrarConDocentes.status === 409,
    `status ${borrarConDocentes.status}`);

  const desactivada = await patch('/instituciones/upb', { activa: false }, admin);
  ok('Desactivar conserva el perfil', desactivada.status === 200 && desactivada.json?.item?.activa === false,
    `status ${desactivada.status}`);
  const catalogoSinUpb = await get('/registro/catalogo');
  ok('Una institución desactivada deja de ofrecerse en el registro',
    !(catalogoSinUpb.json?.instituciones ?? []).some((i: any) => i.institutionId === 'upb'));
  const registroEnDesactivada = await post('/registro', {
    ...SOLICITUD,
    cedula: '1098765436',
    email: 'e2e-desactivada@uts.edu.co',
    institutionId: 'upb',
  });
  ok('Registrarse en una desactivada → 400', registroEnDesactivada.status === 400,
    `status ${registroEnDesactivada.status}`);

  const borrarSinDocentes = await del('/instituciones/upb', admin);
  ok('Eliminar una sin registros relacionados → 200 (borrado lógico)',
    borrarSinDocentes.status === 200, `status ${borrarSinDocentes.status}`);
  const listaFinal = await get('/instituciones', admin);
  ok('La eliminada no vuelve a listarse',
    !(listaFinal.json?.items ?? []).some((i: any) => i.institutionId === 'upb'));

  // ── 21. Institución por rol ─────────────────────────────────────────────
  seccion('21) Institución por rol: todos menos ADMIN');

  // El arranque vincula a las UTS las cuentas y fichas anteriores a los
  // perfiles: aquí se crearon después de arrancar, así que se repite lo que
  // hace el arranque antes de comprobar alcances.
  await asegurarPerfilesIniciales();

  const sinInstitucion = await post(
    '/usuarios',
    { email: 'e2e-sin-inst@uts.edu.co', password: 'ClaveNueva2026', fullName: 'Sin institución', role: 'COORDINATOR' },
    admin,
  );
  ok('Una coordinación sin institución → 400', sinInstitucion.status === 400, `status ${sinInstitucion.status}`);

  const adminNuevo = await post(
    '/usuarios',
    { email: 'e2e-admin2@uts.edu.co', password: 'ClaveNueva2026', fullName: 'Admin dos', role: 'ADMIN' },
    admin,
  );
  ok('ADMIN se crea sin institución y ve todas',
    adminNuevo.status === 201 && adminNuevo.json?.item?.institucion === null,
    JSON.stringify(adminNuevo.json?.item?.institucion));

  const coordUdes = await post(
    '/usuarios',
    {
      email: 'e2e-coord-udes@uts.edu.co',
      password: CLAVE,
      fullName: 'Coordinación UDES',
      role: 'COORDINATOR',
      institutionId: 'udes',
    },
    admin,
  );
  ok('Una coordinación nace con su institución',
    coordUdes.status === 201 && coordUdes.json?.item?.institucion?.institutionId === 'udes',
    JSON.stringify(coordUdes.json?.item?.institucion));
  const coordUdesId = String(coordUdes.json?.item?.id ?? '');

  const sesionUdes = await login('e2e-coord-udes@uts.edu.co');
  const materiasUdes = await get(`/coordinacion/materias?period=${PERIODO}`, sesionUdes);
  ok('Coordinación de la UDES no ve materias de docentes de las UTS',
    materiasUdes.status === 200 && (materiasUdes.json?.items ?? []).length === 0,
    `status ${materiasUdes.status} · ${JSON.stringify(materiasUdes.json).slice(0, 160)}`);
  const institucionesUdes = await get('/instituciones', sesionUdes);
  ok('Coordinación solo ve su propia institución en el listado',
    institucionesUdes.status === 200 &&
      (institucionesUdes.json?.items ?? []).map((i: any) => i.institutionId).join() === 'udes',
    `status ${institucionesUdes.status} · ${JSON.stringify(institucionesUdes.json).slice(0, 160)}`);

  const movida = await patch(`/usuarios/${coordUdesId}`, { institutionId: 'uts' }, admin);
  ok('ADMIN cambia la institución de una cuenta',
    movida.status === 200 && movida.json?.item?.institucion?.institutionId === 'uts',
    JSON.stringify(movida.json?.item?.institucion));
  const materiasTrasMover = await get(`/coordinacion/materias?period=${PERIODO}`, sesionUdes);
  ok('Al pasar a las UTS ve sus materias sin cerrar sesión',
    materiasTrasMover.status === 200 && (materiasTrasMover.json?.items ?? []).length >= 1,
    `${(materiasTrasMover.json?.items ?? []).length} materias`);

  const ascenso = await patch(`/usuarios/${coordUdesId}`, { role: 'ADMIN' }, admin);
  ok('Al pasar a ADMIN la institución se borra',
    ascenso.status === 200 && ascenso.json?.item?.institucion === null,
    JSON.stringify(ascenso.json?.item?.institucion));

  const docenteDemo = await get('/usuarios?role=PROFESSOR', admin);
  const fichaDemo = (docenteDemo.json?.items ?? []).find((u: any) => u.email === 'e2e-docente@uts.edu.co');
  ok('La cuenta del docente lleva la institución de su ficha (UTS)',
    fichaDemo?.institucion?.institutionId === 'uts',
    JSON.stringify(fichaDemo?.institucion));
}

main().catch(async error => {
  console.error('\n⛔ La suite se interrumpió:', error);
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
