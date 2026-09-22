import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
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
  ChevronRight,
  ChevronsLeft,
  FileSpreadsheet,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Settings,
  Shield,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/ui/logo';
import { Tooltip } from '@/shared/ui/primitives';
import { useUserRole } from '@/state/session.store';
import { useAdminModeStore, useIsAdminModeActive } from '@/state/admin-mode.store';
import { can, type Capability } from '@/core/auth/permissions';
import { useUnreadCount } from '@/features/notifications/hooks/use-notifications';
import { profileRepository } from '@/infrastructure/repositories/profile.repository';
import { queryKeys } from '@/core/api/query-keys';
import type { PosicionMenu } from '@/domain/appearance/preferences';
import { rutaEnWeb } from '@/domain/platform/web-access';
import { esWeb } from '@/core/platform/tauri';

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
      { to: '/supervision-admin', label: 'Supervisión Cuentas y Docentes', icon: ShieldCheck, capability: 'staff.manage' },
      // Coordinación abre el grupo: para quien tiene ese rol es la pantalla de
      // entrada, no una herramienta ocasional.
      { to: '/coordinacion', label: 'Coordinación', icon: Building2, capability: 'coordination.read' },
      { to: '/personal', label: 'Personal', icon: UsersRound, capability: 'staff.manage' },
      { to: '/instituciones', label: 'Perfiles institucionales', icon: Landmark, capability: 'institutions.read' },
      { to: '/vinculos-uniplanner', label: 'Vínculos UniPlanner', icon: Smartphone, capability: 'uniplanner.links.read' },
      { to: '/docentes', label: 'Docentes', icon: UserCog, capability: 'professors.manage' },
      // Por `coordination.read` y no por `periods.close`: coordinación y
      // secretaría consultan el estado y el acta aunque no cierren nada.
      { to: '/periodos', label: 'Periodos', icon: CalendarRange, capability: 'coordination.read' },
      { to: '/auditoria', label: 'Auditoría', icon: ScrollText, capability: 'audit.read' },
      { to: '/estado-sistema', label: 'Estado del sistema', icon: Activity, capability: 'system.health' },
    ],
  },
];


/** Cómo se dibuja el menú según su posición. Todo lo que depende del lado vive aquí. */
const POR_POSICION: Record<
  PosicionMenu,
  {
    horizontal: boolean;
    borde: string;
    tooltip: 'right' | 'left' | 'top' | 'bottom';
    indicador: string;
  }
> = {
  izquierda: { horizontal: false, borde: 'border-r', tooltip: 'right', indicador: 'left-0 h-5 w-[3px] rounded-r-full' },
  derecha: { horizontal: false, borde: 'border-l', tooltip: 'left', indicador: 'right-0 h-5 w-[3px] rounded-l-full' },
  arriba: { horizontal: true, borde: 'border-b', tooltip: 'bottom', indicador: 'bottom-0 left-2 right-2 h-[3px] rounded-t-full' },
  abajo: { horizontal: true, borde: 'border-t', tooltip: 'top', indicador: 'top-0 left-2 right-2 h-[3px] rounded-b-full' },
};

export function Sidebar({
  collapsed: collapsedPedido,
  onToggle,
  position = 'izquierda',
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** Dónde está el menú. Arriba y abajo lo pintan como barra horizontal. */
  position?: PosicionMenu;
}) {
  const role = useUserRole();
  const unread = useUnreadCount();
  const forma = POR_POSICION[position];
  const horizontal = forma.horizontal;

  // Como barra, con etiquetas puede no caber (un ADMIN en modo admin tiene
  // 24 entradas): si el ancho que piden las etiquetas supera el disponible,
  // se compacta a iconos aunque nadie lo haya pedido. El ancho necesario se
  // mide solo mientras hay etiquetas; compactada ya no se puede medir, así
  // que se conserva el último valor y con él se decide cuándo volver.
  const navRef = useRef<HTMLElement>(null);
  const [anchoNecesario, setAnchoNecesario] = useState(0);
  const [anchoDisponible, setAnchoDisponible] = useState(Number.POSITIVE_INFINITY);
  const desborda = horizontal && anchoNecesario > anchoDisponible;
  const collapsed = collapsedPedido || desborda;
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!horizontal || !nav) return;
    const observador = new ResizeObserver(() => {
      setAnchoDisponible(nav.clientWidth);
      if (!collapsed) setAnchoNecesario(nav.scrollWidth);
    });
    observador.observe(nav);
    return () => observador.disconnect();
  }, [horizontal, collapsed]);

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

  const isAdminMode = useIsAdminModeActive();
  const { toggleAdminMode } = useAdminModeStore();

  function visible(item: NavItem) {
    if (role === 'ADMIN' && !isAdminMode) {
      if (
        item.to === '/supervision-admin' ||
        item.to === '/personal' ||
        item.to === '/instituciones' ||
        item.to === '/docentes' ||
        item.to === '/periodos' ||
        item.to === '/auditoria' ||
        item.to === '/estado-sistema'
      ) {
        return false;
      }
    }
    return (
      (!item.capability || can(role, item.capability)) &&
      (!item.requiresDirector || esDirector) &&
      // En la versión web, solo lo que la web ofrece (`domain/platform/web-access.ts`).
      rutaEnWeb(item.to, esWeb, role)
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
            horizontal && 'shrink-0 py-1.5',
            horizontal && !collapsed && 'pl-2.5',
            horizontal && collapsed && 'size-9',
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
                className={cn('absolute bg-primary', forma.indicador)}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            ) : null}
            <item.icon className="size-4 shrink-0" aria-hidden />
            {!collapsed ? <span className={cn('truncate', !horizontal && 'flex-1')}>{item.label}</span> : null}
            {badgeCount > 0 ? (
              <span
                className={cn(
                  'grid min-w-5 place-items-center rounded-full bg-danger px-1.5 text-caption font-bold tabular text-white',
                  collapsed && 'absolute right-2 top-1 min-w-4 px-1',
                  collapsed && horizontal && 'right-0 top-0',
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
      <Tooltip key={item.to} content={item.label} side={forma.tooltip}>
        <div>{link}</div>
      </Tooltip>
    ) : (
      link
    );
  }

  const cabecera = (
    <div
      className={cn(
        'drag-region flex items-center gap-2.5',
        horizontal ? 'h-full shrink-0 px-3' : 'h-16 border-b border-border px-4',
      )}
    >
      <Logo size={horizontal ? 30 : 34} className="shrink-0" alt="" />
      {!collapsed ? (
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-body font-bold leading-tight text-text">UTS Nexus</span>
            {role === 'ADMIN' && (
              <span
                className={cn(
                  'rounded px-1 text-[9px] font-bold uppercase tracking-wider',
                  isAdminMode
                    ? 'bg-primary/20 text-primary'
                    : 'bg-surface-alt text-muted',
                )}
                title={isAdminMode ? 'Modo Administrador activo' : 'Modo Normal activo'}
              >
                {isAdminMode ? 'Admin' : 'Normal'}
              </span>
            )}
          </div>
          {/* El acento de marca aparece exactamente una vez en el menú, aquí.
              Repetido en cada sección dejaría de señalar nada. */}
          {!horizontal ? (
            <span className="truncate text-caption font-semibold uppercase tracking-wide leading-tight text-accent-strong">
              Académico
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const botonAdmin =
    role === 'ADMIN' ? (
      <button
        type="button"
        onClick={toggleAdminMode}
        className={cn(
          'flex items-center rounded-lg text-caption font-medium transition-colors',
          horizontal ? 'shrink-0 gap-1.5 px-2 py-1.5' : 'mb-1 justify-between px-2.5 py-1.5',
          isAdminMode
            ? 'bg-primary-soft/60 text-primary hover:bg-primary-soft'
            : 'text-muted hover:bg-surface-alt hover:text-text',
        )}
        title="Alternar entre Modo Normal y Modo Administrador"
      >
        <span className="flex items-center gap-2">
          <Shield className="size-3.5 shrink-0" aria-hidden />
          {!collapsed || !horizontal ? <span>{isAdminMode ? 'Modo Admin' : 'Modo Normal'}</span> : null}
        </span>
        {!horizontal ? (
          <span className="rounded bg-primary/20 px-1 py-0.5 text-[9px] font-bold text-primary">
            {isAdminMode ? 'ACTIVO' : 'ACTIVAR'}
          </span>
        ) : null}
      </button>
    ) : null;

  const IconoContraer = horizontal ? ChevronsLeft : position === 'derecha' ? ChevronRight : ChevronLeft;
  const botonContraer = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
      className={cn(
        'flex items-center gap-3 rounded-lg text-caption font-medium text-subtle',
        'transition-colors hover:bg-surface-alt hover:text-text',
        horizontal ? 'size-9 shrink-0 justify-center' : 'py-2 pl-3 pr-2',
        collapsed && !horizontal && 'justify-center px-0',
      )}
    >
      <IconoContraer
        className={cn('size-4 shrink-0 transition-transform duration-200', collapsed && 'rotate-180')}
        aria-hidden
      />
      {!collapsed && !horizontal ? 'Contraer' : null}
    </button>
  );

  if (horizontal) {
    return (
      <aside
        className={cn('flex w-full shrink-0 items-center gap-1 border-border bg-surface', forma.borde)}
        style={{ height: 'var(--navbar-height)' }}
      >
        {cabecera}
        <nav ref={navRef} className="scrollbar-slim flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
          {groups.map((group, index) => (
            <div key={group.title ?? 'principal'} className="flex shrink-0 items-center gap-0.5">
              {/* Entre grupos, una raya vertical: es la única pista de que
                  estos iconos van juntos cuando no hay sitio para el título. */}
              {index > 0 ? <span className="mx-1 h-5 border-l border-border" aria-hidden /> : null}
              {group.items.map(renderItem)}
            </div>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-0.5 px-2">
          {botonAdmin}
          {renderItem({ to: '/configuracion', label: 'Configuración', icon: Settings })}
          {botonContraer}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-border bg-surface',
        forma.borde,
        'transition-[width] duration-200 ease-out',
      )}
      style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
    >
      {cabecera}

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
        {!collapsed ? botonAdmin : null}

        {/* Configuración vive al pie y no dentro de «Administración»: no es una
            tarea de administrar la institución, es la de ajustar esta copia de
            la aplicación, y se busca en la esquina donde se busca siempre. */}
        {renderItem({ to: '/configuracion', label: 'Configuración', icon: Settings })}

        {botonContraer}
      </div>
    </aside>
  );
}
