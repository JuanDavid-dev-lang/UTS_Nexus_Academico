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
import { queryKeys } from '@/core/api/query-keys';
import { can } from '@/core/auth/permissions';
import { useUserRole } from '@/state/session.store';
import { toast } from '@/state/toast.store';
import { REGLAS_CONTRASENA, contrasenaValida } from '@/shared/lib/password-rules';
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

const VACIO = { fullName: '', email: '', password: '', role: 'PROFESSOR' as Role };

export function AccountsCard() {
  const role = useUserRole();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(VACIO);
  const [programas, setProgramas] = useState<string[]>([]);
  const [verClave, setVerClave] = useState(false);

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

  const crear = useMutation({
    mutationFn: () =>
      usersRepository.create({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        programas,
      }),
    onSuccess(item) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.coordination.all });
      setForm(VACIO);
      setProgramas([]);
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
  const claveValida = contrasenaValida(form.password);
  const listo =
    form.fullName.trim().length >= 3 && form.email.trim().includes('@') && claveValida;

  const descripcionRol = roles.data?.find((item) => item.id === form.role)?.descripcion;

  return (
    <Card>
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

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 @xl:grid-cols-2">
          <Field label="Nombre completo">
            {(props) => (
              <Input
                {...props}
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                placeholder="María Fernanda Ortiz"
              />
            )}
          </Field>

          <Field label="Correo institucional">
            {(props) => (
              <Input
                {...props}
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="coordinacion.sistemas@uts.edu.co"
              />
            )}
          </Field>

          <Field label="Rol">
            {(props) => (
              <NativeSelect
                {...props}
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
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

          <Field label="Contraseña inicial">
            {(props) => (
              <div className="flex gap-2">
                <Input
                  {...props}
                  type={verClave ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="La que le vas a entregar"
                  autoComplete="new-password"
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

        <div className="flex items-center justify-end gap-2">
          <Button onClick={() => crear.mutate()} disabled={!listo || crear.isPending}>
            <UserPlus className="size-4" aria-hidden />
            {crear.isPending ? 'Creando…' : 'Crear cuenta'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
