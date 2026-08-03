/**
 * Smoke test end-to-end de UTS Nexus Académico.
 *
 * Verifica que el servidor y los endpoints clave del refactor respondan bien
 * (login por rol, motor de notas consolidado, matrículas, dashboard real,
 * escaneo de riesgo, reportes y self-service del estudiante).
 *
 * Requiere el servidor en ejecución y la base sembrada (npm run seed).
 * Uso:  npm run smoke
 */
const PORT = Number(process.env.PORT ?? 4000);
const ROOT = `http://localhost:${PORT}`;
const BASE = `${ROOT}/api/v1`;

let passed = 0;
let failed = 0;

function ok(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken?: string };
  return data.accessToken ?? null;
}

async function getJson(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as any };
}

async function waitForServer(retries = 30): Promise<boolean> {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${ROOT}/health`);
      if (res.ok) return true;
    } catch {
      /* servidor aún no responde */
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  console.log(`\n🔎 Smoke test UTS Nexus Académico → ${BASE}\n`);

  console.log('1) Disponibilidad');
  const up = await waitForServer();
  ok('GET /health responde', up);
  if (!up) {
    console.log('\n⛔ El servidor no respondió. ¿Está arrancado (npm start)?\n');
    process.exit(1);
  }

  console.log('\n2) Autenticación por rol');
  // La contraseña ya no está escrita en el código: el seed genera una distinta
  // por instalación. Se pasa por entorno para poder probar cualquier despliegue.
  const clave = process.env.SEED_PASSWORD ?? '';
  if (!clave) {
    console.error('\n⛔ Indica la contraseña sembrada:  SEED_PASSWORD="…" npm run smoke\n');
    process.exit(1);
  }
  const docente = await login('docente@uts.edu.co', clave);
  ok('Login docente', !!docente);
  const estudiante = await login('estudiante@uts.edu.co', clave);
  ok('Login estudiante', !!estudiante);
  if (!docente) {
    console.log('\n⛔ Sin token de docente no se puede continuar. Corre: npm run seed\n');
    process.exit(1);
  }

  console.log('\n3) Núcleo académico (docente)');
  const dash = await getJson('/analytics/dashboard', docente);
  ok('Dashboard real', dash.status === 200 && dash.json?.ok, `status ${dash.status}`);
  ok('Dashboard tiene métricas', typeof dash.json?.summary?.averageGrade === 'number');

  const cons = await getJson('/grades/consolidado?period=2026-1', docente);
  ok('Notas consolidadas (motor 30/60/10 + 33/33/34)', cons.status === 200 && Array.isArray(cons.json?.items));
  const primera = cons.json?.items?.[0];
  ok('Consolidado incluye notaFinal', primera ? typeof primera.notaFinal === 'number' : true);

  const enr = await getJson('/enrollments', docente);
  ok('Matrículas del docente', enr.status === 200 && Array.isArray(enr.json?.items));

  console.log('\n4) Riesgo y notificaciones');
  const scan = await fetch(`${BASE}/notifications/risks/scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${docente}` },
  });
  const scanJson = (await scan.json().catch(() => ({}))) as any;
  ok('Escaneo de riesgo ejecuta', scan.status === 200 && scanJson?.ok);
  console.log(`     · evaluados=${scanJson?.evaluados ?? 0} enRiesgo=${scanJson?.enRiesgo ?? 0} notif=${scanJson?.notificaciones ?? 0}`);
  const notifs = await getJson('/notifications', docente);
  ok('Notificaciones del docente', notifs.status === 200 && Array.isArray(notifs.json?.items));

  console.log('\n5) Reportes');
  const pdf = await fetch(`${BASE}/reports/pdf/consolidado?period=2026-1`, {
    headers: { Authorization: `Bearer ${docente}` },
  });
  ok('PDF consolidado (200 + application/pdf)', pdf.ok && (pdf.headers.get('content-type') ?? '').includes('pdf'));

  console.log('\n6) Self-service del estudiante');
  if (estudiante) {
    const misNotas = await getJson('/grades/consolidado?period=2026-1', estudiante);
    ok('Estudiante ve SUS notas', misNotas.status === 200 && Array.isArray(misNotas.json?.items));
    const miAsistencia = await getJson('/attendance', estudiante);
    ok('Estudiante ve SU asistencia', miAsistencia.status === 200 && Array.isArray(miAsistencia.json?.items));
  } else {
    ok('Estudiante ve SUS notas', false, 'sin login de estudiante (¿corriste el seed nuevo?)');
  }

  console.log(`\n${'─'.repeat(48)}`);
  console.log(`Resultado: ${passed} OK · ${failed} fallos`);
  console.log(`${'─'.repeat(48)}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Error en smoke test:', err);
  process.exit(1);
});
