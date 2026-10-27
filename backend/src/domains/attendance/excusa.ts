/**
 * Excusas de inasistencia. **Lógica pura, sin base de datos.**
 *
 * La excusa la registra quien recibe el soporte —el docente de la materia, o
 * coordinación—, no el estudiante: es quien ve el certificado médico o la
 * constancia y decide que la falta queda justificada. Registrarla ya es
 * aprobarla; no hay un estado intermedio «pendiente» que alguien tenga que
 * acordarse de revisar.
 *
 * Una falta justificada sigue siendo una falta en la lista —nadie dice que
 * vino—, pero `calcularAsistencia()` la saca del porcentaje y del cupo de
 * faltas, y `detectarPatrones()` de las rachas. Por eso esto vive en el
 * dominio: si cada cliente decidiera qué cuenta, el porcentaje del escritorio
 * y el del teléfono dejarían de coincidir.
 */

export const MOTIVOS_EXCUSA = ['MEDICA', 'CALAMIDAD', 'INSTITUCIONAL', 'LABORAL', 'OTRA'] as const;
export type MotivoExcusa = (typeof MOTIVOS_EXCUSA)[number];

export const ETIQUETA_MOTIVO_EXCUSA: Record<MotivoExcusa, string> = {
  MEDICA: 'Incapacidad médica',
  CALAMIDAD: 'Calamidad doméstica',
  INSTITUCIONAL: 'Actividad institucional',
  LABORAL: 'Motivo laboral',
  OTRA: 'Otra',
};

/** «Otra» sin explicar no le dice nada a quien lea el acta después. */
export const DETALLE_MINIMO_OTRA = 5;

/**
 * Por qué no se puede justificar este registro, o `null` si se puede.
 *
 * Solo se justifica una falta: un registro presente no tiene nada que
 * justificar, y aceptar la excusa ahí la dejaría guardada sin efecto, a la
 * espera de que alguien marque la falta y se encuentre una justificación que
 * nunca puso.
 */
export function motivoParaNoJustificar(
  registro: { present: boolean },
  excusa: { motivo: MotivoExcusa; detalle: string },
): string | null {
  if (registro.present) return 'Solo se justifica una falta: este estudiante figura presente en esa clase.';
  if (excusa.motivo === 'OTRA' && excusa.detalle.trim().length < DETALLE_MINIMO_OTRA) {
    return 'Con el motivo «Otra», describe la excusa.';
  }
  return null;
}
