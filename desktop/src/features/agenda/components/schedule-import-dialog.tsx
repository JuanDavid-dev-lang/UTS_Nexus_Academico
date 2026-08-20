import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, FileUp } from 'lucide-react';
import { Badge, Button, Dialog, DialogContent, DialogFooter } from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { agendaRepository } from '@/infrastructure/repositories/agenda.repository';
import { toast } from '@/state/toast.store';
import { currentPeriod } from '@/shared/lib/format';
import type { SesionHorario } from '@/domain/schemas/agenda';

/**
 * Importa el horario del semestre desde el reporte PDF de Academusoft.
 *
 * Dos pasos, como toda importación de esta casa: el PDF se LEE y se muestra lo
 * interpretado —día, horas, materia, grupo, aula— para que el docente confirme
 * que los datos están correctos; solo entonces se escribe. Las materias que no
 * existan se crean con su grupo del reporte, y una franja que ya estaba se
 * actualiza en vez de duplicarse.
 */

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function ScheduleImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [sesiones, setSesiones] = useState<SesionHorario[]>([]);
  const period = currentPeriod();

  const scan = useMutation({
    mutationFn: (file: File) => agendaRepository.scanHorario(period, file),
    onSuccess(data) {
      setSesiones(data.sesiones);
      if (data.sesiones.length === 0) {
        toast.warning('El PDF no trajo sesiones', '¿Es el reporte «Horario Estudiante»?');
      }
    },
    onError(error) {
      toast.fromError(error, 'No se pudo leer el horario');
    },
  });

  const confirmar = useMutation({
    mutationFn: () =>
      agendaRepository.confirmarHorario({
        period,
        sesiones: sesiones.map((sesion) => ({
          codigo: sesion.codigo,
          nombre: sesion.nombre,
          grupo: sesion.grupo,
          dia: sesion.dia,
          horaInicio: sesion.horaInicio,
          horaFin: sesion.horaFin,
          aula: sesion.aula,
        })),
      }),
    onSuccess(resultado) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      toast.success(
        'Horario importado',
        `${resultado.franjasCreadas} clase(s) nuevas, ${resultado.franjasActualizadas} actualizadas` +
          (resultado.materiasCreadas > 0
            ? ` · ${resultado.materiasCreadas} materia(s) creadas con su grupo`
            : ''),
      );
      cerrar();
    },
    onError(error) {
      toast.fromError(error, 'No se pudo importar el horario');
    },
  });

  function cerrar() {
    setSesiones([]);
    onOpenChange(false);
  }

  const materiasNuevas = new Set(
    sesiones.filter((sesion) => !sesion.materiaExiste).map((sesion) => sesion.codigo),
  ).size;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && cerrar()}>
      <DialogContent
        title="Importar horario"
        description={`Sube el reporte «Horario Estudiante» de Academusoft (PDF). Las clases entran al periodo ${period}.`}
        className="max-w-2xl"
      >
        <input
          ref={fileInput}
          type="file"
          accept=".pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) scan.mutate(file);
          }}
        />

        {sesiones.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={scan.isPending}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-primary"
          >
            <FileUp className="size-6 text-muted" aria-hidden />
            <span className="text-body font-medium text-text">
              {scan.isPending ? 'Leyendo el PDF…' : 'Elegir el PDF del horario'}
            </span>
            <span className="text-caption text-muted">
              Solo el PDF original: el día de cada clase se lee de la posición en la tabla.
            </span>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {/*
              La revisión es el punto del flujo: aquí el docente ve si lo leído
              está correcto ANTES de que exista nada en el calendario.
            */}
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-caption">
                <thead className="sticky top-0 bg-surface-alt text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Día</th>
                    <th className="px-2 py-2 font-semibold">Horas</th>
                    <th className="px-2 py-2 font-semibold">Materia</th>
                    <th className="px-2 py-2 font-semibold">Aula</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sesiones.map((sesion, indice) => (
                    <tr key={`${sesion.codigo}-${sesion.dia}-${indice}`}>
                      <td className="px-3 py-2 text-text">{DIAS[sesion.dia] ?? sesion.dia}</td>
                      <td className="px-2 py-2 font-mono tabular-nums text-text">
                        {sesion.horaInicio}–{sesion.horaFin}
                      </td>
                      <td className="max-w-52 px-2 py-2">
                        <span className="block truncate font-medium text-text">
                          {sesion.codigo} · {sesion.nombre}
                        </span>
                        {sesion.grupo ? (
                          <span className="text-muted">Grupo {sesion.grupo}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-muted">{sesion.aula || '—'}</td>
                      <td className="px-2 py-2 text-right">
                        {!sesion.materiaExiste ? (
                          <Badge tone="warning">Materia nueva</Badge>
                        ) : sesion.franjaExiste ? (
                          <Badge tone="neutral">Ya en tu horario</Badge>
                        ) : (
                          <Badge tone="success">Nueva</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-caption text-muted">
              {sesiones.length} clase(s) semanales.{' '}
              {materiasNuevas > 0
                ? `Se crearán ${materiasNuevas} materia(s) con su grupo, listas para matricular.`
                : 'Todas las materias ya existen.'}{' '}
              Una franja repetida se actualiza, no se duplica.
            </p>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setSesiones([])}>
                Elegir otro archivo
              </Button>
              <Button
                variant="primary"
                loading={confirmar.isPending}
                disabled={confirmar.isPending}
                onClick={() => confirmar.mutate()}
              >
                <CalendarCheck aria-hidden />
                Agregar al calendario
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
