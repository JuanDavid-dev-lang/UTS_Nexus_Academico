import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Server, ShieldCheck } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/field';
import { useSession } from '@/state/session.store';
import { toast } from '@/state/toast.store';
import { toAppError } from '@/core/api/errors';
import { platform } from '@/core/platform/tauri';
import { loginInputSchema } from '@/domain/schemas/auth';
import { normalizeServerUrl } from '@/core/config/env';

/**
 * Login screen.
 *
 * Two deliberate changes from v1: no credentials are pre-filled (they were
 * hard-coded in the source), and the server address is not shown at all while
 * it works - the common case is two fields and one button. The probe still
 * runs, because "the server is not running" is a different problem from "wrong
 * password"; what changed is that it only speaks when it has bad news.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const serverUrl = useSession((state) => state.serverUrl);
  const changeServerUrl = useSession((state) => state.changeServerUrl);
  const login = useSession((state) => state.login);
  const [serverDraft, setServerDraft] = useState(serverUrl);

  useEffect(() => setServerDraft(serverUrl), [serverUrl]);

  // Probing on mount turns "login failed" into "the server is not running",
  // which is the actual problem the user needs to fix.
  useEffect(() => {
    let cancelled = false;

    async function probe() {
      setServerStatus('checking');
      const status = await platform.backend.ensureRunning(normalizeServerUrl(serverUrl), 12);
      if (!cancelled) setServerStatus(status.running ? 'online' : 'offline');
    }

    void probe();
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = loginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        ...(fieldErrors.email?.[0] ? { email: fieldErrors.email[0] } : {}),
        ...(fieldErrors.password?.[0] ? { password: fieldErrors.password[0] } : {}),
      });
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
    } catch (error) {
      const appError = toAppError(error);
      toast.error('No se pudo iniciar sesión', appError.message);
      if (appError.kind === 'unauthorized') {
        setErrors({ password: 'Correo o contraseña incorrectos' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveServer() {
    await changeServerUrl(serverDraft);
    toast.success('Servidor actualizado', normalizeServerUrl(serverDraft));
  }

  return (
    <div className="flex h-screen w-screen">
      {/* Brand panel: hidden on narrow windows, where the form matters more. */}
      <aside className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-primary p-10 text-on-primary lg:flex">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-96 rounded-full bg-accent/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-16 size-96 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <Logo size={48} alt="" />
          <div className="flex flex-col">
            <span className="text-body font-bold leading-tight">UTS Nexus Académico</span>
            <span className="text-caption opacity-80">Unidades Tecnológicas de Santander</span>
          </div>
        </div>

        <div className="relative flex flex-col gap-4">
          <h2 className="max-w-md text-h2 font-bold leading-tight">
            Menos planillas.
            <br />
            Más tiempo con tus estudiantes.
          </h2>
          <p className="max-w-md text-body leading-relaxed opacity-85">
            Notas, asistencia y riesgo académico en un solo lugar, con un asistente de IA que corre
            en tu propio equipo.
          </p>
        </div>

        <p className="relative flex items-center gap-2 text-caption opacity-75">
          <ShieldCheck className="size-4" aria-hidden />
          Tus credenciales se guardan cifradas por el sistema operativo.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-bg p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-7 flex flex-col gap-1.5">
            <h1 className="text-h3 font-bold text-text">Bienvenido de vuelta</h1>
            <p className="text-body text-muted">Ingresa con tu cuenta institucional.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="Correo institucional" error={errors.email} required>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="docente@uts.edu.co"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>

            <Field label="Contraseña" error={errors.password} required>
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>

            <Button type="submit" variant="primary" size="lg" block loading={submitting}>
              Entrar
            </Button>
          </form>

          <p className="mt-3 text-center text-body">
            <Link to="/recuperar" className="font-semibold text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>

          <p className="mt-4 text-center text-body text-muted">
            ¿Eres docente y no tienes cuenta?{' '}
            <Link to="/registro" className="font-semibold text-primary hover:underline">
              Regístrate
            </Link>
          </p>

          {/*
            La fila «Servidor · URL · En línea» ya no está. Cuando todo funciona
            no dice nada que el docente necesite hacer, y la dirección del
            servidor se cambia en Configuración.

            Lo que queda es la salida de emergencia, y solo cuando hace falta:
            si el servidor no responde no se puede iniciar sesión, y sin sesión
            no se llega a Configuración. Sin este campo, una dirección mal
            puesta dejaría la aplicación sin ninguna forma de arreglarse desde
            dentro.
          */}
          {serverStatus === 'offline' ? (
            <div className="mt-6 border-t border-border pt-4">
              <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">
                <Server className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  No hay respuesta de <span className="font-mono">{serverUrl}</span>. Comprueba
                  tu conexión, o escribe abajo otra dirección.
                </span>
              </p>

              <div className="mt-3 flex gap-2">
                <Input
                  value={serverDraft}
                  onChange={(event) => setServerDraft(event.target.value)}
                  placeholder="https://servidor.uts.edu.co"
                  aria-label="Dirección del servidor"
                  className="font-mono text-caption"
                />
                <Button variant="secondary" onClick={() => void handleSaveServer()}>
                  Guardar
                </Button>
              </div>
            </div>
          ) : null}
        </motion.div>
      </main>
    </div>
  );
}
