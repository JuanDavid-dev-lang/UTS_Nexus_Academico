/**
 * Lo que va encima de la tabla de un reporte: la ficha (periodo, materia,
 * grupo, fecha de generación) y los indicadores de cabecera.
 *
 * Pura y con pruebas. Los indicadores **cuentan** lo que ya calculó el backend
 * —el estado de cada registro sale de `computeAcademicRecords()` y la
 * asistencia de `calcularAsistencia()`, la misma función del dominio—; aquí no
 * se decide ninguna nota ni ningún porcentaje por otro camino.
 */
import { ASISTENCIA, calcularAsistencia } from '../../domains/attendance/attendance.service.js';
import { RUBRICA } from '../../domains/grading/grading.service.js';
import type { AcademicRecord } from '../../shared/academic.service.js';
import type { MapBundle } from './report-columns.js';
import { fechaCorta, type Tono } from './report-layout.js';

export type Dato = { etiqueta: string; valor: string };
export type Indicador = { etiqueta: string; valor: string; tono?: Tono };

export type FiltrosVisibles = {
  period?: string;
  subjectId?: string;
  groupId?: string;
  studentId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

/**
 * Ficha del reporte.
 *
 * Materia, grupo y estudiante se nombran con los diccionarios de **las filas
 * del propio reporte**, que ya vienen acotadas al alcance de quien lo pide.
 * Antes se imprimía el identificador de la URL («Grupo: 66f1…»), que no le
 * dice nada a quien lee el acta; y resolverlo con una consulta aparte dejaría
 * leer el nombre de una materia o un estudiante ajenos pasando su id. Un
 * reporte vacío, por eso, no nombra el filtro: no hay nada que lo respalde.
 */
export function detallesDelReporte(filtros: FiltrosVisibles, maps: MapBundle, generado: string): Dato[] {
  const datos: Dato[] = [{ etiqueta: 'Periodo', valor: filtros.period || 'Todos' }];

  const materia = filtros.subjectId ? maps.subjects.get(filtros.subjectId) : undefined;
  if (materia) {
    datos.push({ etiqueta: 'Materia', valor: [materia.code, materia.name].filter(Boolean).join(' · ') });
  }
  const grupo = filtros.groupId ? maps.groups.get(filtros.groupId) : undefined;
  if (grupo?.name) datos.push({ etiqueta: 'Grupo', valor: String(grupo.name) });

  const estudiante = filtros.studentId ? maps.students.get(filtros.studentId) : undefined;
  if (estudiante) {
    const documento = estudiante.code ? ` · ${estudiante.code}` : '';
    datos.push({ etiqueta: 'Estudiante', valor: `${estudiante.fullName ?? ''}${documento}`.trim() });
  }

  if (filtros.dateFrom || filtros.dateTo) {
    const desde = fechaCorta(filtros.dateFrom) || 'Inicio';
    const hasta = fechaCorta(filtros.dateTo) || 'Hoy';
    datos.push({ etiqueta: 'Rango de fechas', valor: `${desde} – ${hasta}` });
  }

  datos.push({ etiqueta: 'Generado', valor: generado });
  return datos;
}

const distintos = (ids: unknown[]) => new Set(ids.map(id => String(id ?? ''))).size;

/** Consolidado: cuántos aprueban y cuántos no, con el estado que ya trae cada registro. */
export function indicadoresConsolidado(records: AcademicRecord[]): Indicador[] {
  if (!records.length) return [];
  const aprobados = records.filter(r => r.aprobado).length;
  const reprobados = records.length - aprobados;
  const promedio = records.reduce((suma, r) => suma + r.notaFinal, 0) / records.length;
  return [
    { etiqueta: 'Estudiantes', valor: String(distintos(records.map(r => r.studentId))) },
    { etiqueta: 'Aprobados', valor: String(aprobados), tono: 'ok' },
    { etiqueta: 'Reprobados', valor: String(reprobados), tono: reprobados ? 'mal' : undefined },
    {
      etiqueta: 'Promedio final',
      valor: promedio.toFixed(2),
      tono: promedio < RUBRICA.NOTA_APROBACION ? 'mal' : undefined,
    },
  ];
}

type NotaDelReporte = { studentId?: unknown; score?: unknown };

/**
 * Notas atómicas: sin promedio a propósito. Promediar notas de componentes con
 * pesos distintos (30/60/10) daría una cifra que no es la nota de nadie.
 */
export function indicadoresNotas(notas: NotaDelReporte[]): Indicador[] {
  if (!notas.length) return [];
  const bajo = notas.filter(n => Number(n.score ?? 0) < RUBRICA.NOTA_APROBACION).length;
  return [
    { etiqueta: 'Notas registradas', valor: String(notas.length) },
    { etiqueta: 'Estudiantes', valor: String(distintos(notas.map(n => n.studentId))) },
    {
      etiqueta: `Por debajo de ${RUBRICA.NOTA_APROBACION.toFixed(1)}`,
      valor: String(bajo),
      tono: bajo ? 'mal' : undefined,
    },
  ];
}

type AsistenciaDelReporte = { studentId?: unknown; present: boolean; durationMinutes?: number | null };

/** Porcentaje ponderado por minutos, con la función del dominio y sus umbrales. */
export function indicadorDeAsistencia(registros: AsistenciaDelReporte[]): Indicador | null {
  if (!registros.length) return null;
  const { porcentaje } = calcularAsistencia(registros);
  const tono: Tono =
    porcentaje < ASISTENCIA.UMBRAL_CRITICO ? 'mal' : porcentaje < ASISTENCIA.UMBRAL_MINIMO ? 'alerta' : 'ok';
  return { etiqueta: 'Asistencia (por minutos)', valor: `${porcentaje.toFixed(1)}%`, tono };
}

export function indicadoresAsistencia(registros: AsistenciaDelReporte[]): Indicador[] {
  const porcentaje = indicadorDeAsistencia(registros);
  if (!porcentaje) return [];
  const resumen = calcularAsistencia(registros);
  return [
    { etiqueta: 'Registros', valor: String(resumen.totalClases) },
    { etiqueta: 'Estudiantes', valor: String(distintos(registros.map(r => r.studentId))) },
    { etiqueta: 'Presentes', valor: String(resumen.clasesPresente), tono: 'ok' },
    { etiqueta: 'Ausencias', valor: String(resumen.clasesAusente), tono: resumen.clasesAusente ? 'mal' : undefined },
    porcentaje,
  ];
}
