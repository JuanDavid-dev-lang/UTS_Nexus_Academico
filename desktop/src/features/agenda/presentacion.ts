/**
 * Cómo se ve cada tipo de la agenda.
 *
 * Se declara el significado y se resuelve contra los tokens del tema, nunca un
 * color en crudo (DESIGN.md §4): un `#EF4444` escrito aquí se vería igual en
 * claro y en oscuro, y en oscuro cae por debajo del contraste AA.
 */
import {
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  Handshake,
  Landmark,
  ListChecks,
  Users,
} from 'lucide-react';
import type { AgendaPrioridad, AgendaTipo } from '@/domain/schemas/agenda';

export type PresentacionTipo = {
  etiqueta: string;
  icono: typeof BookOpen;
  /** Fondo suave + texto, para chips y bloques del calendario. */
  suave: string;
  /** Barra lateral del bloque: el color pleno. */
  barra: string;
};

export const PRESENTACION_TIPO: Record<AgendaTipo, PresentacionTipo> = {
  CLASS: {
    etiqueta: 'Clase',
    icono: BookOpen,
    suave: 'bg-primary/10 text-primary',
    barra: 'bg-primary',
  },
  EXAM: {
    etiqueta: 'Parcial',
    icono: GraduationCap,
    suave: 'bg-danger-soft text-danger',
    barra: 'bg-danger',
  },
  EVALUATION: {
    etiqueta: 'Evaluación',
    icono: ClipboardCheck,
    suave: 'bg-danger-soft text-danger',
    barra: 'bg-danger',
  },
  DELIVERY: {
    etiqueta: 'Entrega',
    icono: FileUp,
    suave: 'bg-warning-soft text-warning',
    barra: 'bg-warning',
  },
  ACTIVITY: {
    etiqueta: 'Actividad',
    icono: ListChecks,
    suave: 'bg-info-soft text-info',
    barra: 'bg-info',
  },
  MEETING: {
    etiqueta: 'Reunión',
    icono: Users,
    suave: 'bg-info-soft text-info',
    barra: 'bg-info',
  },
  TUTORING: {
    etiqueta: 'Tutoría',
    icono: Handshake,
    suave: 'bg-success-soft text-success',
    barra: 'bg-success',
  },
  ACADEMIC: {
    etiqueta: 'Evento académico',
    icono: Landmark,
    suave: 'bg-success-soft text-success',
    barra: 'bg-success',
  },
  REMINDER: {
    etiqueta: 'Recordatorio',
    icono: CalendarClock,
    suave: 'bg-surface-alt text-muted',
    barra: 'bg-border-strong',
  },
};

export const ETIQUETA_PRIORIDAD: Record<AgendaPrioridad, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

/** Antelaciones que ofrece la interfaz. Coinciden con las que valida el backend. */
export const ANTELACIONES: { valor: number; etiqueta: string }[] = [
  { valor: 5, etiqueta: '5 minutos antes' },
  { valor: 10, etiqueta: '10 minutos antes' },
  { valor: 15, etiqueta: '15 minutos antes' },
  { valor: 30, etiqueta: '30 minutos antes' },
  { valor: 60, etiqueta: '1 hora antes' },
  { valor: 1440, etiqueta: '1 día antes' },
];
