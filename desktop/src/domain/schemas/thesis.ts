/**
 * Formatos oficiales de trabajo de grado.
 */
import { z } from 'zod';
import { mongoDoc, numberish } from './common';

// ── Formatos de trabajo de grado ────────────────────────────────────────────

export const etapaTrabajoGrado = z.enum(['PROPUESTA', 'DESARROLLO', 'INFORME_FINAL', 'EVALUACION', 'GRADO']);
export type EtapaTrabajoGrado = z.infer<typeof etapaTrabajoGrado>;

export const ETAPA_TG_LABEL: Record<EtapaTrabajoGrado, string> = {
  PROPUESTA: 'Propuesta',
  DESARROLLO: 'Desarrollo',
  INFORME_FINAL: 'Informe final',
  EVALUACION: 'Evaluación',
  GRADO: 'Solicitud de grado',
};

export const thesisFormatSchema = mongoDoc.extend({
  nombre: z.string(),
  descripcion: z.string().optional().default(''),
  etapa: etapaTrabajoGrado,
  modalidades: z.array(z.string()).optional().default([]),
  camposALlenar: z.array(z.string()).optional().default([]),
  version: z.string().optional().default('1'),
  archivo: z.object({
    filename: z.string(),
    originalName: z.string(),
    mimetype: z.string(),
    size: numberish,
  }),
});
export type ThesisFormat = z.infer<typeof thesisFormatSchema>;
