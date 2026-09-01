import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  IdCard,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Search,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Field, Input, NativeSelect } from '@/shared/ui';
import { Logo } from '@/shared/ui/logo';
import { registroRepository } from '@/infrastructure/repositories/academic.repository';
import { queryKeys } from '@/core/api/query-keys';
import {
  solicitudRegistroSchema,
  type FacultadId,
  type NivelId,
  type SolicitudRegistro,
} from '@/domain/schemas/academic';
import { toast } from '@/state/toast.store';

type Errores = Partial<Record<keyof SolicitudRegistro, string>>;

const REGLAS_CONTRASENA = [
  { texto: '10+ caracteres', cumple: (p: string) => p.length >= 10 },
  { texto: 'Una mayúscula', cumple: (p: string) => /[A-Z]/.test(p) },
  { texto: 'Una minúscula', cumple: (p: string) => /[a-z]/.test(p) },
  { texto: 'Un número', cumple: (p: string) => /\d/.test(p) },
];

const VACIO = {
  cedula: '',
  nombres: '',
  apellidos: '',
  sede: '',
  facultad: '',
  niveles: [] as NivelId[],
  programas: [] as string[],
  email: '',
  password: '',
};

/**
 * Solicitud de registro de un docente.
 *
 * El formulario está encadenado: la facultad y los niveles marcados deciden qué
 * programas se ofrecen. Mostrar los 32 de golpe obligaría a buscar entre
 * carreras de otra facultad, y permitiría enviar combinaciones que el servidor
 * va a rechazar convirtiendo un error evitable en un viaje de ida y vuelta.
 */
export default function RegisterPage() {
  const [valores, setValores] = useState(VACIO);
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [verClave, setVerClave] = useState(false);
  const [filtroPrograma, setFiltroPrograma] = useState('');
  const navigate = useNavigate();

  const catalogo = useQuery({
    queryKey: queryKeys.registro.catalogo(),
    queryFn: () => registroRepository.catalogo(),
    retry: 1,
  });

  const programasVisibles = useMemo(() => {
    if (!catalogo.data || !valores.facultad) return [];
    return catalogo.data.programas.filter(
      p => p.facultad === valores.facultad && valores.niveles.includes(p.nivel),
    );
  }, [catalogo.data, valores.facultad, valores.niveles]);

  const programasFiltrados = useMemo(() => {
    const q = filtroPrograma.trim().toLowerCase();
    if (!q) return programasVisibles;
    return programasVisibles.filter(p => p.nombre.toLowerCase().includes(q));
  }, [programasVisibles, filtroPrograma]);

  function set<K extends keyof typeof VACIO>(campo: K, valor: (typeof VACIO)[K]) {
    setValores(previos => ({ ...previos, [campo]: valor }));
    setErrores(previos => ({ ...previos, [campo]: undefined }));
  }

  /** Al cambiar facultad o nivel se descartan los programas que dejan de ser válidos. */
  function depurarProgramas(facultad: string, niveles: NivelId[]) {
    if (!catalogo.data) return [];
    return valores.programas.filter(id => {
      const programa = catalogo.data.programas.find(p => p.id === id);
      return programa && programa.facultad === facultad && niveles.includes(programa.nivel);
    });
  }

  function alternarNivel(nivel: NivelId) {
    const marcados = valores.niveles.includes(nivel)
      ? valores.niveles.filter(x => x !== nivel)
      : [...valores.niveles, nivel];
    setValores(previos => ({
      ...previos,
      niveles: marcados,
      programas: depurarProgramas(previos.facultad, marcados),
    }));
    setErrores(previos => ({ ...previos, niveles: undefined }));
  }

  function seleccionarTodosProgramas() {
    const todosIds = programasVisibles.map(p => p.id);
    set('programas', todosIds);
  }

  function desmarcarTodosProgramas() {
    set('programas', []);
  }

  async function enviar() {
    const parsed = solicitudRegistroSchema.safeParse(valores);
    if (!parsed.success) {
      const nuevos: Errores = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] as keyof SolicitudRegistro;
        nuevos[campo] ??= issue.message;
      }
      setErrores(nuevos);
      return;
    }

    setEnviando(true);
    try {
      const { message } = await registroRepository.solicitar(parsed.data);
      setEnviado(message);
    } catch (causa) {
      toast.fromError(causa, 'No se pudo enviar la solicitud');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <MarcoLayout>
        <Card className="w-full max-w-lg border-border/80 shadow-md">
          <CardContent className="flex flex-col items-center p-8 text-center sm:p-10">
            <span className="grid size-16 place-items-center rounded-2xl bg-success-soft text-success shadow-inner">
              <CheckCircle2 className="size-8" aria-hidden />
            </span>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-caption font-semibold text-success">
              <Check className="size-3.5" /> Solicitud radicada
            </span>
            <h1 className="mt-3 text-h2 font-bold text-text">Solicitud enviada</h1>
            <p className="mt-2 text-body leading-relaxed text-muted">{enviado}</p>
            <div className="mt-6 w-full rounded-xl border border-border/60 bg-surface-alt/60 p-4 text-left text-caption text-muted">
              <p className="font-medium text-text">¿Qué sigue ahora?</p>
              <p className="mt-1">
                La administración o coordinación verificará tus datos y habilitará tu acceso docente.
                Recibirás la confirmación a tu correo institucional.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="mt-6 w-full"
              onClick={() => navigate('/login')}
            >
              Volver al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </MarcoLayout>
    );
  }

  if (catalogo.isPending) {
    return (
      <MarcoLayout>
        <Card className="w-full max-w-md border-border/70 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-body font-medium text-text">Cargando catálogo institucional…</p>
            <p className="text-caption text-muted">Consultando sedes, facultades y carreras vigentes.</p>
          </CardContent>
        </Card>
      </MarcoLayout>
    );
  }

  if (catalogo.isError || !catalogo.data?.abierto) {
    return (
      <MarcoLayout>
        <Card className="w-full max-w-md border-border/70 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:p-10">
            <div className="grid size-14 place-items-center rounded-2xl bg-warning-soft text-warning">
              <AlertTriangle className="size-7" aria-hidden />
            </div>
            <h1 className="text-h3 font-bold text-text">El registro está cerrado</h1>
            <p className="text-body text-muted leading-relaxed">
              {catalogo.isError
                ? 'No se pudo consultar el servidor. Verifica la dirección configurada en la pantalla de acceso.'
                : 'La administración académica tiene inhabilitado el autorregistro en este momento. Contacta a tu coordinación.'}
            </p>
            <Link to="/login" className="w-full">
              <Button variant="secondary" block size="lg">
                <ArrowLeft className="size-4" aria-hidden />
                Volver al inicio
              </Button>
            </Link>
          </CardContent>
        </Card>
      </MarcoLayout>
    );
  }

  const { sedes, facultades, niveles } = catalogo.data;

  return (
    <MarcoLayout panelLateral>
      <div className="mx-auto w-full max-w-2xl py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-caption font-medium text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Volver al inicio de sesión
          </Link>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-caption font-medium text-primary">
            Autorregistro docente
          </span>
        </div>

        <div className="mb-8">
          <h1 className="text-h2 font-bold tracking-tight text-text">Registro de docentes</h1>
          <p className="mt-1 text-body text-muted">
            Solicita tu cuenta institucional completando tu información y adscripción académica.
          </p>
        </div>

        <form
          className="flex flex-col gap-6"
          onSubmit={event => {
            event.preventDefault();
            void enviar();
          }}
          noValidate
        >
          {/* SECCIÓN 1: IDENTIDAD */}
          <SeccionFormulario
            numero={1}
            titulo="Datos personales"
            subtitulo="Identificación oficial y nombres tal como figuran en la institución"
            icono={User}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cédula" error={errores.cedula} required>
                {props => (
                  <div className="relative flex items-center">
                    <Input
                      {...props}
                      inputMode="numeric"
                      value={valores.cedula}
                      onChange={e => set('cedula', e.target.value.replace(/\D/g, ''))}
                      placeholder="1098765432"
                      autoFocus
                      required
                    />
                    <IdCard className="pointer-events-none absolute right-3 size-4 text-muted/60" aria-hidden />
                  </div>
                )}
              </Field>

              <Field label="Nombres" error={errores.nombres} required>
                {props => (
                  <Input
                    {...props}
                    value={valores.nombres}
                    onChange={e => set('nombres', e.target.value)}
                    placeholder="María Fernanda"
                    autoComplete="given-name"
                    required
                  />
                )}
              </Field>

              <Field label="Apellidos" error={errores.apellidos} className="sm:col-span-2" required>
                {props => (
                  <Input
                    {...props}
                    value={valores.apellidos}
                    onChange={e => set('apellidos', e.target.value)}
                    placeholder="Ortiz Gómez"
                    autoComplete="family-name"
                    required
                  />
                )}
              </Field>
            </div>
          </SeccionFormulario>

          {/* SECCIÓN 2: ADSCRIPCIÓN ACADÉMICA */}
          <SeccionFormulario
            numero={2}
            titulo="Dónde enseñas"
            subtitulo="Sede, facultad y programas a los que estás vinculado en el periodo"
            icono={GraduationCap}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Sede institucional" error={errores.sede} required>
                {props => (
                  <NativeSelect
                    {...props}
                    value={valores.sede}
                    onChange={e => set('sede', e.target.value)}
                    required
                  >
                    <option value="">Elige la sede…</option>
                    {sedes.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>

              <Field label="Facultad" error={errores.facultad} required>
                {props => (
                  <NativeSelect
                    {...props}
                    value={valores.facultad}
                    onChange={e => {
                      const facultad = e.target.value as FacultadId | '';
                      setValores(previos => ({
                        ...previos,
                        facultad,
                        programas: depurarProgramas(facultad, previos.niveles),
                      }));
                      setErrores(previos => ({ ...previos, facultad: undefined }));
                    }}
                    required
                  >
                    <option value="">Elige la facultad…</option>
                    {facultades.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.nombre}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>

            {/* Selector interactivo de nivel */}
            <div className="mt-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-caption font-semibold text-text">
                  Nivel en el que dictas <span className="text-danger">*</span>
                </p>
                <span className="text-caption text-muted">Puedes elegir uno o ambos</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {niveles.map(n => {
                  const seleccionado = valores.niveles.includes(n.id as NivelId);
                  const IconoNivel = n.id === 'TECNOLOGICO' ? BookOpen : Award;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => alternarNivel(n.id as NivelId)}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                        seleccionado
                          ? 'border-primary bg-primary/8 text-primary shadow-xs font-semibold'
                          : 'border-border bg-surface text-muted hover:border-border-hover hover:text-text'
                      }`}
                    >
                      <div
                        className={`grid size-7 shrink-0 place-items-center rounded-lg transition-colors ${
                          seleccionado ? 'bg-primary text-white' : 'bg-surface-alt text-muted'
                        }`}
                      >
                        {seleccionado ? <Check className="size-4" /> : <IconoNivel className="size-4" />}
                      </div>
                      <span className="text-body">{n.nombre}</span>
                    </button>
                  );
                })}
              </div>
              {errores.niveles && <p className="mt-1.5 text-caption text-danger">{errores.niveles}</p>}
            </div>

            {/* Selector de programas */}
            <div className="mt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-caption font-semibold text-text">
                    Programas académicos <span className="text-danger">*</span>
                  </p>
                  {programasVisibles.length > 0 && (
                    <Badge tone={valores.programas.length > 0 ? 'success' : 'neutral'}>
                      {valores.programas.length} de {programasVisibles.length} marcados
                    </Badge>
                  )}
                </div>

                {programasVisibles.length > 1 && (
                  <div className="flex items-center gap-2 text-caption">
                    <button
                      type="button"
                      onClick={seleccionarTodosProgramas}
                      className="font-medium text-primary hover:underline"
                    >
                      Marcar todos
                    </button>
                    <span className="text-border">·</span>
                    <button
                      type="button"
                      onClick={desmarcarTodosProgramas}
                      className="text-muted hover:text-text hover:underline"
                    >
                      Desmarcar
                    </button>
                  </div>
                )}
              </div>

              {!valores.facultad || valores.niveles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-surface-alt/50 p-4 text-center">
                  <Building2 className="mx-auto size-6 text-muted/60" aria-hidden />
                  <p className="mt-1.5 text-caption font-medium text-text">Adscripción pendiente</p>
                  <p className="mt-0.5 text-caption text-muted">
                    Elige primero la facultad y el nivel académico para listar los programas autorizados.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col rounded-xl border border-border bg-surface shadow-xs">
                  {programasVisibles.length > 4 && (
                    <div className="border-b border-border p-2">
                      <div className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
                        <input
                          type="text"
                          placeholder="Buscar programa…"
                          value={filtroPrograma}
                          onChange={e => setFiltroPrograma(e.target.value)}
                          className="w-full rounded-lg bg-surface-alt py-1.5 pl-8 pr-3 text-caption text-text placeholder:text-muted focus:outline-hidden"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex max-h-56 flex-col gap-1 overflow-y-auto p-2">
                    {programasFiltrados.length === 0 ? (
                      <p className="p-4 text-center text-caption text-muted">
                        No se encontraron programas con esa búsqueda.
                      </p>
                    ) : (
                      programasFiltrados.map(p => {
                        const marcado = valores.programas.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-body transition-colors ${
                              marcado
                                ? 'bg-primary/5 text-text font-medium'
                                : 'text-muted hover:bg-surface-alt hover:text-text'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="size-4 shrink-0 accent-primary"
                              checked={marcado}
                              onChange={e =>
                                set(
                                  'programas',
                                  e.target.checked
                                    ? [...valores.programas, p.id]
                                    : valores.programas.filter(x => x !== p.id),
                                )
                              }
                            />
                            <span className="flex-1 text-caption leading-tight sm:text-body">{p.nombre}</span>
                            <span className="shrink-0 text-caption font-mono text-muted/60">{p.id}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
              {errores.programas && <p className="mt-1.5 text-caption text-danger">{errores.programas}</p>}
            </div>
          </SeccionFormulario>

          {/* SECCIÓN 3: CUENTA Y CREDENCIALES */}
          <SeccionFormulario
            numero={3}
            titulo="Tu cuenta"
            subtitulo="Credenciales institucionales para iniciar sesión una vez aprobada la solicitud"
            icono={Lock}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Correo institucional"
                error={errores.email}
                hint="Tu buzón de correo asignado por las UTS"
                required
              >
                {props => (
                  <div className="relative flex items-center">
                    <Input
                      {...props}
                      type="email"
                      autoComplete="email"
                      value={valores.email}
                      onChange={e => set('email', e.target.value)}
                      placeholder="docente@uts.edu.co"
                      required
                    />
                    <Mail className="pointer-events-none absolute right-3 size-4 text-muted/60" aria-hidden />
                  </div>
                )}
              </Field>

              <Field
                label="Contraseña"
                error={errores.password}
                required
              >
                {props => (
                  <div className="flex gap-2">
                    <Input
                      {...props}
                      type={verClave ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={valores.password}
                      onChange={e => set('password', e.target.value)}
                      placeholder="Crea una clave segura"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setVerClave(v => !v)}
                      aria-label={verClave ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                    >
                      {verClave ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                )}
              </Field>
            </div>

            {/* Badges de validación en vivo de contraseña */}
            {valores.password.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REGLAS_CONTRASENA.map(regla => (
                  <Badge key={regla.texto} tone={regla.cumple(valores.password) ? 'success' : 'neutral'}>
                    <KeyRound className="size-3" aria-hidden />
                    {regla.texto}
                  </Badge>
                ))}
              </div>
            )}
          </SeccionFormulario>

          {/* ACCIONES FINALES */}
          <div className="mt-2 rounded-2xl border border-border/80 bg-surface p-5 shadow-xs">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5 text-caption text-muted">
                <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
                <span>
                  Tus datos son protegidos por la política de seguridad institucional de las UTS.
                </span>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={enviando}
                disabled={enviando}
                className="shrink-0"
              >
                <UserPlus className="size-4" aria-hidden />
                Enviar solicitud
              </Button>
            </div>
          </div>
        </form>
      </div>
    </MarcoLayout>
  );
}

function MarcoLayout({
  children,
  panelLateral = false,
}: {
  children: React.ReactNode;
  panelLateral?: boolean;
}) {
  return (
    <div className="flex min-h-screen w-screen bg-bg">
      {panelLateral && (
        <aside className="relative hidden w-80 flex-col justify-between overflow-hidden bg-primary p-10 text-on-primary lg:flex xl:w-96">
          <div
            aria-hidden
            className="absolute -right-24 -top-24 size-96 rounded-full bg-accent/20 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-32 -left-16 size-96 rounded-full bg-accent/10 blur-3xl"
          />

          <div className="relative flex items-center gap-3">
            <Logo size={44} alt="" />
            <div className="flex flex-col">
              <span className="text-body font-bold leading-tight">UTS Nexus Académico</span>
              <span className="text-caption opacity-80">Unidades Tecnológicas de Santander</span>
            </div>
          </div>

          <div className="relative flex flex-col gap-5">
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-caption font-semibold tracking-wide uppercase text-accent">
              Convocatoria & Docencia
            </span>
            <h2 className="text-h2 font-bold leading-tight">
              Forma parte de la comunidad académica UTS.
            </h2>
            <p className="text-body leading-relaxed opacity-85">
              Gestiona tus calificaciones, el control de asistencia y el seguimiento a tus estudiantes en una plataforma ágil y moderna.
            </p>

            <div className="mt-2 flex flex-col gap-3 text-caption opacity-90">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-accent" />
                <span>Adscripción oficial a tus sedes y facultades</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-accent" />
                <span>Validación directa por parte de la coordinación</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-accent" />
                <span>Cálculos automáticos bajo el reglamento institucional</span>
              </div>
            </div>
          </div>

          <p className="relative flex items-center gap-2 text-caption opacity-75">
            <ShieldCheck className="size-4" aria-hidden />
            Unidades Tecnológicas de Santander · Bucaramanga
          </p>
        </aside>
      )}

      <main className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}

function SeccionFormulario({
  numero,
  titulo,
  subtitulo,
  icono: Icono,
  children,
}: {
  numero: number;
  titulo: string;
  subtitulo?: string;
  icono: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-xs transition-shadow sm:p-6">
      <div className="mb-4 flex items-start gap-3 border-b border-border/60 pb-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-caption font-bold text-primary">
          {numero}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Icono className="size-4 text-muted" />
            <h2 className="text-body font-bold text-text">{titulo}</h2>
          </div>
          {subtitulo && <p className="mt-0.5 text-caption text-muted">{subtitulo}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
