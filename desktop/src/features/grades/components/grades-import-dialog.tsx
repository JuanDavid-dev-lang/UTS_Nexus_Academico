import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileUp, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  NativeSelect,
  Textarea,
} from '@/shared/ui';
import { parseGrades } from '@/domain/grades/parse-grades';
import {
  gradeImportRepository,
} from '@/infrastructure/repositories/academic.repository';
import { queryKeys } from '@/core/api/query-keys';
import { toast } from '@/state/toast.store';
import { useStudents } from '@/features/students/hooks/use-students';
import { useGroups, useSubjects } from '@/features/subjects/hooks/use-subjects';
import type { CutNumber, NivelCoincidencia } from '@/domain/schemas/academic';

/**
 * Importación de calificaciones en dos pasos: entrada (pegar texto o subir
 * archivo) → revisión en tabla → escritura.
 *
 * La revisión no es ceremonia: una nota mal leída no da error, escribe una
 * calificación equivocada, y eso se descubre cuando el consolidado reprueba a
 * alguien que aprobó. Por eso confirmar exige mirar la tabla, y la respuesta
 * dice cuántas notas existentes se SOBRESCRIBIERON.
 */

type ComponentType = 'TRABAJOS' | 'PARCIALES' | 'AUTOEVALUACION';

type FilaRevision = {
  key: string;
  studentId: string | null;
  code: string;
  nombre: string;
  nivel: NivelCoincidencia;
  confianza: number;
  /** Como texto: el docente corrige en la celda y se valida al confirmar. */
  scores: string[];
  avisos: string[];
};

const NIVEL_BADGE: Record<NivelCoincidencia, { tono: 'success' | 'info' | 'warning' | 'danger'; texto: string }> = {
  exacta: { tono: 'success', texto: 'Exacta' },
  probable: { tono: 'info', texto: 'Probable' },
  dudosa: { tono: 'warning', texto: 'Dudosa' },
  'sin-coincidencia': { tono: 'danger', texto: 'Sin asignar' },
};

function parseCell(value: string): number | null | 'invalida' {
  const text = value.trim().replace(',', '.');
  if (!text) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return 'invalida';
  const numero = Number(text);
  return numero >= 0 && numero <= 5 ? numero : 'invalida';
}

export function GradesImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [chosenGroup, setChosenGroup] = useState('');
  const [corte, setCorte] = useState<CutNumber>(1);
  const [componentType, setComponentType] = useState<ComponentType>('PARCIALES');
  const [text, setText] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [revision, setRevision] = useState<FilaRevision[] | null>(null);
  const [avisosScan, setAvisosScan] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const groupsQuery = useGroups();
  const subjectsQuery = useSubjects();
  const groups = groupsQuery.data ?? [];
  const groupId = chosenGroup || groups[0]?._id || '';

  const subjectName = useMemo(() => {
    const group = groups.find((candidate) => candidate._id === groupId);
    const subject = (subjectsQuery.data ?? []).find((candidate) => candidate._id === group?.subjectId);
    return subject ? `${subject.name} (${subject.code})` : '';
  }, [groups, groupId, subjectsQuery.data]);

  // Matriculados del grupo, para cruzar el texto pegado por cédula.
  const enrolledQuery = useStudents(groupId ? { groupId } : undefined);

  const parsed = useMemo(() => parseGrades(text), [text]);

  const confirmar = useMutation({
    mutationFn: (input: Parameters<typeof gradeImportRepository.bulk>[0]) =>
      gradeImportRepository.bulk(input),
    onSuccess(result) {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.grades.all] });
      if (result.actualizadas > 0) {
        toast.warning(
          `${result.creadas} notas creadas, ${result.actualizadas} sobrescritas`,
          'Las sobrescritas tenían ya una nota con la misma etiqueta en este corte.',
        );
      } else {
        toast.success(`${result.creadas} notas creadas`, 'El consolidado ya las incluye.');
      }
      close();
    },
    onError(error) {
      toast.fromError(error, 'No se pudo importar');
    },
  });

  function close() {
    setText('');
    setRevision(null);
    setLabels([]);
    setAvisosScan([]);
    onOpenChange(false);
  }

  /** Paso texto → revisión: cruza por cédula exacta contra los matriculados. */
  function revisarTexto() {
    const enrolled = enrolledQuery.data ?? [];
    const porCedula = new Map(enrolled.map((student) => [student.code, student]));
    const columnas = Math.max(parsed.columns, 1);

    setLabels(Array.from({ length: columnas }, (_, i) => `Nota ${i + 1}`));
    setRevision(
      parsed.rows.map((row, index) => {
        const match = porCedula.get(row.code);
        return {
          key: `t-${index}`,
          studentId: match?._id ?? null,
          code: row.code,
          nombre: match?.fullName ?? row.fullName ?? '',
          nivel: match ? 'exacta' : 'sin-coincidencia',
          confianza: 1,
          scores: Array.from({ length: columnas }, (_, i) => {
            const value = row.scores[i];
            return value === null || value === undefined ? '' : String(value);
          }),
          avisos: match ? row.warnings : [...row.warnings, 'La cédula no está matriculada en este grupo.'],
        };
      }),
    );
    setAvisosScan([]);
  }

  /** CSV se queda en el textarea; Excel, PDF y foto van al servidor a proponer. */
  async function handleFile(file: File | undefined) {
    if (!file) return;

    if (/\.(csv|txt|tsv)$/i.test(file.name)) {
      setText(await file.text());
      return;
    }
    if (!groupId) {
      toast.warning('Elige primero el grupo', 'Las notas se importan a un grupo concreto.');
      return;
    }

    setLeyendo(true);
    try {
      const lectura = await gradeImportRepository.scan({ groupId, archivo: file });
      const columnas = Math.max(lectura.columnas, 1);
      setLabels(Array.from({ length: columnas }, (_, i) => `Nota ${i + 1}`));
      setRevision(
        lectura.filas.map((fila) => ({
          key: `s-${fila.indice}`,
          studentId: fila.studentId,
          code: fila.code ?? fila.cedulaLeida,
          nombre: fila.fullName ?? fila.nombreLeido,
          nivel: fila.nivel,
          confianza: fila.confianza,
          scores: Array.from({ length: columnas }, (_, i) => {
            const value = fila.notas[i];
            return value === null || value === undefined ? '' : String(value);
          }),
          avisos: fila.avisos,
        })),
      );
      setAvisosScan(lectura.avisos);
    } catch (error) {
      toast.fromError(error, 'No se pudo leer el archivo');
    } finally {
      setLeyendo(false);
    }
  }

  // ── Estado de la revisión ─────────────────────────────────────────────────
  const dudosas = (revision ?? []).filter(
    (fila) => fila.studentId && (fila.confianza < 0.7 || fila.nivel === 'dudosa' || fila.nivel === 'probable'),
  ).length;
  const sinAsignar = (revision ?? []).filter((fila) => !fila.studentId).length;
  const celdasInvalidas = (revision ?? []).reduce(
    (total, fila) => total + fila.scores.filter((cell) => parseCell(cell) === 'invalida').length,
    0,
  );
  const importables = (revision ?? []).filter(
    (fila) => fila.studentId && fila.scores.some((cell) => typeof parseCell(cell) === 'number'),
  );

  function handleConfirm() {
    confirmar.mutate({
      groupId,
      corte,
      componentType,
      labels: labels.map((label, i) => label.trim() || `Nota ${i + 1}`),
      filas: importables.map((fila) => ({
        studentId: fila.studentId as string,
        scores: fila.scores.map((cell) => {
          const value = parseCell(cell);
          return typeof value === 'number' ? value : null;
        }),
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : close())}>
      <DialogContent
        title="Importar calificaciones"
        description="Pega las notas o sube un Excel, un PDF o una foto de la planilla. Nada se guarda hasta que revises."
        className="max-w-4xl"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Grupo" className="min-w-56 flex-1">
              {(props) => (
                <NativeSelect {...props} value={groupId} onChange={(event) => { setChosenGroup(event.target.value); setRevision(null); }}>
                  {groups.map((group) => (
                    <option key={group._id} value={group._id}>
                      {group.name}
                      {group.period ? ` · ${group.period}` : ''}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Corte" className="w-28">
              {(props) => (
                <NativeSelect {...props} value={corte} onChange={(event) => setCorte(Number(event.target.value) as CutNumber)}>
                  <option value={1}>Corte 1</option>
                  <option value={2}>Corte 2</option>
                  <option value={3}>Corte 3</option>
                </NativeSelect>
              )}
            </Field>
            <Field label="Componente" className="w-44">
              {(props) => (
                <NativeSelect {...props} value={componentType} onChange={(event) => setComponentType(event.target.value as ComponentType)}>
                  <option value="TRABAJOS">Trabajos (30%)</option>
                  <option value="PARCIALES">Parciales (60%)</option>
                  <option value="AUTOEVALUACION">Autoevaluación (10%)</option>
                </NativeSelect>
              )}
            </Field>
          </div>
          {subjectName ? (
            <p className="-mt-2 text-caption text-muted">Materia del grupo: {subjectName}</p>
          ) : null}

          {revision === null ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.txt,.tsv,.xlsx,.xls,.pdf,image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void handleFile(file);
                  }}
                />
                <Button variant="secondary" size="sm" loading={leyendo} onClick={() => fileInput.current?.click()}>
                  <FileUp className="size-4" aria-hidden />
                  Abrir Excel, CSV, PDF o foto
                </Button>
                <span className="text-caption text-muted">o pega las notas abajo</span>
              </div>

              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={'1098765432;Pepito Pérez;4,5;3.0\n1098765433;Ana Gómez;3.8;2.5'}
                aria-label="Notas pegadas"
              />
              <p className="text-caption text-muted">
                Una línea por estudiante: cédula y una o más notas de 0 a 5 (el nombre es opcional).
                Sirve punto y coma, coma o tabulación.
              </p>

              {text.trim().length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-alt p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={parsed.rows.length > 0 ? 'success' : 'neutral'}>
                      {parsed.rows.length} filas · {parsed.columns} columna(s) de nota
                    </Badge>
                    {parsed.duplicates > 0 && <Badge tone="warning">{parsed.duplicates} cédula(s) repetida(s)</Badge>}
                    {parsed.errors.length > 0 && <Badge tone="danger">{parsed.errors.length} línea(s) con problema</Badge>}
                  </div>
                  {parsed.errors.length > 0 && (
                    <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                      {parsed.errors.map((error) => (
                        <li key={error.line} className="flex items-start gap-2 text-caption text-danger">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          <span>
                            Línea {error.line}: {error.reason} <span className="text-muted">«{error.raw}»</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={close}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  disabled={parsed.rows.length === 0 || !groupId || enrolledQuery.isPending}
                  onClick={revisarTexto}
                >
                  Revisar {parsed.rows.length || ''}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">{importables.length} listas para importar</Badge>
                {dudosas > 0 && <Badge tone="warning">{dudosas} dudosa(s): revísalas</Badge>}
                {sinAsignar > 0 && <Badge tone="danger">{sinAsignar} sin asignar (no se importan)</Badge>}
                {celdasInvalidas > 0 && <Badge tone="danger">{celdasInvalidas} celda(s) inválida(s)</Badge>}
              </div>
              {avisosScan.map((aviso) => (
                <p key={aviso} className="text-caption text-warning">
                  {aviso}
                </p>
              ))}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-body">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt text-left">
                      <th className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-muted">Estudiante</th>
                      <th className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-muted">Coincidencia</th>
                      {labels.map((label, i) => (
                        <th key={i} className="px-2 py-1.5">
                          <Input
                            value={label}
                            aria-label={`Etiqueta de la columna ${i + 1}`}
                            onChange={(event) =>
                              setLabels((previas) => previas.map((previa, j) => (j === i ? event.target.value : previa)))
                            }
                            className="h-8 w-24"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revision.map((fila) => (
                      <tr key={fila.key} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-text">{fila.nombre || '—'}</p>
                          <p className="text-caption text-muted">{fila.code || fila.key}</p>
                          {fila.avisos.map((aviso) => (
                            <p key={aviso} className="text-caption text-warning">
                              {aviso}
                            </p>
                          ))}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={NIVEL_BADGE[fila.nivel].tono}>{NIVEL_BADGE[fila.nivel].texto}</Badge>
                        </td>
                        {fila.scores.map((cell, i) => (
                          <td key={i} className="px-2 py-1.5">
                            <Input
                              value={cell}
                              aria-label={`${labels[i] ?? `Nota ${i + 1}`} de ${fila.nombre || fila.code}`}
                              aria-invalid={parseCell(cell) === 'invalida'}
                              disabled={!fila.studentId}
                              onChange={(event) =>
                                setRevision((previas) =>
                                  (previas ?? []).map((previa) =>
                                    previa.key === fila.key
                                      ? { ...previa, scores: previa.scores.map((s, j) => (j === i ? event.target.value : s)) }
                                      : previa,
                                  ),
                                )
                              }
                              className="h-8 w-16 text-center"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setRevision(null)} disabled={confirmar.isPending}>
                  Volver
                </Button>
                <Button
                  variant="primary"
                  loading={confirmar.isPending}
                  disabled={importables.length === 0 || celdasInvalidas > 0}
                  onClick={handleConfirm}
                >
                  <Upload className="size-4" aria-hidden />
                  Importar {importables.length || ''} al corte {corte}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
