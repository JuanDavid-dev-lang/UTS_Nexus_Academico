import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pin, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageContainer,
  PageHeader,
  SkeletonList,
  Tooltip,
} from '@/shared/ui';
import { avisoRepository } from '@/infrastructure/repositories/academic.repository';
import type { Aviso, TipoAviso } from '@/domain/schemas/academic';
import { useUserRole } from '@/state/session.store';
import { toast } from '@/state/toast.store';
import { AnnouncementComposer } from './components/announcement-composer';

/** Presentación de cada tipo. El color nunca va solo: siempre lleva su palabra. */
const TIPO: Record<TipoAviso, { tono: 'neutral' | 'warning' | 'danger'; texto: string }> = {
  INFORMATIVO: { tono: 'neutral', texto: 'Informativo' },
  IMPORTANTE: { tono: 'warning', texto: 'Importante' },
  URGENTE: { tono: 'danger', texto: 'Urgente' },
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Avisos de la institución.
 *
 * El docente lee; la administración además publica. Un aviso se marca como
 * leído al abrirlo, pero no desaparece: sigue estando disponible aunque ya se
 * haya visto, porque un cambio de fechas de entrega hay que poder consultarlo
 * dos semanas después.
 */
export default function AnnouncementsPage() {
  const role = useUserRole();
  const esAdmin = role === 'ADMIN';
  const [componiendo, setComponiendo] = useState(false);
  const [borrando, setBorrando] = useState<Aviso | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const avisos = useQuery({ queryKey: ['avisos'], queryFn: () => avisoRepository.list() });

  const marcarLeido = useMutation({
    mutationFn: (id: string) => avisoRepository.marcarLeido(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['avisos'] }),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => avisoRepository.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['avisos'] });
      toast.success('Aviso eliminado');
      setBorrando(null);
    },
    onError: causa => toast.fromError(causa, 'No se pudo eliminar'),
  });

  function abrir(aviso: Aviso) {
    setAbierto(previo => (previo === aviso._id ? null : aviso._id));
    if (!aviso.leido) marcarLeido.mutate(aviso._id);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Avisos"
        subtitle={
          avisos.data
            ? `${avisos.data.items.length} publicados · ${avisos.data.sinLeer} sin leer`
            : 'Comunicaciones de la institución'
        }
        actions={
          esAdmin ? (
            <Button variant="primary" onClick={() => setComponiendo(true)}>
              <Plus aria-hidden />
              Publicar aviso
            </Button>
          ) : null
        }
      />

      {esAdmin && <AnnouncementComposer open={componiendo} onOpenChange={setComponiendo} />}

      {avisos.isPending ? (
        <SkeletonList rows={4} />
      ) : avisos.isError ? (
        <ErrorState error={avisos.error} onRetry={() => void avisos.refetch()} />
      ) : avisos.data.items.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay avisos"
            message={
              esAdmin
                ? 'Publica el primero para que los docentes lo vean al entrar.'
                : 'Cuando la administración publique algo, aparecerá aquí.'
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {avisos.data.items.map(aviso => {
            const expandido = abierto === aviso._id;
            return (
              <Card
                key={aviso._id}
                className={aviso.leido ? undefined : 'border-l-4 border-l-primary'}
              >
                <CardContent className="p-4">
                  <button
                    type="button"
                    onClick={() => abrir(aviso)}
                    className="flex w-full items-start gap-3 text-left"
                    aria-expanded={expandido}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {aviso.fijado && (
                          <Tooltip content="Fijado">
                            <Pin className="size-3.5 text-primary" aria-label="Fijado" />
                          </Tooltip>
                        )}
                        <span className="text-body font-semibold text-text">{aviso.titulo}</span>
                        <Badge tone={TIPO[aviso.tipo].tono}>{TIPO[aviso.tipo].texto}</Badge>
                        {!aviso.leido && <Badge tone="info">Sin leer</Badge>}
                      </div>
                      <p className="text-caption text-muted">
                        {fecha(aviso.publicadoEn)}
                        {aviso.autorId?.fullName ? ` · ${aviso.autorId.fullName}` : ''}
                        {esAdmin ? ` · ${aviso.lecturas} lectura(s)` : ''}
                      </p>
                      {!expandido && (
                        <p className="line-clamp-2 text-body text-muted">{aviso.cuerpo}</p>
                      )}
                    </div>
                  </button>

                  {expandido && (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="whitespace-pre-line text-body text-text">{aviso.cuerpo}</p>
                      {aviso.expiraEn && (
                        <p className="mt-3 flex items-center gap-1.5 text-caption text-warning">
                          <AlertTriangle className="size-3.5" aria-hidden />
                          Vigente hasta el {fecha(aviso.expiraEn)}
                        </p>
                      )}
                      {esAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-3 text-danger"
                          onClick={() => setBorrando(aviso)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Eliminar
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!borrando}
        onOpenChange={abierto => !abierto && setBorrando(null)}
        title="¿Eliminar este aviso?"
        description={
          borrando
            ? `«${borrando.titulo}» dejará de verse para todos los docentes.`
            : ''
        }
        confirmLabel="Eliminar"
        onConfirm={() => borrando && borrar.mutate(borrando._id)}
      />
    </PageContainer>
  );
}
