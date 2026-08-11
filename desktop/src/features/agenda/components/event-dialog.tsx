import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
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
import { Switch } from '@/shared/ui/primitives';
import { aCampos, desdeCampos } from '@/domain/agenda/calendar';
import { ANTELACIONES, ETIQUETA_PRIORIDAD, PRESENTACION_TIPO } from '@/features/agenda/presentacion';
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '@/features/agenda/hooks/use-agenda';
import { useSubjects } from '@/features/subjects/hooks/use-subjects';
import { toast } from '@/state/toast.store';
import type { AgendaPrioridad, CalendarEventInput, EventoTipo } from '@/domain/schemas/agenda';

const TIPOS: EventoTipo[] = [
  'EVALUATION',
  'EXAM',
  'DELIVERY',
  'ACTIVITY',
  'MEETING',
  'TUTORING',
  'ACADEMIC',
  'REMINDER',
];

const PRIORIDADES: AgendaPrioridad[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export type EventoEditable = {
  id: string;
  title: string;
  description: string;
  type: EventoTipo;
  startAt: string;
  endAt: string | null;
  subjectId: string | null;
  location: string;
  priority: AgendaPrioridad;
  reminderMinutes: number[];
};

/**
 * Alta y edición de un evento del calendario.
 *
 * Solo eventos: una clase se edita en el horario, porque una clase es una
 * franja que se repite cada semana. Cambiarla "solo este día" daría la ilusión
 * de una excepción que el modelo no guarda, y la semana siguiente volvería a
 * la hora vieja sin que nadie lo hubiera pedido.
 */
export function EventDialog({
  open,
  onOpenChange,
  offset,
  fechaSugerida,
  evento,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offset: number;
  /** Día preseleccionado al crear desde el calendario. */
  fechaSugerida?: string;
  /** Presente = edición. */
  evento?: EventoEditable | undefined;
}) {
  const crear = useCreateEvent();
  const actualizar = useUpdateEvent();
  const eliminar = useDeleteEvent();
  const subjects = useSubjects();

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<EventoTipo>('EXAM');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [conFin, setConFin] = useState(false);
  const [horaFin, setHoraFin] = useState('09:00');
  const [subjectId, setSubjectId] = useState('');
  const [lugar, setLugar] = useState('');
  const [prioridad, setPrioridad] = useState<AgendaPrioridad>('MEDIUM');
  const [antelaciones, setAntelaciones] = useState<number[]>([60]);
  const [error, setError] = useState<string | undefined>();

  // Se rellena al abrir, no en cada render: si se recalculara siempre, escribir
  // en un campo lo devolvería a su valor de origen en el siguiente teclazo.
  useEffect(() => {
    if (!open) return;
    setError(undefined);

    if (evento) {
      const inicio = aCampos(evento.startAt, offset);
      const fin = aCampos(evento.endAt, offset);
      setTitulo(evento.title);
      setDescripcion(evento.description);
      setTipo(evento.type);
      setFecha(inicio.fecha);
      setHoraInicio(inicio.hora || '08:00');
      setConFin(Boolean(evento.endAt));
      setHoraFin(fin.hora || '09:00');
      setSubjectId(evento.subjectId ?? '');
      setLugar(evento.location);
      setPrioridad(evento.priority);
      setAntelaciones(evento.reminderMinutes);
      return;
    }

    setTitulo('');
    setDescripcion('');
    setTipo('EXAM');
    setFecha(fechaSugerida ?? aCampos(new Date().toISOString(), offset).fecha);
    setHoraInicio('08:00');
    setConFin(false);
    setHoraFin('09:00');
    setSubjectId('');
    setLugar('');
    setPrioridad('MEDIUM');
    setAntelaciones([60]);
  }, [open, evento, fechaSugerida, offset]);

  const materias = useMemo(() => subjects.data ?? [], [subjects.data]);
  const guardando = crear.isPending || actualizar.isPending;

  function alternarAntelacion(valor: number) {
    setAntelaciones((actuales) =>
      actuales.includes(valor) ? actuales.filter((minutos) => minutos !== valor) : [...actuales, valor],
    );
  }

  async function guardar() {
    if (titulo.trim().length === 0) {
      setError('Escribe un título.');
      return;
    }

    const startAt = desdeCampos(fecha, horaInicio, offset);
    if (!startAt) {
      setError('Revisa la fecha y la hora.');
      return;
    }

    const endAt = conFin ? desdeCampos(fecha, horaFin, offset) : undefined;
    if (conFin && (!endAt || new Date(endAt).getTime() <= new Date(startAt).getTime())) {
      setError('La hora de fin debe ser posterior a la de inicio.');
      return;
    }

    const payload: CalendarEventInput = {
      title: titulo.trim(),
      description: descripcion.trim(),
      type: tipo,
      startAt,
      ...(endAt ? { endAt } : {}),
      ...(subjectId ? { subjectId } : {}),
      location: lugar.trim(),
      priority: prioridad,
      reminderMinutes: antelaciones,
    };

    try {
      if (evento) await actualizar.mutateAsync({ id: evento.id, cambios: payload });
      else await crear.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      // El toast de error ya lo emite el hook; aquí solo se evita cerrar el
      // diálogo y perder lo que el docente había escrito.
    }
  }

  async function borrar() {
    if (!evento) return;
    try {
      await eliminar.mutateAsync(evento.id);
      onOpenChange(false);
    } catch {
      toast.error('No se pudo eliminar', 'Vuelve a intentarlo.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={evento ? 'Editar evento' : 'Nuevo evento'}
        description="Parciales, entregas, tutorías y recordatorios. Las clases se gestionan en el horario."
      >
        <div className="flex flex-col gap-3">
          <Field label="Título" required error={error && titulo.trim() ? undefined : error}>
            {(props) => (
              <Input
                {...props}
                value={titulo}
                onChange={(evt) => setTitulo(evt.target.value)}
                placeholder="Primer parcial de Cálculo I"
                autoFocus
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              {(props) => (
                <NativeSelect {...props} value={tipo} onChange={(evt) => setTipo(evt.target.value as EventoTipo)}>
                  {TIPOS.map((valor) => (
                    <option key={valor} value={valor}>
                      {PRESENTACION_TIPO[valor].etiqueta}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label="Prioridad">
              {(props) => (
                <NativeSelect
                  {...props}
                  value={prioridad}
                  onChange={(evt) => setPrioridad(evt.target.value as AgendaPrioridad)}
                >
                  {PRIORIDADES.map((valor) => (
                    <option key={valor} value={valor}>
                      {ETIQUETA_PRIORIDAD[valor]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" required>
              {(props) => (
                <Input {...props} type="date" value={fecha} onChange={(evt) => setFecha(evt.target.value)} />
              )}
            </Field>

            <Field label="Hora de inicio" required hint="Hora del campus">
              {(props) => (
                <Input {...props} type="time" value={horaInicio} onChange={(evt) => setHoraInicio(evt.target.value)} />
              )}
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <label htmlFor="con-fin" className="text-body text-text">
              Definir hora de finalización
            </label>
            <Switch id="con-fin" checked={conFin} onCheckedChange={setConFin} />
          </div>

          {conFin ? (
            <Field label="Hora de fin">
              {(props) => (
                <Input {...props} type="time" value={horaFin} onChange={(evt) => setHoraFin(evt.target.value)} />
              )}
            </Field>
          ) : null}

          <Field label="Materia" hint="Opcional. Si la eliges, el evento aparece junto a esa materia.">
            {(props) => (
              <NativeSelect {...props} value={subjectId} onChange={(evt) => setSubjectId(evt.target.value)}>
                <option value="">Sin materia</option>
                {materias.map((materia) => (
                  <option key={materia._id} value={materia._id}>
                    {materia.name} · {materia.period}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field label="Lugar" hint="Aula, sala o enlace de la sesión.">
            {(props) => (
              <Input {...props} value={lugar} onChange={(evt) => setLugar(evt.target.value)} placeholder="Aula 304" />
            )}
          </Field>

          <Field label="Descripción">
            {(props) => (
              <Textarea
                {...props}
                value={descripcion}
                onChange={(evt) => setDescripcion(evt.target.value)}
                placeholder="Temas, instrucciones o material necesario."
              />
            )}
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-caption font-semibold text-muted">Recordatorios</legend>
            <div className="flex flex-wrap gap-2">
              {ANTELACIONES.map((opcion) => {
                const activo = antelaciones.includes(opcion.valor);
                return (
                  <button
                    key={opcion.valor}
                    type="button"
                    onClick={() => alternarAntelacion(opcion.valor)}
                    aria-pressed={activo}
                    className={
                      activo
                        ? 'rounded-full bg-primary px-3 py-1 text-caption font-semibold text-on-primary'
                        : 'rounded-full border border-border px-3 py-1 text-caption text-muted hover:border-border-strong'
                    }
                  >
                    {opcion.etiqueta}
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-muted">
              Se avisa una sola vez por recordatorio, aunque tengas varios dispositivos.
            </p>
          </fieldset>

          {error ? <p className="text-caption text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          {evento ? (
            <Button variant="ghost" onClick={borrar} loading={eliminar.isPending} className="mr-auto text-danger">
              <Trash2 aria-hidden />
              Eliminar
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} loading={guardando}>
            {evento ? 'Guardar cambios' : 'Crear evento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
