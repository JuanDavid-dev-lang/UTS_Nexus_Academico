import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Hourglass,
  QrCode as QrIcon,
  ShieldAlert,
  Smartphone,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  ErrorState,
  Field,
  NativeSelect,
  Skeleton,
  Switch,
} from '@/shared/ui';
import { QrCode } from '@/shared/ui/qr-code';
import { cn } from '@/shared/lib/cn';
import { MINUTOS_QR, type SesionQr } from '@/domain/schemas/attendance-qr';
import type { Group } from '@/domain/schemas/academic';
import {
  useAbrirSesionQr,
  useCerrarSesionQr,
  useQrVigente,
  useSesionQr,
} from '../hooks/use-attendance-qr';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
  /** Los grupos de la materia a los que se puede pasar lista. */
  grupos: Group[];
  /** El grupo que el docente ya eligió en la pantalla, o vacío. */
  grupoInicial: string;
  /** La sesión que ya estaba abierta para esta materia, si la hay. */
  sesionAbiertaId: string | null;
};

const hora = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' });

/**
 * Pasar lista con QR.
 *
 * Tres momentos en el mismo diálogo: elegir cuánto tiempo acepta marcas, el QR
 * en pantalla con quién va llegando, y el resumen al cerrar. Está pensado para
 * proyectarse: el código ocupa todo lo que puede y el recuento se lee de lejos.
 *
 * Cerrar el diálogo **no** cierra la lista. La sesión sigue en el servidor
 * recibiendo marcas —y se cierra sola al vencer—, así que el docente puede
 * volver a la pantalla de asistencia a marcar a mano a quien no tiene teléfono
 * y retomar el QR después.
 */
export function QrSessionDialog({
  open,
  onOpenChange,
  subjectId,
  subjectName,
  grupos,
  grupoInicial,
  sesionAbiertaId,
}: Props) {
  // La sesión se fija al montar (o en cuanto llega la que estaba en curso) y
  // ya no se suelta: al cerrarla, la consulta de «abiertas» vuelve vacía, y si
  // el id siguiera saliendo de ahí el diálogo volvería a la configuración en
  // vez de enseñar el resumen, con un botón que abre otra lista.
  const [sesionId, setSesionId] = useState<string | null>(sesionAbiertaId);
  // Ajuste durante el render, no en un efecto: la que estaba en curso puede
  // llegar un instante después de montar, y un efecto pintaría antes la
  // configuración.
  if (!sesionId && sesionAbiertaId) setSesionId(sesionAbiertaId);
  // El grupo se pide **siempre**, aunque la materia tenga uno solo: el QR
  // lleva la etiqueta del grupo (A194) y es lo que el estudiante ve al
  // confirmar, así que tiene que ser una decisión, no un valor por defecto.
  const [grupo, setGrupo] = useState(grupoInicial);
  const [minutos, setMinutos] = useState<number>(15);
  const [marcarAusentes, setMarcarAusentes] = useState(true);
  const [confirmando, setConfirmando] = useState(false);

  const abrir = useAbrirSesionQr();
  const cerrar = useCerrarSesionQr();
  const sesion = useSesionQr(open ? sesionId : null);
  const abierta = sesion.data?.estado === 'ABIERTA';
  const qr = useQrVigente(open ? sesionId : null, abierta);

  function empezar() {
    abrir.mutate(
      { subjectId, groupId: grupo, minutos, marcarAusentes },
      { onSuccess: ({ sesion: nueva }) => setSesionId(nueva.id) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          sesion.data
            ? `Lista por QR · ${sesion.data.subjectName}${sesion.data.grupo ? ` · ${sesion.data.grupo}` : ''}`
            : 'Pasar lista con QR'
        }
        description={
          sesion.data
            ? undefined
            : 'Los estudiantes escanean el código desde UniPlanner y su asistencia se registra sola.'
        }
        className={cn(sesionId ? 'max-w-6xl' : 'max-w-lg')}
      >
        {!sesionId ? (
          <Configuracion
            subjectName={subjectName}
            grupos={grupos}
            grupo={grupo}
            onGrupo={setGrupo}
            minutos={minutos}
            onMinutos={setMinutos}
            marcarAusentes={marcarAusentes}
            onMarcarAusentes={setMarcarAusentes}
            abriendo={abrir.isPending}
            onEmpezar={empezar}
          />
        ) : sesion.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : sesion.isError ? (
          <ErrorState error={sesion.error} />
        ) : sesion.data.estado === 'CERRADA' ? (
          <Resumen sesion={sesion.data} onListo={() => onOpenChange(false)} />
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <PanelQr
                sesion={sesion.data}
                recibidaEn={sesion.dataUpdatedAt}
                contenido={qr.data?.contenido ?? null}
                error={qr.isError}
              />
              <PanelLista sesion={sesion.data} />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Ocultar
              </Button>
              <Button onClick={() => setConfirmando(true)} loading={cerrar.isPending}>
                Cerrar lista
              </Button>
            </DialogFooter>

            <ConfirmDialog
              open={confirmando}
              onOpenChange={setConfirmando}
              title="¿Cerrar la lista?"
              description={[
                sesion.data.marcarAusentes
                  ? 'Nadie más podrá marcar con este QR. Quien no escaneó y no tiene marca de hoy quedará ausente; lo que ya marcaste a mano no cambia.'
                  : 'Nadie más podrá marcar con este QR. A quien no escaneó no se le registra nada.',
                sesion.data.resumen.confirmando > 0
                  ? `${sesion.data.resumen.confirmando} todavía no ha${sesion.data.resumen.confirmando === 1 ? '' : 'n'} confirmado en su teléfono y no quedará${sesion.data.resumen.confirmando === 1 ? '' : 'n'} presente${sesion.data.resumen.confirmando === 1 ? '' : 's'}.`
                  : '',
              ].join(' ')}
              confirmLabel="Cerrar lista"
              loading={cerrar.isPending}
              onConfirm={() =>
                cerrar.mutate(sesion.data.id, { onSettled: () => setConfirmando(false) })
              }
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Configuracion(props: {
  subjectName: string;
  grupos: Group[];
  grupo: string;
  onGrupo: (grupo: string) => void;
  minutos: number;
  onMinutos: (minutos: number) => void;
  marcarAusentes: boolean;
  onMarcarAusentes: (valor: boolean) => void;
  abriendo: boolean;
  onEmpezar: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-body text-muted">
        Clase de hoy de <span className="font-semibold text-text">{props.subjectName}</span>. El
        código cambia cada pocos segundos, así que una foto reenviada a alguien que no está en el
        salón no sirve.
      </p>

      <Field label="Grupo" required hint="El QR es de un grupo: solo sus estudiantes pueden marcar.">
        {(campo) => (
          <NativeSelect {...campo} value={props.grupo} onChange={(event) => props.onGrupo(event.target.value)}>
            <option value="">Elige el grupo</option>
            {props.grupos.map((grupo) => (
              <option key={grupo._id} value={grupo._id}>
                {grupo.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>

      <Field label="Acepta marcas durante">
        {(campo) => (
          <NativeSelect
            {...campo}
            value={props.minutos}
            onChange={(event) => props.onMinutos(Number(event.target.value))}
          >
            {MINUTOS_QR.map((valor) => (
              <option key={valor} value={valor}>
                {valor} minutos
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>

      <label className="flex items-start gap-3">
        <Switch checked={props.marcarAusentes} onCheckedChange={props.onMarcarAusentes} />
        <span className="flex flex-col gap-0.5">
          <span className="text-body font-medium text-text">Marcar ausentes al cerrar</span>
          <span className="text-caption text-muted">
            Quien no escaneó y no tiene marca de hoy queda ausente. Lo que marques a mano no se
            toca.
          </span>
        </span>
      </label>

      <DialogFooter>
        <Button onClick={props.onEmpezar} loading={props.abriendo} disabled={!props.grupo}>
          <QrIcon aria-hidden />
          Mostrar QR
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Cuenta atrás a partir de lo que dijo el servidor, no del reloj del equipo. */
function useRestante(restanteMs: number, recibidaEn: number): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(reloj);
  }, []);
  return Math.max(0, restanteMs - (ahora - recibidaEn));
}

function PanelQr({
  sesion,
  recibidaEn,
  contenido,
  error,
}: {
  sesion: SesionQr;
  recibidaEn: number;
  contenido: string | null;
  error: boolean;
}) {
  const restante = useRestante(sesion.restanteMs, recibidaEn);
  const minutos = Math.floor(restante / 60_000);
  const segundos = Math.floor((restante % 60_000) / 1000);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Con error no se pinta el último código aunque lo haya: si el wifi del
          aula cae, el proyector seguiría enseñando un QR vencido y los
          estudiantes recibirían «vencido» sin que el docente viera nada raro. */}
      {contenido && !error ? (
        <QrCode
          value={contenido}
          label={`Código QR de asistencia de ${sesion.subjectName}`}
          className="w-full max-w-[min(58vh,32rem)] rounded-lg"
        />
      ) : (
        <div className="grid aspect-square w-full max-w-[min(58vh,32rem)] place-items-center rounded-lg bg-surface-sunken">
          {error ? (
            <span className="px-6 text-center text-body text-muted">
              No se pudo obtener el código. Revisa la conexión; se reintenta solo.
            </span>
          ) : (
            <Skeleton className="size-full" />
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-h3 font-semibold text-text">
          {sesion.subjectCode}
          {sesion.grupo ? ` · ${sesion.grupo}` : ''}
        </span>
        <span className="text-body text-muted">
          Abre UniPlanner, entra a <span className="font-medium text-text">Asistencia por QR</span> y
          apunta al código.
        </span>
      </div>

      <Badge tone={restante < 60_000 ? 'warning' : 'neutral'} className="tabular">
        <Clock aria-hidden className="size-3.5" />
        Cierra en {minutos}:{String(segundos).padStart(2, '0')}
      </Badge>
    </div>
  );
}

function PanelLista({ sesion }: { sesion: SesionQr }) {
  const alumnos = useMemo(
    // Los que ya marcaron arriba, luego los que están confirmando: es lo que
    // cambia mientras se mira.
    () => {
      const orden = { PRESENTE: 0, CONFIRMANDO: 1, SIN_MARCA: 2 } as const;
      return [...sesion.alumnos].sort(
        (a, b) => orden[a.estado] - orden[b.estado] || a.fullName.localeCompare(b.fullName, 'es'),
      );
    },
    [sesion.alumnos],
  );
  const sinApp = sesion.resumen.matriculados - sesion.resumen.conUniPlanner;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-well flex flex-col gap-1 p-3">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted">Presentes</span>
          <span className="text-h1 font-semibold tabular text-text">
            {sesion.resumen.presentes}
            <span className="text-h3 text-muted"> / {sesion.resumen.matriculados}</span>
          </span>
        </div>
        <div className="surface-well flex flex-col gap-1 p-3">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted">Sin UniPlanner</span>
          <span className="text-h1 font-semibold tabular text-text">{sinApp}</span>
        </div>
      </div>

      {sinApp > 0 ? (
        <p className="flex items-start gap-2 text-caption text-muted">
          <Smartphone aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Quien no tiene la app enlazada no puede escanear: márcalo a mano en la lista de asistencia.
        </p>
      ) : null}

      <ul className="scrollbar-slim flex max-h-[42vh] flex-col gap-1 overflow-y-auto" aria-label="Estudiantes">
        {alumnos.map((alumno) => (
          <li
            key={alumno.studentId}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5',
              alumno.estado === 'PRESENTE' && 'bg-success-soft/50',
            )}
          >
            {alumno.estado === 'PRESENTE' ? (
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" />
            ) : alumno.estado === 'CONFIRMANDO' ? (
              <Hourglass aria-hidden className="size-4 shrink-0 text-warning" />
            ) : (
              <Users aria-hidden className="size-4 shrink-0 text-muted" />
            )}
            <span className="min-w-0 flex-1 truncate text-body text-text">
              {alumno.fullName}
              {/* El icono y el fondo no llegan a un lector de pantalla. */}
              <span className="sr-only">
                {alumno.estado === 'PRESENTE'
                  ? ', presente'
                  : alumno.estado === 'CONFIRMANDO'
                    ? ', confirmando'
                    : alumno.enlazado
                      ? ', sin marcar'
                      : ', sin marcar, no tiene UniPlanner'}
              </span>
            </span>
            {alumno.estado === 'PRESENTE' && alumno.marcadaEn ? (
              <span className="shrink-0 text-caption tabular text-muted">
                {hora.format(new Date(alumno.marcadaEn))}
              </span>
            ) : alumno.estado === 'CONFIRMANDO' ? (
              <Badge tone="warning" size="sm" title="Escaneó y falta que confirme en su teléfono">
                Confirmando
              </Badge>
            ) : !alumno.enlazado ? (
              <Badge tone="neutral" size="sm">
                Sin app
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>

      {sesion.rechazos.length > 0 ? (
        <details className="surface-well p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-body font-medium text-text">
            <ShieldAlert aria-hidden className="size-4 text-warning" />
            {sesion.rechazos.length} marca{sesion.rechazos.length === 1 ? '' : 's'} rechazada
            {sesion.rechazos.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {sesion.rechazos.slice(0, 30).map((rechazo, i) => (
              <li key={`${rechazo.creadaEn}-${i}`} className="text-caption text-muted">
                <span className="font-medium text-text">{rechazo.fullName ?? 'Cuenta sin matrícula'}</span>
                {' — '}
                {rechazo.mensaje}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const MOTIVO_CIERRE: Record<NonNullable<SesionQr['motivoCierre']>, string> = {
  DOCENTE: 'La cerraste tú.',
  VENCIDA: 'Se cerró sola al terminar el tiempo.',
  PERIODO: 'Se cerró porque el periodo entró en cierre: no se registró nada más.',
};

function Resumen({ sesion, onListo }: { sesion: SesionQr; onListo: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-well flex flex-col gap-1 p-3">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted">Por QR</span>
          <span className="text-h2 font-semibold tabular text-success">{sesion.resumen.presentes}</span>
        </div>
        <div className="surface-well flex flex-col gap-1 p-3">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted">Ausentes marcados</span>
          <span className="text-h2 font-semibold tabular text-text">{sesion.ausentesMarcados}</span>
        </div>
        <div className="surface-well flex flex-col gap-1 p-3">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted">Rechazadas</span>
          <span className="text-h2 font-semibold tabular text-text">{sesion.resumen.rechazadas}</span>
        </div>
      </div>
      <p className="text-body text-muted">
        {sesion.motivoCierre ? MOTIVO_CIERRE[sesion.motivoCierre] : null} Puedes corregir cualquier
        marca desde la lista de asistencia.
      </p>
      <DialogFooter>
        <Button onClick={onListo}>Listo</Button>
      </DialogFooter>
    </div>
  );
}
