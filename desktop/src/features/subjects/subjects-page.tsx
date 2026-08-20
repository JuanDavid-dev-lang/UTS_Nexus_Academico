import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
  Tooltip,
} from '@/shared/ui';
import {
  useCreateGroup,
  useCreateSubject,
  useDeleteSubject,
  useSubjects,
  useUpdateSubject,
} from '@/features/subjects/hooks/use-subjects';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useCurrentUser, useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import { currentPeriod, recentPeriods } from '@/shared/lib/format';
import { subjectInputSchema, type Subject, type SubjectInput } from '@/domain/schemas/academic';
import { RosterImportDialog } from './components/roster-import-dialog';

const EMPTY: SubjectInput = { name: '', code: '', period: currentPeriod(), credits: 3 };

export default function SubjectsPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('buscar') ?? '');
  const debouncedQuery = useDebounce(query, 200);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [rosterFor, setRosterFor] = useState<Subject | null>(null);
  const [values, setValues] = useState<SubjectInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof SubjectInput, string>>>({});

  const user = useCurrentUser();
  const role = useUserRole();
  const canWrite = can(role, 'subjects.write');
  const canDelete = can(role, 'subjects.delete');

  const subjects = useSubjects();
  const createSubject = useCreateSubject();
  // El primer grupo nace con la materia: sin ningún grupo no se puede
  // matricular a nadie, y hasta ahora no había ningún sitio donde crear uno —
  // la importación de listas moría en «esta materia no tiene grupos». Se llama
  // como el código de la materia, que es como la UTS nombra los grupos: B191
  // no es «la materia y su grupo A», es el grupo en sí.
  const createGroup = useCreateGroup({ avisar: false });
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();

  useEffect(() => {
    if (!formOpen) return;
    setValues(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            period: editing.period,
            credits: editing.credits,
          }
        : EMPTY,
    );
    setErrors({});
  }, [formOpen, editing]);

  const filtered = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    const items = subjects.data ?? [];
    if (!term) return items;

    return items.filter(
      (subject) =>
        subject.name.toLowerCase().includes(term) ||
        subject.code.toLowerCase().includes(term) ||
        subject.period.toLowerCase().includes(term),
    );
  }, [subjects.data, debouncedQuery]);

  /** Grouping by period keeps the current semester visually separate. */
  const byPeriod = useMemo(() => {
    const groups = new Map<string, Subject[]>();
    for (const subject of filtered) {
      const list = groups.get(subject.period) ?? [];
      list.push(subject);
      groups.set(subject.period, list);
    }
    return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [filtered]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = subjectInputSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        code: fieldErrors.code?.[0],
        period: fieldErrors.period?.[0],
        credits: fieldErrors.credits?.[0],
      });
      return;
    }

    if (editing) {
      updateSubject.mutate(
        { id: editing._id, input: parsed.data },
        { onSuccess: () => setFormOpen(false) },
      );
      return;
    }

    if (!user) return;
    createSubject.mutate(
      { ...parsed.data, professorId: user.id },
      {
        onSuccess(subject) {
          setFormOpen(false);
          createGroup.mutate({ name: subject.code, subjectId: subject._id, period: subject.period });
        },
      },
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Materias"
        subtitle={`${subjects.data?.length ?? 0} materias registradas`}
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus aria-hidden />
              Nueva materia
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
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, código o periodo…"
          aria-label="Buscar materias"
          className="pl-9"
        />
      </div>

      {subjects.isPending ? (
        <SkeletonList rows={4} />
      ) : subjects.isError ? (
        <Card>
          <ErrorState error={subjects.error} onRetry={() => void subjects.refetch()} />
        </Card>
      ) : byPeriod.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin materias"
            message="Crea tu primera materia para empezar a registrar notas y asistencia."
            {...(canWrite
              ? {
                  action: {
                    label: 'Crear materia',
                    onClick: () => {
                      setEditing(null);
                      setFormOpen(true);
                    },
                  },
                }
              : {})}
          />
        </Card>
      ) : (
        byPeriod.map(([period, items]) => (
          <section key={period} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-body font-bold text-text">Periodo {period}</h3>
              <Badge>{items.length}</Badge>
            </div>

            <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {items.map((subject, index) => (
                <motion.article
                  key={subject._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.2) }}
                  className="surface-card group flex items-start gap-3 p-4 transition-shadow hover:shadow-md"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BookOpen className="size-5" aria-hidden />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h4 className="truncate text-body font-semibold text-text">{subject.name}</h4>
                    <p className="truncate text-caption text-muted">
                      {subject.code} · {subject.credits} créditos
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {canWrite ? (
                      <Tooltip content="Estudiantes de la materia">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Estudiantes de ${subject.name}`}
                          onClick={() => setRosterFor(subject)}
                        >
                          <Users aria-hidden />
                        </Button>
                      </Tooltip>
                    ) : null}
                    {canWrite ? (
                      <Tooltip content="Editar">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${subject.name}`}
                          onClick={() => {
                            setEditing(subject);
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
                          className="text-danger"
                          aria-label={`Eliminar ${subject.name}`}
                          onClick={() => setDeleting(subject)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </Tooltip>
                    ) : null}
                  </div>
                </motion.article>
              ))}
            </div>
          </section>
        ))
      )}

      {rosterFor ? (
        <RosterImportDialog
          open
          onOpenChange={(next) => !next && setRosterFor(null)}
          subjectId={rosterFor._id}
          subjectName={rosterFor.name}
        />
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          title={editing ? 'Editar materia' : 'Nueva materia'}
          description="Los datos académicos se comparten con la app móvil y los reportes."
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="Nombre de la materia" error={errors.name} required>
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  value={values.name}
                  onChange={(event) => setValues({ ...values, name: event.target.value })}
                  placeholder="Estructuras de Datos"
                />
              )}
            </Field>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Código" error={errors.code} required>
                {(props) => (
                  <Input
                    {...props}
                    value={values.code}
                    onChange={(event) => setValues({ ...values, code: event.target.value })}
                    placeholder="ED-201"
                  />
                )}
              </Field>

              <Field label="Periodo" error={errors.period} required>
                {(props) => (
                  <NativeSelect
                    {...props}
                    value={values.period}
                    onChange={(event) => setValues({ ...values, period: event.target.value })}
                  >
                    {recentPeriods(6).map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Créditos" error={errors.credits} required>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={0}
                    max={20}
                    value={values.credits}
                    onChange={(event) =>
                      setValues({ ...values, credits: Number(event.target.value) })
                    }
                  />
                )}
              </Field>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={createSubject.isPending || updateSubject.isPending}
              >
                {editing ? 'Guardar cambios' : 'Crear materia'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="¿Eliminar materia?"
        description={`Se eliminará "${deleting?.name ?? ''}" y sus notas asociadas dejarán de estar accesibles desde esta materia.`}
        loading={deleteSubject.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteSubject.mutate(deleting._id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </PageContainer>
  );
}
