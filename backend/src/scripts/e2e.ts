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
    { name: 'Cálculo E2E', code: 'E2E-CAL', credits: 4, period: PERIODO, professorId: docenteId },
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
}

main().catch(async error => {
  console.error('\n⛔ La suite se interrumpió:', error);
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
