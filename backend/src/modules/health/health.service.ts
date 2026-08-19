/**
 * Centro de salud: estado real de cada integración y de cada tarea periódica.
 *
 * Dos reglas gobiernan todo lo que hay aquí.
 *
 * **Ni un secreto sale.** Ni una URI de conexión, ni un correo de cuenta de
 * servicio, ni un fragmento de clave. El mensaje de error de Mongoose lleva
 * dentro la cadena de conexión completa con usuario y contraseña, y el centro
 * de salud es exactamente la pantalla que apetece pegar en un chat de soporte:
 * todo pasa por `resumirError()`, que enmascara antes de devolver.
 *
 * **Abrir el panel no puede tumbar el servidor.** Las comprobaciones remotas
 * van con un tiempo de espera corto y en paralelo; una integración caída
 * responde «con error» en dos segundos, no deja la petición colgada mientras
 * un TCP agota su propio tiempo.
 *
 * Los cuatro estados son distintos a propósito: **desactivado** (nadie lo
 * configuró y está bien), **configurado** (hay credenciales pero no se ha
 * comprobado), **saludable** y **con error**. Sin esa distinción, un SMTP que
 * nadie quiso activar aparecería en rojo para siempre y el rojo dejaría de
 * significar nada.
 */
import os from 'node:os';
import { dbStatus } from '../../shared/db.js';
import { env } from '../../shared/env.js';
import { correoActivo } from '../../shared/mailer.js';
import { pushConfigurado } from '../../shared/push.js';
import { mlStatus } from '../ml/ml.service.js';
import { leerEjecuciones } from '../../shared/job-run.js';
import { resumirError } from '../../shared/sanitize.js';
import { APP_VERSION } from '../../shared/version.js';
import { resumen as resumenDeErrores } from '../telemetry/telemetry.service.js';

export type EstadoServicio = 'desactivado' | 'configurado' | 'saludable' | 'error';

export type Comprobacion = {
  clave: string;
  nombre: string;
  estado: EstadoServicio;
  /** Frase que lee una persona. Nunca un volcado de error. */
  detalle: string;
  /** Instante de esta comprobación. */
  comprobadoEn: string;
  /** Ruta interna de la app donde se configura, si la hay. */
  enlace?: string;
};

export type SaludDelSistema = {
  version: string;
  uptimeSegundos: number;
  /**
   * Nombre de la instancia. Con varias detrás de un balanceador, sin esto el
   * panel presentaría los datos en memoria de UNA como si fueran del sistema.
   */
  instancia: string;
  /** Advertencia explícita de que lo de arriba es local a esta instancia. */
  avisoMultiInstancia: string;
  servicios: Comprobacion[];
  tareas: EstadoTarea[];
  riesgo: { fuente: 'model' | 'rules'; detalle: string };
  /** Defectos reportados por los clientes; el detalle vive en `/telemetry`. */
  errores: Awaited<ReturnType<typeof resumenDeErrores>>;
};

export type EstadoTarea = {
  job: string;
  nombre: string;
  activa: boolean;
  intervaloMin: number;
  ultimaEjecucion: string | null;
  ultimoExito: string | null;
  duracionMs: number;
  ejecuciones: number;
  fallos: number;
  ultimoError: string | null;
  ultimoResultado: Record<string, unknown>;
  instancia: string;
};

const AHORA = () => new Date().toISOString();

/** Nombres legibles y su intervalo configurado. Un solo sitio. */
const TAREAS: Record<string, { nombre: string; intervalo: () => number }> = {
  'risk-scan': { nombre: 'Escaneo de riesgo académico', intervalo: () => env.RISK_SCAN_INTERVAL_MIN },
  'class-reminders': { nombre: 'Recordatorios de clase', intervalo: () => env.CLASS_REMINDER_INTERVAL_MIN },
  'activity-due': { nombre: 'Avisos de vencimiento de actividades', intervalo: () => env.ACTIVITY_DUE_INTERVAL_MIN },
  'attendance-patterns': { nombre: 'Patrones de inasistencia', intervalo: () => env.ATTENDANCE_PATTERN_INTERVAL_MIN },
  'release-check': { nombre: 'Aviso de versiones', intervalo: () => env.RELEASE_CHECK_INTERVAL_H * 60 },
};

/** Comprobación de MongoDB. El estado ya lo mantiene `shared/db.ts`. */
function comprobarMongo(): Comprobacion {
  const { status, error } = dbStatus();
  const mapa: Record<string, EstadoServicio> = {
    disabled: 'desactivado',
    connecting: 'configurado',
    connected: 'saludable',
    error: 'error',
  };
  const detalle =
    status === 'connected'
      ? 'Conexión establecida.'
      : status === 'connecting'
        ? 'Conectando…'
        : status === 'disabled'
          ? 'Sin MONGODB_URI: el servidor arranca pero no guarda nada.'
          : // El mensaje crudo de Mongoose lleva la URI con usuario y contraseña.
            resumirError(error ?? 'Sin conexión');

  return {
    clave: 'mongodb',
    nombre: 'Base de datos',
    estado: mapa[status] ?? 'error',
    detalle,
    comprobadoEn: AHORA(),
  };
}

/** Comprobación del servicio ML, con tiempo de espera propio (3 s en `mlStatus`). */
async function comprobarMl(): Promise<{ servicio: Comprobacion; fuente: 'model' | 'rules' }> {
  const estado = await mlStatus();

  if (!estado.enabled) {
    return {
      servicio: {
        clave: 'ml',
        nombre: 'Servicio de predicción (ML)',
        estado: 'desactivado',
        detalle: 'Desactivado con ML_ENABLED=0. El riesgo se calcula con el motor de reglas.',
        comprobadoEn: AHORA(),
      },
      fuente: 'rules',
    };
  }

  if (!estado.available) {
    return {
      servicio: {
        clave: 'ml',
        nombre: 'Servicio de predicción (ML)',
        estado: 'error',
        // El mensaje de `fetch` puede traer la URL completa; se sanea.
        detalle: `No responde (${resumirError(estado.message ?? 'sin detalle', 120)}). El riesgo cae al motor de reglas.`,
        comprobadoEn: AHORA(),
      },
      fuente: 'rules',
    };
  }

  return {
    servicio: {
      clave: 'ml',
      nombre: 'Servicio de predicción (ML)',
      estado: 'saludable',
      detalle: `Modelo ${estado.version ?? 'desconocido'} (${estado.origin ?? 'origen sin declarar'}).`,
      comprobadoEn: AHORA(),
    },
    fuente: 'model',
  };
}

/**
 * Correo saliente.
 *
 * No se envía un correo de prueba: comprobar SMTP de verdad significa abrir
 * una conexión y autenticarse, y hacerlo cada vez que alguien abre el panel
 * convertiría un servidor de correo legítimo en uno que nos bloquea por
 * exceso de conexiones. Se informa de si está configurado, que es la pregunta
 * que de hecho se hace.
 */
function comprobarCorreo(): Comprobacion {
  const activo = correoActivo();
  return {
    clave: 'smtp',
    nombre: 'Correo saliente',
    estado: activo ? 'configurado' : 'desactivado',
    detalle: activo
      // El host no es secreto, pero el usuario y la contraseña sí; solo sale el host.
      ? `Configurado contra ${env.SMTP_HOST}:${env.SMTP_PORT}. No se envía correo de prueba al abrir el panel.`
      : 'Sin SMTP_HOST. La recuperación de contraseña devuelve el código solo fuera de producción.',
    comprobadoEn: AHORA(),
    enlace: '/configuracion',
  };
}

function comprobarPush(): Comprobacion {
  const configurado = pushConfigurado();
  return {
    clave: 'fcm',
    nombre: 'Notificaciones push (Android)',
    estado: configurado ? 'configurado' : 'desactivado',
    detalle: configurado
      ? 'Cuenta de servicio de Firebase presente.'
      : 'Sin FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY. Los recordatorios de clase siguen llegando: los programa el teléfono.',
    comprobadoEn: AHORA(),
  };
}

function comprobarVersiones(): Comprobacion {
  const horas = env.RELEASE_CHECK_INTERVAL_H;
  return {
    clave: 'releases',
    nombre: 'Comprobación de versiones',
    estado: horas > 0 ? 'configurado' : 'desactivado',
    detalle:
      horas > 0
        ? `Consulta ${env.RELEASES_REPO} cada ${horas} h.`
        : 'Desactivada con RELEASE_CHECK_INTERVAL_H=0.',
    comprobadoEn: AHORA(),
  };
}

/** Estado de las tareas periódicas, leído de la colección, no de la memoria. */
async function estadoDeTareas(): Promise<EstadoTarea[]> {
  const ejecuciones = await leerEjecuciones();
  const porJob = new Map(ejecuciones.map(e => [String(e.job), e]));

  return Object.entries(TAREAS).map(([job, meta]) => {
    const registro = porJob.get(job) ?? {};
    const intervalo = meta.intervalo();
    return {
      job,
      nombre: meta.nombre,
      activa: intervalo > 0,
      intervaloMin: intervalo,
      ultimaEjecucion: fecha(registro.lastRunAt),
      ultimoExito: fecha(registro.lastSuccessAt),
      duracionMs: Number(registro.lastDurationMs ?? 0),
      ejecuciones: Number(registro.runs ?? 0),
      fallos: Number(registro.failures ?? 0),
      // Ya viene saneado de `ejecutarTarea`; se vuelve a pasar por si el
      // documento es anterior a esa función.
      ultimoError: registro.lastError ? resumirError(registro.lastError, 160) : null,
      ultimoResultado: (registro.lastResult ?? {}) as Record<string, unknown>,
      instancia: String(registro.lastHost ?? ''),
    };
  });
}

function fecha(valor: unknown): string | null {
  if (!valor) return null;
  const instante = new Date(valor as string);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

/**
 * Estado completo.
 *
 * Las comprobaciones remotas van en paralelo: encadenadas, un ML caído sumaría
 * su tiempo de espera al de todas las demás y el panel tardaría más cuanto
 * peor estuviera el sistema, que es justo al revés de lo que hace falta.
 */
export async function estadoDelSistema(): Promise<SaludDelSistema> {
  const [ml, tareas, errores] = await Promise.all([
    comprobarMl(),
    estadoDeTareas(),
    resumenDeErrores(),
  ]);

  return {
    version: APP_VERSION,
    uptimeSegundos: Math.round(process.uptime()),
    instancia: os.hostname(),
    avisoMultiInstancia:
      'El tiempo de actividad y la versión son de ESTA instancia. Las tareas se leen de la base de datos, así que valen para todo el despliegue.',
    servicios: [
      comprobarMongo(),
      ml.servicio,
      comprobarCorreo(),
      comprobarPush(),
      comprobarVersiones(),
    ],
    tareas,
    errores,
    riesgo: {
      fuente: ml.fuente,
      detalle:
        ml.fuente === 'model'
          ? 'Las predicciones vienen del modelo entrenado con explicación SHAP.'
          : 'Las predicciones vienen del motor de reglas de domains/risk.',
    },
  };
}
