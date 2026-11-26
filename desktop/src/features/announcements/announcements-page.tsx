import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
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
import { queryKeys } from '@/core/api/query-keys';
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

/** Fecha y hora, para lo programado: «el viernes» no basta si sale a las 7:00. */
function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  const [editando, setEditando] = useState<Aviso | null>(null);
  /** Cambia en cada edición: remonta el formulario con los datos de ese aviso. */
  const [apertura, setApertura] = useState(0);
  const [borrando, setBorrando] = useState<Aviso | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const avisos = useQuery({ queryKey: queryKeys.announcements.all, queryFn: () => avisoRepository.list() });

  const marcarLeido = useMutation({
    mutationFn: (id: string) => avisoRepository.marcarLeido(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all }),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => avisoRepository.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all });
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
            ? resumenDeAvisos(avisos.data.items, avisos.data.sinLeer)
            : 'Comunicaciones de la institución'
        }
        actions={
          esAdmin ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditando(null);
                setComponiendo(true);
              }}
            >
              <Plus aria-hidden />
              Publicar aviso
            </Button>
          ) : null
        }
      />

      {esAdmin && (
        <AnnouncementComposer
          key={editando ? `${editando._id}:${apertura}` : 'nuevo'}
          open={componiendo}
          onOpenChange={abierto => {
            setComponiendo(abierto);
            if (!abierto) setEditando(null);
          }}
          aviso={editando}
        />
      )}

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
            const programado = aviso.estado === 'PROGRAMADO';
            return (
              // Sin franja en el filo: «Sin leer» ya lo dice la insignia, y el
              // filo de marca basta para encontrarlo al recorrer la lista.
              <Card
                key={aviso._id}
                className={aviso.leido ? undefined : 'border-primary-tint'}
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
                        {programado && (
                          <Badge tone="info">
                            <CalendarClock className="size-3.5" aria-hidden />
                            Programado para el {fechaHora(aviso.publicadoEn)}
                          </Badge>
                        )}
                        {aviso.estado === 'CADUCADO' && <Badge tone="neutral">Caducado</Badge>}
                        {!aviso.leido && !programado && <Badge tone="info">Sin leer</Badge>}
                      </div>
                      <p className="text-caption text-muted">
                        {fecha(aviso.publicadoEn)}
                        {aviso.autorId?.fullName ? ` · ${aviso.autorId.fullName}` : ''}
                        {esAdmin && !programado ? ` · ${aviso.lecturas} lectura(s)` : ''}
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
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditando(aviso);
                              setApertura(n => n + 1);
                              setComponiendo(true);
                            }}
                          >
                            <Pencil className="size-4" aria-hidden />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onClick={() => setBorrando(aviso)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                            {programado ? 'Cancelar publicación' : 'Eliminar'}
                          </Button>
                        </div>
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
        title={borrando?.estado === 'PROGRAMADO' ? '¿Cancelar este aviso programado?' : '¿Eliminar este aviso?'}
        description={
          borrando
            ? borrando.estado === 'PROGRAMADO'
              ? `«${borrando.titulo}» no llegará a publicarse ni a notificarse.`
              : `«${borrando.titulo}» dejará de verse para todos los docentes.`
            : ''
        }
        confirmLabel={borrando?.estado === 'PROGRAMADO' ? 'Cancelar aviso' : 'Eliminar'}
        onConfirm={() => borrando && borrar.mutate(borrando._id)}
      />
    </PageContainer>
  );
}

/**
 * Subtítulo de la pantalla. Cuenta lo que el servidor dice que es cada aviso:
 * a un docente solo le llegan vigentes; a ADMIN también programados y
 * caducados, y mezclarlos bajo «publicados» contaría como enviado lo que aún
 * no ha salido.
 */
function resumenDeAvisos(items: Aviso[], sinLeer: number): string {
  const programados = items.filter(a => a.estado === 'PROGRAMADO').length;
  const publicados = items.length - programados;
  const partes = [`${publicados} publicados`];
  if (programados > 0) partes.push(`${programados} programado(s)`);
  partes.push(`${sinLeer} sin leer`);
  return partes.join(' · ');
}
