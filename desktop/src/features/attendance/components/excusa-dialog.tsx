import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogFooter, Field, NativeSelect, Textarea } from '@/shared/ui';
import { MOTIVOS_EXCUSA, type Attendance, type MotivoExcusa } from '@/domain/schemas/attendance';
import { useExcusaDeFalta } from '@/features/attendance/hooks/use-attendance';
import { formatDate } from '@/shared/lib/format';

/** El registro de la falta y a quién pertenece, para el título. */
export type FaltaAJustificar = {
  registro: Attendance;
  nombre: string;
};

/**
 * Justificar una falta. Lo hace quien recibe el soporte —el docente o
 * coordinación—: registrarla ya es aceptarla, no queda pendiente de nadie.
 * El servidor decide qué cuenta: una falta justificada sale del porcentaje,
 * del riesgo y de los patrones.
 */
export function ExcusaDialog({
  falta,
  onOpenChange,
}: {
  falta: FaltaAJustificar | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Abre con lo ya registrado: corregir una excusa no debe empezar de cero.
  // Quien lo monta le pone `key` por registro, así que esto se lee al abrir.
  const actual = falta?.registro.excusa ?? null;
  const [motivo, setMotivo] = useState<MotivoExcusa>(actual?.motivo ?? 'MEDICA');
  const [detalle, setDetalle] = useState(actual?.detalle ?? '');
  const excusa = useExcusaDeFalta();

  const faltaDescribir = motivo === 'OTRA' && detalle.trim().length < 5;

  function guardar(conMotivo: MotivoExcusa | null) {
    if (!falta) return;
    excusa.mutate(
      { id: falta.registro._id, motivo: conMotivo, detalle: detalle.trim() },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={falta !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={falta ? `Excusa · ${falta.nombre}` : 'Excusa'}
        description={
          falta
            ? `Falta del ${formatDate(falta.registro.date)}. Justificada, no cuenta en la asistencia ni en el riesgo.`
            : undefined
        }
        className="max-w-lg"
      >
        <div className="flex flex-col gap-4">
          <Field label="Motivo" required>
            {(fieldProps) => (
              <NativeSelect
                {...fieldProps}
                value={motivo}
                onChange={(event) => setMotivo(event.target.value as MotivoExcusa)}
              >
                {MOTIVOS_EXCUSA.map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field
            label="Detalle"
            required={motivo === 'OTRA'}
            hint="Qué soporte entregó: incapacidad de la EPS, constancia, oficio."
          >
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                rows={3}
                value={detalle}
                maxLength={500}
                onChange={(event) => setDetalle(event.target.value)}
                placeholder="Incapacidad de 2 días expedida por la EPS."
              />
            )}
          </Field>
        </div>

        <DialogFooter>
          {actual ? (
            <Button
              variant="ghost"
              className="mr-auto"
              loading={excusa.isPending && excusa.variables?.motivo === null}
              onClick={() => guardar(null)}
            >
              Quitar excusa
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={faltaDescribir}
            loading={excusa.isPending && excusa.variables?.motivo !== null}
            onClick={() => guardar(motivo)}
          >
            {actual ? 'Guardar excusa' : 'Justificar falta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
