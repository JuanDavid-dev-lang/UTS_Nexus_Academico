import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2 } from 'lucide-react';
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
import { Avatar } from '@/shared/ui/primitives';
import { queryKeys } from '@/core/api/query-keys';
import { profileRepository } from '@/infrastructure/repositories/profile.repository';
import { useSession } from '@/state/session.store';
import { toast } from '@/state/toast.store';

/**
 * Perfil del docente.
 *
 * La tarjeta anterior solo mostraba lo que ya venía en la sesión: nombre,
 * correo y rol, sin forma de cambiar nada. Lo editable es deliberadamente
 * poco —nombre, cargo, departamento y foto—; la sede, la facultad y los
 * programas son alcance académico y los decide la administración, no el propio
 * docente.
 */
export function ProfileCard() {
  const user = useSession((state) => state.user);
  const setUser = useSession((state) => state.setUser);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const perfil = useQuery({
    queryKey: queryKeys.profile.me(),
    queryFn: () => profileRepository.me(),
    // Un ADMIN puede no tener ficha de docente; eso no es un error que mostrar.
    retry: false,
  });

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  // Los campos arrancan con lo guardado; sin esto el formulario nacería vacío
  // y guardar sin tocar nada borraría el cargo.
  useEffect(() => {
    if (!perfil.data) return;
    setTitle(perfil.data.title ?? '');
    setDepartment(perfil.data.department ?? '');
  }, [perfil.data]);

  useEffect(() => {
    setFullName(user?.fullName ?? '');
  }, [user?.fullName]);

  const guardar = useMutation({
    mutationFn: (input: {
      fullName?: string;
      title?: string;
      department?: string;
      photoUrl?: string | null;
    }) => profileRepository.update(input),
    onSuccess(item, input) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      // La barra superior lee el usuario de la sesión, no de esta consulta.
      if (user) {
        setUser({
          ...user,
          ...(input.fullName ? { fullName: input.fullName } : {}),
          ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl ?? undefined } : {}),
        });
      }
      toast.success('Perfil actualizado', item.title ?? undefined);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo actualizar el perfil');
    },
  });

  async function subirFoto(file: File) {
    setSubiendo(true);
    try {
      const url = await profileRepository.uploadImage(file);
      guardar.mutate({ photoUrl: url });
    } catch (error) {
      toast.fromError(error, 'No se pudo subir la imagen');
    } finally {
      setSubiendo(false);
    }
  }

  const sinFicha = perfil.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>Cómo te ve el resto de la aplicación</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <Avatar name={user?.fullName ?? 'Docente'} src={user?.photoUrl} size="lg" />
            <Button
              variant="secondary"
              size="icon"
              className="absolute -bottom-1 -right-1 size-7 rounded-full"
              aria-label="Cambiar foto"
              disabled={subiendo || sinFicha}
              onClick={() => fileInput.current?.click()}
            >
              {subiendo ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Camera className="size-3.5" aria-hidden />
              )}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Se limpia el input para que elegir el MISMO archivo otra vez
                // vuelva a disparar el evento.
                event.target.value = '';
                if (file) void subirFoto(file);
              }}
            />
          </div>

          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body font-semibold text-text">{user?.fullName}</span>
            <span className="truncate text-caption text-muted">{user?.email}</span>
          </div>

          <Badge tone="accent" className="ml-auto">
            {user?.role}
          </Badge>
        </div>

        {sinFicha ? (
          <p className="text-caption text-muted">
            Esta cuenta no tiene ficha de docente, así que no hay cargo ni departamento que
            editar.
          </p>
        ) : (
          <>
            <div className="grid gap-3 @2xl:grid-cols-3">
              <Field label="Nombre completo">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Nombre y apellidos"
                  />
                )}
              </Field>
              <Field label="Cargo">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Docente"
                  />
                )}
              </Field>
              <Field label="Departamento">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                    placeholder="UTS"
                  />
                )}
              </Field>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={guardar.isPending}
                onClick={() =>
                  guardar.mutate({
                    fullName: fullName.trim() || undefined,
                    title: title.trim() || undefined,
                    department: department.trim() || undefined,
                  })
                }
              >
                Guardar cambios
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
