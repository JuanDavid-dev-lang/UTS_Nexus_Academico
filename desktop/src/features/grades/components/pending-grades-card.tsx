import { CheckCircle2, ClipboardList } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/shared/ui';
import { usePendingGrades } from '@/features/grades/hooks/use-grades';
import type { ComponentType } from '@/domain/schemas/academic';

/**
 * Qué falta por calificar.
 *
 * Un docente no persigue promedios: persigue el cierre de corte. La pregunta de
 * esa semana es «¿qué me falta?», y la respuesta ya vivía en los datos —el
 * motor distingue una nota de 0.0 de una nota que no existe— pero se usaba solo
 * para no dar falsos positivos de riesgo y después se descartaba.
 *
 * Se cuenta sobre los matriculados, no sobre quien ya tiene alguna nota: el
 * estudiante sin ninguna es justo el que no puede quedar fuera de la cuenta.
 */

const COMPONENT_SHORT: Record<ComponentType, string> = {
  TRABAJOS: 'Trabajos',
  PARCIALES: 'Parciales',
  AUTOEVALUACION: 'Autoev.',
};

export function PendingGradesCard({
  period,
  subjectId,
}: {
  period: string;
  subjectId?: string;
}) {
  const pending = usePendingGrades(period, subjectId);

  // Mientras carga no se ocupa sitio: es una ayuda, no el contenido de la
  // página, y un esqueleto aquí solo desplazaría la tabla al llegar.
  if (pending.isPending || pending.isError) return null;

  const items = (pending.data ?? []).filter((subject) => subject.faltan > 0);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2.5 py-3 text-body text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          No queda nada por calificar en {period}.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-body">
          <ClipboardList className="size-4 text-warning" aria-hidden />
          Te falta por calificar
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.map((subject) => (
          <div key={subject.subjectId} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-body font-medium text-text">{subject.name}</span>
              <span className="font-mono text-caption text-muted">{subject.code}</span>
              <Badge tone="warning" className="ml-auto">
                {subject.faltan} {subject.faltan === 1 ? 'nota' : 'notas'}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {subject.cortes
                .filter((cut) => cut.faltan > 0)
                .map((cut) => (
                  <span key={cut.corte} className="text-caption text-muted">
                    <span className="font-semibold text-text">Corte {cut.corte}:</span>{' '}
                    {cut.componentes
                      .filter((component) => component.faltan > 0)
                      .map(
                        (component) =>
                          `${COMPONENT_SHORT[component.componente]} ${component.faltan}/${component.total}`,
                      )
                      .join(' · ')}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
