import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CornerDownLeft,
  GraduationCap,
  Moon,
  Search,
  Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/shared/lib/cn';
import { Kbd } from '@/shared/ui/primitives';
import { queryKeys } from '@/core/api/query-keys';
import { studentRepository, subjectRepository } from '@/infrastructure/repositories/academic.repository';
import { agendaRepository } from '@/infrastructure/repositories/agenda.repository';
import { horaCampus, OFFSET_CAMPUS_POR_DEFECTO, rangoDeVista } from '@/domain/agenda/calendar';
import { useTheme } from '@/state/theme.store';
import { useDebounce } from '@/shared/hooks/use-debounce';

/**
 * Global command palette (Ctrl+K).
 *
 * One entry point for navigation, search and actions. It removes the "which
 * menu was that under?" problem that a nine-item sidebar creates as the app
 * grows, and it is the fastest path for a teacher who knows what they want.
 */

type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof Search;
  run: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const cycleTheme = useTheme((state) => state.cycle);
  const debouncedQuery = useDebounce(query, 150);

  // Entity search only runs while the palette is open, so the lists are not
  // fetched during normal navigation.
  const { data: students = [] } = useQuery({
    queryKey: queryKeys.students.list(),
    queryFn: () => studentRepository.list(),
    enabled: open,
    staleTime: 60_000,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: queryKeys.subjects.list(),
    queryFn: () => subjectRepository.list(),
    enabled: open,
    staleTime: 60_000,
  });

  // Agenda del próximo mes. Buscar "parcial" y llegar al parcial es la razón de
  // ser de la paleta: sin esto habría que abrir el calendario y navegar semanas.
  const rangoAgenda = useMemo(
    () => rangoDeVista('proximas', new Date(), OFFSET_CAMPUS_POR_DEFECTO),
    // Se fija al montar y no en cada render: recalcularlo cambiaría la clave de
    // caché cada milisegundo y dispararía una petición por pulsación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const { data: agenda } = useQuery({
    queryKey: queryKeys.agenda.range(rangoAgenda.desde.toISOString(), rangoAgenda.hasta.toISOString()),
    queryFn: () => agendaRepository.range(rangoAgenda),
    enabled: open,
    staleTime: 60_000,
  });

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onOpenChange(false);
    };

    const navigation: Command[] = [
      { id: 'nav-dashboard', label: 'Ir al panel', group: 'Navegación', icon: ArrowRight, run: go('/') },
      { id: 'nav-students', label: 'Ir a estudiantes', group: 'Navegación', icon: Users, run: go('/estudiantes') },
      { id: 'nav-subjects', label: 'Ir a materias', group: 'Navegación', icon: BookOpen, run: go('/materias') },
      { id: 'nav-grades', label: 'Ir a notas', group: 'Navegación', icon: GraduationCap, run: go('/notas') },
      { id: 'nav-agenda', label: 'Ir a la agenda', group: 'Navegación', icon: CalendarDays, run: go('/agenda') },
      { id: 'nav-attendance', label: 'Ir a asistencia', group: 'Navegación', icon: ArrowRight, run: go('/asistencia') },
      { id: 'nav-risk', label: 'Ir a riesgo académico', group: 'Navegación', icon: ArrowRight, run: go('/riesgo') },
      { id: 'nav-assistant', label: 'Abrir asistente IA', group: 'Navegación', icon: ArrowRight, run: go('/asistente') },
      { id: 'nav-reports', label: 'Ir a reportes', group: 'Navegación', icon: ArrowRight, run: go('/reportes') },
      {
        id: 'action-theme',
        label: 'Cambiar tema (claro / oscuro / automático)',
        group: 'Acciones',
        icon: Moon,
        run: () => {
          cycleTheme();
          onOpenChange(false);
        },
      },
    ];

    const term = debouncedQuery.trim().toLowerCase();
    if (term.length < 2) return navigation;

    const studentMatches: Command[] = students
      .filter(
        (student) =>
          student.fullName.toLowerCase().includes(term) || student.code.toLowerCase().includes(term),
      )
      .slice(0, 6)
      .map((student) => ({
        id: `student-${student._id}`,
        label: student.fullName,
        hint: `Cédula ${student.code}`,
        group: 'Estudiantes',
        icon: Users,
        run: () => {
          navigate(`/estudiantes?buscar=${encodeURIComponent(student.code)}`);
          onOpenChange(false);
        },
      }));

    const subjectMatches: Command[] = subjects
      .filter(
        (subject) =>
          subject.name.toLowerCase().includes(term) || subject.code.toLowerCase().includes(term),
      )
      .slice(0, 6)
      .map((subject) => ({
        id: `subject-${subject._id}`,
        label: subject.name,
        hint: `${subject.code} · ${subject.period}`,
        group: 'Materias',
        icon: BookOpen,
        run: () => {
          navigate(`/materias?buscar=${encodeURIComponent(subject.code)}`);
          onOpenChange(false);
        },
      }));

    const offset = agenda?.campusOffsetMinutes ?? OFFSET_CAMPUS_POR_DEFECTO;
    const agendaMatches: Command[] = (agenda?.items ?? [])
      .filter(
        (item) =>
          item.title.toLowerCase().includes(term) ||
          item.subjectName.toLowerCase().includes(term) ||
          item.classroom.toLowerCase().includes(term),
      )
      .slice(0, 6)
      .map((item) => ({
        id: `agenda-${item.id}`,
        label: item.title || item.subjectName,
        hint: `${item.date} · ${horaCampus(item.startAt, offset)}${item.classroom ? ` · ${item.classroom}` : ''}`,
        group: 'Agenda',
        icon: CalendarDays,
        run: () => {
          // El parámetro `item` abre directamente ese elemento en la agenda.
          navigate(`/agenda?item=${encodeURIComponent(item.id)}`);
          onOpenChange(false);
        },
      }));

    return [...studentMatches, ...subjectMatches, ...agendaMatches, ...navigation];
  }, [debouncedQuery, students, subjects, agenda, navigate, onOpenChange, cycleTheme]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(term) || command.hint?.toLowerCase().includes(term),
    );
  }, [commands, query]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Keeps the highlighted row inside the visible scroll area.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(results.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      results[activeIndex]?.run();
    }
  }

  let lastGroup = '';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="anim-popup fixed left-1/2 top-[18%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Búsqueda global</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Busca estudiantes, materias y acciones. Navega con las flechas y confirma con Enter.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar estudiantes, materias o acciones…"
              className="h-12 flex-1 bg-transparent text-body text-text outline-none placeholder:text-muted"
              aria-label="Buscar"
            />
            <Kbd>Esc</Kbd>
          </div>

          <div ref={listRef} className="scrollbar-slim max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-body text-muted">
                Sin resultados para “{query}”.
              </p>
            ) : (
              results.map((command, index) => {
                const showGroup = command.group !== lastGroup;
                lastGroup = command.group;

                return (
                  <div key={command.id}>
                    {showGroup ? (
                      <p className="px-3 pb-1 pt-3 text-caption font-bold uppercase tracking-wide text-muted">
                        {command.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      data-index={index}
                      onClick={command.run}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-body transition-colors',
                        index === activeIndex ? 'bg-primary/10 text-primary' : 'text-text',
                      )}
                    >
                      <command.icon className="size-4 shrink-0 opacity-70" aria-hidden />
                      <span className="flex-1 truncate">{command.label}</span>
                      {command.hint ? (
                        <span className="shrink-0 text-caption text-muted">{command.hint}</span>
                      ) : null}
                      {index === activeIndex ? (
                        <CornerDownLeft className="size-3.5 shrink-0 opacity-60" aria-hidden />
                      ) : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
