/**
 * Los avisos que Nexus escribe en el buzón de UniPlanner. Lógica pura.
 *
 * Aquí solo se **construye** el documento; escribirlo es de
 * `shared/uniplanner.ts`. La separación importa porque lo que se manda a la
 * app de un estudiante es una decisión académica —qué cuenta como riesgo, qué
 * texto lee, cuándo deja de tener sentido— y esas se prueban sin red.
 *
 * Regla que gobierna todo el canal: **el aviso informa, nunca aplica nada.**
 * UniPlanner ofrece la acción y el estudiante decide. Un aviso de faltas no
 * marca faltas en su app. Ver `docs/UNIPLANNER.md`.
 */
import { ASISTENCIA } from '../attendance/attendance.service.js';

/** Los tipos que UniPlanner entiende. Son literales permanentes: viajan en el
 * documento y los lee una app que puede ser de hace seis meses. */
export type TipoAviso =
  | 'attendance_alert'
  | 'grade_published'
  | 'course_load'
  | 'assignment'
  | 'notice';

export type Aviso = {
  type: TipoAviso;
  courseCode?: string;
  courseName?: string;
  teacherName?: string;
  term?: string;
  message?: string;
  /** Cuándo deja de tener sentido en el buzón. */
  expiresAt?: Date;
  payload?: Record<string, unknown>;
};

/** Semáforo de inasistencias que pinta la lista de clase. */
export type NivelInasistencia = 'VERDE' | 'AMARILLO' | 'ROJO';

export const INASISTENCIA = {
  /** Proporción del cupo de faltas a partir de la cual se avisa temprano. */
  UMBRAL_AMARILLO: 0.5,
  /** A partir de aquí es riesgo crítico o pérdida por faltas. */
  UMBRAL_ROJO: 0.8,
  /** Vigencia de un aviso de faltas. Un corte no dura más que esto. */
  DIAS_VIGENCIA: 120,
} as const;

/**
 * Qué proporción del cupo de faltas lleva gastada, de 0 a 1 o más.
 *
 * Sale del **porcentaje ponderado por minutos**, que es la regla académica de
 * la casa: una clase de tres horas no cuenta lo mismo que una de hora y media.
 * Con el umbral en 70 %, el cupo es el 30 % restante, así que un 85 % de
 * asistencia ha gastado la mitad del cupo.
 *
 * Por encima de 1 la materia ya está perdida por faltas; no se recorta, porque
 * la diferencia entre «justo en el límite» y «al doble» es información.
 */
export function cupoConsumido(porcentajeAsistencia: number): number {
  const tolerancia = 100 - ASISTENCIA.UMBRAL_MINIMO;
  if (tolerancia <= 0) return 0;
  const ausencia = Math.max(0, 100 - porcentajeAsistencia);
  return Math.round((ausencia / tolerancia) * 1000) / 1000;
}

export function nivelDeInasistencia(porcentajeAsistencia: number): NivelInasistencia {
  const consumido = cupoConsumido(porcentajeAsistencia);
  if (consumido >= INASISTENCIA.UMBRAL_ROJO) return 'ROJO';
  if (consumido >= INASISTENCIA.UMBRAL_AMARILLO) return 'AMARILLO';
  return 'VERDE';
}

/**
 * Cuántas faltas se toleran en un curso de [totalClases] clases.
 *
 * Se redondea **hacia abajo**: el límite es el máximo tolerado y la materia se
 * pierde al superarlo, así que con 30 clases y un 30 % de tolerancia, nueve
 * faltas son exactamente el tope y la décima es la que cuesta la materia.
 *
 * Es un número **en clases**, no en minutos, y eso es a propósito aunque el
 * porcentaje de la casa sea ponderado: es lo que el estudiante cuenta y lo que
 * su app va a pintar. Cuando las clases duran lo mismo —el caso normal— las
 * dos cuentas coinciden; cuando no, el texto del aviso lleva el porcentaje
 * real, que es el que manda.
 */
export function faltasPermitidas(totalClases: number): number {
  if (!Number.isFinite(totalClases) || totalClases <= 0) return 0;
  return Math.floor((totalClases * (100 - ASISTENCIA.UMBRAL_MINIMO)) / 100);
}

function enDias(dias: number, desde: Date): Date {
  return new Date(desde.getTime() + dias * 24 * 60 * 60 * 1000);
}

/** Redondeo a dos decimales para los números que se pintan. */
function dosDecimales(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export type DatosInasistencia = {
  materiaCodigo?: string;
  materiaNombre: string;
  docente?: string;
  corte?: string;
  /** Clases no asistidas. */
  clasesAusente: number;
  /** Clases dictadas hasta ahora. */
  totalClases: number;
  /** Porcentaje ponderado por minutos, la cifra canónica de la casa. */
  porcentajeAsistencia: number;
  /** Texto propio del docente. Si no lo escribe, se compone uno. */
  mensaje?: string;
  ahora?: Date;
};

/**
 * Aviso de inasistencias acumuladas.
 *
 * El texto que se compone cuando el docente no escribe uno **no reprende ni
 * amenaza**: dice cuántas faltas hay, cuántas se toleran, y qué puede hacer
 * quien lo lee. Un aviso que solo dice «vas a perder la materia» no deja a
 * nadie ninguna salida, y el objetivo de mandarlo es justo lo contrario.
 */
export function avisoDeInasistencia(datos: DatosInasistencia): Aviso {
  const ahora = datos.ahora ?? new Date();
  const permitidas = faltasPermitidas(datos.totalClases);
  const corte = datos.corte?.trim();

  const compuesto = permitidas > 0
    ? `Llevas ${datos.clasesAusente} de ${permitidas} inasistencias permitidas en ${datos.materiaNombre}` +
      ` (asistencia ${dosDecimales(datos.porcentajeAsistencia)} %).` +
      ' Si tienes justificantes pendientes, habla con tu docente antes del cierre de actas.'
    : `Tu docente registró ${datos.clasesAusente} inasistencias en ${datos.materiaNombre}.` +
      ' Si tienes justificantes pendientes, habla con él antes del cierre de actas.';

  return {
    type: 'attendance_alert',
    courseCode: datos.materiaCodigo,
    courseName: datos.materiaNombre,
    teacherName: datos.docente,
    term: corte || undefined,
    message: datos.mensaje?.trim() || compuesto,
    expiresAt: enDias(INASISTENCIA.DIAS_VIGENCIA, ahora),
    payload: {
      absences: Math.max(0, Math.trunc(datos.clasesAusente)),
      maxAllowed: permitidas,
    },
  };
}

export type DatosNota = {
  materiaCodigo?: string;
  materiaNombre: string;
  docente?: string;
  /** Número de corte: 1, 2, 3. */
  corte: number;
  nota: number;
  /** Nota máxima de la escala. En la UTS, 5.0. */
  escala: number;
  titulo?: string;
  mensaje?: string;
  ahora?: Date;
};

/**
 * Aviso de nota publicada.
 *
 * `escala` viaja siempre aunque en la UTS sea 5.0: quien lo lee puede tener
 * configurada otra, y sin ese número un 4.3 se guardaría tal cual sobre una
 * escala de 100. UniPlanner convierte y avisa antes de escribir nada, pero
 * solo puede hacerlo si sabe de qué escala viene.
 */
export function avisoDeNota(datos: DatosNota): Aviso {
  const ahora = datos.ahora ?? new Date();
  const nota = dosDecimales(datos.nota);

  return {
    type: 'grade_published',
    courseCode: datos.materiaCodigo,
    courseName: datos.materiaNombre,
    teacherName: datos.docente,
    term: `Corte ${datos.corte}`,
    message:
      datos.mensaje?.trim() ||
      `Tu docente publicó la nota del corte ${datos.corte} en ${datos.materiaNombre}: ${nota} sobre ${dosDecimales(datos.escala)}.`,
    expiresAt: enDias(INASISTENCIA.DIAS_VIGENCIA, ahora),
    payload: {
      value: nota,
      scaleMax: dosDecimales(datos.escala),
      period: Math.trunc(datos.corte),
      ...(datos.titulo?.trim() ? { title: datos.titulo.trim() } : {}),
    },
  };
}

export type FranjaCarga = {
  /** 1 = lunes … 7 = domingo. */
  dia: number;
  /** `HH:mm`. */
  inicio: string;
  fin: string;
  aula?: string | null;
};

export type MateriaCarga = {
  codigo?: string;
  nombre: string;
  grupo?: string | null;
  docente?: string | null;
  franjas: FranjaCarga[];
};

/** Topes del envío, iguales a los que UniPlanner acepta. Lo que pasa de ahí lo
 * corta el receptor en silencio, así que se corta aquí y se puede contar. */
export const CARGA = {
  MAX_MATERIAS: 30,
  MAX_FRANJAS: 20,
  DIAS_VIGENCIA: 180,
} as const;

/**
 * Aviso con la carga académica del semestre.
 *
 * Es la alternativa a que el estudiante extraiga su horario de un PDF: Nexus
 * ya tiene la asignación oficial. UniPlanner la mete por el mismo asistente de
 * importación que el PDF, con su selección materia a materia, así que esto no
 * escribe nada en su semestre por su cuenta.
 */
export function avisoDeCargaAcademica(datos: {
  materias: MateriaCarga[];
  periodo?: string;
  mensaje?: string;
  ahora?: Date;
}): Aviso {
  const ahora = datos.ahora ?? new Date();
  const materias = datos.materias.slice(0, CARGA.MAX_MATERIAS).map((materia) => ({
    ...(materia.codigo ? { code: materia.codigo } : {}),
    name: materia.nombre,
    ...(materia.grupo ? { group: materia.grupo } : {}),
    ...(materia.docente ? { teacher: materia.docente } : {}),
    slots: materia.franjas.slice(0, CARGA.MAX_FRANJAS).map((franja) => ({
      day: franja.dia,
      start: franja.inicio,
      end: franja.fin,
      ...(franja.aula ? { room: franja.aula } : {}),
    })),
  }));

  return {
    type: 'course_load',
    term: datos.periodo,
    message:
      datos.mensaje?.trim() ||
      `Tu horario del periodo ${datos.periodo ?? 'actual'} está listo para importar: ${materias.length} materias.`,
    expiresAt: enDias(CARGA.DIAS_VIGENCIA, ahora),
    payload: { courses: materias },
  };
}

export type DatosEntrega = {
  materiaCodigo?: string;
  materiaNombre: string;
  docente?: string;
  titulo: string;
  /** `yyyy-MM-dd`. */
  fecha?: string;
  /** `HH:mm`. */
  hora?: string;
  mensaje?: string;
  ahora?: Date;
};

/** Días que un aviso de entrega sigue en el buzón después de su fecha. */
export const ENTREGA_DIAS_GRACIA = 30;

/**
 * Si `yyyy-MM-dd` es un día que existe de verdad.
 *
 * El patrón no basta, y este es el caso exacto que lo demuestra: `2026-02-31`
 * casa con la expresión regular, y `new Date('2026-02-31T23:59:59Z')` **no
 * falla** — desborda al 3 de marzo. Un taller creado con esa fecha vencería
 * tres días tarde y no habría ningún error por el que enterarse: ni aquí, ni en
 * el buzón, ni en la app del estudiante.
 *
 * Se comprueba reconstruyendo la fecha y mirando si los tres números
 * sobrevivieron. Es la única forma de distinguir «31 de febrero» de «3 de
 * marzo» una vez que `Date` los ha igualado.
 */
export function esFechaReal(iso: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!partes) return false;

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

/**
 * Aviso de un trabajo con fecha de entrega.
 *
 * Caduca a los treinta días de la fecha, no a los ciento veinte: un taller
 * entregado hace un mes no pinta nada en el buzón de nadie. Sin fecha se le da
 * la vigencia corta igualmente, porque un trabajo sin plazo tampoco envejece
 * bien.
 */
export function avisoDeEntrega(datos: DatosEntrega): Aviso {
  const ahora = datos.ahora ?? new Date();

  // Una fecha imposible se trata como si no la hubieran puesto. La ruta ya la
  // rechaza con un 400 —que es la respuesta correcta para quien la escribió—,
  // pero el dominio no puede confiar en su único llamador: emitir `2026-02-31`
  // pondría en la app de alguien un plazo que no existe, y allí ya no queda a
  // quién preguntarle.
  const fecha = datos.fecha && esFechaReal(datos.fecha) ? datos.fecha : undefined;
  const base = fecha ? new Date(`${fecha}T23:59:59Z`) : ahora;
  const vence = Number.isNaN(base.getTime()) ? ahora : base;

  return {
    type: 'assignment',
    courseCode: datos.materiaCodigo,
    courseName: datos.materiaNombre,
    teacherName: datos.docente,
    message:
      datos.mensaje?.trim() ||
      `${datos.titulo} en ${datos.materiaNombre}${fecha ? `, para el ${fecha}` : ''}.`,
    expiresAt: enDias(ENTREGA_DIAS_GRACIA, vence),
    payload: {
      title: datos.titulo,
      ...(fecha ? { dueDate: fecha } : {}),
      ...(datos.hora ? { dueTime: datos.hora } : {}),
    },
  };
}
