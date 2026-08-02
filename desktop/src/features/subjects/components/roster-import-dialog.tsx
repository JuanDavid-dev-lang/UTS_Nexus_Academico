import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileUp, Search, UserPlus, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/shared/ui';
import { NativeSelect } from '@/shared/ui';
import { parseRoster } from '@/domain/roster/parse-roster';
import { useStudents, useStudentSearch } from '@/features/students/hooks/use-students';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useEnrollStudent, useImportRoster } from '../hooks/use-enrollment';
import { useGroups } from '../hooks/use-subjects';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
};

/**
 * Importa una lista de estudiantes a un grupo, o añade uno que ya existe.
 *
 * Nunca importa a ciegas: primero muestra qué se leyó, qué líneas fallaron y
 * cuántas cédulas venían repetidas, y solo entonces habilita el botón. Un
 * docente que pega una lista mal formateada tiene que verlo antes de matricular,
 * no después.
 */
export function RosterImportDialog({ open, onOpenChange, subjectId, subjectName }: Props) {
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [chosenGroup, setChosenGroup] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const debouncedTerm = useDebounce(term, 300);
  const search = useStudentSearch(debouncedTerm);
  const importRoster = useImportRoster();
  const enrollStudent = useEnrollStudent();

  // La matrícula cuelga del grupo, no de la materia: una materia con dos grupos
  // tiene dos listas distintas y hay que decir a cuál se importa.
  const groupsQuery = useGroups();
  const groups = useMemo(
    () => (groupsQuery.data ?? []).filter((group) => group.subjectId === subjectId),
    [groupsQuery.data, subjectId],
  );
  const groupId = chosenGroup || groups[0]?._id || '';

  // Quiénes ya están dentro, para no ofrecer matricular dos veces a la misma persona.
  const enrolledQuery = useStudents(groupId ? { groupId } : undefined);
  const enrolled = useMemo(
    () => new Set((groupId ? enrolledQuery.data ?? [] : []).map((student) => student.code)),
    [enrolledQuery.data, groupId],
  );

  const parsed = useMemo(() => parseRoster(text), [text]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
  }

  function close() {
    setText('');
    setTerm('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Estudiantes de ${subjectName}`}
        description="Importa una lista completa o busca a alguien que ya esté registrado."
        className="max-w-2xl"
      >
        {!groupsQuery.isLoading && groups.length === 0 && (
          <p className="rounded-lg border border-border bg-surface-alt p-3 text-body text-muted">
            Esta materia todavía no tiene grupos. Crea uno antes de matricular: la lista de
            estudiantes pertenece al grupo, no a la materia.
          </p>
        )}

        {groups.length > 1 && (
          <NativeSelect
            className="mb-1"
            aria-label="Grupo al que se matricula"
            value={groupId}
            onChange={(event) => setChosenGroup(event.target.value)}
          >
            {groups.map((group) => (
              <option key={group._id} value={group._id}>
                {group.name}
                {group.period ? ` · ${group.period}` : ''}
              </option>
            ))}
          </NativeSelect>
        )}

        <Tabs defaultValue="import">
          <TabsList>
            <TabsTrigger value="import">
              <FileUp className="size-4" aria-hidden />
              Importar lista
            </TabsTrigger>
            <TabsTrigger value="search">
              <Search className="size-4" aria-hidden />
              Buscar existente
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="flex flex-col gap-3 pt-4">
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
                <FileUp className="size-4" aria-hidden />
                Abrir archivo CSV
              </Button>
              <span className="text-caption text-muted">o pega la lista abajo</span>
            </div>

            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={'1098765432;Pepito Pérez\n1098765433;Ana Gómez'}
              aria-label="Lista de estudiantes"
            />

            <p className="text-caption text-muted">
              Una línea por estudiante: cédula y nombre. Sirve punto y coma, coma o tabulación, y da
              igual el orden de las dos columnas.
            </p>

            {text.trim().length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-alt p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={parsed.rows.length > 0 ? 'success' : 'neutral'}>
                    {parsed.rows.length} para matricular
                  </Badge>
                  {parsed.duplicates > 0 && (
                    <Badge tone="warning">{parsed.duplicates} cédula(s) repetida(s)</Badge>
                  )}
                  {parsed.errors.length > 0 && (
                    <Badge tone="danger">{parsed.errors.length} línea(s) con problema</Badge>
                  )}
                </div>

                {parsed.errors.length > 0 && (
                  <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                    {parsed.errors.map((error) => (
                      <li key={error.line} className="flex items-start gap-2 text-caption text-danger">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                          Línea {error.line}: {error.reason}{' '}
                          <span className="text-muted">«{error.raw}»</span>
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
                loading={importRoster.isPending}
                disabled={parsed.rows.length === 0 || importRoster.isPending || !groupId}
                onClick={() =>
                  importRoster.mutate(
                    { groupId, students: parsed.rows },
                    { onSuccess: close },
                  )
                }
              >
                <Users className="size-4" aria-hidden />
                Matricular {parsed.rows.length || ''}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="search" className="flex flex-col gap-3 pt-4">
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Nombre o cédula (mínimo 3 caracteres)"
              aria-label="Buscar estudiante"
              autoFocus
            />

            <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto">
              {debouncedTerm.trim().length < 3 && (
                <p className="py-6 text-center text-body text-muted">
                  Escribe al menos 3 caracteres para buscar.
                </p>
              )}

              {debouncedTerm.trim().length >= 3 && search.isFetching && (
                <p className="py-6 text-center text-body text-muted">Buscando…</p>
              )}

              {debouncedTerm.trim().length >= 3 &&
                !search.isFetching &&
                (search.data?.length ?? 0) === 0 && (
                  <p className="py-6 text-center text-body text-muted">
                    Nadie coincide con «{debouncedTerm}».
                  </p>
                )}

              {search.data?.map((student) => {
                const already = enrolled.has(student.code);
                return (
                  <div key={student._id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium text-text">{student.fullName}</p>
                      <p className="truncate text-caption text-muted">
                        {student.code}
                        {student.program ? ` · ${student.program}` : ''}
                      </p>
                    </div>
                    {already ? (
                      <Badge tone="neutral">Ya matriculado</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={enrollStudent.isPending || !groupId}
                        onClick={() => enrollStudent.mutate({ studentId: student._id, groupId })}
                      >
                        <UserPlus className="size-4" aria-hidden />
                        Matricular
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={close}>
                Listo
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
