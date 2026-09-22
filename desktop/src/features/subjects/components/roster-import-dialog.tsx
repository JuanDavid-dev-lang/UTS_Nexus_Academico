import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileUp, Pencil, Plus, Search, UserPlus, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
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
import { enrollmentRepository } from '@/infrastructure/repositories/academic.repository';
import { toast } from '@/state/toast.store';
import { useStudents, useStudentSearch } from '@/features/students/hooks/use-students';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useEnrollStudent, useImportRoster } from '../hooks/use-enrollment';
import { useCreateGroup, useGroups, useRenameGroup, useSubjects } from '../hooks/use-subjects';
import { useRecorteWeb } from '@/shared/hooks/use-recorte-web';

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
  const [leyendo, setLeyendo] = useState(false);
  // En la versión web solo se lee lo que se lee aquí (CSV, texto): XLSX, PDF y
  // fotos pasan por el servidor y son de la aplicación.
  const recorteWeb = useRecorteWeb();
  const [nombreGrupo, setNombreGrupo] = useState('');
  /** Con grupos ya creados, el formulario de uno nuevo se abre a petición. */
  const [creandoOtro, setCreandoOtro] = useState(false);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const renameGroup = useRenameGroup();
  const fileInput = useRef<HTMLInputElement>(null);

  const debouncedTerm = useDebounce(term, 300);
  const search = useStudentSearch(debouncedTerm);
  const importRoster = useImportRoster();
  const enrollStudent = useEnrollStudent();

  // La matrícula cuelga del grupo, no de la materia: una materia con dos grupos
  // tiene dos listas distintas y hay que decir a cuál se importa.
  const groupsQuery = useGroups();
  const createGroup = useCreateGroup();
  // El periodo del grupo nuevo es el de la materia: es el único dato que el
  // diálogo no recibe y sin él el backend rechaza la creación.
  const subjectsQuery = useSubjects();
  const subjectData = subjectsQuery.data?.find((subject) => subject._id === subjectId);
  const subjectPeriod = subjectData?.period;
  // El grupo tiene su propia etiqueta —en la UTS, A194, A193, B212—, que no es
  // el código de la materia (PIS701). Antes se proponía el código de la materia
  // y así nacieron grupos imposibles de distinguir entre sí.
  const nombreGrupoFinal = nombreGrupo.trim().toUpperCase();
  const comoLaMateria = (nombre: string) =>
    Boolean(subjectData?.code) &&
    nombre.replace(/\s+/g, '').toUpperCase() === (subjectData?.code ?? '').replace(/\s+/g, '').toUpperCase();
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

  /**
   * Un CSV se lee aquí; un XLSX, PDF o una foto los interpreta el servidor.
   *
   * El resultado del reconocimiento cae en el MISMO cuadro de texto que la
   * lista pegada a mano, y por eso pasa por la misma revisión antes de
   * importarse. Es deliberado: una cédula mal leída no da error, crea un
   * estudiante que no existe y lo matricula, y eso se descubre semanas después
   * cuando alguien no aparece en el consolidado.
   */
  async function handleFile(file: File | undefined) {
    if (!file) return;

    const esTexto = /\.(csv|txt|tsv)$/i.test(file.name);
    if (esTexto) {
      setText(await file.text());
      return;
    }

    if (!groupId) {
      toast.warning('Elige primero el grupo', 'La lista se importa a un grupo concreto.');
      return;
    }

    setLeyendo(true);
    try {
      const lectura = await enrollmentRepository.scanRoster(groupId, file);

      /*
       * Se vuelca como texto para que el docente lo corrija donde ya sabe
       * corregir. Sin marcas dentro de la línea: `parseRoster` divide por
       * delimitador y cualquier anotación acabaría dentro del programa del
       * último estudiante. Las dudosas se nombran en el aviso, que es donde no
       * estorban.
       */
      setText(
        lectura.filas
          .map((fila) =>
            [fila.code, fila.fullName, fila.email ?? '', fila.program ?? '']
              .filter(Boolean)
              .join(';'),
          )
          .join('\n'),
      );

      const dudosas = lectura.filas.filter((fila) => fila.confianza < 0.7);
      if (dudosas.length > 0) {
        toast.warning(
          `${lectura.filas.length} filas leídas, ${dudosas.length} dudosas`,
          `Revisa: ${dudosas
            .slice(0, 3)
            .map((fila) => fila.fullName || fila.code || 'fila sin datos')
            .join(', ')}${dudosas.length > 3 ? '…' : ''}`,
        );
      } else {
        toast.success(
          `${lectura.filas.length} estudiantes leídos`,
          lectura.origen === 'pdf-texto'
            ? 'El PDF traía texto, así que no hubo reconocimiento que pueda fallar.'
            : 'Revisa la lista antes de importar.',
        );
      }
    } catch (error) {
      toast.fromError(error, 'No se pudo leer el archivo');
    } finally {
      setLeyendo(false);
    }
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
        {/*
          Antes esto era un callejón sin salida: el aviso decía «crea un grupo
          antes» y no existía ningún sitio en la aplicación donde crearlo. El
          grupo se crea aquí mismo, que es donde se descubre que falta.
        */}
        {!groupsQuery.isLoading && (groups.length === 0 || creandoOtro) && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-alt p-3">
            <p className="text-body text-muted">
              {groups.length === 0
                ? 'Esta materia todavía no tiene grupos, y la lista de estudiantes pertenece al grupo, no a la materia. Crea el primero con la etiqueta que le da la universidad:'
                : 'Nuevo grupo de esta materia, con la etiqueta que le da la universidad:'}
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={nombreGrupo}
                onChange={(event) => setNombreGrupo(event.target.value.toUpperCase())}
                placeholder="A194"
                maxLength={20}
                aria-label="Nombre del grupo nuevo"
                className="h-9 flex-1"
              />
              <Button
                variant="primary"
                size="sm"
                loading={createGroup.isPending}
                disabled={
                  !nombreGrupoFinal || comoLaMateria(nombreGrupoFinal) || !subjectPeriod || createGroup.isPending
                }
                onClick={() =>
                  createGroup.mutate(
                    { name: nombreGrupoFinal, subjectId, period: subjectPeriod ?? '' },
                    {
                      onSuccess: (group) => {
                        setChosenGroup(group._id);
                        setNombreGrupo('');
                        setCreandoOtro(false);
                      },
                    },
                  )
                }
              >
                Crear grupo
              </Button>
              {groups.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setCreandoOtro(false)}>
                  Cancelar
                </Button>
              ) : null}
            </div>
            {comoLaMateria(nombreGrupoFinal) ? (
              <p className="text-caption text-danger">
                Ese es el código de la materia. El grupo tiene su propia etiqueta, por ejemplo A194.
              </p>
            ) : null}
          </div>
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <NativeSelect
                className="flex-1"
                aria-label="Grupo"
                value={groupId}
                onChange={(event) => setChosenGroup(event.target.value)}
                disabled={groups.length === 1}
              >
                {groups.map((group) => (
                  <option key={group._id} value={group._id}>
                    Grupo {group.name}
                    {group.period ? ` · ${group.period}` : ''}
                  </option>
                ))}
              </NativeSelect>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRenombrando(groups.find((group) => group._id === groupId)?.name ?? '')}
                aria-label="Renombrar el grupo"
                title="Renombrar el grupo"
              >
                <Pencil aria-hidden />
              </Button>
              {!creandoOtro ? (
                <Button variant="secondary" size="sm" onClick={() => setCreandoOtro(true)}>
                  <Plus aria-hidden />
                  Otro grupo
                </Button>
              ) : null}
            </div>

            {/* Los grupos que nacieron con el código de la materia como nombre. */}
            {comoLaMateria(groups.find((group) => group._id === groupId)?.name ?? '') && renombrando === null ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-caption text-text">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                Este grupo se llama como la materia ({subjectData?.code}). Renómbralo con la etiqueta del grupo
                que da la universidad (por ejemplo A194): es la que ven los estudiantes al marcar asistencia.
              </p>
            ) : null}

            {renombrando !== null ? (
              <div className="flex items-center gap-2">
                <Input
                  value={renombrando}
                  onChange={(event) => setRenombrando(event.target.value.toUpperCase())}
                  placeholder="A194"
                  maxLength={20}
                  aria-label="Nuevo nombre del grupo"
                  className="h-9 flex-1"
                  autoFocus
                />
                <Button
                  variant="primary"
                  size="sm"
                  loading={renameGroup.isPending}
                  disabled={!renombrando.trim() || comoLaMateria(renombrando) || renameGroup.isPending}
                  onClick={() =>
                    renameGroup.mutate(
                      { id: groupId, name: renombrando.trim() },
                      { onSuccess: () => setRenombrando(null) },
                    )
                  }
                >
                  Guardar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRenombrando(null)}>
                  Cancelar
                </Button>
              </div>
            ) : null}
          </div>
        )}

        <Tabs defaultValue="lista">
          <TabsList>
            {/*
              La lista va primero: la pregunta más frecuente al abrir esto no
              es «cómo importo», es «quiénes están». Importar y buscar son las
              acciones que se hacen una vez por semestre.
            */}
            <TabsTrigger value="lista">
              <Users className="size-4" aria-hidden />
              Matriculados{groupId && enrolledQuery.data ? ` (${enrolledQuery.data.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="import">
              <FileUp className="size-4" aria-hidden />
              Importar lista
            </TabsTrigger>
            <TabsTrigger value="search">
              <Search className="size-4" aria-hidden />
              Buscar existente
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="flex flex-col gap-3 pt-4">
            {!groupId ? (
              <p className="py-6 text-center text-body text-muted">
                Crea o elige un grupo para ver su lista.
              </p>
            ) : enrolledQuery.isLoading ? (
              <p className="py-6 text-center text-body text-muted">Cargando la lista…</p>
            ) : (enrolledQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="Nadie matriculado todavía"
                message="Importa una lista o busca estudiantes ya registrados en las otras pestañas."
              />
            ) : (
              <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
                {(enrolledQuery.data ?? []).map((student) => (
                  <div key={student._id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium text-text">{student.fullName}</p>
                      <p className="truncate text-caption text-muted">
                        {student.code}
                        {student.program ? ` · ${student.program}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="import" className="flex flex-col gap-3 pt-4">
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={recorteWeb ? '.csv,.txt,.tsv' : '.csv,.txt,.tsv,.xlsx,.pdf,image/*'}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Se limpia para que elegir el mismo archivo otra vez vuelva
                  // a disparar el evento.
                  event.target.value = '';
                  void handleFile(file);
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={leyendo}
                onClick={() => fileInput.current?.click()}
              >
                <FileUp className="size-4" aria-hidden />
                {recorteWeb ? 'Abrir CSV' : 'Abrir XLSX, CSV, PDF o foto'}
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
