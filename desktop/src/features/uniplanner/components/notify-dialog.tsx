import { useState } from 'react';
import { Send, Smartphone } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  Textarea,
} from '@/shared/ui';
import { useAvisarInasistencia } from '@/features/uniplanner/hooks/use-uniplanner';

export type DestinatarioAviso = {
  studentId: string;
  fullName: string;
  code: string;
  /** Si tiene la app enlazada. Los que no, se enseñan y no se envían. */
  enlazado: boolean;
  /**
   * Si la institución confirmó que ese código es de esa persona.
   *
   * Se enseña porque hoy **nadie confirma ninguno**: el nombre del documento de
   * enlace se deriva de (institución, código), así que cualquiera que teclee el
   * código de otro reclama su buzón. En la fila individual lo dice la insignia;
   * en el envío masivo no lo veía nadie, que es justo donde más destinatarios
   * hay.
   */
  verificado: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
  period: string;
  destinatarios: DestinatarioAviso[];
};

/** Cuántos nombres se enumeran antes de resumir en «y N más». */
const NOMBRES_VISIBLES = 6;

/**
 * Confirmación antes de escribir en la app de un estudiante.
 *
 * No es un paso de cortesía. Esto **escribe en el teléfono de otra persona** un
 * aviso sobre su situación académica, y en el envío masivo lo hace en treinta a
 * la vez: un clic de más en la fila equivocada no se puede deshacer desde aquí.
 * Por eso el diálogo enseña a quién le va a llegar, con nombre, antes de que
 * exista el botón de enviar.
 *
 * Lo que **no** se pide es el número de faltas. Ese lo lee el servidor de su
 * propia base: si se pudiera escribir aquí, esto dejaría de ser «avisar de lo
 * que hay» para ser «poner un número en la app de alguien».
 */
export function NotifyDialog({
  open,
  onOpenChange,
  subjectId,
  subjectName,
  period,
  destinatarios,
}: Props) {
  // El texto arranca vacío en cada apertura sin necesidad de reiniciarlo: la
  // pantalla monta el diálogo solo cuando hay destinatarios y lo desmonta al
  // cerrarlo. Si algún día se quedara montado, un mensaje escrito para un
  // estudiante concreto reaparecería —ya sin contexto— en el aviso masivo.
  const [corte, setCorte] = useState('');
  const [mensaje, setMensaje] = useState('');
  const avisar = useAvisarInasistencia();

  const alcanzables = destinatarios.filter((d) => d.enlazado);
  const fuera = destinatarios.length - alcanzables.length;
  const sinConfirmar = alcanzables.filter((d) => !d.verificado).length;
  const enviando = avisar.isPending;

  async function enviar() {
    if (alcanzables.length === 0) return;
    await avisar.mutateAsync({
      subjectId,
      period,
      studentIds: alcanzables.map((d) => d.studentId),
      corte: corte.trim() || undefined,
      mensaje: mensaje.trim() || undefined,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Avisar por UniPlanner"
        description={`Se escribirá en la app de ${alcanzables.length === 1 ? 'este estudiante' : 'estos estudiantes'} un aviso de inasistencias de ${subjectName}.`}
      >
        <div className="flex flex-col gap-4 overflow-y-auto">
          <div className="surface-sunken flex flex-col gap-2 rounded-card p-3">
            <div className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wide text-muted">
              <Smartphone className="size-4" aria-hidden />
              Le llegará a
            </div>

            {alcanzables.length === 0 ? (
              <p className="text-body text-muted">
                Ninguno de los seleccionados tiene UniPlanner enlazado. El aviso no saldría.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {alcanzables.slice(0, NOMBRES_VISIBLES).map((destinatario) => (
                  <li key={destinatario.studentId}>
                    <Badge tone="neutral">{destinatario.fullName}</Badge>
                  </li>
                ))}
                {alcanzables.length > NOMBRES_VISIBLES ? (
                  <li>
                    <Badge tone="neutral">
                      y {alcanzables.length - NOMBRES_VISIBLES} más
                    </Badge>
                  </li>
                ) : null}
              </ul>
            )}

            {sinConfirmar > 0 ? (
              /*
                No bloquea el envío —esa decisión es del despliegue, con
                `UNIPLANNER_SOLO_VERIFICADOS`— pero se dice antes de pulsar.
                Un enlace sin confirmar es un código que alguien reclamó y que
                nadie ha comprobado que sea suyo: el aviso lleva las faltas de
                una persona con nombre y apellido.
              */
              <p className="text-caption text-warning">
                {sinConfirmar === 1
                  ? 'Un enlace no está confirmado por la institución.'
                  : `${sinConfirmar} enlaces no están confirmados por la institución.`}{' '}
                Nadie ha comprobado que esos códigos sean de quien los reclamó.
              </p>
            ) : null}

            {fuera > 0 ? (
              /*
                Los que se quedan fuera se dicen aquí y no después del envío:
                enterarse al final de que a nueve de treinta no les llegó es
                enterarse cuando ya no se puede hacer nada distinto.
              */
              <p className="text-caption text-muted">
                {fuera} {fuera === 1 ? 'no tiene' : 'no tienen'} la app enlazada y no{' '}
                {fuera === 1 ? 'lo recibirá' : 'lo recibirán'}.
              </p>
            ) : null}
          </div>

          <Field label="Corte" hint="Opcional. Aparece como referencia en el aviso.">
            {(props) => (
              <Input
                {...props}
                value={corte}
                onChange={(event) => setCorte(event.target.value)}
                placeholder="Corte 2"
                maxLength={40}
              />
            )}
          </Field>

          <Field
            label="Mensaje"
            hint="Opcional. Sin él se compone uno con las faltas acumuladas y el cupo."
          >
            {(props) => (
              <Textarea
                {...props}
                value={mensaje}
                onChange={(event) => setMensaje(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Si tienes justificantes pendientes, pásate por mi oficina esta semana."
              />
            )}
          </Field>

          <p className="text-caption text-muted">
            El aviso es informativo: en su app se le ofrece abrir su asistencia, pero{' '}
            <strong className="font-semibold text-text">no se le marca ninguna falta</strong>.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || alcanzables.length === 0}>
            <Send aria-hidden />
            {enviando ? 'Enviando…' : `Enviar a ${alcanzables.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
