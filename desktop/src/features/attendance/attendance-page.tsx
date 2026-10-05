import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Camera, Check, QrCode, Send, Smartphone, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  Progress,
  SkeletonList,
} from '@/shared/ui';
import { Avatar } from '@/shared/ui/primitives';
import {
  useAsistenciaPendiente,
  useAttendance,
  useMarkAttendance,
} from '@/features/attendance/hooks/use-attendance';
import type { ClaseAsistencia, RegistroAsistencia } from '@/domain/offline/outbox';
import { TEXTO_SIN_CONEXION } from '@/features/offline/requiere-conexion';
import { useEnLinea } from '@/state/connectivity.store';
import { useEnrolledStudents } from '@/features/grades/hooks/use-grades';
import { useGroups, useSubjects } from '@/features/subjects/hooks/use-subjects';
import { useCurrentUser, useUserRole } from '@/state/session.store';
import { ExportButton } from '@/features/reports/components/export-button';
import { useRecorteWeb } from '@/shared/hooks/use-recorte-web';
import { can } from '@/core/auth/permissions';
import {
  currentPeriod,
  formatDate,
  formatPercent,
  recentPeriods,
  toIsoDate,
} from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { toast } from '@/state/toast.store';
import { SheetScanDialog } from './components/sheet-scan-dialog';
import { QrSessionDialog } from './components/qr-session-dialog';
import { useSesionQrAbierta } from './hooks/use-attendance-qr';
import {
  useEnlacesUniPlanner,
  useEstadoUniPlanner,
} from '@/features/uniplanner/hooks/use-uniplanner';
import {
  NotifyDialog,
  type DestinatarioAviso,
} from '@/features/uniplanner/components/notify-dialog';

/**
 * Attendance roll call.
 *
 * Built around the real workflow: pick a class, then tap through the list. Each
 * mark is saved immediately, so an interrupted session never loses the marks
 * already made - the v1 flow required a separate save step per student.
 */
export default function AttendancePage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [subjectId, setSubjectId] = useState('');
  /** El grupo que eligió el docente. Vacío = ninguno elegido todavía. */
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(toIsoDate());
  const [scanOpen, setScanOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [avisando, setAvisando] = useState<DestinatarioAviso[] | null>(null);

  const user = useCurrentUser();
  const role = useUserRole();
  const canWrite = can(role, 'attendance.write');
  const puedeExportar = can(role, 'reports.export');
  // Leer una planilla desde una foto pasa por el servicio de visión: en la
  // versión web no está. El QR sí: proyectarlo desde el navegador funciona igual.
  const recorteWeb = useRecorteWeb();

  const subjects = useSubjects();
  const groups = useGroups();

  /*
    Se pasa lista a un **grupo**, no a la materia: en la UTS una materia
    (PIS701) tiene varios grupos (A194, A193, B212), cada uno con sus
    estudiantes y su horario. Con un solo grupo se usa ese; con varios hay que
    elegir, y hasta entonces no se enseña ninguna lista: mezclar dos salones en
    una es la forma más fácil de marcar ausente a quien no tenía clase.
  */
  const gruposDeMateria = useMemo(
    () =>
      (groups.data ?? [])
        .filter((group) => group.subjectId === subjectId && (!group.period || group.period === period))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [groups.data, subjectId, period],
  );
  const grupoElegido =
    gruposDeMateria.length === 1
      ? gruposDeMateria[0]!._id
      : gruposDeMateria.some((group) => group._id === groupId)
        ? groupId
        : '';
  const faltaGrupo = gruposDeMateria.length > 1 && !grupoElegido;
  const grupoActivo = gruposDeMateria.find((group) => group._id === grupoElegido);

  const enrolled = useEnrolledStudents({ subjectId, period, groupId: grupoElegido || undefined });
  const attendance = useAttendance({ subjectId: subjectId || undefined, period }, Boolean(subjectId));
  const markAttendance = useMarkAttendance();
  const enLinea = useEnLinea();
  // Lo marcado que aún no salió de este equipo se ve igual que lo guardado,
  // con su marca de «pendiente».
  const pendientes = useAsistenciaPendiente(subjectId, date);

  /*
    Puente con UniPlanner. Se pregunta primero si está encendido: sin
    credenciales configuradas no se pide la lista de enlaces —que es una
    llamada a otro proyecto— ni se pinta ningún botón que no podría funcionar.
  */
  const puente = useEstadoUniPlanner();
  const puenteActivo = puente.data?.configurado === true;
  const enlaces = useEnlacesUniPlanner({ subjectId, period }, puenteActivo && Boolean(subjectId));

  /*
    Lista por QR. Solo para la clase de hoy —el QR registra el día en que se
    escanea— y solo con el puente encendido: sin él nadie podría escanear.
  */
  const esHoy = date === toIsoDate();
  const puedeQr = canWrite && puenteActivo && Boolean(subjectId) && esHoy && gruposDeMateria.length > 0;
  const sesionQr = useSesionQrAbierta(subjectId, grupoElegido, puedeQr);

  const enlacePorEstudiante = useMemo(
    () => new Map((enlaces.data ?? []).map((enlace) => [enlace.studentId, enlace])),
    [enlaces.data],
  );

  /** Los del grupo que están en riesgo por faltas y además tienen la app. */
  const enRiesgoConApp = useMemo(() => {
    const delGrupo = new Set(enrolled.data.map((student) => student._id));
    return (enlaces.data ?? []).filter(
      (enlace) => enlace.enlazado && enlace.nivel !== 'VERDE' && delGrupo.has(enlace.studentId),
    );
  }, [enlaces.data, enrolled.data]);

  useEffect(() => {
    if (subjectId) return;
    const first = subjects.data?.find((subject) => subject.period === period);
    if (first) setSubjectId(first._id);
  }, [subjects.data, period, subjectId]);

  const periodSubjects = useMemo(
    () => (subjects.data ?? []).filter((subject) => subject.period === period),
    [subjects.data, period],
  );

  /** Marks already registered for the selected date, keyed by student. */
  const marksForDate = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const record of attendance.data ?? []) {
      if (record.date.slice(0, 10) === date) map.set(record.studentId, record.present);
    }
    // Lo pendiente manda sobre lo guardado: es lo último que el docente marcó.
    for (const [studentId, marca] of pendientes) map.set(studentId, marca.present);
    return map;
  }, [attendance.data, date, pendientes]);

  /**
   * El registro ya guardado de cada estudiante en esa fecha. El envío por
   * lotes escribe también el retraso y la observación, y sin esto marcar
   * desde aquí los pondría a cero sobre lo que el móvil hubiera anotado.
   */
  const registroGuardado = useMemo(() => {
    const map = new Map<string, { lateMinutes: number; notes: string }>();
    for (const record of attendance.data ?? []) {
      if (record.date.slice(0, 10) === date) {
        map.set(record.studentId, { lateMinutes: record.lateMinutes, notes: record.notes });
      }
    }
    return map;
  }, [attendance.data, date]);

  /** Overall attendance rate per student across the whole period. */
  const ratesByStudent = useMemo(() => {
    const totals = new Map<string, { present: number; total: number }>();
    for (const record of attendance.data ?? []) {
      const current = totals.get(record.studentId) ?? { present: 0, total: 0 };
      current.total += 1;
      if (record.present) current.present += 1;
      totals.set(record.studentId, current);
    }

    const rates = new Map<string, number>();
    for (const [studentId, { present, total }] of totals) {
      rates.set(studentId, total > 0 ? (present / total) * 100 : 0);
    }
    return rates;
  }, [attendance.data]);

  const registeredCount = marksForDate.size;
  const presentCount = [...marksForDate.values()].filter(Boolean).length;
  const absentCount = registeredCount - presentCount;
  const materiaActiva = periodSubjects.find((subject) => subject._id === subjectId);

  function claseActual(): ClaseAsistencia | null {
    if (!user || !subjectId) return null;
    return {
      subjectId,
      ...(grupoElegido ? { groupId: grupoElegido } : {}),
      teacherId: user.id,
      period,
      dia: date,
      date: new Date(`${date}T12:00:00`).toISOString(),
    };
  }

  function registroDe(studentId: string, present: boolean): RegistroAsistencia {
    const previo = registroGuardado.get(studentId);
    return { studentId, present, lateMinutes: previo?.lateMinutes ?? 0, notes: previo?.notes ?? '' };
  }

  function mark(studentId: string, present: boolean) {
    const clase = claseActual();
    if (!clase) return;
    markAttendance.mutate({ clase, registros: [registroDe(studentId, present)] });
  }

  function markAllPresent() {
    const clase = claseActual();
    if (!clase) return;
    const pending = enrolled.data.filter((student) => !marksForDate.has(student._id));
    if (pending.length === 0) {
      toast.info('Nada que registrar', 'Ya marcaste a todos los estudiantes de esta clase.');
      return;
    }
    // Un solo envío con toda la lista, no uno por estudiante.
    markAttendance.mutate(
      { clase, registros: pending.map((student) => registroDe(student._id, true)) },
      {
        onSuccess: (resultado) => {
          if (!resultado.enCola) toast.success(`${pending.length} estudiantes marcados como presentes`);
        },
      },
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <>
            <CalendarCheck className="size-3.5" aria-hidden />
            {materiaActiva ? materiaActiva.name : 'Sin materia seleccionada'}
            {grupoActivo ? ` · Grupo ${grupoActivo.name}` : ''}
            {' · '}
            {formatDate(`${date}T12:00:00`)}
          </>
        }
        title="Asistencia"
        subtitle="Registra la asistencia de una clase; cada marca se guarda al instante, también sin conexión"
        actions={
          canWrite || puedeExportar ? (
            <div className="flex flex-wrap gap-2">
              {puedeExportar ? (
                <ExportButton
                  kind="attendance"
                  period={period}
                  subjectId={subjectId || undefined}
                  groupId={grupoElegido || undefined}
                  subjectCode={materiaActiva?.code}
                />
              ) : null}
              {canWrite && puedeQr ? (
                <Button
                  variant={sesionQr.data ? 'primary' : 'secondary'}
                  onClick={() => setQrOpen(true)}
                  disabled={!enLinea}
                  title={enLinea ? undefined : TEXTO_SIN_CONEXION}
                >
                  <QrCode aria-hidden />
                  {sesionQr.data ? 'Lista por QR en curso' : 'Pasar lista con QR'}
                </Button>
              ) : null}
              {canWrite && !recorteWeb ? (
                <Button
                  variant="secondary"
                  onClick={() => setScanOpen(true)}
                  disabled={!enLinea}
                  title={enLinea ? undefined : TEXTO_SIN_CONEXION}
                >
                  <Camera aria-hidden />
                  Importar desde una foto
                </Button>
              ) : null}
              {canWrite && !faltaGrupo && enrolled.data.length > 0 ? (
                <Button variant="secondary" onClick={markAllPresent}>
                  <Check aria-hidden />
                  Marcar todos presentes
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      <SheetScanDialog open={scanOpen} onOpenChange={setScanOpen} />

      {/* Se monta al abrir: cada apertura empieza limpia o retoma la sesión en curso. */}
      {qrOpen && materiaActiva ? (
        <QrSessionDialog
          open
          onOpenChange={setQrOpen}
          subjectId={subjectId}
          subjectName={materiaActiva.name}
          grupos={gruposDeMateria}
          // Solo el que el docente eligió aquí a mano: el QR pide el grupo
          // siempre, y uno puesto solo porque es el único no cuenta como
          // elegido.
          grupoInicial={gruposDeMateria.length > 1 ? grupoElegido : ''}
          sesionAbiertaId={sesionQr.data?.id ?? null}
        />
      ) : null}

      <div className="surface-well flex flex-wrap items-end gap-3 p-3">
        <Field label="Periodo" className="w-36">
          {(props) => (
            <NativeSelect
              {...props}
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                setSubjectId('');
              }}
            >
              {recentPeriods(6).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        <Field label="Materia" className="min-w-64 flex-1 max-w-sm">
          {(props) => (
            <NativeSelect
              {...props}
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setGroupId('');
              }}
              disabled={periodSubjects.length === 0}
            >
              <option value="">Selecciona una materia</option>
              {periodSubjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.name} ({subject.code})
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        {gruposDeMateria.length > 0 ? (
          <Field label="Grupo" className="w-36">
            {(props) => (
              <NativeSelect
                {...props}
                value={grupoElegido}
                onChange={(event) => setGroupId(event.target.value)}
                disabled={gruposDeMateria.length === 1}
              >
                {gruposDeMateria.length > 1 ? <option value="">Elige el grupo</option> : null}
                {gruposDeMateria.map((group) => (
                  <option key={group._id} value={group._id}>
                    {group.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        ) : null}

        <Field label="Fecha de clase" className="w-48">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={date}
              max={toIsoDate()}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>
      </div>

      {/*
        El resumen se queda pegado arriba mientras se pasa lista.
        Antes era una tarjeta más al principio de la página: en un salón de
        treinta, para saber si iban veintiocho o treinta había que subir hasta
        arriba, mirar y volver a bajar hasta donde se había quedado. El recuento
        es justo el dato que hace falta mientras se está en mitad de la lista,
        que es exactamente cuando estaba fuera de pantalla.
      */}
      {subjectId && !faltaGrupo && enrolled.data.length > 0 ? (
        <div className="surface-glass sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-4 rounded-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <CalendarCheck className="size-4" aria-hidden />
            </span>
            <div className="flex flex-col">
              <span className="text-caption font-semibold uppercase tracking-wide text-muted">
                Progreso de la clase
              </span>
              <span className="text-body font-semibold tabular text-text">
                {registeredCount} de {enrolled.data.length} registrados
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="success">{presentCount} presentes</Badge>
            <Badge tone={absentCount > 0 ? 'danger' : 'neutral'}>{absentCount} ausentes</Badge>
          </div>

          {/*
            Aviso masivo. Solo aparece cuando hay alguien a quien mandarlo: un
            botón permanente que casi siempre no hace nada se acaba pulsando
            por costumbre, y esto escribe en el teléfono de treinta personas.
          */}
          {canWrite && puenteActivo && enRiesgoConApp.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAvisando(
                  enRiesgoConApp.map((enlace) => ({
                    studentId: enlace.studentId,
                    code: enlace.code,
                    fullName:
                      enrolled.data.find((student) => student._id === enlace.studentId)?.fullName ??
                      enlace.code,
                    enlazado: true,
                    verificado: enlace.verificado,
                  })),
                )
              }
            >
              <Send aria-hidden />
              Avisar a {enRiesgoConApp.length} en riesgo
            </Button>
          ) : null}

          <div className="min-w-40 flex-1">
            <Progress
              value={(registeredCount / enrolled.data.length) * 100}
              tone={registeredCount === enrolled.data.length ? 'success' : 'primary'}
              label="Progreso del registro de asistencia"
            />
          </div>
        </div>
      ) : null}

      {!subjectId ? (
        <Card>
          <EmptyState
            title="Selecciona una materia"
            message="Elige la materia y la fecha de la clase para pasar lista."
          />
        </Card>
      ) : faltaGrupo ? (
        <Card>
          <EmptyState
            title="Elige el grupo"
            message={`${materiaActiva?.name ?? 'Esta materia'} tiene ${gruposDeMateria.length} grupos (${gruposDeMateria
              .map((group) => group.name)
              .join(', ')}). Cada uno tiene su lista: elige a cuál le pasas asistencia.`}
          />
        </Card>
      ) : enrolled.isPending || attendance.isPending ? (
        <SkeletonList rows={6} />
      ) : enrolled.isError ? (
        <Card>
          <ErrorState error={enrolled.error} />
        </Card>
      ) : enrolled.data.length === 0 ? (
        <Card>
          <EmptyState
            title={grupoActivo ? `Sin estudiantes en el grupo ${grupoActivo.name}` : 'Sin estudiantes en esta materia'}
            message="Matricula estudiantes en el grupo para poder registrar asistencia."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {enrolled.data.map((student) => {
            const marked = marksForDate.get(student._id);
            const rate = ratesByStudent.get(student._id);

            return (
              <li
                key={student._id}
                className={cn(
                  // `flex-wrap`: en un teléfono el interruptor Presente/Ausente
                  // se comía el ancho y el nombre quedaba en cero píxeles —se
                  // veían el avatar y los botones, pero no a quién se marcaba—.
                  'surface-card relative flex flex-wrap items-center gap-3 overflow-hidden p-3 pl-4 transition-colors duration-200',
                  marked === true && 'border-success-border bg-success-soft/40',
                  marked === false && 'border-danger-border bg-danger-soft/40',
                )}
              >
                {/*
                  Franja del estado en el borde izquierdo. El tinte de fondo por
                  sí solo se pierde: al 30% sobre blanco son unos pocos puntos
                  de luminancia, y recorriendo treinta filas con la vista no se
                  distingue una marcada de una sin marcar hasta leer el botón.
                */}
                {marked !== undefined ? (
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 w-1',
                      marked ? 'bg-success' : 'bg-danger',
                    )}
                    aria-hidden
                  />
                ) : null}

                <Avatar name={student.fullName} src={student.photoUrl} size="sm" />

                <div className="flex min-w-[9rem] flex-1 flex-col">
                  <span className="truncate text-body font-medium text-text">{student.fullName}</span>
                  <span className="truncate font-mono tabular text-caption text-muted">
                    {student.code}
                  </span>
                </div>

                {pendientes.has(student._id) ? (
                  <Badge
                    tone={pendientes.get(student._id)?.fallida ? 'danger' : 'warning'}
                    title={
                      pendientes.get(student._id)?.fallida
                        ? 'El servidor rechazó esta marca: revisa la lista de envíos'
                        : enLinea
                          ? 'Enviando al servidor'
                          : 'Guardada en este equipo; se envía al volver la conexión'
                    }
                  >
                    {pendientes.get(student._id)?.fallida ? 'Con error' : 'Pendiente'}
                  </Badge>
                ) : null}

                {rate !== undefined ? (
                  <Badge
                    tone={rate >= 80 ? 'success' : rate >= 70 ? 'warning' : 'danger'}
                    title="Asistencia acumulada en el periodo"
                    className="tabular"
                  >
                    {formatPercent(rate)}
                  </Badge>
                ) : null}

                {/*
                  Estado en UniPlanner. La insignia no es decorativa: dice si
                  pulsar "avisar" va a servir de algo. Sin ella, el docente
                  manda un aviso a alguien que no tiene la app y se queda
                  esperando una reacción que no puede llegar.
                */}
                {puenteActivo ? (() => {
                  const enlace = enlacePorEstudiante.get(student._id);
                  if (!enlace?.enlazado) {
                    return (
                      <Badge tone="neutral" title="Sin UniPlanner enlazado">
                        <Smartphone aria-hidden className="size-3.5 opacity-50" />
                        Sin app
                      </Badge>
                    );
                  }
                  const insignia = (
                    <Badge
                      tone={enlace.verificado ? 'success' : 'warning'}
                      title={
                        enlace.verificado
                          ? 'Enlazado a UniPlanner y confirmado'
                          : 'Enlazado a UniPlanner, sin confirmar por la institución'
                      }
                    >
                      <Smartphone aria-hidden className="size-3.5" />
                      {enlace.verificado ? 'UniPlanner' : 'Sin confirmar'}
                    </Badge>
                  );
                  return (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/*
                        Solo informa. Confirmar el enlace no es cosa del
                        docente de un curso: el enlace es del estudiante con su
                        universidad y vale para todas sus materias, así que lo
                        confirma la institución en «Vínculos UniPlanner».
                      */}
                      {insignia}
                      {canWrite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setAvisando([
                              {
                                studentId: student._id,
                                code: student.code,
                                fullName: student.fullName,
                                enlazado: true,
                                verificado: enlace.verificado,
                              },
                            ])
                          }
                          aria-label={`Avisar por UniPlanner a ${student.fullName}`}
                          title="Avisar por UniPlanner"
                        >
                          <Send aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  );
                })() : null}

                {canWrite ? (
                  /*
                    Los dos botones van pegados dentro de un carril hundido: es
                    un interruptor de dos posiciones, no dos acciones sueltas.
                    Separados y ambos en `outline`, nada decía que elegir uno
                    apagaba el otro, y no era raro pulsarlos en secuencia
                    esperando que hicieran cosas distintas.
                  */
                  // En angosto baja a su propia línea y se estira: dos botones
                  // de medio ancho se aciertan con el pulgar pasando lista.
                  <div className="flex w-full shrink-0 items-center gap-1 rounded-lg bg-surface-sunken p-1 @xl:w-auto">
                    <Button
                      variant={marked === true ? 'primary' : 'ghost'}
                      size="sm"
                      className="flex-1 @xl:flex-none"
                      onClick={() => mark(student._id, true)}
                      aria-pressed={marked === true}
                      aria-label={`Marcar presente a ${student.fullName}`}
                    >
                      <Check aria-hidden />
                      Presente
                    </Button>
                    <Button
                      variant={marked === false ? 'danger' : 'ghost'}
                      size="sm"
                      className="flex-1 @xl:flex-none"
                      onClick={() => mark(student._id, false)}
                      aria-pressed={marked === false}
                      aria-label={`Marcar ausente a ${student.fullName}`}
                    >
                      <X aria-hidden />
                      Ausente
                    </Button>
                  </div>
                ) : (
                  <Badge tone={marked ? 'success' : marked === false ? 'danger' : 'neutral'}>
                    {marked === true ? 'Presente' : marked === false ? 'Ausente' : 'Sin registro'}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {avisando ? (
        <NotifyDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setAvisando(null);
          }}
          subjectId={subjectId}
          subjectName={
            periodSubjects.find((subject) => subject._id === subjectId)?.name ?? 'la materia'
          }
          period={period}
          destinatarios={avisando}
        />
      ) : null}
    </PageContainer>
  );
}
