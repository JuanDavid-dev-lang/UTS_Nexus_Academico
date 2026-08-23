import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX, Phone, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  NativeSelect,
  Progress,
  RiskBadge,
  Textarea,
} from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { analyticsRepository } from '@/infrastructure/repositories/insights.repository';
import { attendanceRepository } from '@/infrastructure/repositories/attendance.repository';
import { gradeRepository } from '@/infrastructure/repositories/grades.repository';
import { toast } from '@/state/toast.store';
import { currentPeriod, formatDate, formatGrade, formatPercent } from '@/shared/lib/format';
import type { AccionSeguimiento, RiskItem, Seguimiento } from '@/domain/schemas/risk';

/**
 * Seguimiento de un estudiante en riesgo: su expediente y qué se hace con él.
 *
 * Reúne en un solo sitio lo que el docente necesita para decidir —qué días ha
 * faltado y qué notas lleva— y el acompañamiento como episodios: se abre uno
 * diciendo QUÉ se va a hacer (llamar, tutoría, charla), un día después llega
 * el recordatorio de actualizarlo, y se cierra con su resultado. BIEN si hubo
 * charla o solución; NEGADO si el estudiante no aceptó — y esa negativa queda
 * en el historial: reabrir después de un NEGADO pide confirmación explícita.
 *
 * El progreso (¿el riesgo bajó desde que se abrió?) lo mide el servidor
 * comparando niveles del motor canónico; aquí solo se muestra.
 */

const ACCIONES: { value: AccionSeguimiento; label: string }[] = [
  { value: 'LLAMADA', label: 'Llamar al estudiante' },
  { value: 'TUTORIA', label: 'Recomendar tutoría' },
  { value: 'CHARLA', label: 'Charla personal' },
  { value: 'OTRA', label: 'Otra acción' },
];

const ACCION_LABEL: Record<AccionSeguimiento, string> = {
  LLAMADA: 'Llamada',
  TUTORIA: 'Tutoría',
  CHARLA: 'Charla',
  OTRA: 'Otra acción',
};

const ESTADO_TONO = {
  EN_CURSO: 'info',
  BIEN: 'success',
  NEGADO: 'danger',
} as const;

const ESTADO_LABEL = {
  EN_CURSO: 'En curso',
  BIEN: 'Fue bien',
  NEGADO: 'Acompañamiento negado',
} as const;

const PROGRESO_TEXTO = {
  MEJORA: 'El riesgo va disminuyendo',
  IGUAL: 'El riesgo sigue igual',
  EMPEORA: 'El riesgo va aumentando',
} as const;

export function SeguimientoDialog({
  row,
  onOpenChange,
}: {
  row: RiskItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const period = currentPeriod();
  const scope = row
    ? { studentId: row.studentId, subjectId: row.subjectId, period }
    : null;

  const seguimientos = useQuery({
    queryKey: queryKeys.analytics.seguimientos(scope ?? { studentId: '', subjectId: '', period }),
    queryFn: () => analyticsRepository.seguimientos(scope!),
    enabled: scope !== null,
  });

  // El expediente mínimo para decidir: qué días faltó y qué notas lleva.
  const faltas = useQuery({
    queryKey: queryKeys.attendance.list(scope ?? {}),
    queryFn: () => attendanceRepository.list(scope!),
    enabled: scope !== null,
    select: (items) =>
      items
        .filter((item) => !item.present)
        .sort((a, b) => b.date.localeCompare(a.date)),
  });

  const consolidado = useQuery({
    queryKey: queryKeys.grades.consolidated({ ...scope, period }),
    queryFn: () => gradeRepository.consolidated({ ...scope!, period }),
    enabled: scope !== null,
    select: (rows) => rows.find((item) => item.studentId === row?.studentId) ?? null,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['analytics', 'seguimientos'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  };

  const crear = useMutation({
    mutationFn: (input: { accion: AccionSeguimiento; nota: string }) =>
      analyticsRepository.crearSeguimiento({ ...scope!, ...input }),
    onSuccess() {
      invalidar();
      toast.success('Seguimiento abierto', 'Mañana te llegará el recordatorio de actualizarlo.');
    },
    onError(error) {
      toast.fromError(error, 'No se pudo abrir el seguimiento');
    },
  });

  const cerrar = useMutation({
    mutationFn: (input: { id: string; resultado: 'BIEN' | 'NEGADO'; nota: string }) =>
      analyticsRepository.cerrarSeguimiento(input.id, {
        resultado: input.resultado,
        nota: input.nota,
      }),
    onSuccess(_data, variables) {
      invalidar();
      toast.success(
        variables.resultado === 'BIEN' ? 'Seguimiento cerrado: fue bien' : 'Quedó como acompañamiento negado',
      );
    },
    onError(error) {
      toast.fromError(error, 'No se pudo actualizar el seguimiento');
    },
  });

  const datos = seguimientos.data;
  const abierto = datos?.items.find((item) => item.estado === 'EN_CURSO') ?? null;

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={row ? `Seguimiento · ${row.fullName}` : 'Seguimiento'}
        // La nota y la asistencia salieron de aquí: ahora son el titular del
        // veredicto. Repetirlas en el subtítulo restaba peso a ese bloque.
        description={row ? row.code : undefined}
        className="max-w-2xl"
      >
        {row ? (
          <div className="flex flex-col gap-4">
            {/* ── El veredicto ───────────────────────────────────────── */}
            <Veredicto row={row} />

            <SeparadorRotulado>Lo que sustenta el nivel</SeparadorRotulado>

            {/* ── Expediente: faltas y notas ─────────────────────────── */}
            <div className="grid gap-3 @lg:grid-cols-2">
              <section className="rounded-lg border border-border bg-surface-alt/50 p-3">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold text-text">
                  <CalendarX className="size-3.5 text-warning" aria-hidden />
                  Días que ha faltado ({row.missed})
                </h3>
                {faltas.isPending ? (
                  <p className="text-caption text-muted">Cargando…</p>
                ) : (faltas.data?.length ?? 0) === 0 ? (
                  <p className="text-caption text-muted">Sin faltas registradas.</p>
                ) : (
                  <ul className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                    {faltas.data!.slice(0, 12).map((falta) => (
                      <li key={falta._id} className="text-caption tabular-nums text-text">
                        {formatDate(falta.date)}
                      </li>
                    ))}
                    {faltas.data!.length > 12 ? (
                      <li className="text-caption text-muted">…y {faltas.data!.length - 12} más</li>
                    ) : null}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-border bg-surface-alt/50 p-3">
                <h3 className="mb-1.5 text-caption font-semibold text-text">Notas que lleva</h3>
                {consolidado.isPending ? (
                  <p className="text-caption text-muted">Cargando…</p>
                ) : consolidado.data ? (
                  <ul className="flex flex-col gap-0.5">
                    {consolidado.data.cortes.map((corte) => (
                      <li key={corte.corte} className="flex justify-between text-caption text-text">
                        <span>
                          Corte {corte.corte}
                          {corte.completo ? '' : ' (incompleto)'}
                        </span>
                        <span className="font-mono tabular-nums">{formatGrade(corte.nota)}</span>
                      </li>
                    ))}
                    <li className="mt-0.5 flex justify-between border-t border-border pt-1 text-caption font-semibold text-text">
                      <span>Final parcial</span>
                      <span className="font-mono tabular-nums">
                        {formatGrade(consolidado.data.notaFinal)}
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="text-caption text-muted">Todavía sin notas registradas.</p>
                )}
              </section>
            </div>

            {/* ── Historial de episodios ─────────────────────────────── */}
            {(datos?.items.length ?? 0) > 0 ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-caption font-semibold text-text">Acompañamientos</h3>
                {datos!.items.map((episodio) => (
                  <EpisodioFila key={episodio._id} episodio={episodio} />
                ))}
              </section>
            ) : null}

            {/* ── Actualizar el abierto, o abrir uno nuevo ───────────── */}
            {abierto ? (
              <ActualizarPanel
                episodio={abierto}
                progreso={datos?.progreso ?? null}
                nivelActual={datos?.nivelActual ?? 'BAJO'}
                enviando={cerrar.isPending}
                onCerrar={(resultado, nota) => cerrar.mutate({ id: abierto._id, resultado, nota })}
              />
            ) : (
              <AbrirPanel
                huboNegado={datos?.huboNegado ?? false}
                enviando={crear.isPending}
                onCrear={(accion, nota) => crear.mutate({ accion, nota })}
              />
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Nota, asistencia y el porqué del nivel, arriba de todo.
 *
 * Antes las dos cifras que deciden el caso —nota y asistencia— vivían en el
 * subtítulo del diálogo, en gris apagado y del mismo tamaño que la cédula. El
 * docente abría la ficha y no tenía dónde posar el ojo: cuatro cajas del mismo
 * peso y ningún veredicto. Aquí las cifras son el titular, con su barra y su
 * color, y debajo van los motivos que el motor de riesgo ya calcula y que la
 * tabla solo mostraba de a uno.
 */
function Veredicto({ row }: { row: RiskItem }) {
  return (
    <section className="rounded-xl border border-border bg-surface-alt/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <RiskBadge level={row.level} />
        <span className="font-mono text-caption tabular-nums text-muted">
          {row.riskScore}/100 de riesgo
        </span>
      </div>

      <div className="grid gap-3 @sm:grid-cols-2">
        <Cifra
          etiqueta="Nota"
          valor={formatGrade(row.notaFinal)}
          porcentaje={Math.min(100, (row.notaFinal / 5) * 100)}
          tono={row.notaFinal >= 3.5 ? 'success' : row.notaFinal >= 3 ? 'warning' : 'danger'}
        />
        <Cifra
          etiqueta="Asistencia"
          valor={formatPercent(row.attendanceRate)}
          porcentaje={row.attendanceRate}
          tono={
            row.attendanceRate >= 80 ? 'success' : row.attendanceRate >= 70 ? 'warning' : 'danger'
          }
        />
      </div>

      {row.motivos.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
          {row.motivos.map((motivo) => (
            <li key={motivo} className="flex gap-2 text-caption text-muted">
              <span className="select-none text-subtle" aria-hidden>
                ·
              </span>
              {motivo}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Una cifra grande con su barra. El número manda; la etiqueta acompaña. */
function Cifra({
  etiqueta,
  valor,
  porcentaje,
  tono,
}: {
  etiqueta: string;
  valor: string;
  porcentaje: number;
  tono: 'success' | 'warning' | 'danger';
}) {
  const color = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tono];

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
      <span className="text-caption font-semibold uppercase tracking-wide text-muted">
        {etiqueta}
      </span>
      <span className={`font-mono text-h2 font-bold tabular-nums leading-none ${color}`}>
        {valor}
      </span>
      <Progress value={porcentaje} tone={tono} />
    </div>
  );
}

/**
 * Rótulo sobre una línea. Separa el veredicto de su evidencia.
 *
 * No se numeran las secciones: el docente no recorre un procedimiento paso a
 * paso, mira el nivel y decide. Numerarlas sugeriría un orden obligatorio que
 * no existe.
 */
function SeparadorRotulado({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-caption font-semibold uppercase tracking-wide text-muted">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

function EpisodioFila({ episodio }: { episodio: Seguimiento }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
      <Phone className="size-3.5 shrink-0 text-muted" aria-hidden />
      <span className="text-caption font-medium text-text">{ACCION_LABEL[episodio.accion]}</span>
      {episodio.creadoEn ? (
        <span className="text-caption tabular-nums text-muted">{formatDate(episodio.creadoEn)}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-caption text-muted">
        {episodio.estado === 'EN_CURSO' ? episodio.nota : episodio.notaCierre || episodio.nota}
      </span>
      {episodio.nivelAlCerrar ? (
        <span className="text-caption tabular-nums text-muted">
          {episodio.nivelAlCrear} → {episodio.nivelAlCerrar}
        </span>
      ) : null}
      <Badge tone={ESTADO_TONO[episodio.estado]}>{ESTADO_LABEL[episodio.estado]}</Badge>
    </div>
  );
}

/** Cierre del episodio abierto: cómo fue, con el progreso medido a la vista. */
function ActualizarPanel({
  episodio,
  progreso,
  nivelActual,
  enviando,
  onCerrar,
}: {
  episodio: Seguimiento;
  progreso: 'MEJORA' | 'IGUAL' | 'EMPEORA' | null;
  nivelActual: string;
  enviando: boolean;
  onCerrar: (resultado: 'BIEN' | 'NEGADO', nota: string) => void;
}) {
  const [nota, setNota] = useState('');

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-surface-alt/50 p-3">
      <h3 className="text-caption font-semibold text-text">
        Actualizar seguimiento · {ACCION_LABEL[episodio.accion]}
      </h3>

      {progreso ? (
        <p className="flex items-center gap-1.5 text-caption text-muted">
          {progreso === 'MEJORA' ? (
            <TrendingDown className="size-3.5 text-success" aria-hidden />
          ) : (
            <TrendingUp
              className={progreso === 'EMPEORA' ? 'size-3.5 text-danger' : 'size-3.5 text-muted'}
              aria-hidden
            />
          )}
          {PROGRESO_TEXTO[progreso]}: abrió en {episodio.nivelAlCrear}, hoy está en {nivelActual}.
        </p>
      ) : null}

      <Textarea
        value={nota}
        onChange={(event) => setNota(event.target.value)}
        rows={2}
        placeholder="Qué pasó: hubo charla, llegó a tutoría, no respondió…"
        aria-label="Nota del cierre"
      />

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          loading={enviando}
          disabled={enviando}
          onClick={() => onCerrar('NEGADO', nota.trim())}
        >
          Fue mal — acompañamiento negado
        </Button>
        <Button
          variant="primary"
          loading={enviando}
          disabled={enviando}
          onClick={() => onCerrar('BIEN', nota.trim())}
        >
          Fue bien
        </Button>
      </div>
    </section>
  );
}

/** Apertura de un episodio, con la advertencia si ya hubo un NEGADO. */
function AbrirPanel({
  huboNegado,
  enviando,
  onCrear,
}: {
  huboNegado: boolean;
  enviando: boolean;
  onCrear: (accion: AccionSeguimiento, nota: string) => void;
}) {
  const [accion, setAccion] = useState<AccionSeguimiento>('LLAMADA');
  const [nota, setNota] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  function enviar() {
    if (huboNegado && !confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    onCrear(accion, nota.trim());
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-alt/50 p-3">
      <h3 className="text-caption font-semibold text-text">Abrir seguimiento</h3>

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={accion}
          onChange={(event) => setAccion(event.target.value as AccionSeguimiento)}
          aria-label="Qué se va a hacer"
          className="h-9 w-auto"
        >
          {ACCIONES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
        <span className="text-caption text-muted">
          Mañana te llegará un recordatorio para registrar cómo fue.
        </span>
      </div>

      <Textarea
        value={nota}
        onChange={(event) => setNota(event.target.value)}
        rows={2}
        placeholder="Contexto: qué se acordó, a qué tutoría se envía…"
        aria-label="Nota del seguimiento"
      />

      {confirmando ? (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3">
          <p className="text-caption text-warning">
            Este estudiante ya estuvo en acompañamiento pero fue negado. ¿Deseas realizarlo de
            todas formas?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" loading={enviando} onClick={enviar}>
              Sí, abrir de todas formas
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button variant="primary" loading={enviando} disabled={enviando} onClick={enviar}>
            Abrir seguimiento
          </Button>
        </div>
      )}
    </section>
  );
}
