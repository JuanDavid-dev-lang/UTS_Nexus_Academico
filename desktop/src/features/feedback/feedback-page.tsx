import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bug, Lightbulb, Send, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
  Textarea,
} from '@/shared/ui';
import { feedbackRepository } from '@/infrastructure/repositories/academic.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useUserRole } from '@/state/session.store';
import { toast } from '@/state/toast.store';
import type {
  EstadoFeedback,
  Feedback,
  TipoFeedback,
} from '@/domain/schemas/academic';

/** Presentación de cada estado. El color nunca va solo: lleva su palabra. */
const ESTADO: Record<EstadoFeedback, { tono: 'neutral' | 'info' | 'success' | 'warning'; texto: string }> = {
  NUEVO: { tono: 'info', texto: 'Nuevo' },
  EN_REVISION: { tono: 'warning', texto: 'En revisión' },
  RESUELTO: { tono: 'success', texto: 'Resuelto' },
  DESCARTADO: { tono: 'neutral', texto: 'Descartado' },
};

const ESTADOS: EstadoFeedback[] = ['NUEVO', 'EN_REVISION', 'RESUELTO', 'DESCARTADO'];

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Buzón de sugerencias y reportes de error de la plataforma.
 *
 * El docente escribe y sigue el estado de lo suyo; la administración revisa la
 * bandeja completa y decide. Es el flujo inverso a los avisos.
 */
export default function FeedbackPage() {
  const role = useUserRole();
  const esGestor = role === 'ADMIN' || role === 'COORDINATOR';
  const esAdmin = role === 'ADMIN';

  const [tipo, setTipo] = useState<TipoFeedback>('SUGERENCIA');
  const [mensaje, setMensaje] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoFeedback | ''>('');
  const [borrando, setBorrando] = useState<Feedback | null>(null);

  const queryClient = useQueryClient();
  const invalidar = () => void queryClient.invalidateQueries({ queryKey: [...queryKeys.feedback.all] });

  const bandeja = useQuery({
    queryKey: [...queryKeys.feedback.all, 'list', filtroEstado || null],
    queryFn: () => feedbackRepository.list(filtroEstado ? { estado: filtroEstado } : undefined),
  });

  const enviar = useMutation({
    mutationFn: () => feedbackRepository.create({ tipo, mensaje, origen: 'DESKTOP' }),
    onSuccess() {
      invalidar();
      setMensaje('');
      toast.success('Enviado', 'Gracias: la administración lo revisará.');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo enviar'),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoFeedback }) =>
      feedbackRepository.setEstado(id, estado),
    onSuccess: invalidar,
    onError: (causa) => toast.fromError(causa, 'No se pudo cambiar el estado'),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => feedbackRepository.remove(id),
    onSuccess() {
      invalidar();
      toast.success('Eliminado');
      setBorrando(null);
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo eliminar'),
  });

  const puedeEnviar = mensaje.trim().length >= 10 && !enviar.isPending;

  return (
    <PageContainer>
      <PageHeader
        title="Sugerencias"
        subtitle={
          esGestor
            ? 'Lo que los docentes reportan sobre la plataforma'
            : 'Cuéntanos qué mejorar o qué está fallando'
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Enviar al buzón</CardTitle>
          <CardDescription>
            Llega a la administración con tu nombre — así se te puede responder.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Tipo" className="w-44">
              {(props) => (
                <NativeSelect
                  {...props}
                  value={tipo}
                  onChange={(event) => setTipo(event.target.value as TipoFeedback)}
                >
                  <option value="SUGERENCIA">Sugerencia</option>
                  <option value="ERROR">Reporte de error</option>
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label="Mensaje">
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                maxLength={2000}
                placeholder={
                  tipo === 'ERROR'
                    ? 'Qué pantalla, qué hiciste y qué pasó en su lugar.'
                    : 'Qué te facilitaría el trabajo.'
                }
                value={mensaje}
                onChange={(event) => setMensaje(event.target.value)}
              />
            )}
          </Field>
          <div>
            <Button onClick={() => enviar.mutate()} loading={enviar.isPending} disabled={!puedeEnviar}>
              <Send aria-hidden />
              Enviar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold text-text">
          {esGestor ? 'Bandeja' : 'Lo que has enviado'}
        </h2>
        {esGestor ? (
          <Field label="Estado" className="w-44">
            {(props) => (
              <NativeSelect
                {...props}
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value as EstadoFeedback | '')}
              >
                <option value="">Todos</option>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {ESTADO[estado].texto}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        ) : null}
      </div>

      {bandeja.isPending ? (
        <SkeletonList rows={3} />
      ) : bandeja.isError ? (
        <ErrorState error={bandeja.error} onRetry={() => void bandeja.refetch()} />
      ) : bandeja.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Nada por aquí"
            message={
              esGestor
                ? 'Cuando un docente escriba, su mensaje aparecerá en esta bandeja.'
                : 'Lo que envíes quedará aquí con su estado de revisión.'
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {bandeja.data.map((item) => (
            <Card key={item._id}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {item.tipo === 'ERROR' ? (
                    <Bug className="size-4 text-muted" aria-hidden />
                  ) : (
                    <Lightbulb className="size-4 text-muted" aria-hidden />
                  )}
                  <span className="text-body font-semibold text-text">
                    {item.tipo === 'ERROR' ? 'Reporte de error' : 'Sugerencia'}
                  </span>
                  <Badge tone={ESTADO[item.estado].tono}>{ESTADO[item.estado].texto}</Badge>
                  <span className="text-caption text-muted">
                    {esGestor && item.autorId?.fullName ? `${item.autorId.fullName} · ` : ''}
                    {item.createdAt ? fecha(item.createdAt) : ''}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-body text-text">{item.mensaje}</p>
                {esAdmin ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                      value={item.estado}
                      onChange={(event) =>
                        cambiarEstado.mutate({ id: item._id, estado: event.target.value as EstadoFeedback })
                      }
                      className="w-44"
                    >
                      {ESTADOS.map((estado) => (
                        <option key={estado} value={estado}>
                          {ESTADO[estado].texto}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button variant="ghost" onClick={() => setBorrando(item)}>
                      <Trash2 aria-hidden />
                      Eliminar
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(borrando)}
        onOpenChange={(open) => !open && setBorrando(null)}
        title="¿Eliminar este mensaje?"
        description="Desaparece de la bandeja y de la lista de quien lo envió."
        onConfirm={() => borrando && borrar.mutate(borrando._id)}
        loading={borrar.isPending}
      />
    </PageContainer>
  );
}
