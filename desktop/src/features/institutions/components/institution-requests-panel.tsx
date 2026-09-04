import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, NativeSelect } from '@/shared/ui';
import { institutionsRepository } from '@/infrastructure/repositories/institutions.repository';
import { queryKeys } from '@/core/api/query-keys';
import { toast } from '@/state/toast.store';
import type { InstitucionPublica, SolicitudInstitucion } from '@/domain/schemas/institutions';

type Props = {
  solicitudes: SolicitudInstitucion[];
  instituciones: InstitucionPublica[];
  puedeGestionar: boolean;
  /** Abre el formulario de alta precargado con el nombre pedido, para crear el perfil que falta. */
  onCrearPerfil: (solicitud: SolicitudInstitucion) => void;
};

/**
 * Solicitudes de instituciones que un docente pidió y todavía no existen como
 * perfil. Cada fila ofrece las dos salidas: asociarla a un perfil que ya
 * existe (por defecto, la primera coincidencia sugerida) o crear el perfil
 * desde cero con el nombre que el docente escribió.
 */
export function InstitutionRequestsPanel({ solicitudes, instituciones, puedeGestionar, onCrearPerfil }: Props) {
  if (solicitudes.length === 0) {
    return (
      <Card>
        <EmptyState title="Sin solicitudes" message="Nadie ha pedido una institución que no esté en el catálogo." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {solicitudes.map((solicitud) => (
        <FilaSolicitud
          key={solicitud.id}
          solicitud={solicitud}
          instituciones={instituciones}
          puedeGestionar={puedeGestionar}
          onCrearPerfil={onCrearPerfil}
        />
      ))}
    </div>
  );
}

function FilaSolicitud({
  solicitud,
  instituciones,
  puedeGestionar,
  onCrearPerfil,
}: {
  solicitud: SolicitudInstitucion;
  instituciones: InstitucionPublica[];
  puedeGestionar: boolean;
  onCrearPerfil: (solicitud: SolicitudInstitucion) => void;
}) {
  const queryClient = useQueryClient();
  const [destino, setDestino] = useState(solicitud.coincidencias[0]?.perfil.institutionId ?? '');

  const asociar = useMutation({
    mutationFn: () => institutionsRepository.asociarSolicitud(solicitud.id, destino),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.institutions.all });
      toast.success('Docente asociado', `${solicitud.nombre} ya tiene institución.`);
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo asociar'),
  });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <div>
        <p className="text-body font-medium text-text">{solicitud.nombre}</p>
        <p className="text-caption text-muted">{solicitud.email}</p>
        <p className="mt-1 text-caption text-text">
          Pidió: <span className="font-semibold">{solicitud.institucionSolicitada}</span>
        </p>
      </div>

      {solicitud.coincidencias.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {solicitud.coincidencias.map((coincidencia) => (
            <Badge key={coincidencia.perfil.id} tone={coincidencia.tipo === 'exacta' ? 'success' : 'warning'}>
              {coincidencia.perfil.nombre} · {coincidencia.tipo === 'exacta' ? 'coincidencia exacta' : 'posible coincidencia'}
            </Badge>
          ))}
        </div>
      )}

      {puedeGestionar && (
        <div className="flex flex-wrap items-center gap-2">
          {instituciones.length > 0 && (
            <>
              <NativeSelect
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="w-56"
                aria-label={`Institución para ${solicitud.nombre}`}
              >
                <option value="">Elige una institución…</option>
                {instituciones.map((inst) => (
                  <option key={inst.institutionId} value={inst.institutionId}>
                    {inst.nombre}
                  </option>
                ))}
              </NativeSelect>
              <Button
                size="sm"
                variant="secondary"
                disabled={!destino || asociar.isPending}
                loading={asociar.isPending}
                onClick={() => asociar.mutate()}
              >
                Asociar a…
              </Button>
            </>
          )}
          <Button size="sm" variant="primary" onClick={() => onCrearPerfil(solicitud)}>
            <Plus className="size-4" aria-hidden />
            Crear perfil
          </Button>
        </div>
      )}
    </div>
  );
}
