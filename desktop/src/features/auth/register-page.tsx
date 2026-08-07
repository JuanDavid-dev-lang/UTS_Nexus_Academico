import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, Field, Input, NativeSelect } from '@/shared/ui';
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
 * va a rechazar —Ingeniería Civil en la facultad de empresariales— convirtiendo
 * un error evitable en un viaje de ida y vuelta.
 */
export default function RegisterPage() {
  const [valores, setValores] = useState(VACIO);
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
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
      <Marco>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success">
            <Check className="size-7" aria-hidden />
          </span>
          <h1 className="text-h3 font-bold text-text">Solicitud enviada</h1>
          <p className="text-body text-muted">{enviado}</p>
          <Button variant="primary" onClick={() => navigate('/login')}>
            Volver al inicio de sesión
          </Button>
        </div>
      </Marco>
    );
  }

  if (catalogo.isPending) {
    return (
      <Marco>
        <p className="flex items-center justify-center gap-2 py-8 text-body text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Cargando el catálogo…
        </p>
      </Marco>
    );
  }

  if (catalogo.isError || !catalogo.data?.abierto) {
    return (
      <Marco>
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="size-8 text-warning" aria-hidden />
          <h1 className="text-h3 font-bold text-text">El registro está cerrado</h1>
          <p className="text-body text-muted">
            {catalogo.isError
              ? 'No se pudo consultar el servidor. Revisa la dirección en la pantalla anterior.'
              : 'La administración tiene que habilitarlo antes de que puedas registrarte. Escríbeles y vuelve a intentarlo.'}
          </p>
          <Link to="/login">
            <Button variant="secondary">
              <ArrowLeft className="size-4" aria-hidden />
              Volver
            </Button>
          </Link>
        </div>
      </Marco>
    );
  }

  const { sedes, facultades, niveles } = catalogo.data;

  return (
    <Marco ancho>
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-h3 font-bold text-text">Registro de docentes</h1>
        <p className="text-body text-muted">
          Un administrador revisa cada solicitud antes de dar acceso.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <Seccion titulo="Tus datos">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cédula" error={errores.cedula}>
              {props => (
                <Input
                  {...props}
                  inputMode="numeric"
                  value={valores.cedula}
                  onChange={e => set('cedula', e.target.value.replace(/\D/g, ''))}
                  placeholder="1098765432"
                />
              )}
            </Field>
            <Field label="Nombres" error={errores.nombres}>
              {props => (
                <Input {...props} value={valores.nombres} onChange={e => set('nombres', e.target.value)} />
              )}
            </Field>
            <Field label="Apellidos" error={errores.apellidos} className="sm:col-span-2">
              {props => (
                <Input {...props} value={valores.apellidos} onChange={e => set('apellidos', e.target.value)} />
              )}
            </Field>
          </div>
        </Seccion>

        <Seccion titulo="Dónde enseñas">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sede" error={errores.sede}>
              {props => (
                <NativeSelect {...props} value={valores.sede} onChange={e => set('sede', e.target.value)}>
                  <option value="">Elige la sede…</option>
                  {sedes.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field label="Facultad" error={errores.facultad}>
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

          <div className="mt-3">
            <p className="mb-2 text-caption font-semibold text-text">Nivel en el que dictas</p>
            <div className="flex flex-wrap gap-4">
              {niveles.map(n => (
                <label key={n.id} className="flex cursor-pointer items-center gap-2 text-body">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={valores.niveles.includes(n.id as NivelId)}
                    onChange={e => {
                      const marcados = e.target.checked
                        ? [...valores.niveles, n.id as NivelId]
                        : valores.niveles.filter(x => x !== n.id);
                      setValores(previos => ({
                        ...previos,
                        niveles: marcados,
                        programas: depurarProgramas(previos.facultad, marcados),
                      }));
                      setErrores(previos => ({ ...previos, niveles: undefined }));
                    }}
                  />
                  {n.nombre}
                </label>
              ))}
            </div>
            {errores.niveles && <p className="mt-1 text-caption text-danger">{errores.niveles}</p>}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-caption font-semibold text-text">
              Programas en los que dictas
              {programasVisibles.length > 0 && (
                <span className="ml-2 font-normal text-muted">
                  ({valores.programas.length} de {programasVisibles.length} marcados)
                </span>
              )}
            </p>

            {!valores.facultad || valores.niveles.length === 0 ? (
              <p className="rounded-lg bg-surface-alt p-3 text-caption text-muted">
                Elige primero la facultad y el nivel; aquí aparecerán solo los programas que
                corresponden a esa combinación.
              </p>
            ) : (
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
                {programasVisibles.map(p => (
                  <label key={p.id} className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-body hover:bg-surface-alt">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={valores.programas.includes(p.id)}
                      onChange={e =>
                        set(
                          'programas',
                          e.target.checked
                            ? [...valores.programas, p.id]
                            : valores.programas.filter(x => x !== p.id),
                        )
                      }
                    />
                    <span>{p.nombre}</span>
                  </label>
                ))}
              </div>
            )}
            {errores.programas && <p className="mt-1 text-caption text-danger">{errores.programas}</p>}
          </div>
        </Seccion>

        <Seccion titulo="Tu cuenta">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Correo institucional" error={errores.email}>
              {props => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  value={valores.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="nombre@uts.edu.co"
                />
              )}
            </Field>
            <Field
              label="Contraseña"
              error={errores.password}
              hint="Mínimo 10 caracteres, con mayúscula, minúscula y número"
            >
              {props => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={valores.password}
                  onChange={e => set('password', e.target.value)}
                />
              )}
            </Field>
          </div>
        </Seccion>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Link to="/login" className="text-body text-muted hover:text-text">
            ← Ya tengo cuenta
          </Link>
          <Button variant="primary" loading={enviando} disabled={enviando} onClick={() => void enviar()}>
            Enviar solicitud
          </Button>
        </div>
      </div>
    </Marco>
  );
}

function Marco({ children, ancho }: { children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <Card className={ancho ? 'w-full max-w-2xl' : 'w-full max-w-md'}>
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <Logo size={36} />
            <span className="text-body font-bold text-text">UTS Nexus Académico</span>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 border-b border-border pb-2 text-body font-bold text-text">{titulo}</h2>
      {children}
    </section>
  );
}
