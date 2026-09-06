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
import { institutionsRepository } from '@/infrastructure/repositories/institutions.repository';
import { useListadoPaginado } from '@/shared/hooks/use-listado-paginado';
import { retrasoEscalonado, useTandaNueva } from '@/shared/hooks/use-tanda-nueva';
import { CargarMasAlLlegar } from '@/shared/ui/cargar-mas';
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
  const [institucion, setInstitucion] = useState('');
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
      ...(institucion ? { institutionId: institucion } : {}),
    }),
    [debouncedQ, programa, institucion],
  );

  /**
   * Instituciones activas, para acotar el listado a una universidad.
   *
   * Cambian poquísimo —se crean desde el panel y se quedan— así que se cachean
   * diez minutos: es un desplegable, no un dato vivo.
   */
  const instituciones = useQuery({
    queryKey: queryKeys.institutions.activas(),
    queryFn: () => institutionsRepository.activas(),
    staleTime: 10 * 60_000,
  });

  /**
   * Por páginas. «Todos los docentes» deja de ser una lista que quepa de una vez
   * en cuanto conviven varias universidades en la misma instalación, y el tope
   * por defecto del backend son 100: recortaba sin más aviso que `hasMore`.
   */
  const docentes = useListadoPaginado({
    queryKey: queryKeys.professors.list(filtro),
    consultar: (pagina) => professorAdminRepository.listarPagina(filtro, pagina),
  });
  const nuevasDesde = useTandaNueva(docentes.items.length);

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
              placeholder="Nombre, apellido, cédula o correo"
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
        {/*
          Solo si hay más de una: con una sola universidad es un desplegable que
          no filtra nada y le quita sitio a los que sí.
        */}
        {(instituciones.data ?? []).length > 1 ? (
          <Field label="Institución" className="w-56">
            {(props) => (
              <NativeSelect
                {...props}
                value={institucion}
                onChange={(event) => setInstitucion(event.target.value)}
              >
                <option value="">Todas</option>
                {(instituciones.data ?? []).map((item) => (
                  <option key={item.institutionId} value={item.institutionId}>
                    {item.nombre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        ) : null}
      </div>

      {docentes.isPending ? (
        <SkeletonList rows={5} />
      ) : docentes.isError ? (
        <ErrorState error={docentes.error} onRetry={() => void docentes.refetch()} />
      ) : docentes.items.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin resultados"
            message="Ningún docente coincide con la búsqueda y el programa elegidos."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {docentes.items.map((docente, indice) => (
            <Card
              key={docente._id}
              className={nuevasDesde !== null && indice >= nuevasDesde ? 'animate-rise' : undefined}
              style={{ animationDelay: retrasoEscalonado(indice, nuevasDesde) }}
            >
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
          <CargarMasAlLlegar
            {...docentes.propsDeTabla}
            mostrados={docentes.items.length}
            error={docentes.error}
            onReintentar={() => void docentes.fetchNextPage()}
            sustantivo="docente"
            sustantivoPlural="docentes"
          />
        </div>
      )}
    </PageContainer>
  );
}
