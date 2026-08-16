import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
} from '@/shared/ui';
import { thesisRepository } from '@/infrastructure/repositories/academic.repository';
import { queryKeys } from '@/core/api/query-keys';
import { platform } from '@/core/platform/tauri';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useUserRole } from '@/state/session.store';
import { toast } from '@/state/toast.store';
import { FormatUploadDialog } from './components/format-upload-dialog';
import {
  ETAPA_TG_LABEL,
  etapaTrabajoGrado,
  type EtapaTrabajoGrado,
  type ThesisFormat,
} from '@/domain/schemas/academic';

/**
 * Formatos oficiales de trabajo de grado.
 *
 * Para el docente director: encontrar el formato correcto por etapa y saber
 * qué campos hay que diligenciar antes de abrirlo. Para la administración:
 * además subir y retirar formatos. Los archivos se descargan por la ruta
 * autenticada — no están en el estático público.
 */
export default function ThesisFormatsPage() {
  const role = useUserRole();
  const esGestor = role === 'ADMIN' || role === 'COORDINATOR';
  const [etapa, setEtapa] = useState<EtapaTrabajoGrado | ''>('');
  const [q, setQ] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [borrando, setBorrando] = useState<ThesisFormat | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const debouncedQ = useDebounce(q, 300);
  const queryClient = useQueryClient();

  const filtro = useMemo(
    () => ({
      ...(etapa ? { etapa } : {}),
      ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
    }),
    [etapa, debouncedQ],
  );

  const formatos = useQuery({
    queryKey: queryKeys.thesisFormats.list(filtro),
    queryFn: () => thesisRepository.list(filtro),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => thesisRepository.remove(id),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.thesisFormats.all] });
      toast.success('Formato retirado');
      setBorrando(null);
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo retirar'),
  });

  async function descargar(formato: ThesisFormat) {
    setDescargando(formato._id);
    try {
      const blob = await thesisRepository.download(formato._id);
      const path = await platform.files.saveDownload(formato.archivo.originalName, blob);
      toast.withAction('success', 'Formato descargado', formato.archivo.originalName, {
        label: 'Abrir carpeta',
        onClick: () => void platform.files.reveal(path),
      });
    } catch (error) {
      toast.fromError(error, 'No se pudo descargar');
    } finally {
      setDescargando(null);
    }
  }

  // Agrupado por etapa: así se recorre como se recorre un trabajo de grado.
  const porEtapa = useMemo(() => {
    const grupos = new Map<EtapaTrabajoGrado, ThesisFormat[]>();
    for (const formato of formatos.data ?? []) {
      const lista = grupos.get(formato.etapa) ?? [];
      lista.push(formato);
      grupos.set(formato.etapa, lista);
    }
    return grupos;
  }, [formatos.data]);

  return (
    <PageContainer>
      <PageHeader
        title="Trabajos de grado"
        subtitle="Los formatos oficiales, organizados por etapa"
        actions={
          esGestor ? (
            <Button variant="primary" onClick={() => setSubiendo(true)}>
              <Plus aria-hidden />
              Subir formato
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Etapa" className="w-56">
          {(props) => (
            <NativeSelect
              {...props}
              value={etapa}
              onChange={(event) => setEtapa(event.target.value as EtapaTrabajoGrado | '')}
            >
              <option value="">Todas las etapas</option>
              {etapaTrabajoGrado.options.map((option) => (
                <option key={option} value={option}>
                  {ETAPA_TG_LABEL[option]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Buscar" className="min-w-64 flex-1 max-w-sm">
          {(props) => (
            <Input
              {...props}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Nombre o descripción (F-DC-124, propuesta…)"
            />
          )}
        </Field>
      </div>

      {formatos.isPending ? (
        <SkeletonList rows={4} />
      ) : formatos.isError ? (
        <ErrorState error={formatos.error} onRetry={() => void formatos.refetch()} />
      ) : (formatos.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin formatos"
            message={
              esGestor
                ? 'Sube los formatos oficiales para que los directores los encuentren aquí.'
                : 'La administración aún no ha cargado formatos para este filtro.'
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {[...porEtapa.entries()].map(([etapaGrupo, lista]) => (
            <section key={etapaGrupo} className="flex flex-col gap-2">
              <h2 className="text-h3 font-semibold text-text">{ETAPA_TG_LABEL[etapaGrupo]}</h2>
              {lista.map((formato) => (
                <Card key={formato._id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                        <p className="text-body font-semibold text-text">{formato.nombre}</p>
                        <Badge tone="neutral">v{formato.version}</Badge>
                      </div>
                      {formato.descripcion ? (
                        <p className="mt-1 text-caption text-muted">{formato.descripcion}</p>
                      ) : null}
                      {formato.camposALlenar.length > 0 && (
                        <div className="mt-2">
                          <p className="text-caption font-semibold uppercase tracking-wide text-muted">
                            Qué se diligencia
                          </p>
                          <ul className="mt-1 list-inside list-disc text-caption text-text">
                            {formato.camposALlenar.map((campo) => (
                              <li key={campo}>{campo}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={descargando === formato._id}
                        onClick={() => void descargar(formato)}
                      >
                        <Download className="size-4" aria-hidden />
                        Descargar
                      </Button>
                      {role === 'ADMIN' && (
                        <Button variant="ghost" size="sm" onClick={() => setBorrando(formato)}>
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          ))}
        </div>
      ))}

      {esGestor && <FormatUploadDialog open={subiendo} onOpenChange={setSubiendo} />}

      <ConfirmDialog
        open={Boolean(borrando)}
        onOpenChange={(open) => !open && setBorrando(null)}
        title={`¿Retirar «${borrando?.nombre ?? ''}»?`}
        description="Desaparece del catálogo y el archivo deja de poder descargarse."
        confirmLabel="Retirar"
        onConfirm={() => borrando && borrar.mutate(borrando._id)}
        loading={borrar.isPending}
      />
    </PageContainer>
  );
}
