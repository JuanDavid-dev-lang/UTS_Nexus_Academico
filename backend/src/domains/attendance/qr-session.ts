/**
 * Asistencia por QR escaneado desde UniPlanner. Lógica pura, sin I/O.
 *
 * El docente proyecta un QR; el estudiante lo escanea en UniPlanner, que deja
 * una marca en Firestore; Nexus la lee, decide aquí si vale y, si vale, escribe
 * la asistencia. **Nada de lo que decide si una marca vale sale del teléfono**:
 * la identidad es la cuenta que tiene la sesión abierta en UniPlanner —las
 * reglas de Firestore exigen que la marca sea de `request.auth.uid`—, y la hora
 * es la del servidor de Firestore (`request.time`), no la del reloj del equipo.
 *
 * Tres defensas, cada una contra un intento distinto:
 *
 * - **Firma.** Materia, grupo y hora son predecibles: sin una firma que solo
 *   Nexus pueda calcular, cualquiera generaría el QR desde su casa con una app
 *   de códigos. El secreto es de la sesión y nunca sale del servidor.
 * - **Ventana.** El contenido cambia cada `SEGUNDOS_POR_VENTANA`. Una foto del
 *   QR mandada a alguien que no está en el salón caduca antes de que la use.
 * - **Una cuenta, un estudiante, un teléfono.** Una marca por cuenta y sesión
 *   (el id del documento en Firestore es el `uid`), ninguna cuenta que responda
 *   por dos matrículas del grupo, y ningún teléfono que marque por dos cuentas.
 *
 * Lo que **no** resuelve: un compañero que escanea en vivo por videollamada.
 * Ningún QR prueba presencia física; eso lo ve el docente mirando el salón y el
 * contador a la vez.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Prefijo y versión del formato. Un QR de otra cosa no se confunde con este. */
export const VERSION_QR = 'UNX1';

/**
 * Cada cuánto cambia el QR.
 *
 * Quince segundos dan tiempo a apuntar la cámara desde el fondo del salón y a
 * que la marca llegue con los datos móviles; bastante menos que lo que tarda
 * reenviar una foto y que el otro abra la app.
 */
export const SEGUNDOS_POR_VENTANA = 15;

/**
 * Cuántas ventanas de diferencia se aceptan entre el QR y la hora de la marca.
 *
 * Una hacia atrás cubre a quien escanea en el último segundo y tarda un par en
 * enviar; una hacia delante, el desfase entre el reloj de Nexus —que compone
 * el QR— y el de Firestore —que sella la marca—. Con eso un QR vale entre 15 y
 * 30 segundos.
 */
export const TOLERANCIA_VENTANAS = 1;

/** Minutos que la sesión acepta marcas, si el docente no dice otra cosa. */
export const MINUTOS_POR_DEFECTO = 15;
export const MINUTOS_MIN = 5;
export const MINUTOS_MAX = 120;

/**
 * Cuántas veces puede intentarlo una cuenta en la misma clase.
 *
 * Una marca rechazada se puede volver a mandar —UniPlanner borra la suya y
 * escanea otra vez—, porque el rechazo más común es de lo más inocente: un QR
 * que venció mientras la señal del salón tardaba. Sin reintento, ese estudiante
 * se quedaba sin asistencia por culpa del wifi. Con un tope, porque probar QR
 * a ciegas no debe salir gratis.
 */
export const MAX_INTENTOS = 5;

/**
 * Si una marca nueva de una cuenta que ya había marcado se tiene que evaluar.
 *
 * Solo tras un rechazo o una vista previa sin confirmar, solo si es posterior
 * al intento anterior y solo hasta el tope. Una marca aceptada no se reevalúa
 * nunca: la asistencia ya está escrita y un segundo documento no puede
 * cambiarla.
 */
export function esReintentoValido(
  previa: { estado: 'ACEPTADA' | 'RECHAZADA' | 'PENDIENTE'; creadaEn: Date; intentos?: number },
  nueva: { creadaEn: Date },
): boolean {
  // Una pendiente de confirmar también se puede sustituir: la persona pulsó
  // «no es mi clase», UniPlanner retiró la marca y escaneó otra.
  return (
    (previa.estado === 'RECHAZADA' || previa.estado === 'PENDIENTE') &&
    (previa.intentos ?? 1) < MAX_INTENTOS &&
    nueva.creadaEn.getTime() > previa.creadaEn.getTime()
  );
}

/**
 * Si una marca nueva llega cuando la cuenta ya gastó sus intentos.
 *
 * No se evalúa, pero se contesta **una vez**: sin respuesta, la marca se
 * quedaba «esperando» en el teléfono para siempre, porque las reglas de
 * UniPlanner no dejan retirar una marca que la plataforma no ha contestado.
 */
export function agotoIntentos(
  previa: { estado: 'ACEPTADA' | 'RECHAZADA' | 'PENDIENTE'; creadaEn: Date; intentos?: number; motivo?: string | null },
  nueva: { creadaEn: Date },
): boolean {
  return (
    (previa.estado === 'RECHAZADA' || previa.estado === 'PENDIENTE') &&
    (previa.intentos ?? 1) >= MAX_INTENTOS &&
    previa.motivo !== 'DEMASIADOS_INTENTOS' &&
    nueva.creadaEn.getTime() > previa.creadaEn.getTime()
  );
}

/** Longitud máxima de cada dato visible. El QR se lee desde lejos: corto. */
const MAX_VISIBLE = 24;

export type DatosVisibles = {
  /** Código de la materia: por él la casa UniPlanner con el curso del estudiante. */
  materia: string;
  /** Etiqueta del grupo («A194»). Vacía si la sesión es de la materia entera. */
  grupo: string;
  /** Hora de inicio en el campus, `HH:mm`. */
  hora: string;
};

export type QrLeido = DatosVisibles & {
  sesionId: string;
  ventana: number;
  firma: string;
  /** Lo firmado: todo menos la firma. */
  cuerpo: string;
};

/** Ventana a la que pertenece un instante. */
export function ventanaDe(instante: Date | number): number {
  const ms = instante instanceof Date ? instante.getTime() : instante;
  return Math.floor(ms / (SEGUNDOS_POR_VENTANA * 1000));
}

/** Cuándo empieza la ventana siguiente. */
export function finDeVentana(ventana: number): Date {
  return new Date((ventana + 1) * SEGUNDOS_POR_VENTANA * 1000);
}

/**
 * Un dato visible sin nada que rompa el formato.
 *
 * El separador es `|`: un grupo que se llamara «A|194» partiría el QR en un
 * campo de más y no se leería.
 *
 * Y solo ASCII: una tilde obliga a codificar en UTF-8, cada letra acentuada
 * ocupa dos bytes y no todos los lectores adivinan la codificación de un QR sin
 * declararla. «Grupo Ñ» sale como «Grupo N»: es un rótulo para reconocer la
 * clase, no un dato que se compare.
 */
export function limpiarVisible(texto: string): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_VISIBLE);
}

function firmar(secreto: string, cuerpo: string): string {
  // 128 bits bastan: la firma solo tiene que resistir durante quince segundos,
  // y cada carácter de más hace el QR más denso y más difícil de leer de lejos.
  return createHmac('sha256', secreto).update(cuerpo).digest().subarray(0, 16).toString('base64url');
}

/** El texto del QR para una ventana. */
export function componerQr(
  datos: { sesionId: string; ventana: number } & DatosVisibles,
  secreto: string,
): string {
  const cuerpo = [
    VERSION_QR,
    datos.sesionId,
    String(datos.ventana),
    limpiarVisible(datos.materia),
    limpiarVisible(datos.grupo),
    limpiarVisible(datos.hora),
  ].join('|');
  return `${cuerpo}|${firmar(secreto, cuerpo)}`;
}

/** Descompone un QR, o `null` si no es de este formato. No comprueba la firma. */
export function leerQr(texto: unknown): QrLeido | null {
  if (typeof texto !== 'string' || texto.length > 256) return null;
  const partes = texto.split('|');
  if (partes.length !== 7) return null;

  const [version, sesionId, ventana, materia, grupo, hora, firma] = partes as [
    string, string, string, string, string, string, string,
  ];
  if (version !== VERSION_QR) return null;
  if (!/^[a-f0-9]{24}$/.test(sesionId)) return null;
  if (!/^\d{1,12}$/.test(ventana)) return null;
  if (!/^[A-Za-z0-9_-]{22}$/.test(firma)) return null;

  return {
    sesionId,
    ventana: Number(ventana),
    materia,
    grupo,
    hora,
    firma,
    cuerpo: partes.slice(0, 6).join('|'),
  };
}

/** Si la firma es de este secreto. En tiempo constante. */
export function firmaValida(qr: QrLeido, secreto: string): boolean {
  const esperada = Buffer.from(firmar(secreto, qr.cuerpo));
  const recibida = Buffer.from(qr.firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

// ── Decidir una marca ────────────────────────────────────────────────────────

export type MotivoRechazo =
  | 'SESION_CERRADA'
  | 'QR_INVALIDO'
  | 'QR_DE_OTRA_CLASE'
  | 'QR_VENCIDO'
  | 'NO_MATRICULADO'
  | 'CUENTA_CON_VARIOS_ENLACES'
  | 'DISPOSITIVO_REPETIDO'
  | 'SIN_CONFIRMAR'
  | 'CUENTA_CAMBIADA'
  | 'DECIDIDA_POR_DOCENTE'
  | 'DEMASIADOS_INTENTOS';

/**
 * Lo que lee el estudiante en UniPlanner cuando su marca no vale.
 *
 * Viaja junto al código del motivo: la app traduce el código si lo conoce y
 * enseña este texto si no, así que un motivo nuevo no deja a nadie mirando un
 * error sin explicación.
 */
export const MENSAJE_DE_RECHAZO: Record<MotivoRechazo, string> = {
  SESION_CERRADA: 'La lista de esta clase ya está cerrada.',
  QR_INVALIDO: 'Ese código no es un QR de asistencia válido.',
  QR_DE_OTRA_CLASE: 'Ese QR es de otra clase.',
  QR_VENCIDO: 'El QR ya cambió. Escanea el que está en pantalla ahora.',
  NO_MATRICULADO:
    'Tu enlace no corresponde a ningún estudiante de este grupo. Revisa en Configuración que ' +
    'el documento sea el mismo que tiene registrado la universidad.',
  CUENTA_CON_VARIOS_ENLACES:
    'Tu cuenta está enlazada a más de un estudiante de este grupo. Deja solo el tuyo.',
  DISPOSITIVO_REPETIDO: 'Desde este teléfono ya se registró otra cuenta en esta clase.',
  SIN_CONFIRMAR: 'No confirmaste tu asistencia antes de que se cerrara la lista.',
  CUENTA_CAMBIADA:
    'Este semestre la asistencia de este estudiante se marca desde otra cuenta de UniPlanner. ' +
    'Si cambiaste de cuenta o de documento, pide a tu universidad que revise tu enlace.',
  DECIDIDA_POR_DOCENTE:
    'El docente ya registró tu asistencia de esta clase a mano. Si hay un error, habla con él.',
  DEMASIADOS_INTENTOS: 'Hiciste demasiados intentos en esta clase. Pídele al docente que te marque.',
};

/**
 * Lo que lee quien escanea cuando ya tenía asistencia de esa materia ese día.
 *
 * No es un rechazo: la persona está presente, que es lo único que quería saber.
 * Pasa al volver a escanear en la misma clase, en una segunda lista que el
 * docente abrió después, o cuando el docente ya lo marcó a mano.
 */
export const MENSAJE_YA_REGISTRADA = 'Tu asistencia de hoy en esta materia ya estaba registrada.';

/** El código con el que viaja ese caso. Literal permanente: lo lee UniPlanner. */
export const MOTIVO_YA_REGISTRADA = 'YA_REGISTRADA';

export type MarcaEntrante = {
  uid: string;
  qr: string;
  /** Identificador de la instalación de UniPlanner. Vacío si no lo manda. */
  deviceId: string;
  /** `request.time` de Firestore: la hora del servidor, no la del teléfono. */
  creadaEn: Date;
};

export type ContextoSesion = {
  sesionId: string;
  secreto: string;
  abiertaEn: Date;
  /** Hasta cuándo acepta marcas: la hora prevista o la del cierre anticipado. */
  cierraEn: Date;
  /** Cuenta de UniPlanner → estudiantes matriculados que responden a ella. */
  estudiantesPorUid: ReadonlyMap<string, readonly string[]>;
  /**
   * Estudiantes con una marca de esta sesión aceptada **o esperando su
   * confirmación**. La que espera cuenta: si no, dos cuentas podrían reservar
   * a la misma persona mientras ninguna ha confirmado todavía.
   */
  aceptadas: ReadonlySet<string>;
  /** Teléfono → cuenta que ya marcó (o espera confirmar) desde él. */
  dispositivos: ReadonlyMap<string, string>;
  /**
   * Estudiantes que ya tienen asistencia **presente** de esta materia en este
   * día, venga de donde venga: otra lista por QR, la lista a mano, una planilla.
   * Una clase se registra una vez por día.
   */
  yaPresentes: ReadonlySet<string>;
  /**
   * Quién marcó por quién este semestre, según Nexus: cuenta → estudiante y
   * estudiante → cuenta. Es lo que hace valer el bloqueo del enlace aunque el
   * enlace se borre y se vuelva a crear en UniPlanner. Sin él, no se comprueba.
   */
  vinculos?: {
    porUid: ReadonlyMap<string, string>;
    porEstudiante: ReadonlyMap<string, string>;
  };
};

export type Decision =
  | { aceptada: true; studentId: string; yaRegistrada: boolean }
  | { aceptada: false; motivo: MotivoRechazo; studentId: string | null };

/**
 * Si una marca vale, y para quién.
 *
 * El orden importa: primero lo que dice si la marca es de esta clase y de
 * ahora —firma, sesión, ventana— y solo después quién es. Así un QR falso se
 * rechaza como falso aunque la cuenta no sea de nadie del grupo, y el motivo
 * que ve el estudiante apunta al problema real.
 */
export function evaluarMarca(marca: MarcaEntrante, ctx: ContextoSesion): Decision {
  const rechazo = (motivo: MotivoRechazo, studentId: string | null = null): Decision => ({
    aceptada: false,
    motivo,
    studentId,
  });

  const t = marca.creadaEn.getTime();
  if (Number.isNaN(t) || t < ctx.abiertaEn.getTime() || t > ctx.cierraEn.getTime()) {
    return rechazo('SESION_CERRADA');
  }

  const qr = leerQr(marca.qr);
  if (!qr) return rechazo('QR_INVALIDO');
  if (qr.sesionId !== ctx.sesionId) return rechazo('QR_DE_OTRA_CLASE');
  if (!firmaValida(qr, ctx.secreto)) return rechazo('QR_INVALIDO');
  if (Math.abs(ventanaDe(marca.creadaEn) - qr.ventana) > TOLERANCIA_VENTANAS) {
    return rechazo('QR_VENCIDO');
  }

  const estudiantes = ctx.estudiantesPorUid.get(marca.uid) ?? [];
  if (estudiantes.length === 0) return rechazo('NO_MATRICULADO');
  // Una cuenta que responde por dos matrículas del mismo grupo es exactamente
  // la de alguien que se enlazó con el documento de un compañero: no se acepta
  // por ninguno de los dos.
  if (estudiantes.length > 1) return rechazo('CUENTA_CON_VARIOS_ENLACES');
  const studentId = estudiantes[0] as string;

  // La cuenta que marcó este semestre por otro estudiante, o un estudiante que
  // ya marca desde otra cuenta: es borrar el perfil en UniPlanner y enlazarse
  // al código de un compañero. Va antes de «ya registrada» para no confirmarle
  // nada sobre la asistencia de otra persona.
  const estudianteDeLaCuenta = ctx.vinculos?.porUid.get(marca.uid);
  const cuentaDelEstudiante = ctx.vinculos?.porEstudiante.get(studentId);
  if ((estudianteDeLaCuenta && estudianteDeLaCuenta !== studentId) ||
      (cuentaDelEstudiante && cuentaDelEstudiante !== marca.uid)) {
    return rechazo('CUENTA_CAMBIADA', studentId);
  }

  // Ya presente hoy: no se escribe nada y se le dice. Va antes de mirar el
  // teléfono porque no concede nada que no tuviera: la asistencia ya estaba.
  if (ctx.yaPresentes.has(studentId) || ctx.aceptadas.has(studentId)) {
    return { aceptada: true, studentId, yaRegistrada: true };
  }

  const otraCuenta = marca.deviceId ? ctx.dispositivos.get(marca.deviceId) : undefined;
  if (otraCuenta && otraCuenta !== marca.uid) return rechazo('DISPOSITIVO_REPETIDO', studentId);

  return { aceptada: true, studentId, yaRegistrada: false };
}

/**
 * Si una confirmación todavía vale.
 *
 * La vigencia del QR se midió al escanear —con la hora de Firestore—, así que
 * leer con calma la pantalla de confirmación no lo hace vencer. Lo único que
 * se exige al confirmar es que la lista siga abierta: una marca confirmada
 * después del cierre llegaría cuando el docente ya dio la lista por buena.
 */
export function confirmacionValida(
  confirmadaEn: Date,
  sesion: { abiertaEn: Date; cierraEn: Date },
): boolean {
  const t = confirmadaEn.getTime();
  return !Number.isNaN(t) && t >= sesion.abiertaEn.getTime() && t <= sesion.cierraEn.getTime();
}

/**
 * El documento de la persona, con todo menos los cuatro últimos caracteres
 * tapados: `••••••5432`.
 *
 * Es lo que ve en la confirmación para reconocerse. Entero no hace falta —ella
 * ya lo sabe— y la pantalla de un teléfono en un salón la puede leer quien
 * esté al lado.
 */
export function enmascararDocumento(codigo: string): string {
  const limpio = String(codigo ?? '');
  if (limpio.length <= 4) return limpio;
  return '•'.repeat(limpio.length - 4) + limpio.slice(-4);
}

/**
 * Decide una tanda de marcas en orden de llegada.
 *
 * Cada aceptada cuenta para las siguientes: dos marcas del mismo teléfono que
 * lleguen en la misma lectura no pasan las dos solo porque el contexto se
 * calculó antes de ver ninguna.
 */
export function evaluarLote(
  marcas: readonly MarcaEntrante[],
  ctx: ContextoSesion,
): { marca: MarcaEntrante; decision: Decision }[] {
  const aceptadas = new Set(ctx.aceptadas);
  const dispositivos = new Map(ctx.dispositivos);
  const ordenadas = [...marcas].sort((a, b) => a.creadaEn.getTime() - b.creadaEn.getTime());

  return ordenadas.map((marca) => {
    const decision = evaluarMarca(marca, { ...ctx, aceptadas, dispositivos });
    if (decision.aceptada && !decision.yaRegistrada) {
      aceptadas.add(decision.studentId);
      if (marca.deviceId) dispositivos.set(marca.deviceId, marca.uid);
    }
    return { marca, decision };
  });
}

/** `HH:mm` de pared del campus para un instante. */
export function horaDePared(instante: Date, offsetMinutos: number): string {
  const desplazado = new Date(instante.getTime() + offsetMinutos * 60_000);
  return desplazado.toISOString().slice(11, 16);
}
