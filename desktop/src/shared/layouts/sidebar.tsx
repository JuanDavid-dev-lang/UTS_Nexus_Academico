import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Bell,
  BookMarked,
  CalendarRange,
  ClipboardList,
  ScrollText,
  Megaphone,
  MessageSquare,
  BookOpen,
  Bot,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/ui/logo';
import { Tooltip } from '@/shared/ui/primitives';
import { useUserRole } from '@/state/session.store';
import { can, type Capability } from '@/core/auth/permissions';
import { useUnreadCount } from '@/features/notifications/hooks/use-notifications';
import { profileRepository } from '@/infrastructure/repositories/profile.repository';
import { queryKeys } from '@/core/api/query-keys';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  capability?: Capability;
  /** Shows a live counter, e.g. unread notifications. */
  badge?: 'notifications';
  /**
   * Solo para docentes directores de trabajo de grado. No es una capability:
   * el gate no depende del rol sino de un flag de la ficha que activa la
   * administración. ADMIN/COORDINATOR lo ven siempre (gestionan los formatos).
   */
  requiresDirector?: boolean;
};

/**
 * El menú va agrupado, no en una lista de diecinueve entradas.
 *
 * Diecinueve destinos seguidos son diecinueve elementos que hay que descartar
 * uno a uno para encontrar el que se busca, y ninguno da ninguna pista de por
 * dónde empezar: «Auditoría» estaba entre «Periodos» y «Estado del sistema»
 * solo porque se añadieron en ese orden. Los grupos convierten la búsqueda en
 * dos pasos —qué estoy haciendo, luego cuál de estos— que es como se recuerda
 * un menú.
 *
 * El orden dentro de cada grupo sí es deliberado: lo que se usa a diario antes
 * que lo que se usa una vez por semestre.
 */
type NavGroup = {
  /** Sin título el grupo no dibuja cabecera: es el bloque de entrada. */
  title?: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ to: '/', label: 'Panel', icon: LayoutDashboard }],
  },
  {
    title: 'Docencia',
    items: [
      { to: '/materias', label: 'Materias', icon: BookOpen, capability: 'subjects.read' },
      { to: '/estudiantes', label: 'Estudiantes', icon: Users, capability: 'students.read' },
      { to: '/notas', label: 'Notas', icon: GraduationCap, capability: 'grades.read' },
      { to: '/asistencia', label: 'Asistencia', icon: CalendarCheck, capability: 'attendance.read' },
      // Las actividades van junto a la asistencia: son las dos cosas que un
      // docente registra a diario, y la agenda las muestra a las dos.
      { to: '/actividades', label: 'Actividades', icon: ClipboardList, capability: 'activities.read' },
      // La agenda cierra el grupo: es la otra forma de entrar a todo lo
      // anterior, por hora en vez de por asignatura.
      { to: '/agenda', label: 'Agenda', icon: CalendarDays },
      { to: '/trabajos-grado', label: 'Trabajos de grado', icon: BookMarked, requiresDirector: true },
    ],
  },
  {
    title: 'Seguimiento',
    items: [
      { to: '/riesgo', label: 'Riesgo', icon: BarChart3, capability: 'analytics.risks' },
      { to: '/asistente', label: 'Asistente IA', icon: Bot, capability: 'assistant.use' },
      { to: '/reportes', label: 'Reportes', icon: FileSpreadsheet, capability: 'reports.export' },
    ],
  },
  {
    title: 'Comunicación',
    items: [
      { to: '/notificaciones', label: 'Notificaciones', icon: Bell, badge: 'notifications' },
      { to: '/avisos', label: 'Avisos', icon: Megaphone },
      { to: '/sugerencias', label: 'Sugerencias', icon: MessageSquare },
    ],
  },
  {
    title: 'Administración',
    items: [
      { to: '/docentes', label: 'Docentes', icon: UserCog, capability: 'professors.manage' },
      { to: '/periodos', label: 'Periodos', icon: CalendarRange, capability: 'periods.close' },
      { to: '/auditoria', label: 'Auditoría', icon: ScrollText, capability: 'audit.read' },
      { to: '/estado-sistema', label: 'Estado del sistema', icon: Activity, capability: 'system.health' },
    ],
  },
];

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const role = useUserRole();
  const unread = useUnreadCount();

  // El flag vive en la ficha, no en el token: consultarlo aquí hace que
  // activarlo desde administración encienda el menú sin cerrar sesión (el
  // evento `professor` invalida `profile` y esta consulta se rehace).
  const perfil = useQuery({
    queryKey: queryKeys.profile.me(),
    queryFn: () => profileRepository.me(),
    enabled: role === 'PROFESSOR',
    staleTime: 60_000,
  });
  const esDirector = role === 'ADMIN' || role === 'COORDINATOR' || Boolean(perfil.data?.esDirectorTrabajoGrado);

  function visible(item: NavItem) {
    return (
      (!item.capability || can(role, item.capability)) &&
      (!item.requiresDirector || esDirector)
    );
  }

  // Un grupo entero puede quedarse sin entradas visibles —«Administración»
  // para un docente— y entonces no se dibuja: una cabecera de sección sobre
  // nada es un hueco que parece un fallo de carga.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(visible),
  })).filter((group) => group.items.length > 0);

  function renderItem(item: NavItem) {
    const badgeCount = item.badge === 'notifications' ? unread : 0;

    const link = (
      <NavLink
        data-tour={`nav-${item.to}`}
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) =>
          cn(
            'group relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-body font-medium',
            'transition-colors duration-200 ease-out',
            collapsed && 'justify-center px-0',
            isActive
              ? 'bg-primary-soft font-semibold text-primary'
              : 'text-muted hover:bg-surface-alt hover:text-text',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive ? (
              <motion.span
                layoutId="nav-active-indicator"
                className="absolute left-0 h-5 w-[3px] rounded-r-full bg-primary"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            ) : null}
            <item.icon className="size-4 shrink-0" aria-hidden />
            {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
            {badgeCount > 0 ? (
              <span
                className={cn(
                  'grid min-w-5 place-items-center rounded-full bg-danger px-1.5 text-caption font-bold tabular text-white',
                  collapsed && 'absolute right-2 top-1 min-w-4 px-1',
                )}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            ) : null}
          </>
        )}
      </NavLink>
    );

    // When collapsed the label is gone, so the tooltip becomes the only
    // way to know what an icon does.
    return collapsed ? (
      <Tooltip key={item.to} content={item.label} side="right">
        <div>{link}</div>
      </Tooltip>
    ) : (
      link
    );
  }

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-surface',
        'transition-[width] duration-200 ease-out',
      )}
      style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
    >
      <div className="drag-region flex h-16 items-center gap-2.5 border-b border-border px-4">
        <Logo size={34} className="shrink-0" alt="" />
        {!collapsed ? (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body font-bold leading-tight text-text">UTS Nexus</span>
            {/* El acento de marca aparece exactamente una vez en el menú, aquí.
                Repetido en cada sección dejaría de señalar nada. */}
            <span className="truncate text-caption font-semibold uppercase tracking-wide leading-tight text-accent-strong">
              Académico
            </span>
          </div>
        ) : null}
      </div>

      <nav className="scrollbar-slim flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {groups.map((group, index) => (
          <div key={group.title ?? 'principal'} className="flex flex-col gap-0.5">
            {group.title ? (
              collapsed ? (
                // Colapsado no hay sitio para la etiqueta, pero la separación
                // entre grupos sí se conserva: es la única pista que queda de
                // que estos iconos van juntos.
                <hr className="mx-3 my-2 border-t border-border" />
              ) : (
                <p
                  className={cn(
                    'px-3 pb-1 text-caption font-semibold uppercase tracking-wider text-subtle',
                    index > 0 && 'pt-3',
                  )}
                >
                  {group.title}
                </p>
              )
            ) : null}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border p-2">
        {/* Configuración vive al pie y no dentro de «Administración»: no es una
            tarea de administrar la institución, es la de ajustar esta copia de
            la aplicación, y se busca en la esquina donde se busca siempre. */}
        {renderItem({ to: '/configuracion', label: 'Configuración', icon: Settings })}

        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          className={cn(
            'flex items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-caption font-medium text-subtle',
            'transition-colors hover:bg-surface-alt hover:text-text',
            collapsed && 'justify-center px-0',
          )}
        >
          <ChevronLeft
            className={cn('size-4 shrink-0 transition-transform duration-200', collapsed && 'rotate-180')}
            aria-hidden
          />
          {!collapsed ? 'Contraer' : null}
        </button>
      </div>
    </aside>
  );
}
