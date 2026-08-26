import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserMinus, UserRoundCog } from 'lucide-react';
import {
  AreasPicker,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
  resumenDeSeleccion,
} from '@/shared/ui';
import { usersRepository } from '@/infrastructure/repositories/coordination.repository';
import { registroRepository } from '@/infrastructure/repositories/academic.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { toast } from '@/state/toast.store';
import type { Role } from '@/domain/schemas/common';
import type { UsuarioPersonal } from '@/domain/schemas/users';
import type { Area, Programa } from '@/domain/schemas/registration';

/**
 * Personal: quién es qué rol y de qué carreras responde.
 *
 * Es la pantalla donde se decide el alcance de una coordinación o de una
 * secretaría, así que dice en voz alta la regla que más sorprende: **sin
 * programas asignados, la cuenta ve la institución entera**. Es lo que hacían
 * las cuentas de coordinación antes de que el alcance existiera, y cerrarlas a
 * «nada» al actualizar las habría dejado con pantallas vacías sin ninguna
 * explicación. Aquí se ve como una advertencia, no como un detalle del backend.
 */

/** Tono del chip de cada rol. El color dice cuánta autoridad tiene. */
const TONO_ROL: Record<Role, 'danger' | 'primary' | 'info' | 'neutral'> = {
  ADMIN: 'danger',
  COORDINATOR: 'primary',
  SECRETARY: 'info',
  PROFESSOR: 'neutral',
  STUDENT: 'neutral',
};

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [rolFiltro, setRolFiltro] = useState('');
  const [editando, setEditando] = useState<UsuarioPersonal | null>(null);
  const [dandoBaja, setDandoBaja] = useState<UsuarioPersonal | null>(null);
  const busqueda = useDebounce(q, 300);

  const filtro = useMemo(
    () => ({ q: busqueda.trim() || undefined, role: rolFiltro || undefined }),
    [busqueda, rolFiltro],
  );

  const roles = useQuery({
    queryKey: queryKeys.users.roles(),
    queryFn: () => usersRepository.roles(),
    staleTime: 10 * 60_000,
  });

  const usuarios = useQuery({
    queryKey: queryKeys.users.list(filtro),
    queryFn: () => usersRepository.list(filtro),
  });

  const catalogo = useQuery({
    queryKey: queryKeys.registro.catalogo(),
    queryFn: () => registroRepository.catalogo(),
    staleTime: 10 * 60_000,
  });

  const guardar = useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Parameters<typeof usersRepository.update>[1] }) =>
      usersRepository.update(id, cambios),
    onSuccess(item) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      // El alcance de coordinación acaba de cambiar: su panorama ya no vale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.coordination.all });
      setEditando(null);
      toast.success('Personal actualizado', `${item.fullName} ya tiene los cambios aplicados.`);
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo guardar'),
  });

  const darDeBaja = useMutation({
    mutationFn: (id: string) => usersRepository.desactivar(id),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      setDandoBaja(null);
      toast.success('Cuenta dada de baja', 'Deja de tener acceso; su historial se conserva.');
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo dar de baja'),
  });

  const programas = catalogo.data?.programas ?? [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administración"
        title="Personal"
        subtitle="Define el rol de cada cuenta y las carreras de las que responde"
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Buscar" className="min-w-56 flex-1 max-w-sm">
            {(props) => (
              <Input
                {...props}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Nombre o correo"
              />
            )}
          </Field>
          <Field label="Rol" className="w-56">
            {(props) => (
              <NativeSelect
                {...props}
                value={rolFiltro}
                onChange={(event) => setRolFiltro(event.target.value)}
              >
                <option value="">Todos los roles</option>
                {(roles.data ?? []).map((rol) => (
                  <option key={rol.id} value={rol.id}>
                    {rol.nombre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </CardContent>
      </Card>

      {/* Qué significa cada rol, donde se decide. Un desplegable con cinco
          palabras sueltas obliga a recordar la diferencia entre coordinación y
          secretaría justo cuando hay que elegir una. */}
      {roles.data && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {roles.data.map((rol) => (
            <div
              key={rol.id}
              className="flex gap-2 rounded-xl border border-border bg-surface-alt p-3"
            >
              <Badge tone={TONO_ROL[rol.id]}>{rol.nombre}</Badge>
              <p className="min-w-0 flex-1 text-caption text-muted">{rol.descripcion}</p>
            </div>
          ))}
        </div>
      )}

      {usuarios.isPending ? (
        <SkeletonList rows={6} />
      ) : usuarios.isError ? (
        <ErrorState error={usuarios.error} onRetry={() => void usuarios.refetch()} />
      ) : usuarios.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin resultados"
            message="Ninguna cuenta coincide con la búsqueda y el rol elegidos."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {usuarios.data.map((usuario) => {
            const porPrograma = usuario.role === 'COORDINATOR' || usuario.role === 'SECRETARY';
            const sinAcotar = porPrograma && usuario.programas.length === 0;

            return (
              <Card key={usuario.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-body font-semibold text-text">
                        {usuario.fullName}
                      </p>
                      <Badge tone={TONO_ROL[usuario.role]}>
                        {roles.data?.find((rol) => rol.id === usuario.role)?.nombre ?? usuario.role}
                      </Badge>
                      {usuario.profesor?.esDirectorTrabajoGrado && (
                        <Badge tone="neutral">Dirige trabajos de grado</Badge>
                      )}
                    </div>
                    <p className="truncate text-caption text-muted">{usuario.email}</p>

                    {porPrograma &&
                      (sinAcotar ? (
                        // La advertencia va en la fila, no escondida en el
                        // formulario: es el estado en el que la cuenta ve más
                        // de lo que probablemente se pretendía.
                        <p className="mt-1 text-caption text-warning">
                          Sin programas asignados: ve la institución completa.
                        </p>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {/* Por carrera, no por título: dos insignias
                              —«Sistemas» y «Sistemas»— no dicen nada, y la
                              marca de «solo un ciclo» es lo que hay que ver. */}
                          {usuario.areas.map((area) => (
                            <Badge key={area.id} tone={area.completa ? 'neutral' : 'warning'}>
                              {area.nombre}
                              {!area.completa && ' · un solo ciclo'}
                            </Badge>
                          ))}
                        </div>
                      ))}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" onClick={() => setEditando(usuario)}>
                      <UserRoundCog className="size-4" aria-hidden />
                      Editar
                    </Button>
                    <Button variant="ghost" onClick={() => setDandoBaja(usuario)}>
                      <UserMinus className="size-4" aria-hidden />
                      Dar de baja
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editando && (
        <EditorDePersonal
          usuario={editando}
          areas={catalogo.data?.areas ?? []}
          programas={programas}
          roles={(roles.data ?? []).map((rol) => ({ id: rol.id, nombre: rol.nombre }))}
          guardando={guardar.isPending}
          onCancel={() => setEditando(null)}
          onSave={(cambios) => guardar.mutate({ id: editando.id, cambios })}
        />
      )}

      <ConfirmDialog
        open={Boolean(dandoBaja)}
        onOpenChange={(abierto) => !abierto && setDandoBaja(null)}
        title="Dar de baja la cuenta"
        description={
          dandoBaja
            ? `${dandoBaja.fullName} dejará de poder entrar. Lo que capturó se conserva: la baja no borra notas ni asistencia.`
            : ''
        }
        confirmLabel="Dar de baja"
        loading={darDeBaja.isPending}
        onConfirm={() => dandoBaja && darDeBaja.mutate(dandoBaja.id)}
      />
    </PageContainer>
  );
}

/**
 * Formulario de una cuenta.
 *
 * El selector de programas solo aparece para los roles que se acotan por
 * carrera. Mostrarlo siempre invitaba a asignarle programas a un docente, donde
 * no significan nada: el alcance de un docente lo da su matrícula.
 */
function EditorDePersonal({
  usuario,
  areas,
  programas,
  roles,
  guardando,
  onCancel,
  onSave,
}: {
  usuario: UsuarioPersonal;
  areas: Area[];
  programas: Programa[];
  roles: { id: Role; nombre: string }[];
  guardando: boolean;
  onCancel: () => void;
  onSave: (cambios: { fullName?: string; role?: Role; programas?: string[] }) => void;
}) {
  const [fullName, setFullName] = useState(usuario.fullName);
  const [role, setRole] = useState<Role>(usuario.role);
  const [elegidos, setElegidos] = useState<string[]>(usuario.programas);

  const porPrograma = role === 'COORDINATOR' || role === 'SECRETARY';

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
          <Button
            onClick={() =>
              onSave({
                fullName: fullName.trim(),
                role,
                // Un rol que no se acota por carrera se guarda sin programas:
                // dejarle los antiguos haría que reaparecieran si algún día
                // vuelve a ser coordinación, sin que nadie los revisara.
                programas: porPrograma ? elegidos : [],
              })
            }
            disabled={guardando || fullName.trim().length < 3}
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
