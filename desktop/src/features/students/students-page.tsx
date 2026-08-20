import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, History, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  ErrorState,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonTable,
  Tooltip,
  type Column,
} from '@/shared/ui';
import { Avatar } from '@/shared/ui/primitives';
import { StudentFormDialog } from '@/features/students/components/student-form-dialog';
import { StudentTimeline } from '@/features/students/components/student-timeline';
import { periodosRepository } from '@/infrastructure/repositories/administracion.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useQuery } from '@tanstack/react-query';
import {
  useCreateStudent,
  useDeleteStudent,
  useStudents,
  useUpdateStudent,
} from '@/features/students/hooks/use-students';
import { useSubjects } from '@/features/subjects/hooks/use-subjects';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import type { Student, StudentInput } from '@/domain/schemas/academic';

export default function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('buscar') ?? '');
  const debouncedQuery = useDebounce(query, 200);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | undefined>(undefined);
  const [deleting, setDeleting] = useState<Student | null>(null);
  /**
   * Estudiante cuyo historial se está viendo.
   *
   * El historial va en un diálogo y no en una pantalla aparte porque se
   * consulta DESDE la lista: obligar a navegar y volver por cada estudiante
   * convierte una revisión de cinco fichas en diez cambios de pantalla.
   */
  const [historial, setHistorial] = useState<Student | null>(null);
  const [subjectFilter, setSubjectFilter] = useState(searchParams.get('materia') ?? '');

  const role = useUserRole();
  const canWrite = can(role, 'students.write');
  const canDelete = can(role, 'students.delete');

  // Filtrar por materia se hace en el backend, no aquí: la lista de una
  // asignatura sale de la matrícula, y recortar en el cliente una lista ya
  // mezclada daría el conjunto equivocado en cuanto un estudiante repita materia.
  const subjects = useSubjects();
  const students = useStudents(subjectFilter ? { subjectId: subjectFilter } : undefined);
  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent();
  const deleteStudent = useDeleteStudent();

  const filtered = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    if (!term) return students.data ?? [];

    return (students.data ?? []).filter(
      (student) =>
        student.fullName.toLowerCase().includes(term) ||
        student.code.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term) ||
        student.program.toLowerCase().includes(term),
    );
  }, [students.data, debouncedQuery]);

  const columns = useMemo<Column<Student>[]>(() => {
    const base: Column<Student>[] = [
      {
        key: 'student',
        header: 'Estudiante',
        width: '2fr',
        sortValue: (row) => row.fullName,
        cell: (row) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.fullName} src={row.photoUrl} size="sm" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{row.fullName}</span>
              <span className="truncate text-caption text-muted">{row.email || 'Sin correo'}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'code',
        header: 'Cédula',
        width: '1fr',
        sortValue: (row) => row.code,
        // `tabular`: sin cifras de ancho fijo, una columna de cédulas se
        // desalinea en cada fila que lleve un 1 y deja de leerse como columna.
        cell: (row) => <span className="font-mono tabular text-caption">{row.code}</span>,
      },
      {
        key: 'program',
        header: 'Programa',
        width: '1.5fr',
        sortValue: (row) => row.program,
        cell: (row) =>
          row.program ? (
            <Badge size="sm" className="max-w-full">
              <span className="truncate">{row.program}</span>
            </Badge>
          ) : (
            <span className="text-subtle">—</span>
          ),
      },
    ];

    /*
     * La columna de acciones existe siempre: el historial no es una operación
     * de escritura, así que un rol que solo lee tiene que poder abrirlo. Antes
     * la columna entera dependía de `canWrite || canDelete`, y añadir el
     * historial dentro lo habría escondido justo para quien más lo consulta.
     */
    base.push({
      key: 'actions',
      header: 'Acciones',
      width: '140px',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Tooltip content="Ver historial académico">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Ver el historial de ${row.fullName}`}
              onClick={(event) => {
                event.stopPropagation();
                setHistorial(row);
              }}
            >
              <History aria-hidden />
            </Button>
          </Tooltip>

          {canWrite || canDelete ? (
            <>
            {canWrite ? (
              <Tooltip content="Editar">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${row.fullName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(row);
                    setFormOpen(true);
                  }}
                >
                  <Pencil aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
            {canDelete ? (
              <Tooltip content="Eliminar">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${row.fullName}`}
                  className="text-danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleting(row);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
            </>
          ) : null}
        </div>
      ),
    });

    return base;
  }, [canWrite, canDelete]);

  function handleSubmit(input: StudentInput) {
    if (editing) {
      updateStudent.mutate(
        { id: editing._id, input },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createStudent.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  }

  const periodos = useQuery({
    queryKey: queryKeys.periods.list(),
    queryFn: () => periodosRepository.list(),
    // Solo cuando hace falta: la lista de estudiantes no necesita periodos.
    enabled: historial !== null,
    staleTime: 5 * 60_000,
  });

  function handleSearch(value: string) {
    setQuery(value);
    // Keeping the term in the URL lets the command palette deep-link here.
    setSearchParams(value ? { buscar: value } : {}, { replace: true });
  }

  function handleSubjectFilter(value: string) {
    setSubjectFilter(value);
    // La materia también viaja en la URL para poder enlazar a una lista concreta.
    setSearchParams(
      {
        ...(query ? { buscar: query } : {}),
        ...(value ? { materia: value } : {}),
      },
      { replace: true },
    );
  }

  const materiaActiva = subjects.data?.find((subject) => subject._id === subjectFilter);
  const hayFiltros = Boolean(subjectFilter || query);

  return (
    <PageContainer>
      <PageHeader
        // El contexto sube al antetítulo. Metido en el subtítulo competía con
        // la explicación de la pantalla, y la materia por la que se está
        // filtrando es exactamente el dato que hay que ver antes de leer nada
        // más: sin él, una lista de doce estudiantes parece la lista completa.
        {...(materiaActiva
          ? {
              eyebrow: (
                <>
                  <BookOpen className="size-3.5" aria-hidden />
                  {materiaActiva.name}
                </>
              ),
            }
          : {})}
        title="Estudiantes"
        subtitle={
          subjectFilter
            ? `${students.data?.length ?? 0} matriculados en esta materia`
            : `${students.data?.length ?? 0} estudiantes en tu alcance académico`
        }
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus aria-hidden />
              Nuevo estudiante
            </Button>
          ) : null
        }
      />

      {/*
        Los filtros van en un pozo y no sueltos sobre el fondo. Sueltos, el
        campo de búsqueda y el desplegable eran dos controles flotando entre el
        título y la tabla, sin nada que dijera que van juntos ni que lo que
        hacen es acotar lo de abajo.
      */}
      <div className="surface-well flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Buscar por nombre, cédula, correo o programa…"
            aria-label="Buscar estudiantes"
            className="pl-9"
          />
        </div>

        <NativeSelect
          className="w-full @lg:w-64"
          aria-label="Filtrar por materia"
          value={subjectFilter}
          onChange={(event) => handleSubjectFilter(event.target.value)}
        >
          <option value="">Todas mis materias</option>
          {(subjects.data ?? []).map((subject) => (
            <option key={subject._id} value={subject._id}>
              {subject.name}
            </option>
          ))}
        </NativeSelect>

        {/* Solo cuando hay algo que limpiar: un botón permanentemente inactivo
            ocupa el mismo sitio y no comunica nada. */}
        {hayFiltros ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              setSubjectFilter('');
              setSearchParams({}, { replace: true });
            }}
          >
            <X aria-hidden />
            Limpiar
          </Button>
        ) : null}
      </div>

      {students.isPending ? (
        <SkeletonTable rows={10} columns={4} />
      ) : students.isError ? (
        <ErrorState error={students.error} onRetry={() => void students.refetch()} />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(row) => row._id}
          searchQuery={debouncedQuery}
          onClearSearch={() => handleSearch('')}
          emptyTitle="Todavía no tienes estudiantes"
          emptyMessage="Crea el primero o pide que te asignen un grupo."
        />
      )}

      <StudentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        student={editing}
        onSubmit={handleSubmit}
        submitting={createStudent.isPending || updateStudent.isPending}
      />

      <Dialog open={historial !== null} onOpenChange={(open) => !open && setHistorial(null)}>
        <DialogContent
          title={`Historial de ${historial?.fullName ?? ''}`}
          description="Matrículas, notas, ausencias, alertas y cierres en orden. Lo arma el servidor: aquí no se cruza nada."
          className="max-w-3xl"
        >
          {historial ? (
            <StudentTimeline
              studentId={historial._id}
              periodos={(periodos.data ?? []).map((registro) => registro.period)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="¿Eliminar estudiante?"
        description={`Se eliminará a ${deleting?.fullName ?? ''} junto con su historial de notas y asistencia. Esta acción no se puede deshacer.`}
        loading={deleteStudent.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteStudent.mutate(deleting._id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </PageContainer>
  );
}
