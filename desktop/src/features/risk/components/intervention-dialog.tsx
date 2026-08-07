import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  NativeSelect,
  Textarea,
} from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { analyticsRepository } from '@/infrastructure/repositories/insights.repository';
import { currentPeriod } from '@/shared/lib/format';
import { toast } from '@/state/toast.store';
import type { InterventionStatus, RiskItem } from '@/domain/schemas/academic';

/**
 * Qué se hizo con un estudiante en riesgo.
 *
 * El motor ya decía quién estaba en riesgo y por qué; lo que no existía era
 * dónde anotar la respuesta. Sin eso la lista repetía los mismos nombres cada
 * semana y no distinguía el caso recién detectado del que llevas un mes
 * siguiendo.
 */

const ESTADOS: { value: InterventionStatus; label: string; hint: string }[] = [
  { value: 'PENDIENTE', label: 'Pendiente', hint: 'Todavía no lo he mirado' },
  { value: 'CONTACTADO', label: 'Contactado', hint: 'Ya hablé con el estudiante' },
  { value: 'CITA_ACORDADA', label: 'Cita acordada', hint: 'Quedamos en vernos' },
  { value: 'NO_RESPONDE', label: 'No responde', hint: 'Lo intenté y no hubo respuesta' },
  { value: 'RESUELTO', label: 'Resuelto', hint: 'Ya no necesita seguimiento' },
];

export const INTERVENTION_LABELS: Record<InterventionStatus, string> = {
  PENDIENTE: 'Pendiente',
  CONTACTADO: 'Contactado',
  CITA_ACORDADA: 'Cita acordada',
  NO_RESPONDE: 'No responde',
  RESUELTO: 'Resuelto',
};

/**
 * Tono de cada estado. `NO_RESPONDE` va en peligro y no en advertencia: es el
 * único que significa que el camino habitual ya falló.
 */
export const INTERVENTION_TONE: Record<InterventionStatus, 'neutral' | 'warning' | 'info' | 'danger' | 'success'> = {
  PENDIENTE: 'warning',
  CONTACTADO: 'info',
  CITA_ACORDADA: 'info',
  NO_RESPONDE: 'danger',
  RESUELTO: 'success',
};

/** Orden de lectura: lo que falta por hacer primero. */
export const INTERVENTION_ORDER: Record<InterventionStatus, number> = {
  PENDIENTE: 0,
  NO_RESPONDE: 1,
  CITA_ACORDADA: 2,
  CONTACTADO: 3,
  RESUELTO: 4,
};

export function InterventionDialog({
  row,
  onOpenChange,
}: {
  row: RiskItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<InterventionStatus>('PENDIENTE');
  const [nota, setNota] = useState('');

  // Arranca con lo ya anotado: abrir el diálogo no debe parecer que se empieza
  // de cero cuando el caso ya tenía historia.
  useEffect(() => {
    if (!row) return;
    setEstado(row.interventionStatus);
    setNota(row.interventionNote);
  }, [row]);

  const guardar = useMutation({
    mutationFn: () =>
      analyticsRepository.saveIntervention({
        studentId: row!.studentId,
        subjectId: row!.subjectId,
        period: currentPeriod(),
        estado,
        nota: nota.trim(),
      }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success('Seguimiento guardado');
      onOpenChange(false);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo guardar el seguimiento');
    },
  });

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={row ? `Seguimiento · ${row.fullName}` : 'Seguimiento'}
        description={row?.motivos[0] ?? 'Qué se hizo con esta alerta'}
        className="max-w-lg"
      >
        {row ? (
          <div className="flex flex-col gap-4">
            {row.motivos.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {row.motivos.map((motivo) => (
                  <li key={motivo} className="text-caption text-muted">
                    · {motivo}
                  </li>
                ))}
              </ul>
            ) : null}

            {row.interventionAt ? (
              <Badge tone="neutral" className="self-start">
                Última anotación: {new Date(row.interventionAt).toLocaleDateString('es-CO')}
              </Badge>
            ) : null}

            <Field label="Estado" required>
              {(fieldProps) => (
                <NativeSelect
                  {...fieldProps}
                  value={estado}
                  onChange={(event) => setEstado(event.target.value as InterventionStatus)}
                >
                  {ESTADOS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} — {option.hint}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field
              label="Nota"
              hint="Qué se acordó, cuándo, con quién. Lo lee tu yo de dentro de un mes."
            >
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  rows={4}
                  value={nota}
                  maxLength={500}
                  onChange={(event) => setNota(event.target.value)}
                  placeholder="Hablamos el martes; se compromete a entregar el taller 2 el viernes."
                />
              )}
            </Field>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={guardar.isPending} onClick={() => guardar.mutate()}>
            Guardar seguimiento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
