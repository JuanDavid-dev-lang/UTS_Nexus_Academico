/**
 * Suite E2E de la asistencia por QR.
 *
 * El servicio real sobre una base MongoDB real, con Firestore simulado dentro
 * del proceso. Lo que se prueba es lo que puede escribir asistencia que nadie
 * observó o perder la de alguien que sí vino: quién puede abrir, qué marcas se
 * aceptan y por qué se rechaza cada una, que el enlace quede fijo, que dos
 * pasadas no dupliquen nada, que un estudiante marque en cada una de sus
 * materias y en ninguna otra, y que el cierre marque ausentes **sin pisar** lo
 * que el docente puso a mano.
 *
 * Firestore va simulado sustituyendo `fetch`: es la única frontera con otra
 * aplicación, y el contrato que se simula —rutas, `updateMask`,
 * `currentDocument.exists`, `runQuery`— es el mismo que describe
 * `docs/UNIPLANNER.md` §8.
 *
 * Mismo aislamiento que `e2e.ts`: base propia con nombre único, borrada al
 * terminar, y se niega a arrancar contra un clúster remoto.
 *
 * Uso:
 *   npm run test:e2e:qr
 *   E2E_MONGODB_URI="mongodb://127.0.0.1:27017" npm run test:e2e:qr
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const SUFIJO = randomBytes(4).toString('hex');
const BASE_URI = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
if (/mongodb\+srv:\/\//i.test(BASE_URI)) {
  console.error('\n⛔ E2E_MONGODB_URI apunta a un clúster remoto. La suite borra la base al terminar.\n');
  process.exit(1);
}

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = `${BASE_URI.replace(/\/+$/, '')}/uts_e2e_qr_${SUFIJO}`;
process.env.JWT_ACCESS_SECRET = `e2e-access-${SUFIJO}-${'x'.repeat(32)}`;
process.env.JWT_REFRESH_SECRET = `e2e-refresh-${SUFIJO}-${'y'.repeat(32)}`;
process.env.UNIPLANNER_PROJECT_ID = 'fake';
process.env.UNIPLANNER_CLIENT_EMAIL = 'nexus@fake.iam.gserviceaccount.com';
process.env.UNIPLANNER_PRIVATE_KEY = privateKey;
process.env.UNIPLANNER_SOLO_VERIFICADOS = '0';
process.env.CAMPUS_UTC_OFFSET_MIN = '-300';

// ── Firestore simulado ───────────────────────────────────────────────────────
type ValorF = {
  stringValue?: string;
  timestampValue?: string;
  booleanValue?: boolean;
  mapValue?: { fields?: Record<string, ValorF> };
};
type DocF = Record<string, ValorF>;
type CuerpoF = {
  documents?: string[];
  fields?: DocF;
  structuredQuery?: {
    limit?: number;
    from?: { collectionId?: string }[];
    orderBy?: { field?: { fieldPath?: string } }[];
    where?: {
      fieldFilter?: { field?: { fieldPath?: string }; value?: ValorF };
      compositeFilter?: { filters?: { fieldFilter?: { field?: { fieldPath?: string }; value?: ValorF } }[] };
    };
  };
};
const store = new Map<string, DocF>();
const ROOT = 'projects/fake/databases/(default)/documents';
const llamadas: string[] = [];

globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const metodo = init.method ?? 'GET';
  const cuerpo = (typeof init.body === 'string' ? JSON.parse(init.body) : {}) as CuerpoF;
  const json = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  if (url.hostname === 'oauth2.googleapis.com') return json(200, { access_token: 'tok', expires_in: 3600 });
  const ruta = decodeURIComponent(url.pathname.replace(`/v1/${ROOT}`, '').replace(/^\//, ''));
  llamadas.push(`${metodo} ${ruta}`);

  if (ruta === ':batchGet' || url.pathname.endsWith(':batchGet')) {
    return json(
      200,
      (cuerpo.documents ?? []).map((nombre) => {
        const clave = nombre.replace(`${ROOT}/`, '');
        return store.has(clave) ? { found: { name: nombre, fields: store.get(clave) } } : { missing: nombre };
      }),
    );
  }
  if (metodo === 'POST' && ruta === ':runQuery') {
    // Consulta de colección de primer nivel con igualdades, como hace la
    // pantalla de vínculos.
    const q = cuerpo.structuredQuery ?? {};
    const coleccion = q.from?.[0]?.collectionId ?? '';
    const filtros = q.where?.compositeFilter?.filters ?? (q.where?.fieldFilter ? [q.where] : []);
    const plano = (v: ValorF | undefined) => v?.stringValue ?? v?.booleanValue;
    const instante = (v: ValorF | undefined) => +new Date(String(v?.timestampValue));
    // Igualdades (pantalla de vínculos) o un `>=` por fecha con su orden
    // (enlaces por verificar). Como Firestore: sin el campo del orden, fuera.
    const orden = q.orderBy?.[0]?.field?.fieldPath ?? '__name__';
    const docs = [...store.entries()]
      .filter(([k]) => k.startsWith(`${coleccion}/`) && !k.slice(coleccion.length + 1).includes('/'))
      .filter(([, v]) => orden === '__name__' || v[orden])
      .filter(([, v]) =>
        filtros.every((f) => {
          const campo = f.fieldFilter!.field!.fieldPath!;
          return (f.fieldFilter as { op?: string }).op === 'GREATER_THAN_OR_EQUAL'
            ? instante(v[campo]) >= instante(f.fieldFilter!.value)
            : plano(v[campo]) === plano(f.fieldFilter!.value);
        }),
      )
      .sort(([a, va], [b, vb]) => (orden === '__name__' ? a.localeCompare(b) : instante(va[orden]) - instante(vb[orden])))
      .slice(0, q.limit);
    if (docs.length === 0) return json(200, [{ readTime: new Date().toISOString() }]);
    return json(200, docs.map(([k, v]) => ({ document: { name: `${ROOT}/${k}`, fields: v } })));
  }
  if (metodo === 'GET') {
    return store.has(ruta) ? json(200, { name: `${ROOT}/${ruta}`, fields: store.get(ruta) }) : json(404, {});
  }
  if (metodo === 'DELETE') {
    store.delete(ruta);
    return json(200, {});
  }
  if (metodo === 'POST' && ruta.endsWith(':runQuery')) {
    const sesion = ruta.replace(':runQuery', '');
    const prefijo = `${sesion}/checkins/`;
    // Como Firestore: se ordena y se filtra por el campo pedido, y los
    // documentos que no lo tienen no salen.
    const campo = cuerpo.structuredQuery?.orderBy?.[0]?.field?.fieldPath ?? 'createdAt';
    const desde = cuerpo.structuredQuery?.where?.fieldFilter?.value?.timestampValue;
    const hora = (v: DocF) => +new Date(String(v[campo]?.timestampValue));
    const docs = [...store.entries()]
      .filter(([k, v]) => k.startsWith(prefijo) && !k.slice(prefijo.length).includes('/') && v[campo])
      .filter(([, v]) => !desde || hora(v) >= +new Date(desde))
      .sort((a, b) => hora(a[1]) - hora(b[1]))
      .slice(0, cuerpo.structuredQuery?.limit);
    if (docs.length === 0) return json(200, [{ readTime: new Date().toISOString() }]);
    return json(200, docs.map(([k, v]) => ({ document: { name: `${ROOT}/${k}`, fields: v } })));
  }
  if (metodo === 'PATCH') {
    const mascara = url.searchParams.getAll('updateMask.fieldPaths');
    if (url.searchParams.get('currentDocument.exists') === 'true' && !store.has(ruta)) {
      return json(404, { error: 'NOT_FOUND' });
    }
    const previo = store.get(ruta) ?? {};
    const nuevo: DocF = { ...previo };
    // Como Firestore: un campo de la máscara que no viene en el cuerpo se borra.
    for (const campo of mascara) {
      if (cuerpo.fields?.[campo]) nuevo[campo] = cuerpo.fields[campo];
      else delete nuevo[campo];
    }
    store.set(ruta, nuevo);
    return json(200, { name: `${ROOT}/${ruta}`, fields: nuevo });
  }
  return json(500, { error: `no simulado: ${metodo} ${ruta}` });
}) as typeof fetch;

const s = (v: string) => ({ stringValue: v });
const ts = (d: Date) => ({ timestampValue: d.toISOString() });
function enlazar(codigo: string, uid: string) {
  store.set(`institution_links/uts__${codigo}`, { uid: s(uid), studentCode: s(codigo), institutionId: s('uts') });
}
function marcar(sesionId: string, uid: string, qr: string, deviceId: string, cuando = new Date()) {
  store.set(`attendance_sessions/${sesionId}/checkins/${uid}`, {
    uid: s(uid),
    qr: s(qr),
    deviceId: s(deviceId),
    createdAt: ts(cuando),
  });
}
const doc = (sesionId: string, uid: string) => store.get(`attendance_sessions/${sesionId}/checkins/${uid}`);
const respuesta = (sesionId: string, uid: string) => {
  const f = doc(sesionId, uid);
  return { status: f?.status?.stringValue, reason: f?.reason?.stringValue ?? null };
};
/** Lo que haría UniPlanner al pulsar «Confirmar». */
function confirmar(sesionId: string, uid: string, cuando = new Date()) {
  const f = doc(sesionId, uid);
  if (!f) throw new Error(`no hay marca de ${uid}`);
  f.confirmedAt = ts(cuando);
}

// ── Proyecto ─────────────────────────────────────────────────────────────────
const mongoose = (await import('mongoose')).default;
const { InstitutionModel } = await import('../models/institution.model.js');
const { UserModel } = await import('../models/user.model.js');
const { SubjectModel } = await import('../models/subject.model.js');
const { GroupModel } = await import('../models/group.model.js');
const { StudentModel } = await import('../models/student.model.js');
const { EnrollmentModel } = await import('../models/enrollment.model.js');
const { AttendanceModel } = await import('../models/attendance.model.js');
const { AttendanceSessionModel } = await import('../models/attendance-session.model.js');
await import('../models/qr-binding.model.js');
const { AcademicPeriodModel } = await import('../models/academic-period.model.js');
const svc = await import('../modules/attendance-qr/attendance-qr.service.js');
const { componerQr, ventanaDe } = await import('../domains/attendance/qr-session.js');
const { normalizarFechaDeClase, diaDeCampus } = await import('../domains/attendance/class-date.js');
const { invalidarCachePeriodos } = await import('../shared/period-guard.js');

await mongoose.connect(process.env.MONGODB_URI!);
await mongoose.connection.dropDatabase();
// Borrar la base se lleva los índices que Mongoose creó al conectar, y los
// únicos son parte de lo que se prueba (una sesión abierta por materia y
// docente, un vínculo por cuenta y semestre).
await Promise.all(
  ['SesionAsistencia', 'VinculoQrSemestre', 'Asistencia'].map((nombre) => mongoose.model(nombre).createIndexes()),
);

let ok = 0;
const conEstado = (codigo: number) => (e: unknown) => (e as { statusCode?: number }).statusCode === codigo;
const paso = (nombre: string) => {
  ok++;
  console.log(`  ✓ ${nombre}`);
};

try {
  const periodo = '2026-2';
  const inst = await InstitutionModel.create({ institutionId: 'uts', nombre: 'Unidades Tecnológicas', sigla: 'UTS' });
  const docente = await UserModel.create({
    email: 'docente@uts.edu.co',
    passwordHash: 'x',
    role: 'PROFESSOR',
    fullName: 'Docente Prueba',
    institutionId: inst._id,
  });
  const actor = { id: String(docente._id), role: 'PROFESSOR' };
  const intruso = await UserModel.create({
    email: 'otro@uts.edu.co',
    passwordHash: 'x',
    role: 'PROFESSOR',
    fullName: 'Otro',
    institutionId: inst._id,
  });

  const materia = await SubjectModel.create({ name: 'Cálculo', code: 'MAT101', professorId: docente._id, period: periodo });
  const materia2 = await SubjectModel.create({ name: 'Física', code: 'FIS201', professorId: docente._id, period: periodo });
  const grupo = await GroupModel.create({ name: 'A194', subjectId: materia._id, professorId: docente._id, period: periodo });
  const grupo2 = await GroupModel.create({ name: 'B201', subjectId: materia2._id, professorId: docente._id, period: periodo });

  const nombres = ['ana', 'beto', 'caro', 'dani', 'eva', 'fede', 'gabi', 'hugo', 'ivan'];
  const est: Record<string, { _id: unknown; code: string }> = {};
  for (const [i, n] of nombres.entries()) {
    est[n] = await StudentModel.create({ code: `10000000${i}`, fullName: n.toUpperCase(), program: 'Sistemas' });
    await EnrollmentModel.create({
      studentId: est[n]._id,
      groupId: grupo._id,
      subjectId: materia._id,
      professorId: docente._id,
      period: periodo,
    });
  }
  // Una sola persona en varias materias: ana también está en Física.
  await EnrollmentModel.create({
    studentId: est.ana._id,
    groupId: grupo2._id,
    subjectId: materia2._id,
    professorId: docente._id,
    period: periodo,
  });

  enlazar(est.ana.code, 'uid-ana');
  enlazar(est.beto.code, 'uid-beto');
  enlazar(est.caro.code, 'uid-multi');
  enlazar(est.dani.code, 'uid-multi');
  enlazar(est.hugo.code, 'uid-hugo');
  enlazar(est.ivan.code, 'uid-ivan');

  // ── Alcance ────────────────────────────────────────────────────────────────
  await assert.rejects(
    svc.abrirSesion({ subjectId: String(materia._id), groupId: String(grupo._id), minutos: 15, marcarAusentes: true }, { id: String(intruso._id), role: 'PROFESSOR' }),
    conEstado(403),
  );
  paso('un docente no abre la clase de otro (403)');

  // ── Abrir ──────────────────────────────────────────────────────────────────
  const { id, existente } = await svc.abrirSesion(
    { subjectId: String(materia._id), groupId: String(grupo._id), minutos: 15, marcarAusentes: true },
    actor,
  );
  assert.equal(existente, false);
  assert.equal(store.get(`attendance_sessions/${id}`)?.open?.booleanValue, true);
  assert.equal(store.get(`attendance_sessions/${id}`)?.courseCode?.stringValue, 'MAT101');
  paso('abre la sesión y la publica en Firestore');

  // Otro grupo de la misma materia y del mismo docente: su lista es otra.
  const grupoA193 = await GroupModel.create({ name: 'A193', subjectId: materia._id, professorId: docente._id, period: periodo });
  await assert.rejects(
    svc.abrirSesion({ subjectId: String(materia._id), groupId: String(grupo2._id), minutos: 15, marcarAusentes: true }, actor),
    conEstado(404),
  );
  // Sin matriculados en A193 no hay lista que pasar, y no se mezcla con A194.
  await assert.rejects(
    svc.abrirSesion({ subjectId: String(materia._id), groupId: String(grupoA193._id), minutos: 15, marcarAusentes: true }, actor),
    conEstado(409),
  );
  paso('la lista es de un grupo: uno de otra materia es 404, y A193 no hereda a los de A194');

  const otraVez = await svc.abrirSesion({ subjectId: String(materia._id), groupId: String(grupo._id), minutos: 15, marcarAusentes: true }, actor);
  assert.deepEqual(otraVez, { id, existente: true });
  paso('abrir dos veces devuelve la misma sesión');

  await assert.rejects(svc.vistaDeSesion(id, { id: String(intruso._id), role: 'PROFESSOR' }), conEstado(404));
  paso('otro docente no ve la sesión (404)');

  const { contenido } = await svc.qrVigente(id, actor);
  assert.match(contenido, /^UNX1\|[a-f0-9]{24}\|\d+\|MAT101\|A194\|\d\d:\d\d\|/);
  paso(`QR vigente: ${contenido}`);

  const secreto = (await AttendanceSessionModel.findById(id).select('+secreto').lean())!.secreto as string;
  // Un segundo atrás: las marcas de la prueba no pueden quedar en el futuro
  // respecto a las que se creen después, o el cursor las dejaría fuera. Y no
  // antes de abrir la sesión, o serían marcas de fuera de hora.
  await new Promise((r) => setTimeout(r, 1200));
  const ahora = new Date(Date.now() - 1000);
  const hace2min = new Date(ahora.getTime() - 120_000);
  const viejo = componerQr({ sesionId: id, ventana: ventanaDe(hace2min), materia: 'MAT101', grupo: 'A194', hora: '10:00' }, secreto);
  const falso = componerQr({ sesionId: id, ventana: ventanaDe(ahora), materia: 'MAT101', grupo: 'A194', hora: '10:00' }, 'adivinado');

  marcar(id, 'uid-ana', contenido, 'tel-1', ahora);
  marcar(id, 'uid-beto', viejo, 'tel-2', ahora);
  marcar(id, 'uid-multi', contenido, 'tel-3', ahora);
  marcar(id, 'uid-intruso', contenido, 'tel-4', ahora);
  marcar(id, 'uid-hugo', contenido, 'tel-1', new Date(ahora.getTime() + 300));
  marcar(id, 'uid-ivan', falso, 'tel-5', ahora);

  await svc.procesarSesionesAbiertas();

  // ── Vista previa: sus datos, y todavía nada escrito ──────────────────────
  const previa = doc(id, 'uid-ana');
  assert.equal(previa?.stage?.stringValue, 'preview');
  assert.equal(previa?.status, undefined);
  const datos = previa?.preview?.mapValue?.fields ?? {};
  assert.equal(datos.studentName?.stringValue, 'ANA');
  assert.equal(datos.studentDocument?.stringValue, `•••••${est.ana!.code.slice(-4)}`);
  assert.equal(datos.courseName?.stringValue, 'Cálculo');
  assert.equal(datos.group?.stringValue, 'A194');
  assert.equal(datos.teacherName?.stringValue, 'Docente Prueba');
  assert.equal(await AttendanceModel.countDocuments({ subjectId: materia._id }), 0);
  paso('al escanear ve su nombre, su documento tapado, la materia y el grupo — y no se escribe nada');

  assert.deepEqual(respuesta(id, 'uid-beto'), { status: 'rejected', reason: 'QR_VENCIDO' });
  assert.deepEqual(respuesta(id, 'uid-multi'), { status: 'rejected', reason: 'CUENTA_CON_VARIOS_ENLACES' });
  assert.deepEqual(respuesta(id, 'uid-intruso'), { status: 'rejected', reason: 'NO_MATRICULADO' });
  assert.deepEqual(respuesta(id, 'uid-hugo'), { status: 'rejected', reason: 'DISPOSITIVO_REPETIDO' });
  assert.deepEqual(respuesta(id, 'uid-ivan'), { status: 'rejected', reason: 'QR_INVALIDO' });
  paso('los rechazos llegan antes de confirmar, con su motivo — incluido «no estás en este curso»');

  const vistaPrevia = await svc.vistaDeSesion(id, actor);
  assert.equal(vistaPrevia.alumnos.find((a) => a.fullName === 'ANA')?.estado, 'CONFIRMANDO');
  assert.equal(vistaPrevia.resumen.confirmando, 1);
  paso('el docente ve a ana «confirmando»');

  // ── Confirmar ─────────────────────────────────────────────────────────────
  // Pasado un rato: la vigencia del QR se midió al escanear.
  confirmar(id, 'uid-ana');
  await svc.procesarSesionesAbiertas();

  const dia = diaDeCampus(new Date(), -300);
  const fecha = normalizarFechaDeClase(dia, -300)!;
  const asistenciaAna = await AttendanceModel.findOne({ studentId: est.ana!._id, subjectId: materia._id }).lean();
  assert.equal(asistenciaAna?.present, true);
  assert.equal(asistenciaAna?.origen, 'QR');
  assert.equal(asistenciaAna?.date.toISOString(), fecha.toISOString());
  assert.equal(String(asistenciaAna?.groupId), String(grupo._id));
  assert.deepEqual(respuesta(id, 'uid-ana'), { status: 'accepted', reason: null });
  assert.equal(doc(id, 'uid-ana')?.stage?.stringValue, 'done');
  paso(`al confirmar queda presente, origen QR, fecha canónica ${fecha.toISOString()}`);

  const lock = store.get(`institution_links/uts__${est.ana!.code}`)?.lockedUntil?.timestampValue;
  // Periodo 2026-2 sin fecha configurada: hasta el 20 de diciembre, entero,
  // en la hora del campus (la fecha por defecto que cubre el calendario UTS).
  assert.equal(lock, '2026-12-21T04:59:59.999Z');
  assert.equal(store.get(`institution_links/uts__${est.beto!.code}`)?.lockedUntil, undefined);
  paso('el enlace de ana queda fijo hasta el fin del semestre; el de beto (rechazado) no');

  const antes = llamadas.filter((l) => l.startsWith('PATCH institution_links')).length;
  const escriturasAntes = (await AttendanceSessionModel.findById(id).lean())!.revision;
  await svc.procesarSesionesAbiertas();
  const sesion1 = await AttendanceSessionModel.findById(id).lean();
  assert.equal(sesion1!.marcas.length, 6);
  assert.equal(sesion1!.revision, escriturasAntes);
  assert.equal(await AttendanceModel.countDocuments({ subjectId: materia._id }), 1);
  assert.equal(llamadas.filter((l) => l.startsWith('PATCH institution_links')).length, antes);
  paso('una pasada sin nada nuevo no escribe la sesión ni duplica asistencia o bloqueos');

  // eva instala la app en plena clase.
  enlazar(est.eva!.code, 'uid-eva');
  marcar(id, 'uid-eva', (await svc.qrVigente(id, actor)).contenido, 'tel-6');
  await svc.procesarSesionesAbiertas();
  assert.equal(doc(id, 'uid-eva')?.stage?.stringValue, 'preview');
  confirmar(id, 'uid-eva');
  await svc.procesarSesionesAbiertas();
  assert.deepEqual(respuesta(id, 'uid-eva'), { status: 'accepted', reason: null });
  paso('quien se enlaza después de abrir la sesión también marca');

  // beto tenía el QR vencido: UniPlanner borra su marca rechazada y vuelve a
  // escanear. El intento nuevo sustituye al rechazado.
  marcar(id, 'uid-beto', (await svc.qrVigente(id, actor)).contenido, 'tel-2');
  await svc.procesarSesionesAbiertas();
  confirmar(id, 'uid-beto');
  await svc.procesarSesionesAbiertas();
  assert.deepEqual(respuesta(id, 'uid-beto'), { status: 'accepted', reason: null });
  const marcaBeto = (await AttendanceSessionModel.findById(id).lean())!.marcas.filter((m) => m.uid === 'uid-beto');
  assert.equal(marcaBeto.length, 1);
  assert.equal(marcaBeto[0]!.intentos, 2);
  paso('tras un rechazo por QR vencido se puede reintentar, y el intento sustituye al anterior');

  // ivan escanea bien, ve su vista previa y no confirma.
  marcar(id, 'uid-ivan', (await svc.qrVigente(id, actor)).contenido, 'tel-5');
  await svc.procesarSesionesAbiertas();
  assert.equal(doc(id, 'uid-ivan')?.stage?.stringValue, 'preview');

  // Una aceptada no se reevalúa aunque llegue otro documento con su uid.
  marcar(id, 'uid-ana', 'basura', 'tel-1');
  await svc.procesarSesionesAbiertas();
  assert.equal((await AttendanceModel.findOne({ studentId: est.ana!._id, subjectId: materia._id }).lean())!.present, true);
  paso('una marca aceptada no se reevalúa');

  // El docente marca a fede a mano (como el escritorio: mediodía local → ISO).
  await AttendanceModel.create({
    studentId: est.fede!._id,
    subjectId: materia._id,
    teacherId: docente._id,
    period: periodo,
    date: normalizarFechaDeClase(`${dia}T17:00:00.000Z`, -300),
    present: true,
    lateMinutes: 12,
    origen: 'MANUAL',
  });

  const vista = await svc.vistaDeSesion(id, actor);
  assert.equal(vista.resumen.presentes, 3);
  assert.equal(vista.resumen.confirmando, 1);
  assert.equal(vista.resumen.matriculados, 9);
  assert.equal(vista.rechazos.length, 3);
  assert.ok(vista.restanteMs > 0);
  paso(`vista: ${vista.resumen.presentes}/${vista.resumen.matriculados} presentes, 1 confirmando, ${vista.rechazos.length} rechazos`);

  // ── Cerrar ─────────────────────────────────────────────────────────────────
  await svc.cerrarSesion(id, actor);
  const cerrada = await AttendanceSessionModel.findById(id).lean();
  assert.equal(cerrada!.estado, 'CERRADA');
  assert.equal(cerrada!.motivoCierre, 'DOCENTE');
  assert.equal(store.get(`attendance_sessions/${id}`)?.open?.booleanValue, false);
  assert.deepEqual(respuesta(id, 'uid-ivan'), { status: 'rejected', reason: 'SIN_CONFIRMAR' });
  paso('cerrar la marca cerrada aquí y en Firestore, y a quien no confirmó se le dice');

  const filas = await AttendanceModel.find({ subjectId: materia._id }).lean();
  const porNombre = Object.fromEntries(
    filas.map((f) => [nombres.find((n) => String(est[n]!._id) === String(f.studentId)), f]),
  );
  assert.equal(filas.length, 9);
  for (const n of ['ana', 'beto', 'eva']) assert.equal(porNombre[n].present, true, n);
  for (const n of ['caro', 'dani', 'gabi', 'hugo', 'ivan']) {
    assert.equal(porNombre[n].present, false, n);
    assert.equal(porNombre[n].origen, 'QR', n);
  }
  assert.equal(porNombre.fede.present, true);
  assert.equal(porNombre.fede.origen, 'MANUAL');
  assert.equal(porNombre.fede.lateMinutes, 12);
  assert.equal(cerrada!.ausentesMarcados, 5);
  assert.equal(new Set(filas.map((f) => f.date.toISOString())).size, 1);
  paso('al cerrar: 5 ausentes (ivan sin confirmar incluido); lo marcado a mano no se toca; una sola fecha');

  marcar(id, 'uid-tarde', contenido, 'tel-9');
  await svc.procesarSesionesAbiertas();
  assert.equal(doc(id, 'uid-tarde')?.status, undefined);
  await assert.rejects(svc.qrVigente(id, actor), conEstado(409));
  paso('una sesión cerrada no lee marcas nuevas ni da QR (409)');

  await svc.cerrarSesion(id, actor);
  paso('cerrar dos veces no hace nada');

  // ── Una clase se registra una vez por día ─────────────────────────────────
  const s1b = await svc.abrirSesion({ subjectId: String(materia._id), groupId: String(grupo._id), minutos: 15, marcarAusentes: true }, actor);
  assert.notEqual(s1b.id, id);
  marcar(s1b.id, 'uid-ana', (await svc.qrVigente(s1b.id, actor)).contenido, 'tel-1');
  // gabi quedó ausente en la primera lista; llega tarde a la segunda.
  enlazar(est.gabi!.code, 'uid-gabi');
  marcar(s1b.id, 'uid-gabi', (await svc.qrVigente(s1b.id, actor)).contenido, 'tel-7');
  await svc.procesarSesionesAbiertas();
  assert.deepEqual(respuesta(s1b.id, 'uid-ana'), { status: 'accepted', reason: 'YA_REGISTRADA' });
  assert.equal(doc(s1b.id, 'uid-ana')?.stage?.stringValue, 'done');
  assert.equal(doc(s1b.id, 'uid-gabi')?.stage?.stringValue, 'preview');
  paso('en una segunda lista del mismo día, ana ve «ya habías registrado tu asistencia» sin confirmar nada');

  confirmar(s1b.id, 'uid-gabi');
  await svc.procesarSesionesAbiertas();
  assert.equal((await AttendanceModel.findOne({ studentId: est.gabi!._id, subjectId: materia._id }).lean())!.present, true);
  assert.equal(await AttendanceModel.countDocuments({ subjectId: materia._id }), 9);
  await svc.cerrarSesion(s1b.id, actor);
  assert.equal((await AttendanceModel.findOne({ studentId: est.fede!._id, subjectId: materia._id }).lean())!.origen, 'MANUAL');
  paso('quien estaba ausente sí puede quedar presente en la segunda lista, y nada se duplica');

  // ── La institución gestiona los vínculos ──────────────────────────────────
  const vinculos = await import('../modules/uniplanner/vinculos.service.js');
  const uis = await InstitutionModel.findOneAndUpdate(
    { institutionId: 'uis' },
    { $setOnInsert: { institutionId: 'uis', nombre: 'Universidad Industrial de Santander', sigla: 'UIS' } },
    { upsert: true, new: true },
  );
  const admin = { id: String((await UserModel.create({ email: 'admin@uts.edu.co', passwordHash: 'x', role: 'ADMIN', fullName: 'Admin' }))._id), role: 'ADMIN' };
  const alcance = (institucion: unknown, studentIds: string[]) => ({
    programas: [], total: false, subjectIds: [], groupIds: [], professorIds: [], studentIds,
    institutionId: String(institucion),
  });
  const coordUts = { id: 'c1', role: 'COORDINATOR' };
  const linkAna = `uts__${est.ana!.code}`;

  const verificado = await vinculos.cambiarVinculo(linkAna, 'verificar', admin);
  assert.equal(verificado.verificado, true);
  assert.equal(store.get(`institution_links/${linkAna}`)?.verified?.booleanValue, true);
  paso('administración verifica el enlace de un estudiante, una vez para todas sus materias');

  await assert.rejects(
    vinculos.cambiarVinculo(linkAna, 'desverificar', { id: 'c2', role: 'COORDINATOR' }, alcance(uis._id, [String(est.ana!._id)])),
    conEstado(404),
  );
  await assert.rejects(
    vinculos.cambiarVinculo(linkAna, 'desverificar', coordUts, alcance(inst._id, [String(est.beto!._id)])),
    conEstado(404),
  );
  paso('coordinación de otra universidad, o sin ese estudiante en su alcance, no lo toca (404)');

  const lista = await vinculos.listarVinculos({ institucion: 'uts', filtro: 'todos' }, coordUts, alcance(inst._id, [String(est.ana!._id), String(est.beto!._id)]));
  assert.deepEqual(lista.items.map((v) => v.estudiante?.fullName).sort(), ['ANA', 'BETO']);
  const busqueda = await vinculos.listarVinculos({ institucion: 'uts', filtro: 'todos', q: 'FEDE' }, admin);
  assert.equal(busqueda.items[0]?.estudiante?.fullName, 'FEDE');
  assert.equal(busqueda.items[0]?.enlazado, false);
  paso('la lista respeta el alcance, y la búsqueda encuentra también a quien no tiene UniPlanner');

  // ana pide desbloquear (se equivocó de código); alguien pide su código, que tiene otra cuenta.
  store.set('link_requests/uid-ana', {
    uid: s('uid-ana'), institutionId: s('uts'), studentCode: s(est.ana!.code), type: s('unlock'),
    reason: s('Me equivoqué de código'), status: s('pending'), createdAt: ts(new Date()),
  });
  store.set('link_requests/uid-caro-real', {
    uid: s('uid-caro-real'), institutionId: s('uts'), studentCode: s(est.caro!.code), type: s('claimed'),
    reason: s('Mi código lo tiene otra cuenta'), status: s('pending'), createdAt: ts(new Date()),
  });
  const solicitudes = await vinculos.listarSolicitudes('uts', admin);
  const deAna = solicitudes.find((x) => x.uid === 'uid-ana')!;
  const deCaro = solicitudes.find((x) => x.uid === 'uid-caro-real')!;
  assert.ok(deAna.acciones.includes('desbloquear'));
  assert.deepEqual(deCaro.acciones, ['asignar', 'rechazar']);
  paso('las solicitudes ofrecen desbloquear solo el enlace propio; un documento ajeno se asigna a quien lo pide');

  const { avisos } = await vinculos.avisarSolicitudesNuevas();
  assert.ok(avisos >= 2);
  assert.equal((await vinculos.avisarSolicitudesNuevas()).avisos, 0);
  paso('administración recibe un aviso por solicitud nueva, y solo uno');

  await vinculos.resolverSolicitud('uid-ana', { accion: 'desbloquear' }, admin);
  // Borrado, no `null`: con `null` las reglas de UniPlanner no dejaban borrar
  // el enlace nunca más.
  assert.ok(store.has(`institution_links/${linkAna}`));
  assert.equal('lockedUntil' in store.get(`institution_links/${linkAna}`)!, false);
  assert.equal(store.get('link_requests/uid-ana')?.status?.stringValue, 'approved');
  await assert.rejects(vinculos.resolverSolicitud('uid-caro-real', { accion: 'desbloquear' }, admin), conEstado(409));
  await assert.rejects(vinculos.resolverSolicitud('uid-caro-real', { accion: 'liberar' }, admin), conEstado(409));
  await vinculos.resolverSolicitud('uid-caro-real', { accion: 'asignar', nota: 'Comprobado en coordinación.' }, admin);
  // No se borra: pasa a la cuenta de quien lo pidió, ya verificado. Borrado, la
  // cuenta anterior podía volver a reclamarlo antes que su dueño.
  const caroAsignado = store.get(`institution_links/uts__${est.caro!.code}`);
  assert.equal(caroAsignado?.uid?.stringValue, 'uid-caro-real');
  assert.equal(caroAsignado?.verified?.booleanValue, true);
  assert.match(String(store.get('link_requests/uid-caro-real')?.message?.stringValue), /te lo asignó.*Comprobado en coordinación/);
  paso('resolver desbloquea el enlace propio o asigna el documento a su dueño, y se lo contesta en su app');

  // Vuelve a fijarlo para lo que sigue.
  store.get(`institution_links/${linkAna}`)!.lockedUntil = { timestampValue: '2026-12-21T04:59:59.999Z' };

  // ── La fecha de fin que pone la administración manda ──────────────────────
  const { configurarPeriodo } = await import('../modules/periods/period.service.js');
  const configurado = await configurarPeriodo(periodo, { endsOn: '2026-12-17' }, { id: String(docente._id) });
  assert.equal(configurado.endsOn, '2026-12-17');
  assert.equal(configurado.endsOnPorDefecto, '2026-12-20');
  paso('el periodo guarda el último día del semestre que pone la administración');

  // ── Un estudiante, varias materias ─────────────────────────────────────────
  const s2 = await svc.abrirSesion({ subjectId: String(materia2._id), groupId: String(grupo2._id), minutos: 15, marcarAusentes: false }, actor);
  marcar(s2.id, 'uid-ana', (await svc.qrVigente(s2.id, actor)).contenido, 'tel-1');
  // beto no está en Física: su cuenta no aparece en el mapa de esta clase.
  marcar(s2.id, 'uid-beto', (await svc.qrVigente(s2.id, actor)).contenido, 'tel-2');
  await svc.procesarSesionesAbiertas();
  confirmar(s2.id, 'uid-ana');
  await svc.procesarSesionesAbiertas();
  assert.deepEqual(respuesta(s2.id, 'uid-ana'), { status: 'accepted', reason: null });
  assert.deepEqual(respuesta(s2.id, 'uid-beto'), { status: 'rejected', reason: 'NO_MATRICULADO' });
  assert.equal(await AttendanceModel.countDocuments({ studentId: est.ana._id }), 2);
  // El fin configurado (17 dic) es más corto que el que ya tenía: no se acorta
  // ni se reescribe — una escritura por estudiante y semestre.
  assert.equal(
    store.get(`institution_links/uts__${est.ana!.code}`)?.lockedUntil?.timestampValue,
    '2026-12-21T04:59:59.999Z',
  );
  paso('el mismo enlace marca en cada materia donde está matriculado, y en ninguna otra');

  // Sin ausentes: marcarAusentes=false.
  await svc.cerrarSesion(s2.id, actor);
  assert.equal(await AttendanceModel.countDocuments({ subjectId: materia2._id }), 1);
  paso('con marcarAusentes=false no se crean ausencias');

  // ── Recrear el perfil en UniPlanner no sirve para marcar por otro ─────────
  // ana marcó este semestre con uid-ana. Borra su perfil y su enlace (la
  // excepción de «borrar la cuenta» en las reglas), recrea el perfil y reclama
  // el código de hugo. Para Firestore es un enlace nuevo y válido.
  store.delete(`institution_links/${linkAna}`);
  store.delete(`institution_links/uts__${est.hugo!.code}`);
  enlazar(est.hugo!.code, 'uid-ana');
  // Y con otra cuenta nueva se enlaza a su propio código.
  enlazar(est.ana!.code, 'uid-ana-2');

  // ── Dos clics seguidos en «Mostrar QR» ────────────────────────────────────
  const [clic1, clic2] = await Promise.all([
    svc.abrirSesion({ subjectId: String(materia._id), groupId: String(grupo._id), minutos: 15, marcarAusentes: false }, actor),
    svc.abrirSesion({ subjectId: String(materia._id), groupId: String(grupo._id), minutos: 15, marcarAusentes: false }, actor),
  ]);
  assert.equal(clic1.id, clic2.id);
  assert.equal(await AttendanceSessionModel.countDocuments({ subjectId: materia._id, estado: 'ABIERTA' }), 1);
  paso('dos aperturas a la vez dan una sola sesión');
  const s4 = clic1.id;
  const qr4 = async () => (await svc.qrVigente(s4, actor)).contenido;
  await new Promise((r) => setTimeout(r, 1200));

  marcar(s4, 'uid-ana', await qr4(), 'tel-1');
  marcar(s4, 'uid-ana-2', await qr4(), 'tel-10');
  await svc.procesarSesionesAbiertas();
  assert.deepEqual(respuesta(s4, 'uid-ana'), { status: 'rejected', reason: 'CUENTA_CAMBIADA' });
  assert.deepEqual(respuesta(s4, 'uid-ana-2'), { status: 'rejected', reason: 'CUENTA_CAMBIADA' });
  paso('la cuenta que marcó por ana no marca por hugo, ni ana desde una cuenta nueva (CUENTA_CAMBIADA)');

  // La institución lo revisa y desbloquea: suelta también el vínculo en Nexus.
  await vinculos.cambiarVinculo(linkAna, 'desbloquear', admin);
  marcar(s4, 'uid-ana-2', await qr4(), 'tel-10', new Date(Date.now() + 500));
  await new Promise((r) => setTimeout(r, 600));
  await svc.procesarSesionesAbiertas();
  // Ya tenía asistencia hoy en Cálculo: la cuenta nueva la ve, sin escribir.
  assert.deepEqual(respuesta(s4, 'uid-ana-2'), { status: 'accepted', reason: 'YA_REGISTRADA' });
  paso('tras desbloquear desde «Vínculos», la cuenta nueva de ana vuelve a marcar');

  // ── Lo que el docente marca a mano durante la lista manda ─────────────────
  // ivan escanea; el docente lo ve «confirmando», no está en el salón y lo
  // marca ausente a mano. La confirmación llega después desde su teléfono.
  // Después del cursor: la marca anterior se dejó medio segundo en el futuro.
  await new Promise((r) => setTimeout(r, 700));
  marcar(s4, 'uid-ivan', await qr4(), 'tel-5');
  await svc.procesarSesionesAbiertas();
  assert.equal(doc(s4, 'uid-ivan')?.stage?.stringValue, 'preview');
  await AttendanceModel.updateOne(
    { studentId: est.ivan!._id, subjectId: materia._id },
    { $set: { present: false, origen: 'MANUAL', notes: 'No estaba en el salón' } },
  );
  confirmar(s4, 'uid-ivan');
  await svc.procesarSesionesAbiertas();
  assert.deepEqual(respuesta(s4, 'uid-ivan'), { status: 'rejected', reason: 'DECIDIDA_POR_DOCENTE' });
  const ivan = await AttendanceModel.findOne({ studentId: est.ivan!._id, subjectId: materia._id }).lean();
  assert.equal(ivan!.present, false);
  assert.equal(ivan!.origen, 'MANUAL');
  paso('una ausencia marcada a mano durante la lista no la deshace la confirmación del teléfono');
  await svc.cerrarSesion(s4, actor);

  // ── Vencimiento automático ─────────────────────────────────────────────────
  const s3 = await svc.abrirSesion({ subjectId: String(materia2._id), groupId: String(grupo2._id), minutos: 5, marcarAusentes: true }, actor);
  await AttendanceSessionModel.updateOne({ _id: s3.id }, { $set: { cierraEn: new Date(Date.now() - 1000) } });
  await svc.procesarSesionesAbiertas();
  const s3doc = await AttendanceSessionModel.findById(s3.id).lean();
  assert.equal(s3doc!.estado, 'CERRADA');
  assert.equal(s3doc!.motivoCierre, 'VENCIDA');
  assert.equal(s3doc!.cerradaPor, null);
  paso('el lector cierra sola la sesión vencida');

  // ── Verificación automática: documento, nombre y universidad ─────────────
  const verificacion = await import('../modules/uniplanner/verificacion.service.js');
  const juan = await StudentModel.create({ code: '1098765432', fullName: 'PÉREZ GÓMEZ JUAN CARLOS', program: 'Sistemas' });
  await EnrollmentModel.create({
    studentId: juan._id, groupId: grupo._id, subjectId: materia._id, professorId: docente._id, period: periodo,
  });
  const pedirVerificacion = (codigo: string, uid: string, nombre: string) => {
    const previo = store.get(`institution_links/uts__${codigo}`) ?? {};
    store.set(`institution_links/uts__${codigo}`, {
      ...previo,
      uid: s(uid), studentCode: s(codigo), institutionId: s('uts'), fullName: s(nombre),
      verificationRequestedAt: ts(new Date()),
    });
  };
  const estadoDe = (codigo: string) => ({
    verificado: store.get(`institution_links/uts__${codigo}`)?.verified?.booleanValue === true,
    estado: store.get(`institution_links/uts__${codigo}`)?.verificationStatus?.stringValue,
  });

  // Escribe el nombre en otro orden: la universidad lo guarda con los apellidos primero.
  pedirVerificacion('1098765432', 'uid-juan', 'JUAN CARLOS PÉREZ GÓMEZ');
  // Un compañero con el documento de juan y el nombre a medias.
  pedirVerificacion('1098765433', 'uid-otro', 'JUAN PÉREZ');
  await verificacion.verificarEnlacesPedidos();
  assert.deepEqual(estadoDe('1098765432'), { verificado: true, estado: 'verified' });
  assert.deepEqual(estadoDe('1098765433'), { verificado: false, estado: 'not_matched' });
  paso('documento, nombre y universidad de un estudiante registrado: verificado solo; si no casan, no');

  // Una pasada sin nada nuevo no reescribe nada.
  const escriturasVerificacion = llamadas.filter((l) => l.startsWith('PATCH institution_links')).length;
  await verificacion.verificarEnlacesPedidos();
  assert.equal(llamadas.filter((l) => l.startsWith('PATCH institution_links')).length, escriturasVerificacion);
  paso('el cursor solo trae lo nuevo: una pasada vacía no escribe');

  // Se enlaza antes de que su docente lo matricule: no casa... hasta que lo matriculan.
  const lucia = await StudentModel.create({ code: '1098765434', fullName: 'LUCÍA ÑÚÑEZ ROA', program: 'Sistemas' });
  await new Promise((r) => setTimeout(r, 20));
  pedirVerificacion('1098765434', 'uid-lucia', 'lucía núñez roa'.toUpperCase());
  await verificacion.verificarEnlacesPedidos();
  assert.equal(estadoDe('1098765434').estado, 'not_matched');
  await EnrollmentModel.create({
    studentId: lucia._id, groupId: grupo._id, subjectId: materia._id, professorId: docente._id, period: periodo,
  });
  await verificacion.verificarEnlacesDeEstudiantes([String(lucia._id)]);
  assert.deepEqual(estadoDe('1098765434'), { verificado: true, estado: 'verified' });
  paso('quien se enlazó antes de estar matriculado queda verificado al matricularlo');

  // ── Periodo en cierre ──────────────────────────────────────────────────────
  await AcademicPeriodModel.updateOne({ period: periodo }, { $set: { state: 'CLOSING' } }, { upsert: true });
  invalidarCachePeriodos();
  await assert.rejects(
    svc.abrirSesion({ subjectId: String(materia._id), groupId: String(grupo._id), minutos: 15, marcarAusentes: true }, actor),
    conEstado(409),
  );
  paso('con el periodo en cierre no se abre (409)');

  console.log(`\n${ok} comprobaciones superadas.`);
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
