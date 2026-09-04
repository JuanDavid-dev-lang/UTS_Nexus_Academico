import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, UserPlus, Users } from 'lucide-react';
import {
  AreasPicker,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  NativeSelect,
  resumenDeSeleccion,
} from '@/shared/ui';
import { usersRepository } from '@/infrastructure/repositories/coordination.repository';
import { registroRepository } from '@/infrastructure/repositories/academic.repository';
import { institutionsRepository } from '@/infrastructure/repositories/institutions.repository';
import { queryKeys } from '@/core/api/query-keys';
import { can } from '@/core/auth/permissions';
import { useUserRole } from '@/state/session.store';
import { toast } from '@/state/toast.store';
import { REGLAS_CONTRASENA, contrasenaValida } from '@/shared/lib/password-rules';
import { CUENTAS_PERSONAL_HASH } from '@/shared/lib/scroll-to-hash';
import type { Role } from '@/domain/schemas/common';

/**
 * Alta de cuentas desde Configuración.
 *
 * Es el sitio donde ya se administra la instalación —el registro de docentes,
 * el servidor, las descargas—, así que crear una coordinación o una secretaría
 * se hace aquí y no en una pantalla propia a la que nadie llegaría dos veces al
 * semestre. La gestión continua (cambiar un rol, mover carreras, dar de baja)
 * vive en **Personal**, que es una lista; esto es un formulario.
 *
 * La contraseña la escribe quien crea la cuenta. Generarla al azar y enseñarla
 * una sola vez suena más seguro y termina igual —hay que transmitirla— pero
 * añade el caso de «se cerró la ventana antes de copiarla», que se resuelve
 * creando otra cuenta.
 */

const VACIO = { fullName: '', email: '', password: '', role: 'PROFESSOR' as Role, institutionId: '' };

function erroresDeCuenta(form: typeof VACIO, institucionEfectiva: string) {
  const fullName = form.fullName.trim();
  const email = form.email.trim();

  return {
    fullName:
      fullName.length < 3
        ? 'Escribe al menos 3 caracteres.'
        : fullName.length > 120
          ? 'El nombre admite hasta 120 caracteres.'
          : undefined,
    email:
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
        ? 'Escribe un correo válido.'
        : undefined,
    password: !contrasenaValida(form.password)
      ? 'Cumple las cuatro reglas de contraseña indicadas abajo.'
      : form.password.length > 128
        ? 'La contraseña admite hasta 128 caracteres.'
        : undefined,
    // ADMIN no se acota a ninguna institución; los demás roles la necesitan
    // porque el backend responde 400 sin ella.
    institutionId:
      form.role !== 'ADMIN' && !institucionEfectiva
        ? 'Elige la institución de la cuenta.'
        : undefined,
  };
}

export function AccountsCard() {
  const role = useUserRole();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(VACIO);
  const [programas, setProgramas] = useState<string[]>([]);
  const [verClave, setVerClave] = useState(false);
  const [intentoCrear, setIntentoCrear] = useState(false);

  const roles = useQuery({
    queryKey: queryKeys.users.roles(),
    queryFn: () => usersRepository.roles(),
    enabled: can(role, 'staff.manage'),
    staleTime: 10 * 60_000,
  });

  const catalogo = useQuery({
    queryKey: queryKeys.registro.catalogo(),
    queryFn: () => registroRepository.catalogo(),
    enabled: can(role, 'staff.manage'),
    staleTime: 10 * 60_000,
  });

  const instituciones = useQuery({
    queryKey: queryKeys.institutions.activas(),
    queryFn: () => institutionsRepository.activas(),
    enabled: can(role, 'staff.manage'),
    staleTime: 10 * 60_000,
  });

  const listaInstituciones = instituciones.data ?? [];
  // Con una sola institución activa no tiene sentido obligar a elegirla: se
  // preselecciona, y el usuario todavía puede cambiarla si aparece otra.
  const institucionEfectiva =
    form.institutionId ||
    (listaInstituciones.length === 1 ? (listaInstituciones[0]?.institutionId ?? '') : '');

  const crear = useMutation({
    mutationFn: () =>
      usersRepository.create({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        programas,
        institutionId: form.role === 'ADMIN' ? undefined : institucionEfectiva || undefined,
      }),
    onSuccess(item) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.coordination.all });
      setForm(VACIO);
      setProgramas([]);
      setIntentoCrear(false);
      toast.success(
        'Cuenta creada',
        `${item.fullName} ya puede entrar con ${item.email}.`,
      );
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo crear la cuenta'),
  });

  // La tarjeta entera es de administración: sin la capacidad no se dibuja, en
  // vez de dibujarse deshabilitada y prometer algo que responde 403.
  if (!can(role, 'staff.manage')) return null;

  const porPrograma = form.role === 'COORDINATOR' || form.role === 'SECRETARY';
  const errores = erroresDeCuenta(form, institucionEfectiva);

  function handleCrear() {
    setIntentoCrear(true);
    if (errores.fullName || errores.email || errores.password || errores.institutionId) return;
    crear.mutate();
  }

  const descripcionRol = roles.data?.find((item) => item.id === form.role)?.descripcion;

  return (
    <Card id={CUENTAS_PERSONAL_HASH.slice(1)} className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-5 text-muted" aria-hidden />
          Cuentas del personal
        </CardTitle>
        <CardDescription>
          Crea cuentas de administración, coordinación, secretaría o docencia. Para cambiar un rol
          o dar de baja, entra a{' '}
          <Link to="/personal" className="font-medium text-accent-strong underline">
            Personal
          </Link>
          .
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleCrear();
          }}
        >
          <div className="grid gap-3 @xl:grid-cols-2">
            <Field
              label="Nombre completo"
              required
              error={intentoCrear ? errores.fullName : undefined}
            >
              {(props) => (
                <Input
                  {...props}
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  placeholder="Ej.: María Fernanda Ortiz"
                  autoComplete="name"
                  required
                />
              )}
            </Field>

            <Field
              label="Correo institucional"
              required
              error={intentoCrear ? errores.email : undefined}
            >
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="Ej.: coordinacion.sistemas@uts.edu.co"
                  autoComplete="email"
                  required
                />
              )}
            </Field>

            <Field label="Rol" required>
              {(props) => (
                <NativeSelect
                  {...props}
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
                  required
                >
                  {(roles.data ?? [])
                    // Un estudiante no se crea aquí: su cuenta cuelga de la ficha
                    // del estudiante, y una sin vincular no ve ni su expediente.
                    .filter((item) => item.id !== 'STUDENT')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                </NativeSelect>
              )}
            </Field>

            <Field
              label="Contraseña inicial"
              required
              error={intentoCrear ? errores.password : undefined}
            >
              {(props) => (
                <div className="flex gap-2">
                  <Input
                    {...props}
                    type={verClave ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder="La que le vas a entregar"
                    autoComplete="new-password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setVerClave((visible) => !visible)}
                    aria-label={verClave ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                  >
                    {verClave ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              )}
            </Field>
          </div>

          {descripcionRol && (
            <p className="text-caption text-muted">{descripcionRol}</p>
          )}

          {/* ADMIN no se acota a ninguna institución y ve todas; los demás
              roles la necesitan porque el backend responde 400 sin ella. */}
          {form.role !== 'ADMIN' && (
            <Field
              label="Institución"
              required
              error={intentoCrear ? errores.institutionId : undefined}
              hint="Acota lo que ve la cuenta a esa institución. Administración ve todas."
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  value={institucionEfectiva}
                  onChange={(event) => setForm({ ...form, institutionId: event.target.value })}
                  required
                >
                  <option value="">Elige la institución…</option>
                  {listaInstituciones.map((inst) => (
                    <option key={inst.institutionId} value={inst.institutionId}>
                      {inst.nombre} ({inst.sigla})
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          )}

          {/* Las reglas se ven mientras se escribe: enterarse de la política por
              un 400 después de rellenar el formulario entero es la peor forma. */}
          {form.password.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {REGLAS_CONTRASENA.map((regla) => (
                <Badge key={regla.texto} tone={regla.cumple(form.password) ? 'success' : 'neutral'}>
                  <KeyRound className="size-3" aria-hidden />
                  {regla.texto}
                </Badge>
              ))}
            </div>
          )}

          {porPrograma && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted" aria-hidden />
                <p className="text-body font-medium text-text">Carreras a cargo</p>
              </div>
              <p className="text-caption text-muted">
                {programas.length === 0
                  ? 'Sin ninguna marcada, la cuenta verá la institución completa.'
                  : `Verá los grupos, docentes y estudiantes de ${resumenDeSeleccion(
                      catalogo.data?.areas ?? [],
                      programas,
                    ).toLowerCase()}.`}
              </p>
              <AreasPicker
                areas={catalogo.data?.areas ?? []}
                programas={catalogo.data?.programas ?? []}
                seleccion={programas}
                onChange={setProgramas}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-muted">
              Los campos con <span className="text-danger">*</span> son obligatorios.
            </p>
            <Button type="submit" loading={crear.isPending}>
              <UserPlus className="size-4" aria-hidden />
              Crear cuenta
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
