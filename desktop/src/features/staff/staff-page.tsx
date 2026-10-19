import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, Search, UserPlus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
} from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { usersRepository } from '@/infrastructure/repositories/coordination.repository';
import { registroRepository } from '@/infrastructure/repositories/academic.repository';
import { institutionsRepository } from '@/infrastructure/repositories/institutions.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useListadoPaginado } from '@/shared/hooks/use-listado-paginado';
import { retrasoEscalonado, useTandaNueva } from '@/shared/hooks/use-tanda-nueva';
import { CargarMasAlLlegar } from '@/shared/ui/cargar-mas';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { toast } from '@/state/toast.store';
import { useSession } from '@/state/session.store';
import { CUENTAS_PERSONAL_HASH } from '@/shared/lib/scroll-to-hash';
import { EditorDePersonal } from './components/editor-de-personal';
import { FilaDePersonal } from './components/fila-de-personal';
import type { UsuarioPersonal } from '@/domain/schemas/users';

/**
 * Personal: quién es qué rol y de qué carreras responde.
 *
 * Es la pantalla donde se decide el alcance de una coordinación o de una
 * secretaría, así que dice en voz alta la regla que más sorprende: **sin
 * programas asignados, la cuenta ve la institución entera**. Es lo que hacían
 * las cuentas de coordinación antes de que el alcance existiera, y cerrarlas a
 * «nada» al actualizar las habría dejado con pantallas vacías sin ninguna
 * explicación. Aquí se ve como una advertencia, no como un detalle del backend.
 *
 * El rol se filtra con botones y no con un desplegable: son cinco, caben, y un
 * clic que filtra se entiende sin abrir nada. Lo que hace cada rol se dice
 * debajo del que esté elegido; la lista completa queda plegada para no empujar
 * las cuentas fuera de la pantalla, que es lo que se viene a buscar.
 */
export default function StaffPage() {
  const queryClient = useQueryClient();
  const miId = useSession((state) => state.user?.id);
  const [q, setQ] = useState('');
  const [rolFiltro, setRolFiltro] = useState('');
  const [institucionFiltro, setInstitucionFiltro] = useState('');
  const [verRoles, setVerRoles] = useState(false);
  const [editando, setEditando] = useState<UsuarioPersonal | null>(null);
  const [dandoBaja, setDandoBaja] = useState<UsuarioPersonal | null>(null);
  const busqueda = useDebounce(q, 300);

  const filtro = useMemo(
    () => ({
      q: busqueda.trim() || undefined,
      role: rolFiltro || undefined,
      institutionId: institucionFiltro || undefined,
    }),
    [busqueda, rolFiltro, institucionFiltro],
  );
  const hayFiltros = Boolean(q.trim() || rolFiltro || institucionFiltro);

  const roles = useQuery({
    queryKey: queryKeys.users.roles(),
    queryFn: () => usersRepository.roles(),
    staleTime: 10 * 60_000,
  });

  /**
   * Por páginas. El tope por defecto del backend son 200 cuentas, que sobraba
   * mientras la instalación fuera una universidad; con perfiles institucionales
   * todas viven en la misma colección y ese número deja de ser teórico.
   *
   * La búsqueda ya iba al servidor (`?q=`), así que paginar no esconde a nadie:
   * es lo que había que comprobar antes de tocar nada.
   */
  const usuarios = useListadoPaginado({
    queryKey: queryKeys.users.list(filtro),
    consultar: (pagina) => usersRepository.listarPagina(filtro, pagina),
  });
  const nuevasDesde = useTandaNueva(usuarios.items.length);

  const catalogo = useQuery({
    queryKey: queryKeys.registro.catalogo(),
    queryFn: () => registroRepository.catalogo(),
    staleTime: 10 * 60_000,
  });

  const instituciones = useQuery({
    queryKey: queryKeys.institutions.activas(),
    queryFn: () => institutionsRepository.activas(),
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

  const listaDeRoles = roles.data ?? [];
  const rolElegido = listaDeRoles.find((rol) => rol.id === rolFiltro);
  const nombreDeRol = (id: string) => listaDeRoles.find((rol) => rol.id === id)?.nombre ?? id;

  function limpiarFiltros() {
    setQ('');
    setRolFiltro('');
    setInstitucionFiltro('');
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administración"
        title="Personal"
        subtitle="Quién entra a la aplicación, con qué rol y de qué carreras responde"
        actions={
          <Button asChild variant="primary">
            <Link to={`/configuracion${CUENTAS_PERSONAL_HASH}`}>
              <UserPlus aria-hidden />
              Crear cuenta
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Buscar" className="min-w-56 flex-1">
              {(props) => (
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                  <Input
                    {...props}
                    type="search"
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder="Nombre o correo de la persona"
                    className="pl-9"
                  />
                </div>
              )}
            </Field>
            {/*
              Acota a una universidad. Con perfiles institucionales todas las
              cuentas conviven en la misma colección, y sin este filtro encontrar
              a alguien de una concreta pasaba por acertar su nombre — peor
              todavía desde que el listado se pagina de 50 en 50.

              Solo aparece si hay más de una: con una sola es un desplegable que
              no filtra nada y ocupa el sitio del que sí.
            */}
            {(instituciones.data ?? []).length > 1 ? (
              <Field label="Institución" className="w-56">
                {(props) => (
                  <NativeSelect
                    {...props}
                    value={institucionFiltro}
                    onChange={(event) => setInstitucionFiltro(event.target.value)}
                  >
                    <option value="">Todas</option>
                    {(instituciones.data ?? []).map((institucion) => (
                      <option key={institucion.institutionId} value={institucion.institutionId}>
                        {institucion.nombre}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            ) : null}
          </div>

          {listaDeRoles.length > 0 && (
            <div className="flex flex-col gap-2">
              <div role="group" aria-label="Filtrar por rol" className="flex flex-wrap gap-1.5">
                {[{ id: '', nombre: 'Todos' }, ...listaDeRoles].map((rol) => (
                  <Button
                    key={rol.id || 'todos'}
                    size="sm"
                    variant={rolFiltro === rol.id ? 'primary' : 'ghost'}
                    aria-pressed={rolFiltro === rol.id}
                    onClick={() => setRolFiltro(rol.id)}
                  >
                    {rol.nombre}
                  </Button>
                ))}
              </div>
              {/* Qué significa el rol elegido, donde se elige. Sin elegir uno,
                  la explicación de los cinco queda a un clic. */}
              {rolElegido ? (
                <p className="text-caption text-muted">{rolElegido.descripcion}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setVerRoles((abierto) => !abierto)}
                  aria-expanded={verRoles}
                  className="flex w-fit items-center gap-1 text-caption text-primary hover:underline"
                >
                  ¿Qué puede hacer cada rol?
                  <ChevronDown
                    className={cn('size-3.5 transition-transform', verRoles && 'rotate-180')}
                    aria-hidden
                  />
                </button>
              )}
              {!rolElegido && verRoles && (
                <dl className="grid gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-[max-content_1fr]">
                  {listaDeRoles.map((rol) => (
                    <div key={rol.id} className="contents">
                      <dt className="text-caption font-semibold text-text">{rol.nombre}</dt>
                      <dd className="text-caption text-muted">{rol.descripcion}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {usuarios.isPending ? (
        <SkeletonList rows={6} />
      ) : usuarios.isError ? (
        <ErrorState error={usuarios.error} onRetry={() => void usuarios.refetch()} />
      ) : usuarios.items.length === 0 ? (
        <Card>
          <EmptyState
            title={hayFiltros ? 'Sin resultados' : 'Todavía no hay cuentas'}
            message={
              hayFiltros
                ? 'Ninguna cuenta coincide con lo que buscas.'
                : 'Crea la primera desde «Crear cuenta».'
            }
            {...(hayFiltros ? { action: { label: 'Quitar filtros', onClick: limpiarFiltros } } : {})}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-caption text-muted">
              {usuarios.total === 1 ? '1 cuenta' : `${usuarios.total} cuentas`}
              {hayFiltros && ' con estos filtros'}
            </p>
            {hayFiltros && (
              <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
                Quitar filtros
              </Button>
            )}
          </div>
          {usuarios.items.map((usuario, indice) => (
            <FilaDePersonal
              key={usuario.id}
              usuario={usuario}
              nombreRol={nombreDeRol(usuario.role)}
              esPropia={usuario.id === miId}
              // Solo la tanda recién llegada entra con animación.
              className={nuevasDesde !== null && indice >= nuevasDesde ? 'animate-rise' : undefined}
              style={{ animationDelay: retrasoEscalonado(indice, nuevasDesde) }}
              onEditar={() => setEditando(usuario)}
              onDarDeBaja={() => setDandoBaja(usuario)}
            />
          ))}
          <CargarMasAlLlegar
            {...usuarios.propsDeTabla}
            mostrados={usuarios.items.length}
            error={usuarios.error}
            onReintentar={() => void usuarios.fetchNextPage()}
            sustantivo="cuenta"
            sustantivoPlural="cuentas"
          />
        </div>
      )}

      {editando && (
        <EditorDePersonal
          usuario={editando}
          esPropia={editando.id === miId}
          areas={catalogo.data?.areas ?? []}
          programas={catalogo.data?.programas ?? []}
          roles={listaDeRoles}
          instituciones={instituciones.data ?? []}
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
