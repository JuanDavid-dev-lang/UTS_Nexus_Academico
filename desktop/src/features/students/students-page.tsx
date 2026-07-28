import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Input,
  PageContainer,
  PageHeader,
  SkeletonTable,
  Tooltip,
  type Column,
} from '@/shared/ui';
import { Avatar } from '@/shared/ui/primitives';
import { StudentFormDialog } from '@/features/students/components/student-form-dialog';
import {
  useCreateStudent,
  useDeleteStudent,
  useStudents,
  useUpdateStudent,
} from '@/features/students/hooks/use-students';
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

  const role = useUserRole();
  const canWrite = can(role, 'students.write');
  const canDelete = can(role, 'students.delete');

  const students = useStudents();
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
              <span className="truncate text-xs text-muted">{row.email || 'Sin correo'}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'code',
        header: 'Cédula',
        width: '1fr',
        sortValue: (row) => row.code,
        cell: (row) => <span className="font-mono text-xs">{row.code}</span>,
      },
      {
        key: 'program',
        header: 'Programa',
        width: '1.5fr',
        sortValue: (row) => row.program,
        cell: (row) => <span className="text-muted">{row.program || '—'}</span>,
      },
    ];

    if (canWrite || canDelete) {
      base.push({
        key: 'actions',
        header: 'Acciones',
        width: '100px',
        align: 'right',
        cell: (row) => (
          <div className="flex justify-end gap-1">
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
          </div>
        ),
      });
    }

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

  function handleSearch(value: string) {
    setQuery(value);
    // Keeping the term in the URL lets the command palette deep-link here.
    setSearchParams(value ? { buscar: value } : {}, { replace: true });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Estudiantes"
        subtitle={`${students.data?.length ?? 0} estudiantes en tu alcance académico`}
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

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
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
