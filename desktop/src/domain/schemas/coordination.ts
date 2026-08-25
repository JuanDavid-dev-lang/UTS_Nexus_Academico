/**
 * Vista de coordinación: las carreras a cargo, de punta a punta.
 *
 * Los promedios, la aprobación y el riesgo llegan calculados: el cliente no
 * suma ni divide nada. Si esta pantalla promediara por su cuenta, la misma
 * materia tendría un número aquí y otro en el consolidado, y el segundo sería
 * el que va al acta.
 */
import { z } from 'zod';
import { objectId } from './common';

export const programaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  facultad: z.string(),
  nivel: z.string(),
});
export type Programa = z.infer<typeof programaSchema>;

/** Nota media. `null` = no hay nada calificado; NO es un cero. */
const promedio = z.number().nullable();

export const materiaCoordinacionSchema = z.object({
  subjectId: objectId,
  code: z.string(),
  name: z.string(),
  period: z.string(),
  credits: z.number(),
  programa: z.string().nullable(),
  programaNombre: z.string(),
  /** El programa se dedujo de la adscripción del docente, no está declarado. */
  programaDeducido: z.boolean(),
  docente: z
    .object({ id: objectId, nombre: z.string(), email: z.string() })
    .nullable(),
  grupos: z.number(),
  estudiantes: z.number(),
  promedio,
  aprobados: z.number(),
  reprobados: z.number(),
  sinNotas: z.number(),
  enRiesgo: z.number(),
  asistencia: promedio,
});
export type MateriaCoordinacion = z.infer<typeof materiaCoordinacionSchema>;

export const docenteCoordinacionSchema = z.object({
  userId: objectId,
  profesorId: objectId.nullable(),
  nombre: z.string(),
  email: z.string(),
  cedula: z.string().nullable(),
  programas: z.array(z.string()),
  programasNombres: z.array(z.string()),
  esDirectorTrabajoGrado: z.boolean(),
  materias: z.array(z.object({ id: objectId, code: z.string(), name: z.string() })),
  grupos: z.number(),
  estudiantes: z.number(),
  promedio,
  enRiesgo: z.number(),
});
export type DocenteCoordinacion = z.infer<typeof docenteCoordinacionSchema>;

export const grupoCoordinacionSchema = z.object({
  groupId: objectId,
  name: z.string(),
  period: z.string(),
  materia: z.object({ id: objectId, code: z.string(), name: z.string() }).nullable(),
  programaNombre: z.string(),
  docente: z.object({ id: objectId, nombre: z.string() }).nullable(),
  estudiantes: z.number(),
  promedio,
  enRiesgo: z.number(),
});
export type GrupoCoordinacion = z.infer<typeof grupoCoordinacionSchema>;

export const resumenCoordinacionSchema = z.object({
  ok: z.literal(true),
  periodo: z.string().nullable(),
  programas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      materias: z.number(),
      grupos: z.number(),
      docentes: z.number(),
      estudiantes: z.number(),
      promedio,
      enRiesgo: z.number(),
    }),
  ),
  totales: z.object({
    materias: z.number(),
    grupos: z.number(),
    docentes: z.number(),
    estudiantes: z.number(),
    promedio,
    enRiesgo: z.number(),
    reprobando: z.number(),
  }),
});
export type ResumenCoordinacion = z.infer<typeof resumenCoordinacionSchema>;

export const programasResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(programaSchema),
  /** `true` cuando la cuenta no está acotada a ningún programa. */
  alcanceTotal: z.boolean(),
});

/** Filtro común de todas las consultas de la pantalla. */
export type FiltroCoordinacion = {
  period?: string;
  programa?: string;
  q?: string;
};
