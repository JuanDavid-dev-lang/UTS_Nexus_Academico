import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, LogOut, Monitor, Moon, Server, ShieldCheck, Sun, Wifi } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  Input,
  Kbd,
  PageContainer,
  PageHeader,
} from '@/shared/ui';
import { Avatar } from '@/shared/ui/primitives';
import { useSession } from '@/state/session.store';
import { useSync } from '@/state/sync.store';
import { useTheme, type ThemePreference } from '@/state/theme.store';
import { platform } from '@/core/platform/tauri';
import { normalizeServerUrl, env } from '@/core/config/env';
import { toast } from '@/state/toast.store';
import { modKeyLabel } from '@/shared/hooks/use-hotkeys';
import { cn } from '@/shared/lib/cn';
import { UpdateCard } from './components/update-card';
import { RegistrationCard } from './components/registration-card';
import { DownloadsCard } from './components/downloads-card';

const THEME_OPTIONS: { value: ThemePreference; label: string; description: string; Icon: typeof Sun }[] =
  [
    { value: 'light', label: 'Claro', description: 'Verde institucional', Icon: Sun },
    { value: 'dark', label: 'Oscuro', description: 'Verde profundo con lima', Icon: Moon },
    { value: 'system', label: 'Automático', description: 'Sigue al sistema', Icon: Monitor },
  ];

const SHORTCUTS = [
  { keys: `${modKeyLabel} K`, action: 'Búsqueda global' },
  { keys: `${modKeyLabel} B`, action: 'Contraer / expandir menú' },
  { keys: `${modKeyLabel} ⇧ L`, action: 'Cambiar tema' },
  { keys: `${modKeyLabel} 1…7`, action: 'Ir a una sección' },
];

export default function SettingsPage() {
  const user = useSession((state) => state.user);
  const serverUrl = useSession((state) => state.serverUrl);
  const changeServerUrl = useSession((state) => state.changeServerUrl);
  const logout = useSession((state) => state.logout);
  const syncStatus = useSync((state) => state.status);
  const preference = useTheme((state) => state.preference);
  const setPreference = useTheme((state) => state.setPreference);

  const [serverDraft, setServerDraft] = useState(serverUrl);
  const [checking, setChecking] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => setServerDraft(serverUrl), [serverUrl]);

  async function handleSaveServer() {
    setChecking(true);
    try {
      const normalized = normalizeServerUrl(serverDraft);
      const online = await platform.backend.health(normalized);

      await changeServerUrl(normalized);
      queryClient.clear();

      if (online) {
        toast.success('Servidor actualizado', normalized);
      } else {
        toast.warning('Servidor guardado, pero sin respuesta', `No hay respuesta en ${normalized}.`);
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleLogout() {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <PageContainer>
      <PageHeader title="Configuración" subtitle="Apariencia, servidor, atajos y sesión" />

      <Card>
        <CardHeader>
          <CardTitle>Cuenta</CardTitle>
          <CardDescription>Datos de la sesión activa</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar name={user?.fullName ?? 'Docente'} src={user?.photoUrl} size="lg" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body font-semibold text-text">{user?.fullName}</span>
            <span className="truncate text-caption text-muted">{user?.email}</span>
          </div>
          <Badge tone="accent" className="ml-auto">
            {user?.role}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apariencia</CardTitle>
          <CardDescription>
            El tema se aplica de inmediato y se recuerda entre sesiones.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 @xl:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const active = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPreference(option.value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <option.Icon
                    className={cn('size-5', active ? 'text-primary' : 'text-muted')}
                    aria-hidden
                  />
                  {active ? <Check className="size-4 text-primary" aria-hidden /> : null}
                </span>
                <span className="text-body font-semibold text-text">{option.label}</span>
                <span className="text-caption text-muted">{option.description}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-4 text-muted" aria-hidden />
            Servidor
          </CardTitle>
          <CardDescription>
            Dirección del backend académico. Cambiarla limpia la caché local.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <Field label="Dirección del servidor" className="flex-1">
              {(props) => (
                <Input
                  {...props}
                  value={serverDraft}
                  onChange={(event) => setServerDraft(event.target.value)}
                  placeholder="http://127.0.0.1:4000"
                  className="font-mono text-caption"
                />
              )}
            </Field>
            <Button
              variant="primary"
              onClick={() => void handleSaveServer()}
              loading={checking}
              disabled={normalizeServerUrl(serverDraft) === serverUrl}
            >
              Guardar
            </Button>
          </div>

          <div className="flex items-center gap-2 text-caption text-muted">
            <Wifi
              className={cn(
                'size-3.5',
                syncStatus === 'connected' ? 'text-success' : 'text-muted',
              )}
              aria-hidden
            />
            Sincronización en tiempo real:{' '}
            <strong className="font-semibold text-text">
              {syncStatus === 'connected'
                ? 'activa'
                : syncStatus === 'connecting'
                  ? 'conectando'
                  : 'inactiva'}
            </strong>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tutorial</CardTitle>
          <CardDescription>El recorrido guiado por las secciones de la aplicación</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="secondary"
            onClick={() => {
              // Se borra la marca de visto y se recarga: el recorrido arranca
              // solo al entrar, así que basta con volver a ese estado.
              if (user?.id) localStorage.removeItem(`uts.tutorial.visto.${user.id}`);
              navigate('/');
              window.location.reload();
            }}
          >
            Ver el tutorial otra vez
          </Button>
        </CardContent>
      </Card>

      <RegistrationCard />

      <DownloadsCard />

      <UpdateCard />

      <Card>
        <CardHeader>
          <CardTitle>Atajos de teclado</CardTitle>
          <CardDescription>Navegación sin soltar el teclado</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.action}
              className="flex items-center justify-between border-b border-border py-2 last:border-0"
            >
              <span className="text-body text-text">{shortcut.action}</span>
              <Kbd>{shortcut.keys}</Kbd>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" aria-hidden />
            Seguridad
          </CardTitle>
          <CardDescription>Cómo se protegen tus credenciales</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-body text-muted">
          <p>
            Tus tokens de sesión se guardan en el almacén de credenciales del sistema operativo
            {platform.isDesktop ? '' : ' (en modo navegador se usa almacenamiento temporal)'}, nunca
            en texto plano.
          </p>
          <p>
            La sesión se renueva automáticamente. Si el token de refresco expira, se te pedirá
            iniciar sesión de nuevo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesión</CardTitle>
          <CardDescription>
            Al cerrar sesión se borran los tokens y la información en caché.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-caption text-muted">
            {env.appName} v{env.appVersion}
          </span>
          <Button variant="danger" onClick={() => setLogoutOpen(true)}>
            <LogOut aria-hidden />
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="¿Cerrar sesión?"
        description="Se borrarán tus credenciales guardadas en este equipo y tendrás que ingresar de nuevo."
        confirmLabel="Cerrar sesión"
        onConfirm={() => void handleLogout()}
      />
    </PageContainer>
  );
}
