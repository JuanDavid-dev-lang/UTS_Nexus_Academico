import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, RefreshCw, ScanLine } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Input,
  NativeSelect,
} from '@/shared/ui';
import { attendanceScanRepository } from '@/infrastructure/repositories/academic.repository';
import type { EscaneoPlanilla, FilaEscaneada, NivelCoincidencia } from '@/domain/schemas/academic';
import { useGroups } from '@/features/subjects/hooks/use-subjects';
import { toast } from '@/state/toast.store';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-keys';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

type Paso = 'elegir' | 'leyendo' | 'revisar' | 'guardando';

/** Cómo se presenta cada nivel de coincidencia. El color nunca va solo. */
const NIVEL: Record<NivelCoincidencia, { tono: 'success' | 'warning' | 'danger' | 'neutral'; texto: string }> = {
  exacta: { tono: 'success', texto: 'Cédula exacta' },
  probable: { tono: 'warning', texto: 'Cédula aproximada' },
  dudosa: { tono: 'warning', texto: 'Revisar' },
  'sin-coincidencia': { tono: 'danger', texto: 'Sin identificar' },
};

/** Hoy en formato `YYYY-MM-DD`, que es lo que espera un `<input type="date">`. */
function hoy(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Importa asistencia desde la foto de una planilla.
 *
 * El paso de revisión no es opcional ni se puede saltar con un botón de
 * "aceptar todo a ciegas": el reconocimiento propone y una persona confirma.
 * Una asistencia mal guardada no se nota el día que se guarda, sino semanas
 * después, cuando el porcentaje no cuadra y ya nadie tiene la hoja.
 */
export function SheetScanDialog({ open, onOpenChange }: Props) {
  const [paso, setPaso] = useState<Paso>('elegir');
  const [groupId, setGroupId] = useState('');
  const [escaneo, setEscaneo] = useState<EscaneoPlanilla | null>(null);
  const [fechas, setFechas] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaEscaneada[]>([]);
  const [duracion, setDuracion] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const grupos = useGroups();
  const queryClient = useQueryClient();

  const sinIdentificar = filas.filter(f => !f.studentId).length;
  const dudosas = filas.filter(f => f.studentId && f.nivel !== 'exacta').length;

  const fechasRepetidas = useMemo(() => {
    const vistas = new Set<string>();
    return fechas.some(f => (f && vistas.has(f) ? true : (vistas.add(f), false)));
  }, [fechas]);

  const fechasIncompletas = fechas.some(f => !f);

  function reiniciar() {
    setPaso('elegir');
    setEscaneo(null);
    setFilas([]);
    setFechas([]);
    setError(null);
  }

  function cerrar() {
    reiniciar();
    setGroupId('');
    onOpenChange(false);
  }

  async function escanear(file: File | undefined) {
    if (!file || !groupId) return;
    setPaso('leyendo');
    setError(null);
    try {
      const resultado = await attendanceScanRepository.escanear({ groupId, archivo: file });
      setEscaneo(resultado);
      setFilas(resultado.filas);
      // Se prellenan con lo que decía la cabecera de la planilla, pero hay que
      // confirmarlas igual: el aviso de arriba dice cuáles no se pudieron leer.
      // Prellenar no es lo mismo que dar por buena una fecha inventada.
      setFechas(
        Array.from({ length: resultado.columnasFecha }, (_, i) => resultado.fechasSugeridas[i] ?? ''),
      );
      setPaso('revisar');
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo leer la planilla.');
      setPaso('elegir');
    }
  }

  function cambiarCelda(indiceFila: number, columna: number) {
    setFilas(previas =>
      previas.map(fila =>
        fila.indice !== indiceFila
          ? fila
          : {
              ...fila,
              celdas: fila.celdas.map(celda =>
                celda.columna === columna ? { ...celda, presente: !celda.presente, dudosa: false } : celda,
              ),
            },
      ),
    );
  }

  function reasignar(indiceFila: number, studentId: string) {
    const alumno = escaneo?.matriculados.find(m => m.id === studentId);
    setFilas(previas =>
      previas.map(fila =>
        fila.indice !== indiceFila
          ? fila
          : {
              ...fila,
              studentId: alumno?.id ?? null,
              code: alumno?.code ?? null,
              fullName: alumno?.fullName ?? null,
              nivel: alumno ? 'exacta' : 'sin-coincidencia',
              avisos: alumno ? ['Asignado a mano.'] : fila.avisos,
            },
      ),
    );
  }

  async function guardar() {
    if (!escaneo) return;
    const listas = filas.filter(f => f.studentId);
    setPaso('guardando');
    try {
      const resultado = await attendanceScanRepository.confirmar({
        groupId: escaneo.groupId,
        fechas,
        durationMinutes: duracion,
        filas: listas.map(f => ({
          studentId: f.studentId as string,
          presentes: f.celdas.map(c => c.presente),
        })),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      toast.success(
        'Asistencia importada',
        `${resultado.estudiantes} estudiantes en ${resultado.clases} clase(s)`,
      );
      cerrar();
    } catch (causa) {
      toast.fromError(causa, 'No se pudo guardar la asistencia');
      setPaso('revisar');
    }
  }

  return (
    <Dialog open={open} onOpenChange={abierto => (abierto ? onOpenChange(true) : cerrar())}>
      <DialogContent
        title="Importar asistencia desde una foto"
        description="Fotografía la planilla, revisa lo que se leyó y confirma."
        className="max-w-4xl"
      >
        {paso === 'elegir' && (
          <div className="flex flex-col gap-4">
            <NativeSelect
              aria-label="Grupo de la planilla"
              value={groupId}
              onChange={event => setGroupId(event.target.value)}
            >
              <option value="">Elegí el grupo…</option>
              {(grupos.data ?? []).map(grupo => (
                <option key={grupo._id} value={grupo._id}>
                  {grupo.name}
                  {grupo.period ? ` · ${grupo.period}` : ''}
                </option>
              ))}
            </NativeSelect>

            <input
              ref={archivo}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={event => void escanear(event.target.files?.[0])}
            />

            <Button variant="primary" disabled={!groupId} onClick={() => archivo.current?.click()}>
              <Camera className="size-4" aria-hidden />
              Elegir la foto de la planilla
            </Button>

            <p className="text-caption text-muted">
              La hoja debe salir completa y con la cuadrícula visible. Primera columna la
              cédula, segunda el nombre, y de la tercera en adelante una por clase.
            </p>

            {error && (
              <p className="flex items-start gap-2 text-body text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}
          </div>
        )}

        {paso === 'leyendo' && (
          <p className="flex items-center gap-2 py-8 text-body text-muted">
            <ScanLine className="size-4 animate-pulse" aria-hidden />
            Leyendo la planilla…
          </p>
        )}

        {(paso === 'revisar' || paso === 'guardando') && escaneo && (
          <div className="flex flex-col gap-4">
            {escaneo.avisos.map(aviso => (
              <p key={aviso} className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-caption text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {aviso}
              </p>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={sinIdentificar > 0 ? 'danger' : 'success'}>
                {filas.length - sinIdentificar} de {filas.length} identificados
              </Badge>
              {dudosas > 0 && <Badge tone="warning">{dudosas} por revisar</Badge>}
            </div>

            <div>
              <p className="mb-2 text-caption font-semibold text-text">
                ¿De qué fecha es cada columna?
              </p>
              <div className="flex flex-wrap gap-2">
                {fechas.map((fecha, indice) => (
                  <Input
                    key={indice}
                    type="date"
                    max={hoy()}
                    aria-label={`Fecha de la columna ${indice + 1}`}
                    value={fecha}
                    className="w-40"
                    onChange={event =>
                      setFechas(previas => previas.map((f, i) => (i === indice ? event.target.value : f)))
                    }
                  />
                ))}
                <Input
                  type="number"
                  min={30}
                  max={300}
                  step={5}
                  aria-label="Minutos por clase"
                  value={duracion}
                  className="w-28"
                  onChange={event => setDuracion(Number(event.target.value) || 90)}
                />
              </div>
              {fechasRepetidas && (
                <p className="mt-2 text-caption text-danger">
                  Hay fechas repetidas. Cada columna es una clase distinta; si se repiten, una
                  sobrescribiría a la otra.
                </p>
              )}
            </div>

            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-body">
                <thead className="sticky top-0 bg-surface-alt">
                  <tr>
                    <th className="p-2 text-left text-caption font-semibold">Estudiante</th>
                    {fechas.map((_, i) => (
                      <th key={i} className="p-2 text-caption font-semibold">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(fila => (
                    <tr key={fila.indice} className="border-t border-border">
                      <td className="p-2">
                        {fila.studentId ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{fila.fullName}</span>
                            <span className="flex items-center gap-1.5 text-caption text-muted">
                              {fila.code}
                              {fila.nivel !== 'exacta' && (
                                <Badge tone={NIVEL[fila.nivel].tono}>{NIVEL[fila.nivel].texto}</Badge>
                              )}
                            </span>
                            {fila.avisos.map(aviso => (
                              <span key={aviso} className="text-caption text-warning">
                                {aviso}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-caption text-danger">
                              Se leyó «{fila.cedulaLeida || fila.nombreLeido || 'nada'}» y no coincide con nadie.
                            </span>
                            <NativeSelect
                              aria-label={`Asignar la fila ${fila.indice + 1}`}
                              value=""
                              onChange={event => reasignar(fila.indice, event.target.value)}
                            >
                              <option value="">Elegí a quién corresponde…</option>
                              {escaneo.matriculados.map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.fullName} · {m.code}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>
                        )}
                      </td>
                      {fila.celdas.map(celda => (
                        <td key={celda.columna} className="p-2 text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            aria-label={`${fila.fullName ?? 'Sin asignar'}, clase ${celda.columna + 1}`}
                            checked={celda.presente}
                            onChange={() => cambiarCelda(fila.indice, celda.columna)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sinIdentificar > 0 && (
              <p className="text-caption text-muted">
                Las filas sin asignar no se guardan. Podés asignarlas o dejarlas y registrarlas
                después a mano.
              </p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={reiniciar}>
                <RefreshCw className="size-4" aria-hidden />
                Otra foto
              </Button>
              <Button
                variant="primary"
                loading={paso === 'guardando'}
                disabled={
                  paso === 'guardando' ||
                  fechasIncompletas ||
                  fechasRepetidas ||
                  filas.every(f => !f.studentId)
                }
                onClick={() => void guardar()}
              >
                <Check className="size-4" aria-hidden />
                Guardar asistencia
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
