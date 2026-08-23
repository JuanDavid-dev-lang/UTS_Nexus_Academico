import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/field';
import { studentInputSchema, type Student, type StudentInput } from '@/domain/schemas/academic';

const EMPTY: StudentInput = { code: '', fullName: '', email: '', program: '' };

/**
 * Create / edit dialog.
 *
 * Validates with the same zod schema the repository uses, so the form can never
 * accept something the API will reject.
 */
export function StudentFormDialog({
  open,
  onOpenChange,
  student,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when creating. */
  student?: Student | undefined;
  onSubmit: (input: StudentInput) => void;
  submitting: boolean;
}) {
  const [values, setValues] = useState<StudentInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof StudentInput, string>>>({});

  useEffect(() => {
    if (!open) return;
    setValues(
      student
        ? {
            code: student.code,
            fullName: student.fullName,
            email: student.email,
            program: student.program,
          }
        : EMPTY,
    );
    setErrors({});
  }, [open, student]);

  function update(key: keyof StudentInput, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = studentInputSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        code: fieldErrors.code?.[0],
        fullName: fieldErrors.fullName?.[0],
        email: fieldErrors.email?.[0],
        program: fieldErrors.program?.[0],
      });
      return;
    }

    setErrors({});
    onSubmit(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={student ? 'Editar estudiante' : 'Nuevo estudiante'}
        description={
          student
            ? 'Actualiza los datos del estudiante.'
            : 'Registra un estudiante en tu alcance académico.'
        }
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cédula" error={errors.code} required>
              {(props) => (
                <Input
                  {...props}
                  value={values.code}
                  onChange={(event) => update('code', event.target.value)}
                  placeholder="1098765432"
                  autoFocus
                />
              )}
            </Field>

            <Field label="Programa" error={errors.program} required>
              {(props) => (
                <Input
                  {...props}
                  value={values.program}
                  onChange={(event) => update('program', event.target.value)}
                  placeholder="Ingeniería de Sistemas"
                />
              )}
            </Field>
          </div>

          <Field label="Nombre completo" error={errors.fullName} required>
            {(props) => (
              <Input
                {...props}
                value={values.fullName}
                onChange={(event) => update('fullName', event.target.value)}
                placeholder="Ana María Rodríguez"
              />
            )}
          </Field>

          <Field label="Correo" error={errors.email} hint="Opcional si aún no se conoce">
            {(props) => (
              <Input
                {...props}
                type="email"
                value={values.email}
                onChange={(event) => update('email', event.target.value)}
                placeholder="ana.rodriguez@uts.edu.co"
              />
            )}
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {student ? 'Guardar cambios' : 'Crear estudiante'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
