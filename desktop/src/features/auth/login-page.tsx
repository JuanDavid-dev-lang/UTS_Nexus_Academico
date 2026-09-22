import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useAnimate,
  type Variants,
} from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Server, TriangleAlert } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/field';
import { Switch } from '@/shared/ui/primitives';
import { Rubri, type RubriEmotion } from '@/shared/ui/rubri';
import { cn } from '@/shared/lib/cn';
import { useSinMovimiento } from '@/shared/hooks/use-sin-movimiento';
import { useSession } from '@/state/session.store';
import { toast } from '@/state/toast.store';
import { toAppError } from '@/core/api/errors';
import { platform } from '@/core/platform/tauri';
import { guardarRecordarSesion, leerRecordarSesion } from '@/core/auth/recordar-sesion';
import { loginInputSchema } from '@/domain/schemas/auth';
import { normalizeServerUrl } from '@/core/config/env';
import {
  BotonPantallaCompletaAcceso,
  FondoAcceso,
  HeroAcceso,
  LogoConAnillo,
} from './components/escenario-acceso';
import { RESORTE } from './components/resorte';

/**
 * Pantalla de acceso.
 *
 * Toda la lógica es la de siempre —sin credenciales precargadas, sondeo del
 * servidor que solo habla cuando hay malas noticias, salida de emergencia para
 * cambiar la dirección—. Lo que cambió es la capa visual, que ahora sigue al
 * acceso del móvil: la pantalla entera es la superficie de marca con nubes que
 * respiran (`escenario-acceso.tsx`), Rubri saluda y pone la cara de lo que
 * pasa, y la tarjeta del formulario sube con un resorte.
 *
 * Dos cosas nuevas que no son solo aspecto:
 *
 * - **«Mantener la sesión iniciada».** Marcada, cerrar la aplicación no cierra
 *   la sesión: dura 15 días sin uso y solo en este equipo (el servidor la ata
 *   al identificador del equipo, ver `core/auth/device-id.ts`). Desmarcada, la
 *   sesión vive lo que la ventana.
 * - **Pantalla completa** con el botón de arriba o con F11.
 */

/** Tarjeta: sube con resorte y reparte la entrada de sus piezas. */
const tarjeta: Variants = {
  oculto: { opacity: 0, y: 36, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...RESORTE, delay: 0.1, staggerChildren: 0.06, delayChildren: 0.28 },
  },
};

const pieza: Variants = {
  oculto: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: RESORTE },
};

/** Sacudida de «no»: corta, amortiguada, solo en horizontal. */
const SACUDIDA = { x: [0, -10, 10, -6, 6, -2, 0] };

function saludo(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  const [recordar, setRecordar] = useState(leerRecordarSesion);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const serverUrl = useSession((state) => state.serverUrl);
  const changeServerUrl = useSession((state) => state.changeServerUrl);
  const login = useSession((state) => state.login);
  const [serverDraft, setServerDraft] = useState(serverUrl);

  const sinMovimiento = useSinMovimiento();
  // Imperativo y sobre un `div` normal a propósito: un `animate` propio en la
  // tarjeta abriría un contexto de variantes nuevo y sus piezas dejarían de
  // recibir el «visible» de la apertura — el formulario se quedaría invisible.
  const [tarjetaRef, animar] = useAnimate<HTMLDivElement>();

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

  // Rubri dice lo mismo que la pantalla: sin servidor, «sin conexión»; tras un
  // intento fallido, triste hasta que se vuelve a escribir.
  const emocion: RubriEmotion =
    serverStatus === 'offline' ? 'offline' : fallo ? 'sad' : 'happy';

  function marcarError(campos: { email?: string; password?: string }) {
    setErrors(campos);
    setFallo(true);
    if (!sinMovimiento) void animar(tarjetaRef.current, SACUDIDA, { duration: 0.42 });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = loginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      marcarError({
        ...(fieldErrors.email?.[0] ? { email: fieldErrors.email[0] } : {}),
        ...(fieldErrors.password?.[0] ? { password: fieldErrors.password[0] } : {}),
      });
      return;
    }

    setErrors({});
    setSubmitting(true);
    guardarRecordarSesion(recordar);
    try {
      await login(parsed.data.email, parsed.data.password, recordar);
    } catch (error) {
      const appError = toAppError(error);
      const credenciales = appError.kind === 'unauthorized';
      // Un 401 aquí es una contraseña equivocada, no una sesión caducada: el
      // mensaje genérico de `unauthorized` («Tu sesión expiró») confundía.
      toast.error(
        'No se pudo iniciar sesión',
        credenciales ? 'Correo o contraseña incorrectos.' : appError.message,
      );
      marcarError(credenciales ? { password: 'Correo o contraseña incorrectos' } : {});
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveServer() {
    await changeServerUrl(serverDraft);
    toast.success('Servidor actualizado', normalizeServerUrl(serverDraft));
  }

  function leerMayusculas(event: React.KeyboardEvent<HTMLInputElement>) {
    setMayusculas(event.getModifierState('CapsLock'));
  }

  return (
    <MotionConfig reducedMotion={sinMovimiento ? 'always' : 'never'}>
      <div className="surface-brand relative isolate flex h-screen w-screen overflow-y-auto rounded-none">
        <FondoAcceso sinMovimiento={sinMovimiento} />
        <BotonPantallaCompletaAcceso />

        <div className="mx-auto flex min-h-full w-full max-w-6xl items-center justify-center gap-16 px-6 py-16 lg:justify-between lg:px-12">
          <HeroAcceso />

          <div className="flex w-full max-w-md flex-col items-center">
            {/* En ventanas estrechas el héroe no está: el logo y el nombre suben aquí. */}
            <div className="mb-16 flex flex-col items-center gap-3 lg:hidden">
              <LogoConAnillo size={56} />
              <span className="text-h3 font-bold">UTS Nexus Académico</span>
            </div>

            <motion.div
              variants={tarjeta}
              initial="oculto"
              animate="visible"
              className="relative w-full"
            >
              {/* Rubri se asoma por encima de la tarjeta y saluda al entrar. */}
              <motion.div
                initial={{ opacity: 0, y: 24, rotate: -12 }}
                animate={{ opacity: 1, y: 0, rotate: [-12, 10, -6, 4, 0] }}
                transition={{ ...RESORTE, delay: 0.45, rotate: { duration: 1.1, delay: 0.55 } }}
                className="absolute -top-16 right-6 z-10"
              >
                <Rubri emotion={emocion} size="medium" className="drop-shadow-lg" />
              </motion.div>

              <div
                ref={tarjetaRef}
                className={cn(
                  'relative rounded-2xl border border-border bg-surface p-8 text-text shadow-pop',
                  // El brillo del filo superior: la tarjeta se lee como una
                  // pieza que flota sobre el degradado, no pegada a él.
                  'before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px',
                  'before:bg-gradient-to-r before:from-transparent before:via-accent before:to-transparent',
                )}
              >
                <motion.div variants={pieza} className="mb-7 flex flex-col gap-1.5 pr-20">
                  <span className="text-caption font-semibold uppercase tracking-[0.12em] text-accent-strong dark:text-accent">
                    {saludo(new Date().getHours())}
                  </span>
                  <h1 className="text-h3 font-bold text-text">Bienvenido de vuelta</h1>
                  <p className="text-body text-muted">Ingresa con tu cuenta institucional.</p>
                </motion.div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                  <motion.div variants={pieza}>
                    <Field label="Correo institucional" error={errors.email} required>
                      {(props) => (
                        <ConIcono icono={<Mail aria-hidden />}>
                          <Input
                            {...props}
                            type="email"
                            autoComplete="username"
                            autoFocus
                            placeholder="docente@uts.edu.co"
                            className="h-11 pl-10"
                            value={email}
                            onChange={(event) => {
                              setEmail(event.target.value);
                              setFallo(false);
                            }}
                          />
                        </ConIcono>
                      )}
                    </Field>
                  </motion.div>

                  <motion.div variants={pieza}>
                    <Field label="Contraseña" error={errors.password} required>
                      {(props) => (
                        <ConIcono icono={<Lock aria-hidden />}>
                          <Input
                            {...props}
                            type={verPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            placeholder="••••••••"
                            // El ojo nativo de Edge/WebView2 duplicaría el nuestro.
                            className="h-11 pl-10 pr-11 [&::-ms-reveal]:hidden"
                            value={password}
                            onKeyDown={leerMayusculas}
                            onKeyUp={leerMayusculas}
                            onChange={(event) => {
                              setPassword(event.target.value);
                              setFallo(false);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setVerPassword((valor) => !valor)}
                            aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            aria-pressed={verPassword}
                            className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.span
                                key={verPassword ? 'ocultar' : 'ver'}
                                initial={{ opacity: 0, rotate: -40, scale: 0.7 }}
                                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                                exit={{ opacity: 0, rotate: 40, scale: 0.7 }}
                                transition={{ duration: 0.16 }}
                                className="flex"
                              >
                                {verPassword ? (
                                  <EyeOff className="size-4" aria-hidden />
                                ) : (
                                  <Eye className="size-4" aria-hidden />
                                )}
                              </motion.span>
                            </AnimatePresence>
                          </button>
                        </ConIcono>
                      )}
                    </Field>
                    <AnimatePresence>
                      {mayusculas ? (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-1.5 flex items-center gap-1.5 overflow-hidden text-caption font-medium text-warning"
                          role="status"
                        >
                          <TriangleAlert className="size-3.5" aria-hidden />
                          Bloq Mayús está activado.
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>

                  <motion.label
                    variants={pieza}
                    className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface-alt/60 px-3.5 py-3 transition-colors hover:border-border-strong"
                  >
                    <span className="flex flex-col">
                      <span className="text-body font-semibold text-text">
                        Mantener la sesión iniciada
                      </span>
                      <span className="text-caption text-muted">
                        Hasta 15 días sin volver a entrar, solo en este equipo.
                      </span>
                    </span>
                    <Switch
                      checked={recordar}
                      onCheckedChange={setRecordar}
                      aria-label="Mantener la sesión iniciada"
                    />
                  </motion.label>

                  <motion.div variants={pieza}>
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      block
                      loading={submitting}
                      className="group mt-1 h-12 transition-[transform,box-shadow,background-color] active:translate-y-px active:shadow-none"
                    >
                      Entrar
                      <ArrowRight
                        className="transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden
                      />
                    </Button>
                  </motion.div>
                </form>

                <motion.div variants={pieza} className="mt-5 flex flex-col items-center gap-2">
                  <Link
                    to="/recuperar"
                    className="text-body font-semibold text-primary hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                  <p className="text-body text-muted">
                    ¿Eres docente y no tienes cuenta?{' '}
                    <Link to="/registro" className="font-semibold text-primary hover:underline">
                      Regístrate
                    </Link>
                  </p>
                </motion.div>

                {/*
                  La salida de emergencia, solo cuando hace falta: si el servidor
                  no responde no se puede iniciar sesión, y sin sesión no se
                  llega a Configuración. Sin este campo, una dirección mal puesta
                  dejaría la aplicación sin ninguna forma de arreglarse desde
                  dentro.
                */}
                <AnimatePresence initial={false}>
                  {serverStatus === 'offline' ? (
                    <motion.div
                      key="servidor"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={RESORTE}
                      className="overflow-hidden"
                    >
                      <div className="mt-6 border-t border-border pt-4">
                        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">
                          <Server className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          <span>
                            No hay respuesta de <span className="font-mono">{serverUrl}</span>.
                            Comprueba tu conexión, o escribe abajo otra dirección.
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
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

/** Un campo con su icono a la izquierda; el icono toma el color del foco. */
function ConIcono({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="group/campo relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-subtle transition-colors group-focus-within/campo:text-primary [&_svg]:size-4">
        {icono}
      </span>
      {children}
    </div>
  );
}
