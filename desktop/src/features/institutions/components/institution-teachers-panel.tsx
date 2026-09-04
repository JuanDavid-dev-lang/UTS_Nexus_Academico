import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';
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
  Field,
  NativeSelect,
  SkeletonList,
} from '@/shared/ui';
import { institutionsRepository } from '@/infrastructure/repositories/institutions.repository';
import { queryKeys } from '@/core/api/query-keys';
import { toast } from '@/state/toast.store';
import type { DocenteInstitucion, Institucion } from '@/domain/schemas/institutions';

const TONO_ESTADO: Record<DocenteInstitucion['estado'], 'success' | 'warning' | 'danger'> = {
  APROBADO: 'success',
  PENDIENTE: 'warning',
  RECHAZADO: 'danger',
};

/**
 * Docentes vinculados a la institución seleccionada, con la acción para
 * moverlos a otra. La lista de instituciones destino la pasa la página: ya la
 * tiene cargada para la tabla, y pedirla de nuevo aquí sería la misma consulta
 * dos veces.
 */
export function InstitutionTeachersPanel({
  institucion,
  instituciones,
  puedeGestionar,
}: {
  institucion: Institucion;
  instituciones: Institucion[];
  puedeGestionar: boolean;
}) {
  const queryClient = useQueryClient();
  const [cambiando, setCambiando] = useState<DocenteInstitucion | null>(null);
  const [destino, setDestino] = useState('');

  const docentes = useQuery({
    queryKey: queryKeys.institutions.docentes(institucion.id),
    queryFn: () => institutionsRepository.docentes(institucion.id),
  });

  const mover = useMutation({
    mutationFn: ({ profesorId, institutionId }: { profesorId: string; institutionId: string }) =>
      institutionsRepository.asignarDocente(profesorId, institutionId),
    onSuccess(item) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.institutions.all });
      toast.success('Docente reasignado', `${item.nombre} ya está en su nueva institución.`);
      setCambiando(null);
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo reasignar'),
  });

  function abrirCambio(docente: DocenteInstitucion) {
    setCambiando(docente);
    const otra = instituciones.find((inst) => inst.institutionId !== institucion.institutionId);
    setDestino(otra?.institutionId ?? '');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Docentes de {institucion.nombre}</CardTitle>
        <CardDescription>{docentes.data?.length ?? 0} vinculados</CardDescription>
      </CardHeader>
      <CardContent>
        {docentes.isPending ? (
          <SkeletonList rows={3} />
        ) : (docentes.data ?? []).length === 0 ? (
          <EmptyState title="Sin docentes" message="Nadie tiene esta institución asignada todavía." />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {docentes.data?.map((docente) => (
              <div key={docente.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-text">{docente.nombre}</p>
                  <p className="truncate text-caption text-muted">
                    {docente.cedula ?? 'Sin cédula'} · {docente.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={TONO_ESTADO[docente.estado]}>{docente.estado}</Badge>
                  {puedeGestionar && (
                    <Button variant="secondary" size="sm" onClick={() => abrirCambio(docente)}>
                      <ArrowRightLeft className="size-3.5" aria-hidden />
                      Cambiar de institución
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={Boolean(cambiando)} onOpenChange={(abierto) => !abierto && setCambiando(null)}>
        <DialogContent
          title="Cambiar de institución"
          description={cambiando ? `${cambiando.nombre} pasará a la institución que elijas.` : ''}
          className="max-w-sm"
        >
          <Field label="Nueva institución">
            {(props) => (
              <NativeSelect {...props} value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Elige una institución…</option>
                {instituciones.map((inst) => (
                  <option key={inst.institutionId} value={inst.institutionId}>
                    {inst.nombre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCambiando(null)} disabled={mover.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => cambiando && destino && mover.mutate({ profesorId: cambiando.id, institutionId: destino })}
              disabled={mover.isPending || !destino}
              loading={mover.isPending}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
