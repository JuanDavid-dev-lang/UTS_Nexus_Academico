import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  NativeSelect,
  SkeletonList,
  Textarea,
} from '@/shared/ui';
import { attendanceCasesRepository } from '@/infrastructure/repositories/activities.repository';
import { queryKeys } from '@/core/api/query-keys';
import { toast } from '@/state/toast.store';
import { TITULO_PATRON, type CasoAsistencia } from '@/domain/schemas/activities';

/**
 * Casos abiertos por patrón de inasistencia.
 *
 * Van en la pantalla de riesgo y no en una propia porque responden la misma
 * pregunta —«¿a quién hay que atender?»— desde el otro lado: el riesgo mira el
 * acumulado del semestre y esto mira la FORMA de las faltas. Un estudiante con
 * 78 % que ha faltado a las tres últimas clases seguidas no sale en la lista de
 * riesgo, y es justo el que está abandonando la materia.
 *
 * El patrón, la severidad y la evidencia los decide el backend
 * (`domains/attendance/patterns.ts`). Aquí no hay ningún umbral.
 */

type Severidad = { tono: 'danger' | 'warning' | 'neutral'; texto: string };

const SEVERIDAD: Record<string, Severidad> = {
  ALTA: { tono: 'danger', texto: 'Alta' },
  MEDIA: { tono: 'warning', texto: 'Media' },
  BAJA: { tono: 'neutral', texto: 'Baja' },
};

/** Media por defecto: una severidad desconocida no debe dejar el chip vacío. */
const SEVERIDAD_POR_DEFECTO: Severidad = { tono: 'warning', texto: 'Media' };

function fecha(iso?: string): string {
  if (!iso) return '—';
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime())
    ? '—'
    : instante.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function AttendanceCasesCard() {
  const [interviniendo, setInterviniendo] = useState<CasoAsistencia | null>(null);
  const [nota, setNota] = useState('');
  const [estado, setEstado] = useState<'EN_SEGUIMIENTO' | 'RESUELTO' | 'DESCARTADO'>(
    'EN_SEGUIMIENTO',
  );

  const queryClient = useQueryClient();

  const casos = useQuery({
    queryKey: queryKeys.attendanceCases.list({ status: 'ABIERTO' }),
    queryFn: () => attendanceCasesRepository.list({ status: 'ABIERTO', limit: 50 }),
  });

  const intervenir = useMutation({
    mutationFn: () =>
      attendanceCasesRepository.intervenir(interviniendo!._id, { nota, estado }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.attendanceCases.all] });
      // El historial del estudiante muestra la intervención como un hecho más.
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.timeline.all] });
      setInterviniendo(null);
      setNota('');
      toast.success('Seguimiento registrado');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo registrar'),
  });

  const items = casos.data?.items ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-4" aria-hidden />
            Patrones de inasistencia
          </CardTitle>
          <CardDescription>
            Faltas seguidas, retrasos repetidos y caídas recientes. Los detecta el servidor sobre
            la forma de las ausencias, no sobre el porcentaje acumulado.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          {casos.isPending ? <SkeletonList rows={3} /> : null}
          {casos.isError ? (
            <ErrorState error={casos.error} onRetry={() => void casos.refetch()} />
          ) : null}

          {casos.isSuccess && items.length === 0 ? (
            <EmptyState
              title="Sin patrones abiertos"
              message="Ningún estudiante muestra ausencias seguidas ni retrasos repetidos."
            />
          ) : null}

          {items.map((caso) => {
            const severidad = SEVERIDAD[caso.severity] ?? SEVERIDAD_POR_DEFECTO;
            return (
              <div
                key={caso._id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="size-3.5 text-warning" aria-hidden />
                    <span className="text-body font-semibold text-text">
                      {TITULO_PATRON[caso.pattern]}
                    </span>
                    <Badge tone={severidad.tono}>Severidad {severidad.texto}</Badge>
                    {caso.occurrences > 1 ? (
                      <Badge tone="neutral">visto {caso.occurrences} veces</Badge>
                    ) : null}
                  </div>

                  {/* La evidencia es la parte accionable: un color solo no
                      justifica contactar a un estudiante. */}
                  <p className="text-caption text-muted">{caso.evidence}</p>
                  <p className="text-caption text-muted">
                    Detectado el {fecha(caso.detectedAt)} · periodo {caso.period} ·{' '}
                    {caso.status === 'ABIERTO' ? 'sin intervención' : caso.status.toLowerCase()}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" asChild>
                    {/* Al detalle de la asistencia de esa materia, que es donde
                        se comprueba la evidencia. */}
                    <Link to={`/asistencia?subjectId=${caso.subjectId}`}>Ver asistencia</Link>
                  </Button>
                  <Button
                    onClick={() => {
                      setInterviniendo(caso);
                      setNota(caso.interventionNote ?? '');
                      setEstado('EN_SEGUIMIENTO');
                    }}
                  >
                    Registrar seguimiento
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(interviniendo)}
        onOpenChange={(abierto) => (abierto ? null : setInterviniendo(null))}
      >
        <DialogContent
          title="Registrar seguimiento"
          description={
            interviniendo
              ? `${TITULO_PATRON[interviniendo.pattern]} · ${interviniendo.evidence}`
              : ''
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Qué se hizo" required>
              {(props) => (
                <Textarea
                  {...props}
                  rows={3}
                  maxLength={500}
                  value={nota}
                  placeholder="Contacté a la estudiante por correo; responde el lunes."
                  onChange={(evento) => setNota(evento.target.value)}
                />
              )}
            </Field>

            <Field
              label="Estado del caso"
              hint="Marcarlo resuelto no lo borra: sigue en el historial del estudiante."
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  value={estado}
                  onChange={(evento) => setEstado(evento.target.value as typeof estado)}
                >
                  <option value="EN_SEGUIMIENTO">En seguimiento</option>
                  <option value="RESUELTO">Resuelto</option>
                  <option value="DESCARTADO">Descartado</option>
                </NativeSelect>
              )}
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setInterviniendo(null)}>
              Cancelar
            </Button>
            <Button
              disabled={nota.trim().length < 3}
              loading={intervenir.isPending}
              onClick={() => intervenir.mutate()}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
