import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
  Switch,
} from '@/shared/ui';
import {
  professorAdminRepository,
  registroRepository,
} from '@/infrastructure/repositories/academic.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { toast } from '@/state/toast.store';
import type { ProfesorAdmin } from '@/domain/schemas/academic';

/**
 * Gestión de docentes (ADMIN/COORDINATOR).
 *
 * La lista se filtra por carrera y por búsqueda, y desde cada ficha se activa
 * o desactiva la dirección de trabajos de grado. El flag es institucional: el
 * propio docente no puede dárselo, igual que no puede cambiarse la sede.
 */
export default function ProfessorsPage() {
  const [q, setQ] = useState('');
  const [programa, setPrograma] = useState('');
  const debouncedQ = useDebounce(q, 300);
  const queryClient = useQueryClient();

  const catalogo = useQuery({
    queryKey: queryKeys.registro.catalogo(),
    queryFn: () => registroRepository.catalogo(),
  });

  const filtro = useMemo(
    () => ({
      ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
      ...(programa ? { programa } : {}),
    }),
    [debouncedQ, programa],
  );

  const docentes = useQuery({
    queryKey: queryKeys.professors.list(filtro),
    queryFn: () => professorAdminRepository.list(filtro),
  });

  const cambiarDirector = useMutation({
    mutationFn: ({ id, esDirector }: { id: string; esDirector: boolean }) =>
      professorAdminRepository.setDirector(id, esDirector),
    onSuccess(item) {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.professors.all] });
      toast.success(
        item.esDirectorTrabajoGrado ? 'Director activado' : 'Director desactivado',
        item.esDirectorTrabajoGrado
          ? 'El docente ya ve la sección de trabajos de grado.'
          : 'El docente deja de ver la sección de trabajos de grado.',
      );
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo cambiar'),
  });

  function nombreDe(docente: ProfesorAdmin): string {
    const propio = `${docente.nombres} ${docente.apellidos}`.trim();
    return propio || docente.userId?.fullName || 'Docente sin nombre';
  }

  const programas = catalogo.data?.programas ?? [];
  const nombrePrograma = (id: string) => programas.find((p) => p.id === id)?.nombre ?? id;

  return (
    <PageContainer>
      <PageHeader
        title="Docentes"
        subtitle="Busca por carrera y define quién dirige trabajos de grado"
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Buscar" className="min-w-64 flex-1 max-w-sm">
          {(props) => (
            <Input
              {...props}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Nombre, apellido o cédula"
            />
          )}
        </Field>
        <Field label="Programa" className="min-w-64 max-w-md flex-1">
          {(props) => (
            <NativeSelect {...props} value={programa} onChange={(event) => setPrograma(event.target.value)}>
              <option value="">Todos los programas</option>
              {programas.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>

      {docentes.isPending ? (
        <SkeletonList rows={5} />
      ) : docentes.isError ? (
        <ErrorState error={docentes.error} onRetry={() => void docentes.refetch()} />
      ) : docentes.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin resultados"
            message="Ningún docente coincide con la búsqueda y el programa elegidos."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {docentes.data.map((docente) => (
            <Card key={docente._id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold text-text">{nombreDe(docente)}</p>
                  <p className="truncate text-caption text-muted">
                    {[docente.cedula, docente.userId?.email, docente.sede].filter(Boolean).join(' · ')}
                  </p>
                  {docente.programas.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {docente.programas.map((id) => (
                        <Badge key={id} tone="neutral">
                          {nombrePrograma(id)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2">
                  <GraduationCap className="size-4 text-muted" aria-hidden />
                  <span className="text-body text-text">Director de trabajo de grado</span>
                  <Switch
                    checked={docente.esDirectorTrabajoGrado}
                    disabled={cambiarDirector.isPending}
                    onCheckedChange={(checked) =>
                      cambiarDirector.mutate({ id: docente._id, esDirector: checked })
                    }
                    aria-label={`Director de trabajo de grado: ${nombreDe(docente)}`}
                  />
                </label>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
