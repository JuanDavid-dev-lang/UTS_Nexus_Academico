import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  AreasPicker,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  NativeSelect,
  resumenDeSeleccion,
} from '@/shared/ui';
import type { Role } from '@/domain/schemas/common';
import type { CambioDeUsuario, UsuarioPersonal } from '@/domain/schemas/users';
import type { Area, Programa } from '@/domain/schemas/registration';
import type { InstitucionPublica } from '@/domain/schemas/institutions';

/**
 * Formulario de edición de una cuenta de Personal.
 *
 * Extraído de `staff-page.tsx` para no cruzar las 400 líneas: la lista y el
 * formulario no comparten estado, solo un callback, así que separarlos no
 * pierde nada de contexto.
 *
 * El selector de programas solo aparece para los roles que se acotan por
 * carrera. Mostrarlo siempre invitaba a asignarle programas a un docente, donde
 * no significan nada: el alcance de un docente lo da su matrícula. El selector
 * de institución sigue la misma regla, pero con ADMIN: esa cuenta no se acota
 * a ninguna, así que ni se muestra ni se envía.
 */
export function EditorDePersonal({
  usuario,
  areas,
  programas,
  roles,
  instituciones,
  guardando,
  onCancel,
  onSave,
}: {
  usuario: UsuarioPersonal;
  areas: Area[];
  programas: Programa[];
  roles: { id: Role; nombre: string }[];
  instituciones: InstitucionPublica[];
  guardando: boolean;
  onCancel: () => void;
  onSave: (cambios: CambioDeUsuario) => void;
}) {
  const [fullName, setFullName] = useState(usuario.fullName);
  const [role, setRole] = useState<Role>(usuario.role);
  const [elegidos, setElegidos] = useState<string[]>(usuario.programas);
  const institucionOriginal = usuario.institucion?.institutionId ?? '';
  const [institutionId, setInstitutionId] = useState(institucionOriginal);

  const porPrograma = role === 'COORDINATOR' || role === 'SECRETARY';
  const requiereInstitucion = role !== 'ADMIN';

  function handleGuardar() {
    const cambios: CambioDeUsuario = {
      fullName: fullName.trim(),
      role,
      // Un rol que no se acota por carrera se guarda sin programas:
      // dejarle los antiguos haría que reaparecieran si algún día
      // vuelve a ser coordinación, sin que nadie los revisara.
      programas: porPrograma ? elegidos : [],
    };
    // Al pasar a ADMIN el servidor borra la institución solo; mandarla aquí
    // sería redundante. Para el resto, solo viaja si de verdad cambió.
    if (requiereInstitucion && institutionId !== institucionOriginal) {
      cambios.institutionId = institutionId || null;
    }
    onSave(cambios);
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCancel()}>
      <DialogContent
        title={usuario.fullName}
        description={usuario.email}
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <Field label="Nombre">
            {(props) => (
              <Input
                {...props}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            )}
          </Field>

          <Field label="Rol">
            {(props) => (
              <NativeSelect
                {...props}
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {roles.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.nombre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          {requiereInstitucion && (
            <Field
              label="Institución"
              hint={
                institutionId
                  ? 'Acota lo que ve la cuenta a esa institución.'
                  : 'Sin institución, la cuenta queda sin acotar hasta que se guarde con una.'
              }
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  value={institutionId}
                  onChange={(event) => setInstitutionId(event.target.value)}
                  disabled={guardando}
                >
                  <option value="">Sin institución</option>
                  {instituciones.map((inst) => (
                    <option key={inst.institutionId} value={inst.institutionId}>
                      {inst.nombre} ({inst.sigla})
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          )}

          {porPrograma && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted" aria-hidden />
                <p className="text-body font-medium text-text">Carreras a cargo</p>
              </div>
              <p className="text-caption text-muted">
                {elegidos.length === 0
                  ? 'Sin ninguna marcada, esta cuenta ve la institución completa.'
                  : `Verá los grupos, docentes y estudiantes de ${resumenDeSeleccion(
                      areas,
                      elegidos,
                    ).toLowerCase()}.`}
              </p>
              <AreasPicker
                areas={areas}
                programas={programas}
                seleccion={elegidos}
                onChange={setElegidos}
                disabled={guardando}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={guardando || fullName.trim().length < 3}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
