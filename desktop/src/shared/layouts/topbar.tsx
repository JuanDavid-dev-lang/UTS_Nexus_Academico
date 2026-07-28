import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  LogOut,
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

const SYNC_PRESENTATION = {
  connected: { label: 'Sincronizado', tone: 'text-success', Icon: Wifi },
  connecting: { label: 'Conectando…', tone: 'text-warning', Icon: RefreshCw },
  disconnected: { label: 'Sin sincronizar', tone: 'text-muted', Icon: WifiOff },
  error: { label: 'Error de sincronización', tone: 'text-danger', Icon: WifiOff },
} as const;

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Automático', Icon: Monitor },
];

const menuContentClass = cn(
  'z-50 min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-pop',
);

const menuItemClass = cn(
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text outline-none',
  'transition-colors data-[highlighted]:bg-surface-alt',
);

export function TopBar({
  title,
  subtitle,
  onOpenSearch,
}: {
  title: string;
  subtitle: string;
  onOpenSearch: () => void;
}) {
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);
  const syncStatus = useSync((state) => state.status);
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
    <header className="drag-region flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-5">
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-sm font-bold leading-tight text-text">{title}</h1>
        <p className="truncate text-xs leading-tight text-muted">{subtitle}</p>
      </div>

      <div className="flex-1" />

      {/* Global search - the fastest path to any student, subject or action. */}
      <button
        type="button"
        onClick={onOpenSearch}
        className={cn(
          'no-drag flex h-9 w-72 items-center gap-2 rounded-lg border border-border bg-bg px-3',
          'text-sm text-muted transition-colors hover:border-border-strong hover:text-text',
        )}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Buscar…</span>
        <Kbd>{modKeyLabel} K</Kbd>
      </button>

      <Tooltip content={sync.label}>
        <span className={cn('no-drag flex items-center gap-1.5 px-1 text-xs font-medium', sync.tone)}>
          <sync.Icon
            className={cn('size-4', syncStatus === 'connecting' && 'animate-spin')}
            aria-hidden
          />
        </span>
      </Tooltip>

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
            <span className="max-w-32 truncate text-xs font-semibold text-text">
              {user?.fullName ?? 'Docente'}
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuContentClass} sideOffset={8} align="end">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-semibold text-text">{user?.fullName}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={menuItemClass} onSelect={() => navigate('/configuracion')}>
              <UserIcon className="size-4" aria-hidden />
              Mi cuenta
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={cn(menuItemClass, 'text-danger')}
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
