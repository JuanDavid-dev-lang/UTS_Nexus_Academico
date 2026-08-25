import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@/shared/ui';
import { authRepository } from '@/infrastructure/repositories/auth.repository';
import { REGLAS_CONTRASENA, contrasenaValida } from '@/shared/lib/password-rules';
import { toast } from '@/state/toast.store';

/**
 * Cambio de la propia contraseña. **Para cualquier rol**, incluidos los de
 * consulta: escribe sobre la cuenta de quien lo pide y sobre nada más.
 *
 * Se pide la actual aunque la sesión ya diga quién eres. Con el token bastaría,
 * pero un equipo desbloqueado —o una sesión olvidada en la sala de docentes—
 * convertiría este formulario en apropiarse de la cuenta en dos clics sin saber
 * nada de su dueño.
 *
 * Cambiarla **cierra las demás sesiones**, que es justo para lo que se cambia
 * una contraseña. La tarjeta lo dice antes de enviar y el aviso lo repite
 * después: quien no lo sepa se queda creyendo que el teléfono de casa sigue
 * dentro.
 */
const VACIO = { actual: '', nueva: '', confirmacion: '' };

export function PasswordCard() {
  const [form, setForm] = useState(VACIO);
  const [visible, setVisible] = useState(false);

  const cambiar = useMutation({
    mutationFn: () =>
      authRepository.changePassword({
        currentPassword: form.actual,
        newPassword: form.nueva,
      }),
    onSuccess({ message }) {
      setForm(VACIO);
      setVisible(false);
      toast.success('Contraseña actualizada', message);
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo cambiar la contraseña'),
  });

  const coinciden = form.nueva.length > 0 && form.nueva === form.confirmacion;
  const distinta = form.nueva !== form.actual;
  const listo =
    form.actual.length > 0 && contrasenaValida(form.nueva) && coinciden && distinta;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-5 text-muted" aria-hidden />
          Contraseña
        </CardTitle>
        <CardDescription>
          Cámbiala cuando quieras. Al hacerlo se cierran las demás sesiones —el teléfono, otro
          computador— y esta se mantiene abierta.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 @xl:grid-cols-3">
          <Field label="Contraseña actual">
            {(props) => (
              <Input
                {...props}
                type={visible ? 'text' : 'password'}
                value={form.actual}
                onChange={(event) => setForm({ ...form, actual: event.target.value })}
                autoComplete="current-password"
              />
            )}
          </Field>

          <Field label="Contraseña nueva">
            {(props) => (
              <Input
                {...props}
                type={visible ? 'text' : 'password'}
                value={form.nueva}
                onChange={(event) => setForm({ ...form, nueva: event.target.value })}
                autoComplete="new-password"
              />
            )}
          </Field>

          <Field
            label="Repite la nueva"
            // El error aparece solo cuando ya hay algo que comparar: marcarlo
            // desde la primera tecla es regañar a quien todavía está escribiendo.
            error={
              form.confirmacion.length > 0 && !coinciden ? 'No coincide con la nueva' : undefined
            }
          >
            {(props) => (
              <Input
                {...props}
                type={visible ? 'text' : 'password'}
                value={form.confirmacion}
                onChange={(event) => setForm({ ...form, confirmacion: event.target.value })}
                autoComplete="new-password"
              />
            )}
          </Field>
        </div>

        {form.nueva.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {REGLAS_CONTRASENA.map((regla) => (
              <Badge key={regla.texto} tone={regla.cumple(form.nueva) ? 'success' : 'neutral'}>
                <KeyRound className="size-3" aria-hidden />
                {regla.texto}
              </Badge>
            ))}
          </div>
        )}

        {form.nueva.length > 0 && !distinta && (
          <p className="text-caption text-warning">
            La nueva es igual a la actual: quien la supiera seguiría sabiéndola.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setVisible((ver) => !ver)}>
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {visible ? 'Ocultar' : 'Ver lo escrito'}
          </Button>
          <Button onClick={() => cambiar.mutate()} disabled={!listo || cambiar.isPending}>
            {cambiar.isPending ? 'Cambiando…' : 'Cambiar contraseña'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
