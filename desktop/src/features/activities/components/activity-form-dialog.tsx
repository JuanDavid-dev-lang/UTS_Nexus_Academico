import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  NativeSelect,
  Textarea,
} from '@/shared/ui';
import { activitiesRepository } from '@/infrastructure/repositories/activities.repository';
import { toast } from '@/state/toast.store';
import type { Actividad, ActividadInput } from '@/domain/schemas/activities';

/** Valor para un `<input type="datetime-local">`, que no admite zona horaria. */
function aInputLocal(iso: string): string {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return '';
  const desfase = instante.getTimezoneOffset() * 60_000;
  return new Date(instante.getTime() - desfase).toISOString().slice(0, 16);
}

function formularioDe(actividad: Actividad | null, inicial: { subjectId: string; period: string }): ActividadInput {
  if (!actividad) {
    return {
      title: '',
      description: '',
      subjectId: inicial.subjectId,
      period: inicial.period || undefined,
      dueAt: '',
      weight: 0,
    };
  }
  return {
    title: actividad.title,
    description: actividad.description,
    subjectId: actividad.subjectId,
    groupId: actividad.groupId ?? undefined,
    period: actividad.period || undefined,
    dueAt: aInputLocal(actividad.dueAt),
    weight: actividad.weight,
    attachmentUrl: actividad.attachmentUrl ?? '',
  };
}

type Props = {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** La que se edita; null para crear una nueva. */
  actividad: Actividad | null;
  materias: { _id: string; name: string }[];
  inicial: { subjectId: string; period: string };
  onGuardada: () => void;
};

/**
 * Crear o editar una actividad. El componente se monta de nuevo en cada
 * apertura (`key` en el padre), así que el formulario siempre parte de la
 * actividad elegida y no de lo que quedó escrito la vez anterior.
 */
export function ActivityFormDialog({ open, onOpenChange, actividad, materias, inicial, onGuardada }: Props) {
  const [formulario, setFormulario] = useState<ActividadInput>(() => formularioDe(actividad, inicial));
  const editando = actividad !== null;

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { ...formulario, dueAt: new Date(formulario.dueAt).toISOString() };
      return actividad ? activitiesRepository.update(actividad._id, cuerpo) : activitiesRepository.create(cuerpo);
    },
    onSuccess() {
      onGuardada();
      onOpenChange(false);
      toast.success(editando ? 'Actividad actualizada' : 'Actividad creada');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo guardar'),
  });

  const cambiar = <K extends keyof ActividadInput>(campo: K, valor: ActividadInput[K]) =>
    setFormulario((previo) => ({ ...previo, [campo]: valor }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editando ? 'Editar actividad' : 'Nueva actividad'}
        description="La fecha límite es lo que decide cuándo avisa el servidor."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            guardar.mutate();
          }}
        >
          <Field label="Título" required>
            {(props) => (
              <Input
                {...props}
                value={formulario.title}
                maxLength={200}
                required
                onChange={(evento) => cambiar('title', evento.target.value)}
              />
            )}
          </Field>

          <Field label="Materia" required>
            {(props) => (
              <NativeSelect
                {...props}
                value={formulario.subjectId}
                required
                // Cambiar de materia una actividad ya creada movería la
                // entrega al listado de otro grupo sin avisar a nadie.
                disabled={editando}
                onChange={(evento) => cambiar('subjectId', evento.target.value)}
              >
                <option value="">Elige una materia</option>
                {materias.map((materia) => (
                  <option key={materia._id} value={materia._id}>
                    {materia.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fecha y hora límite" required>
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  value={formulario.dueAt}
                  required
                  onChange={(evento) => cambiar('dueAt', evento.target.value)}
                />
              )}
            </Field>

            <Field label="Peso dentro del corte" hint="0 si no cuenta para la nota.">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={formulario.weight}
                  onChange={(evento) => cambiar('weight', Number(evento.target.value))}
                />
              )}
            </Field>
          </div>

          <Field label="Enlace o archivo adjunto" hint="Opcional.">
            {(props) => (
              <Input
                {...props}
                type="url"
                value={formulario.attachmentUrl ?? ''}
                onChange={(evento) => cambiar('attachmentUrl', evento.target.value)}
              />
            )}
          </Field>

          <Field label="Descripción">
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={4000}
                value={formulario.description}
                onChange={(evento) => cambiar('description', evento.target.value)}
              />
            )}
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={guardar.isPending}>
              {editando ? 'Guardar cambios' : 'Crear actividad'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
