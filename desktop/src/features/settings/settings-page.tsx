import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldCheck } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Kbd,
  PageContainer,
  PageHeader,
} from '@/shared/ui';
import { ProfileCard } from '@/features/settings/components/profile-card';
import { useSession } from '@/state/session.store';
import { platform } from '@/core/platform/tauri';
import { explicarAlmacen, type AlmacenDeCredenciales } from '@/core/platform/paquete';
import { env } from '@/core/config/env';
import { modKeyLabel } from '@/shared/hooks/use-hotkeys';
import { CUENTAS_PERSONAL_HASH, desplazarASeccion } from '@/shared/lib/scroll-to-hash';
import { UpdateCard } from './components/update-card';
import { RegistrationCard } from './components/registration-card';
import { AccountsCard } from './components/accounts-card';
import { PasswordCard } from './components/password-card';
import { DownloadsCard } from './components/downloads-card';
import { NotificationsCard } from './components/notifications-card';
import { AdminModeCard } from './components/admin-mode-card';
import { AppearanceCard } from './components/appearance-card';
import { StartupCard } from './components/startup-card';
import { ServerCard } from './components/server-card';

const SHORTCUTS = [
  { keys: `${modKeyLabel} K`, action: 'Búsqueda global' },
  { keys: `${modKeyLabel} B`, action: 'Contraer / expandir menú' },
  { keys: `${modKeyLabel} ⇧ L`, action: 'Cambiar tema' },
  { keys: `${modKeyLabel} 1…7`, action: 'Ir a una sección' },
];

export default function SettingsPage() {
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);

  const [logoutOpen, setLogoutOpen] = useState(false);

  /**
   * Dónde guarda este equipo los tokens.
   *
   * Se pregunta una vez: no cambia mientras el proceso viva. El valor inicial es
   * `llavero` porque es lo que ocurre en Windows, macOS y cualquier Linux con
   * escritorio completo — arrancar en `archivo` haría parpadear una advertencia
   * en la inmensa mayoría de los equipos, que no la merecen.
   */
  const [almacen, setAlmacen] = useState<AlmacenDeCredenciales>('llavero');

  useEffect(() => {
    let vivo = true;
    void platform.secureStore
      .backend()
      .then((valor) => vivo && setAlmacen(valor))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.hash === CUENTAS_PERSONAL_HASH) desplazarASeccion(location.hash);
  }, [location.hash]);

  async function handleLogout() {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <PageContainer>
      <PageHeader title="Configuración" subtitle="Apariencia, atajos y sesión" />

      {/* Sustituye a la tarjeta "Cuenta", que solo mostraba lo que ya venía en
          la sesión sin forma de cambiar nada. */}
      <ProfileCard />

      {/* La contraseña propia va arriba, junto al perfil: es de todos los roles
          y es lo que más se busca aquí. Lo de administración viene después. */}
      <PasswordCard />

      <AppearanceCard />

      <StartupCard />

      {/* Solo ADMIN: ver el comentario del componente. */}
      <ServerCard />

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

      <NotificationsCard />

      <AdminModeCard />

      {/* Crear cuentas va antes que la cola de autorregistro: es la vía por la
          que entran coordinación y secretaría, que no se autorregistran. */}
      <AccountsCard />

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
          {/* Esta frase decía siempre «el almacén del sistema operativo», y en
              Linux eso puede ser falso: el llavero es un paquete que puede no
              estar instalado, y entonces se usa un respaldo cifrado en disco que
              protege menos. Se pregunta dónde están de verdad, porque una
              pantalla que existe para explicar cómo se protegen las credenciales
              es el peor sitio donde afirmar algo que no se ha comprobado. */}
          <p>
            {platform.isDesktop
              ? explicarAlmacen(almacen)
              : 'En modo navegador la sesión se guarda en almacenamiento temporal de la pestaña y se borra al cerrarla.'}
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
