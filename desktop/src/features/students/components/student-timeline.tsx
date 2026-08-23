import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  HeartHandshake,
  UserPlus,
} from 'lucide-react';
import { Badge, EmptyState, ErrorState, Field, NativeSelect, SkeletonList } from '@/shared/ui';
import { timelineRepository } from '@/infrastructure/repositories/activities.repository';
import { queryKeys } from '@/core/api/query-keys';
import {
  ETIQUETA_EVENTO,
  type EventoHistorial,
  type TipoEventoHistorial,
} from '@/domain/schemas/timeline';

/**
 * Historial cronológico del estudiante.
 *
 * La unión de matrículas, notas, asistencia, alertas, patrones, actividades y
 * cierres la hace el BACKEND. Este componente pinta lo que llega: no cruza
 * colecciones ni ordena por su cuenta. Si lo hiciera, el escritorio y el móvil
 * contarían dos historias distintas del mismo estudiante.
 */

const PRESENTACION: Record<
  TipoEventoHistorial,
  { tono: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; Icono: typeof UserPlus }
> = {
  MATRICULA: { tono: 'info', Icono: UserPlus },
  NOTA: { tono: 'neutral', Icono: GraduationCap },
  ASISTENCIA: { tono: 'warning', Icono: CalendarCheck },
  ALERTA_RIESGO: { tono: 'danger', Icono: AlertTriangle },
  INTERVENCION: { tono: 'success', Icono: HeartHandshake },
  PATRON_ASISTENCIA: { tono: 'danger', Icono: AlertTriangle },
  ACTIVIDAD: { tono: 'neutral', Icono: ClipboardList },
  CIERRE_PERIODO: { tono: 'info', Icono: Archive },
};

const TIPOS = Object.keys(ETIQUETA_EVENTO) as TipoEventoHistorial[];

/** Día en texto, para agrupar. La hora se muestra dentro de cada fila. */
function dia(iso: string): string {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return 'Sin fecha';
  return instante.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function hora(iso: string): string {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime())
    ? ''
    : instante.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function StudentTimeline({
  studentId,
  periodos = [],
}: {
  studentId: string;
  /** Periodos disponibles para el filtro. Los provee quien abre la ficha. */
  periodos?: string[];
}) {
  const [period, setPeriod] = useState('');
  const [tipo, setTipo] = useState<TipoEventoHistorial | ''>('');

  const filtro = useMemo(
    () => ({ period: period || undefined, tipos: tipo ? [tipo] : undefined, limit: 100 }),
    [period, tipo],
  );

  const historial = useQuery({
    queryKey: [...queryKeys.timeline.student(studentId, filtro), 'seguimiento'],
    queryFn: () => timelineRepository.seguimiento(studentId, { period: filtro.period, limit: 100 }),
    enabled: Boolean(studentId),
  });

  // La agrupación por día es presentación pura sobre una lista que ya viene
  // ordenada del servidor: no reordena nada.
  const porDia = useMemo(() => {
    const grupos = new Map<string, EventoHistorial[]>();
    for (const evento of historial.data?.timeline.items.filter(e => !tipo || e.type === tipo) ?? []) {
      const clave = dia(evento.occurredAt);
      const lista = grupos.get(clave);
      if (lista) lista.push(evento);
      else grupos.set(clave, [evento]);
    }
    return [...grupos.entries()];
  }, [historial.data, tipo]);

  return (
    <div className="flex flex-col gap-3">
      {historial.data ? (
        <section aria-label="Situación académica" className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-muted">Expediente de seguimiento</p>
              <h3 className="text-h3 font-semibold text-text">{historial.data.student.fullName}</h3>
              <p className="text-caption text-muted">{historial.data.student.code} · {historial.data.student.program || 'Programa sin registrar'}</p>
            </div>
            {historial.data.followUp.open ? <Badge tone="warning">Seguimiento en curso</Badge> : <Badge tone="neutral">Sin seguimiento abierto</Badge>}
          </div>
          {historial.data.academic.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {historial.data.academic.map((registro) => (
                <article key={`${registro.subjectId}-${registro.period}`} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-body text-text">{registro.subjectName ?? 'Materia'}</strong>
                    <Badge tone={registro.risk.level === 'ALTO' ? 'danger' : registro.risk.level === 'MEDIO' ? 'warning' : 'success'}>{registro.risk.level}</Badge>
                  </div>
                  <p className="mt-1 text-caption text-muted">{registro.period} · Promedio actual {registro.currentGrade.toFixed(2)} · Asistencia {registro.attendancePercentage.toFixed(1)}%</p>
                  {registro.risk.reasons.length ? <ul className="mt-2 list-disc pl-4 text-caption text-muted">{registro.risk.reasons.map(m => <li key={m}>{m}</li>)}</ul> : <p className="mt-2 text-caption text-muted">Sin señales académicas de riesgo.</p>}
                </article>
              ))}
            </div>
          ) : <p className="text-caption text-muted">Todavía no hay notas ni asistencia consolidadas para este filtro.</p>}
        </section>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Periodo" className="min-w-[140px]">
          {(props) => (
            <NativeSelect
              {...props}
              value={period}
              onChange={(evento) => setPeriod(evento.target.value)}
            >
              <option value="">Todos</option>
              {periodos.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        <Field label="Tipo de hecho" className="min-w-[180px]">
          {(props) => (
            <NativeSelect
              {...props}
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as TipoEventoHistorial | '')}
            >
              <option value="">Todos</option>
              {TIPOS.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETA_EVENTO[valor]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>

      {historial.isPending ? <SkeletonList rows={5} /> : null}
      {historial.isError ? (
        <ErrorState error={historial.error} onRetry={() => void historial.refetch()} />
      ) : null}

      {historial.isSuccess && porDia.length === 0 ? (
        <EmptyState
          title="Sin hechos registrados"
          message="Cuando haya matrículas, notas, ausencias o alertas, aparecerán aquí en orden."
        />
      ) : null}

      {porDia.map(([fecha, eventos]) => (
        <section key={fecha} className="flex flex-col gap-2">
          <h4 className="text-caption font-semibold uppercase tracking-wide text-muted">{fecha}</h4>

          <ol className="flex flex-col gap-2 border-l border-border pl-4">
            {eventos.map((evento) => {
              const presentacion = PRESENTACION[evento.type];
              return (
                <li key={evento.id} className="relative flex flex-col gap-0.5">
                  <span
                    className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border"
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <presentacion.Icono className="size-3.5 text-muted" aria-hidden />
                    <span className="text-body font-medium text-text">{evento.title}</span>
                    <Badge tone={presentacion.tono}>{ETIQUETA_EVENTO[evento.type]}</Badge>
                    {evento.period ? <Badge tone="neutral">{evento.period}</Badge> : null}
                    <span className="text-caption text-muted">{hora(evento.occurredAt)}</span>
                  </div>
                  {evento.summary ? (
                    <p className="text-caption text-muted">{evento.summary}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {historial.data?.timeline.hasMore ? (
        <p className="text-caption text-muted">
          Se muestran los {historial.data.timeline.items.length} hechos más recientes de{' '}
          {historial.data.timeline.total}. Filtra por periodo para ver los anteriores.
        </p>
      ) : null}
    </div>
  );
}
