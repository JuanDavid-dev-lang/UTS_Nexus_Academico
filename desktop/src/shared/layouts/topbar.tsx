import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  LogOut,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Sun,
  User as UserIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/shared/lib/cn';
import { Avatar, Kbd, Tooltip } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { useSession } from '@/state/session.store';
import { useSync } from '@/state/sync.store';
import { useTheme, type ThemePreference } from '@/state/theme.store';
import { modKeyLabel } from '@/shared/hooks/use-hotkeys';

/**
 * Los cuatro estados que el docente necesita distinguir.
 *
 * «Reconectando» va aparte de «conectando»: durante un corte a mitad de sesión
 * lo que hay en pantalla sigue siendo válido y solo deja de actualizarse; en el
 * arranque, en cambio, todavía no hay nada. Verlos iguales llevaba a recargar a
 * mano por si acaso.
 */
const SYNC_PRESENTATION = {
  connected: { label: 'Sincronizado', tone: 'text-success', dot: 'bg-success', Icon: Wifi },
  connecting: { label: 'Conectando…', tone: 'text-warning', dot: 'bg-warning', Icon: RefreshCw },
  reconnecting: { label: 'Reconectando…', tone: 'text-warning', dot: 'bg-warning', Icon: RefreshCw },
  disconnected: { label: 'Sin conexión', tone: 'text-muted', dot: 'bg-border-strong', Icon: WifiOff },
  error: {
    label: 'Sin conexión con el servidor',
    tone: 'text-danger',
    dot: 'bg-danger',
    Icon: WifiOff,
  },
} as const;

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Automático', Icon: Monitor },
];

const menuContentClass = cn(
  'z-50 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-pop',
);

const menuItemClass = cn(
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body text-text outline-none',
  'transition-colors data-[highlighted]:bg-surface-alt',
);

export function TopBar({
  title,
  subtitle,
  onOpenSearch,
  onOpenNav,
}: {
  title: string;
  subtitle: string;
  onOpenSearch: () => void;
  /** Solo en ventanas estrechas, donde el menú lateral pasa a ser un cajón. */
  onOpenNav?: () => void;
}) {
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);
  const syncStatus = useSync((state) => state.status);
  const syncDetail = useSync((state) => state.detail);
  const preference = useTheme((state) => state.preference);
  const setPreference = useTheme((state) => state.setPreference);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const sync = SYNC_PRESENTATION[syncStatus];

  async function handleLogout() {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <header
      className={cn(
        // Vidrio y no color sólido: la barra queda sobre el contenido que se
        // desplaza por debajo, y el desenfoque es lo que deja claro que hay
        // algo pasando ahí abajo sin dejar que compita con el título.
        'surface-glass drag-region relative z-20 flex h-16 shrink-0 items-center gap-3 px-4 xl:px-6',
        'border-x-0 border-t-0',
      )}
    >
      {onOpenNav ? (
        <Button
          variant="ghost"
          size="icon"
          className="no-drag shrink-0"
          onClick={onOpenNav}
          aria-label="Abrir menú"
        >
          <Menu aria-hidden />
        </Button>
      ) : null}

      <div className="flex min-w-0 flex-col">
        {/* Not a heading: this repeats the page title as window chrome, and the
            page body already carries the document's only h1. */}
        <p className="truncate text-body font-bold leading-tight text-text">{title}</p>
        <p className="truncate text-caption leading-tight text-muted">{subtitle}</p>
      </div>

      <div className="flex-1" />

      {/* Global search - the fastest path to any student, subject or action. */}
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Buscar"
        className={cn(
          // El buscador cede ancho antes que el título: a 900px, 288px fijos
          // empujaban el nombre de la pantalla fuera de la barra.
          'no-drag group flex h-9 w-9 items-center gap-2 rounded-lg border border-border bg-surface px-2',
          'md:w-48 md:px-3 xl:w-72',
          'text-body text-muted shadow-sm transition-all duration-200 ease-out',
          'hover:border-primary/40 hover:text-text hover:shadow-md',
        )}
      >
        <Search className="size-4 shrink-0 transition-colors group-hover:text-primary" aria-hidden />
        <span className="hidden flex-1 text-left md:block">Buscar…</span>
        <span className="hidden xl:block">
          <Kbd>{modKeyLabel} K</Kbd>
        </span>
      </button>

      <Tooltip content={syncDetail ? `${sync.label} · ${syncDetail}` : sync.label}>
        <span
          className={cn(
            'no-drag flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1',
            'text-caption font-medium',
            sync.tone,
          )}
          role="status"
          aria-label={sync.label}
        >
          {syncStatus === 'connected' ? (
            // Conectado no necesita icono: un punto verde es la señal más
            // pequeña que aún se entiende, y deja la barra tranquila en el
            // estado que es el 99% del tiempo.
            <span className={cn('size-2 rounded-full', sync.dot)} aria-hidden />
          ) : (
            <sync.Icon
              className={cn(
                'size-3.5',
                (syncStatus === 'connecting' || syncStatus === 'reconnecting') && 'animate-spin',
              )}
              aria-hidden
            />
          )}
          {/* La etiqueta solo aparece cuando algo va mal: en el caso normal el
              punto verde basta y el texto sería ruido permanente. */}
          {syncStatus !== 'connected' ? (
            <span className="hidden xl:inline">{sync.label}</span>
          ) : null}
        </span>
      </Tooltip>

      <span className="h-6 w-px shrink-0 bg-border" aria-hidden />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" className="no-drag" aria-label="Cambiar tema">
            {preference === 'dark' ? (
              <Moon aria-hidden />
            ) : preference === 'light' ? (
              <Sun aria-hidden />
            ) : (
              <Monitor aria-hidden />
            )}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuContentClass} sideOffset={8} align="end">
            {THEME_OPTIONS.map((option) => (
              <DropdownMenu.Item
                key={option.value}
                className={menuItemClass}
                onSelect={() => setPreference(option.value)}
              >
                <option.Icon className="size-4" aria-hidden />
                <span className="flex-1">{option.label}</span>
                {preference === option.value ? (
                  <Check className="size-3.5 text-primary" aria-hidden />
                ) : null}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="no-drag flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-surface-alt"
          >
            <Avatar name={user?.fullName ?? 'Docente'} src={user?.photoUrl} size="sm" />
            {/* El avatar ya identifica la sesión; el nombre completo es lo
                primero que sobra cuando la barra se queda sin sitio. */}
            <span className="hidden max-w-32 truncate text-caption font-semibold text-text lg:block">
              {user?.fullName ?? 'Docente'}
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuContentClass} sideOffset={8} align="end">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <Avatar name={user?.fullName ?? 'Docente'} src={user?.photoUrl} size="md" />
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-text">{user?.fullName}</p>
                <p className="truncate text-caption text-muted">{user?.email}</p>
              </div>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={menuItemClass} onSelect={() => navigate('/configuracion')}>
              <UserIcon className="size-4" aria-hidden />
              Mi cuenta
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={cn(menuItemClass, 'text-danger data-[highlighted]:bg-danger-soft')}
              onSelect={() => void handleLogout()}
            >
              <LogOut className="size-4" aria-hidden />
              Cerrar sesión
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}
