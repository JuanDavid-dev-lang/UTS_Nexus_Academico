import { useMemo, useState } from 'react';
import { Inbox, Lock, Search, ShieldCheck, ShieldOff, Smartphone, Unlink, Unlock } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/shared/ui';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useUserRole } from '@/state/session.store';
import { can } from '@/core/auth/permissions';
import type {
  AccionSolicitud,
  AccionVinculo,
  FiltroVinculos,
  Solicitud,
  Vinculo,
} from '@/domain/schemas/uniplanner';
import {
  useAccionVinculo,
  useEstadoUniPlanner,
  useInstitucionesGestionables,
  useResolverSolicitud,
  useSolicitudesDeEnlace,
  useVinculos,
} from './hooks/use-uniplanner';

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

/**
 * Vínculos de UniPlanner: el enlace de cada estudiante con su universidad.
 *
 * Es institucional y no de un curso: un estudiante se enlaza una vez y le sirve
 * para todas sus materias —avisos, asistencia por QR—. Por eso vive aquí, en
 * administración, y no en la lista de asistencia de cada docente.
 *
 * Dos pestañas: lo que los estudiantes piden desde su app (primero, porque es
 * lo que tiene a alguien esperando) y el listado de enlaces para verificar,
 * desbloquear o liberar.
 */
export default function LinksPage() {
  const role = useUserRole();
  const puedeGestionar = can(role, 'uniplanner.links.manage');
  const puente = useEstadoUniPlanner();
  const activo = puente.data?.configurado === true;

  const instituciones = useInstitucionesGestionables(activo);
  const [elegida, setElegida] = useState('');
  const institucion = elegida || instituciones.data?.[0]?.institutionId || '';
  const solicitudes = useSolicitudesDeEnlace(activo ? institucion : '');

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <>
            <Smartphone className="size-3.5" aria-hidden />
            UniPlanner
          </>
        }
        title="Vínculos de UniPlanner"
        subtitle="El enlace de cada estudiante con su universidad: uno por persona, para todas sus materias"
      />

      {puente.isPending || (activo && instituciones.isPending) ? (
        <SkeletonList rows={4} />
      ) : puente.isError ? (
        // Un fallo de red no es «no configurado»: esa frase manda a revisar las
        // credenciales del servidor cuando lo que falta es reintentar.
        <ErrorState error={puente.error} onRetry={() => void puente.refetch()} />
      ) : !activo ? (
        <Card>
          <EmptyState
            title="El puente con UniPlanner no está configurado"
            message="Sin las credenciales de UniPlanner en el servidor no hay enlaces que gestionar."
          />
        </Card>
      ) : instituciones.isError ? (
        <ErrorState error={instituciones.error} onRetry={() => void instituciones.refetch()} />
      ) : !institucion ? (
        <Card>
          <EmptyState
            title="Sin institución"
            message={
              role === 'ADMIN'
                ? 'No hay ninguna institución activa. Créala o actívala en Perfiles institucionales.'
                : 'Tu cuenta no tiene una institución asignada. Pídeselo a administración.'
            }
          />
        </Card>
      ) : (
        <>
          {/* El selector solo aparece con más de una: con una, no filtra nada. */}
          {(instituciones.data?.length ?? 0) > 1 ? (
            <Field label="Institución" className="w-72">
              {(props) => (
                <NativeSelect {...props} value={institucion} onChange={(e) => setElegida(e.target.value)}>
                  {instituciones.data!.map((i) => (
                    <option key={i.institutionId} value={i.institutionId}>
                      {i.sigla} — {i.nombre}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : null}

          <Tabs defaultValue="solicitudes">
            <TabsList>
              <TabsTrigger value="solicitudes">
                Solicitudes
                {(solicitudes.data?.length ?? 0) > 0 ? (
                  <Badge tone="warning" size="sm" className="ml-2">
                    {solicitudes.data!.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="estudiantes">Estudiantes</TabsTrigger>
            </TabsList>

            <TabsContent value="solicitudes" className="mt-4">
              <PanelSolicitudes
                solicitudes={solicitudes.data ?? []}
                cargando={solicitudes.isPending}
                error={solicitudes.isError ? solicitudes.error : null}
                puedeGestionar={puedeGestionar}
              />
            </TabsContent>
            <TabsContent value="estudiantes" className="mt-4">
              <PanelEstudiantes institucion={institucion} puedeGestionar={puedeGestionar} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </PageContainer>
  );
}

// ── Solicitudes ──────────────────────────────────────────────────────────────

const ETIQUETA_ACCION: Record<AccionSolicitud, string> = {
  desbloquear: 'Quitar bloqueo',
  liberar: 'Liberar documento',
  asignar: 'Asignar a quien lo pide',
  rechazar: 'Rechazar',
};

function PanelSolicitudes({
  solicitudes,
  cargando,
  error,
  puedeGestionar,
}: {
  solicitudes: Solicitud[];
  cargando: boolean;
  error: unknown;
  puedeGestionar: boolean;
}) {
  const [decidiendo, setDecidiendo] = useState<{ solicitud: Solicitud; accion: AccionSolicitud } | null>(null);

  if (cargando) return <SkeletonList rows={3} />;
  if (error) return <ErrorState error={error} />;
  if (solicitudes.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Sin solicitudes pendientes"
          message="Cuando un estudiante pida desde UniPlanner que revisen su enlace, aparecerá aquí y te llegará un aviso."
        />
      </Card>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {solicitudes.map((s) => (
          <li key={s.uid} className="surface-card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-body font-semibold text-text">
                  {s.estudiante?.fullName ?? 'Documento sin estudiante en Nexus'}
                </span>
                <span className="font-mono tabular text-caption text-muted">
                  {s.codigo}
                  {s.estudiante ? ` · ${s.estudiante.program}` : ''}
                  {s.estudiante?.email ? ` · ${s.estudiante.email}` : ''}
                </span>
              </div>
              <Badge tone={s.tipo === 'claimed' ? 'danger' : 'warning'}>
                {s.tipo === 'claimed' ? 'Su documento lo tiene otra cuenta' : 'Quiere cambiar su enlace'}
              </Badge>
            </div>

            {s.motivo ? (
              <p className="rounded-lg bg-surface-sunken px-3 py-2 text-body text-text">«{s.motivo}»</p>
            ) : null}

            <p className="text-caption text-muted">
              Pedida el {fecha(s.creadaEn)} ·{' '}
              {!s.enlace.existe
                ? 'ese documento ya no tiene enlace'
                : s.enlace.esDeQuienPide
                  ? `el enlace es de quien pide${s.enlace.bloqueadoHasta ? `, fijo hasta el ${fecha(s.enlace.bloqueadoHasta)}` : ''}`
                  : `el documento lo tiene otra cuenta${s.enlace.verificado ? ' (verificada)' : ''}`}
            </p>

            {puedeGestionar ? (
              <div className="flex flex-wrap gap-2">
                {s.acciones.map((accion) => (
                  <Button
                    key={accion}
                    size="sm"
                    variant={accion === 'rechazar' ? 'ghost' : accion === 'liberar' ? 'secondary' : 'primary'}
                    onClick={() => setDecidiendo({ solicitud: s, accion })}
                  >
                    {ETIQUETA_ACCION[accion]}
                  </Button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {decidiendo ? (
        <DialogoSolicitud
          solicitud={decidiendo.solicitud}
          accion={decidiendo.accion}
          onClose={() => setDecidiendo(null)}
        />
      ) : null}
    </>
  );
}

const EXPLICACION_ACCION: Record<AccionSolicitud, string> = {
  desbloquear:
    'Quita el bloqueo del semestre: el estudiante podrá cambiar o deshacer su enlace desde su app. Hazlo si comprobaste que se equivocó de documento o cambió de cuenta.',
  liberar:
    'Borra el enlace de ese documento. El estudiante podrá enlazarse de nuevo con el correcto.',
  asignar:
    'El documento pasa a la cuenta de quien lo pide, ya verificado; la otra cuenta deja de recibir sus avisos. Hazlo solo si comprobaste que es suyo: con el documento en la mano, o escribiéndole a su correo institucional.',
  rechazar: 'No cambia nada. El estudiante verá que no se aprobó, con la nota que escribas.',
};

function DialogoSolicitud({
  solicitud,
  accion,
  onClose,
}: {
  solicitud: Solicitud;
  accion: AccionSolicitud;
  onClose: () => void;
}) {
  const [nota, setNota] = useState('');
  const resolver = useResolverSolicitud();

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title={`${ETIQUETA_ACCION[accion]} · ${solicitud.estudiante?.fullName ?? solicitud.codigo}`}
        description={EXPLICACION_ACCION[accion]}
        className="max-w-md"
      >
        <Field label="Nota para el estudiante (opcional)">
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              maxLength={300}
              value={nota}
              placeholder={accion === 'rechazar' ? 'Por ejemplo: acércate a coordinación con tu documento.' : ''}
              onChange={(e) => setNota(e.target.value)}
            />
          )}
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={resolver.isPending}>
            Cancelar
          </Button>
          <Button
            variant={accion === 'liberar' ? 'danger' : 'primary'}
            loading={resolver.isPending}
            onClick={() =>
              resolver.mutate(
                { uid: solicitud.uid, accion, nota: nota.trim() || undefined },
                { onSuccess: onClose },
              )
            }
          >
            {ETIQUETA_ACCION[accion]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Estudiantes ──────────────────────────────────────────────────────────────

const FILTROS: { valor: FiltroVinculos; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'sin-verificar', etiqueta: 'Sin verificar' },
  { valor: 'verificados', etiqueta: 'Verificados' },
  { valor: 'fijos', etiqueta: 'Fijos este semestre' },
];

function PanelEstudiantes({ institucion, puedeGestionar }: { institucion: string; puedeGestionar: boolean }) {
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<FiltroVinculos>('sin-verificar');
  const q = useDebounce(texto.trim(), 300);
  const busqueda = q.length >= 3 ? q : '';
  const vinculos = useVinculos({ institucion, filtro, q: busqueda });
  const [confirmando, setConfirmando] = useState<{ vinculo: Vinculo; accion: AccionVinculo } | null>(null);

  const items = useMemo(() => vinculos.data?.pages.flatMap((p) => p.items) ?? [], [vinculos.data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="surface-well flex flex-wrap items-end gap-3 p-3">
        <Field label="Buscar estudiante" className="min-w-64 flex-1">
          {(props) => (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                {...props}
                className="pl-9"
                value={texto}
                placeholder="Documento o nombre (3 caracteres o más)"
                onChange={(e) => setTexto(e.target.value)}
              />
            </div>
          )}
        </Field>
        <Field label="Mostrar" className="w-52">
          {(props) => (
            <NativeSelect {...props} value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroVinculos)}>
              {FILTROS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>

      <p className="text-caption text-muted">
        Verifica un enlace solo después de comprobar que es del estudiante: que te enseñe en su teléfono
        la pantalla del enlace y su documento, o escribiéndole a su correo institucional. Se verifica una
        vez y vale para todas sus materias.
      </p>

      {vinculos.isPending ? (
        <SkeletonList rows={5} />
      ) : vinculos.isError ? (
        <ErrorState error={vinculos.error} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={busqueda ? 'Sin resultados' : 'Nada que mostrar'}
            message={
              busqueda
                ? 'Ningún estudiante de tu alcance coincide con esa búsqueda.'
                : 'No hay enlaces con ese filtro en esta página.'
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((v) => (
            <FilaVinculo
              key={v.linkId}
              vinculo={v}
              puedeGestionar={puedeGestionar}
              onAccion={(accion) => setConfirmando({ vinculo: v, accion })}
            />
          ))}
        </ul>
      )}

      {vinculos.hasNextPage ? (
        <Button
          variant="secondary"
          className="self-center"
          loading={vinculos.isFetchingNextPage}
          onClick={() => void vinculos.fetchNextPage()}
        >
          Cargar más
        </Button>
      ) : null}

      {confirmando ? (
        <DialogoVinculo
          vinculo={confirmando.vinculo}
          accion={confirmando.accion}
          onClose={() => setConfirmando(null)}
        />
      ) : null}
    </div>
  );
}

function FilaVinculo({
  vinculo,
  puedeGestionar,
  onAccion,
}: {
  vinculo: Vinculo;
  puedeGestionar: boolean;
  onAccion: (accion: AccionVinculo) => void;
}) {
  return (
    <li className="surface-card flex flex-wrap items-center gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium text-text">
          {vinculo.estudiante?.fullName ?? 'Documento sin estudiante en Nexus'}
        </span>
        <span className="truncate font-mono tabular text-caption text-muted">
          {vinculo.codigo}
          {vinculo.estudiante ? ` · ${vinculo.estudiante.program}` : ''}
          {vinculo.enlazadoEn ? ` · enlazado el ${fecha(vinculo.enlazadoEn)}` : ''}
        </span>
        {/* El motivo a la vista y no en un tooltip: es lo que dice si hay que
            matricular a alguien, corregir un nombre o no hacer nada. */}
        {vinculo.motivo && !vinculo.verificado ? (
          <span
            className={`text-caption ${vinculo.verificacion === 'no_coincide' ? 'text-danger' : 'text-warning'}`}
          >
            {textoDelMotivo(vinculo)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {!vinculo.enlazado ? (
          <Badge tone="neutral">Sin UniPlanner</Badge>
        ) : vinculo.verificado ? (
          <Badge
            tone="success"
            title={
              vinculo.verificacion === 'automatica'
                ? 'Documento, nombre y universidad coinciden con el registro de Nexus'
                : 'Verificado por la institución'
            }
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            {vinculo.verificacion === 'automatica' ? 'Verificado automáticamente' : 'Verificado'}
          </Badge>
        ) : vinculo.verificacion === 'no_coincide' ? (
          <Badge
            tone="danger"
            title={
              vinculo.nombreEnUniPlanner
                ? `En UniPlanner escribió «${vinculo.nombreEnUniPlanner}»`
                : 'El documento, el nombre o la universidad no coinciden con el registro'
            }
          >
            No coincide
          </Badge>
        ) : vinculo.verificacion === 'sin_nombre' ? (
          <Badge tone="warning" title="Enlace anterior a la verificación automática: falta su nombre completo">
            Sin nombre
          </Badge>
        ) : (
          <Badge tone="warning">Sin verificar</Badge>
        )}
        {vinculo.bloqueadoHasta ? (
          <Badge tone="info" title="Marcó asistencia con este enlace este semestre">
            <Lock className="size-3.5" aria-hidden />
            Fijo hasta el {fecha(vinculo.bloqueadoHasta)}
          </Badge>
        ) : null}
      </div>

      {puedeGestionar && vinculo.enlazado ? (
        // Los botones se repiten en cada fila: el grupo dice de quién son.
        <div
          role="group"
          aria-label={`Acciones sobre el enlace de ${vinculo.estudiante?.fullName ?? vinculo.codigo}`}
          className="flex flex-wrap gap-1"
        >
          {vinculo.verificado ? (
            <Button size="sm" variant="ghost" onClick={() => onAccion('desverificar')}>
              <ShieldOff aria-hidden />
              Retirar verificación
            </Button>
          ) : (
            <Button size="sm" onClick={() => onAccion('verificar')}>
              <ShieldCheck aria-hidden />
              Verificar
            </Button>
          )}
          {vinculo.bloqueadoHasta ? (
            <Button size="sm" variant="ghost" onClick={() => onAccion('desbloquear')}>
              <Unlock aria-hidden />
              Quitar bloqueo
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => onAccion('liberar')}>
            <Unlink aria-hidden />
            Liberar
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Por qué el enlace no casa con el registro, en lo que hay que hacer.
 *
 * Sin matrícula es el caso más común y el que más confunde: la persona
 * escribió bien sus datos, pero sin ningún curso Nexus no sabe de qué
 * universidad es. Se arregla matriculándola, y el enlace se verifica solo.
 */
function textoDelMotivo(vinculo: Vinculo): string {
  switch (vinculo.motivo) {
    case 'sin_estudiante':
      return 'Ningún estudiante de Nexus tiene este documento.';
    case 'sin_matricula':
      return 'Está en Nexus pero sin matrícula en ningún curso. Al matricularlo se verifica solo.';
    case 'otra_universidad':
      return 'Sus cursos en Nexus son de otra universidad.';
    case 'nombre_distinto':
      return `El nombre no coincide: en UniPlanner escribió «${vinculo.nombreEnUniPlanner ?? ''}» y en Nexus es «${vinculo.estudiante?.fullName ?? ''}».`;
    default:
      return '';
  }
}

const TEXTO_ACCION_VINCULO: Record<AccionVinculo, { titulo: string; cuerpo: string; boton: string }> = {
  verificar: {
    titulo: 'Verificar el enlace',
    cuerpo:
      'Confirma solo si comprobaste que la cuenta de UniPlanner es de este estudiante. Vale para todas sus materias y el estudiante lo verá en su app.',
    boton: 'Es suyo: verificar',
  },
  desverificar: {
    titulo: 'Retirar la verificación',
    cuerpo: 'El enlace volverá a aparecer como sin verificar, aquí y en su teléfono.',
    boton: 'Retirar verificación',
  },
  desbloquear: {
    titulo: 'Quitar el bloqueo del semestre',
    cuerpo:
      'El estudiante podrá cambiar o deshacer su enlace desde su app. Hazlo si se equivocó de documento o cambió de cuenta; el bloqueo existe para que nadie marque asistencia por otra persona cambiando de documento.',
    boton: 'Quitar bloqueo',
  },
  liberar: {
    titulo: 'Liberar el documento',
    cuerpo:
      'Borra el enlace: ese documento queda libre para enlazarse de nuevo y la cuenta que lo tenía deja de recibir avisos. Si el dueño ya lo pidió desde su app, es mejor asignárselo desde la solicitud: así nadie más puede tomarlo antes.',
    boton: 'Liberar documento',
  },
};

function DialogoVinculo({
  vinculo,
  accion,
  onClose,
}: {
  vinculo: Vinculo;
  accion: AccionVinculo;
  onClose: () => void;
}) {
  const cambiar = useAccionVinculo();
  const texto = TEXTO_ACCION_VINCULO[accion];

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title={`${texto.titulo} · ${vinculo.estudiante?.fullName ?? vinculo.codigo}`}
        description={texto.cuerpo}
        className="max-w-md"
      >
        <p className="flex items-center gap-2 text-body text-muted">
          <Inbox className="size-4" aria-hidden />
          Documento <span className="font-mono font-semibold tabular text-text">{vinculo.codigo}</span>
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={cambiar.isPending}>
            Cancelar
          </Button>
          <Button
            variant={accion === 'liberar' || accion === 'desverificar' ? 'danger' : 'primary'}
            loading={cambiar.isPending}
            onClick={() => cambiar.mutate({ linkId: vinculo.linkId, accion }, { onSuccess: onClose })}
          >
            {texto.boton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
