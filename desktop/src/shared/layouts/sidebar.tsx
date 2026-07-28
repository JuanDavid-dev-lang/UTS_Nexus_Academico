import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CalendarCheck,
  ChevronLeft,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/ui/logo';
import { Tooltip } from '@/shared/ui/primitives';
import { useUserRole } from '@/state/session.store';
import { can, type Capability } from '@/core/auth/permissions';
import { useUnreadCount } from '@/features/notifications/hooks/use-notifications';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  capability?: Capability;
  /** Shows a live counter, e.g. unread notifications. */
  badge?: 'notifications';
};

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/estudiantes', label: 'Estudiantes', icon: Users, capability: 'students.read' },
  { to: '/materias', label: 'Materias', icon: BookOpen, capability: 'subjects.read' },
  { to: '/notas', label: 'Notas', icon: GraduationCap, capability: 'grades.read' },
  { to: '/asistencia', label: 'Asistencia', icon: CalendarCheck, capability: 'attendance.read' },
  { to: '/riesgo', label: 'Riesgo', icon: BarChart3, capability: 'analytics.risks' },
  { to: '/asistente', label: 'Asistente IA', icon: Bot, capability: 'assistant.use' },
  { to: '/reportes', label: 'Reportes', icon: FileSpreadsheet, capability: 'reports.export' },
  { to: '/notificaciones', label: 'Notificaciones', icon: Bell, badge: 'notifications' },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
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

  const items = NAV_ITEMS.filter((item) => !item.capability || can(role, item.capability));

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-surface',
        'transition-[width] duration-200 ease-out',
      )}
      style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
    >
      <div className="drag-region flex h-16 items-center gap-2.5 border-b border-border px-4">
        <Logo size={36} className="shrink-0" alt="" />
        {!collapsed ? (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold leading-tight text-text">UTS Nexus</span>
            <span className="truncate text-[11px] leading-tight text-muted">Académico</span>
          </div>
        ) : null}
      </div>

      <nav className="scrollbar-slim flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const badgeCount = item.badge === 'notifications' ? unread : 0;

          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  'transition-colors duration-150',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:bg-surface-alt hover:text-text',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <motion.span
                      layoutId="nav-active-indicator"
                      className="absolute left-0 h-5 w-1 rounded-r-full bg-primary"
                      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                    />
                  ) : null}
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                  {badgeCount > 0 ? (
                    <span
                      className={cn(
                        'grid min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white',
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
        })}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        className={cn(
          'flex items-center gap-2 border-t border-border px-4 py-3 text-xs font-medium text-muted',
          'transition-colors hover:bg-surface-alt hover:text-text',
          collapsed && 'justify-center px-0',
        )}
      >
        <ChevronLeft
          className={cn('size-4 transition-transform duration-200', collapsed && 'rotate-180')}
          aria-hidden
        />
        {!collapsed ? 'Contraer' : null}
      </button>
    </aside>
  );
}
