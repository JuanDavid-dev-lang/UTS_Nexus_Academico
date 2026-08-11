import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Info } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Skeleton,
} from '@/shared/ui';
import { Switch } from '@/shared/ui/primitives';
import { queryKeys } from '@/core/api/query-keys';
import { notificationPreferencesRepository } from '@/infrastructure/repositories/agenda.repository';
import { ANTELACIONES } from '@/features/agenda/presentacion';
import { asegurarPermisoNotificaciones } from '@/core/platform/notifications';
import { isDesktop } from '@/core/platform/tauri';
import { toast } from '@/state/toast.store';
import type { NotificationPreferences } from '@/domain/schemas/agenda';

const CATEGORIAS: { clave: keyof NotificationPreferences; etiqueta: string; detalle: string }[] = [
  { clave: 'clases', etiqueta: 'Clases', detalle: 'Recordatorios de tus clases y cambios de horario.' },
  { clave: 'evaluaciones', etiqueta: 'Evaluaciones', detalle: 'Parciales, quices y entregas próximas.' },
  { clave: 'asistencia', etiqueta: 'Asistencia', detalle: 'Ausencias acumuladas y registros pendientes.' },
  { clave: 'riesgo', etiqueta: 'Riesgo académico', detalle: 'Estudiantes que entran o salen de riesgo.' },
  { clave: 'intervenciones', etiqueta: 'Intervenciones', detalle: 'Seguimiento de acciones pendientes.' },
  { clave: 'eventos', etiqueta: 'Eventos', detalle: 'Reuniones, tutorías y eventos académicos.' },
  { clave: 'recordatorios', etiqueta: 'Recordatorios', detalle: 'Los que creas tú en la agenda.' },
  { clave: 'sincronizacion', etiqueta: 'Sincronización', detalle: 'Avisos técnicos de sincronización.' },
  { clave: 'sistema', etiqueta: 'Sistema', detalle: 'Versiones nuevas y mantenimiento.' },
];

/**
 * Preferencias de notificación.
 *
 * Guardan en el servidor, no en el equipo: el teléfono y el escritorio del
 * mismo docente tienen que estar de acuerdo sobre a qué hora avisar, o la
 * antelación cambiada en uno seguiría siendo la vieja en el otro.
 */
export function NotificationsCard() {
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: () => notificationPreferencesRepository.get(),
    staleTime: 5 * 60_000,
  });

  const [borrador, setBorrador] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    if (consulta.data?.preferences) setBorrador(consulta.data.preferences);
  }, [consulta.data]);

  const guardar = useMutation({
    mutationFn: (cambios: Partial<NotificationPreferences>) =>
      notificationPreferencesRepository.update(cambios),
    onSuccess(resultado) {
      setBorrador(resultado.preferences);
      queryClient.setQueryData(queryKeys.notifications.preferences(), resultado);
      toast.success('Preferencias guardadas');
    },
    onError(error) {
      // Se recarga lo que hay en el servidor: dejar el interruptor movido
      // haría creer que se guardó algo que no se guardó.
      void consulta.refetch();
      toast.fromError(error, 'No se pudieron guardar las preferencias');
    },
  });

  if (consulta.isPending || !borrador) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
        </CardContent>
      </Card>
    );
  }

  if (consulta.isError) {
    return (
      <Card>
        <ErrorState error={consulta.error} onRetry={() => void consulta.refetch()} />
      </Card>
    );
  }

  function cambiar(cambios: Partial<NotificationPreferences>) {
    setBorrador((actual) => (actual ? { ...actual, ...cambios } : actual));
    guardar.mutate(cambios);
  }

  function alternarAntelacion(minutos: number) {
    const actuales = borrador?.classLeadMinutes ?? [];
    const siguientes = actuales.includes(minutos)
      ? actuales.filter((valor) => valor !== minutos)
      : [...actuales, minutos];
    cambiar({ classLeadMinutes: siguientes });
  }

  const pushConfigurado = consulta.data?.pushConfigurado ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4" aria-hidden />
          Notificaciones
        </CardTitle>
        <CardDescription>
          Qué te avisamos y con cuánta antelación. Se aplica también a tu teléfono.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-caption font-bold uppercase tracking-wide text-muted">
            Antelación de las clases
          </h3>
          <div className="flex flex-wrap gap-2">
            {ANTELACIONES.map((opcion) => {
              const activo = borrador.classLeadMinutes.includes(opcion.valor);
              return (
                <button
                  key={opcion.valor}
                  type="button"
                  onClick={() => alternarAntelacion(opcion.valor)}
                  aria-pressed={activo}
                  className={
                    activo
                      ? 'rounded-full bg-primary px-3 py-1 text-caption font-semibold text-on-primary'
                      : 'rounded-full border border-border px-3 py-1 text-caption text-muted hover:border-border-strong'
                  }
                >
                  {opcion.etiqueta}
                </button>
              );
            })}
          </div>
          <p className="text-caption text-muted">
            Además de las que elijas, siempre se avisa cuando la clase comienza.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-caption font-bold uppercase tracking-wide text-muted">Qué recibir</h3>
          <ul className="flex flex-col divide-y divide-border">
            {CATEGORIAS.map((categoria) => (
              <li key={categoria.clave} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-body text-text">{categoria.etiqueta}</p>
                  <p className="text-caption text-muted">{categoria.detalle}</p>
                </div>
                <Switch
                  checked={Boolean(borrador[categoria.clave])}
                  onCheckedChange={(valor) => cambiar({ [categoria.clave]: valor } as Partial<NotificationPreferences>)}
                  aria-label={categoria.etiqueta}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-caption font-bold uppercase tracking-wide text-muted">Horas de silencio</h3>
          <div className="flex items-center justify-between gap-4">
            <p className="text-body text-muted">
              Dentro de la franja no suena nada, pero las notificaciones siguen llegando a la bandeja.
            </p>
            <Switch
              checked={borrador.quietHours.enabled}
              onCheckedChange={(valor) =>
                cambiar({ quietHours: { ...borrador.quietHours, enabled: valor } })
              }
              aria-label="Activar horas de silencio"
            />
          </div>

          {borrador.quietHours.enabled ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-caption font-semibold text-muted">
                Desde
                <Input
                  type="time"
                  value={borrador.quietHours.start}
                  onChange={(evento) =>
                    cambiar({ quietHours: { ...borrador.quietHours, start: evento.target.value } })
                  }
                  className="w-32"
                />
              </label>
              <label className="flex flex-col gap-1 text-caption font-semibold text-muted">
                Hasta
                <Input
                  type="time"
                  value={borrador.quietHours.end}
                  onChange={(evento) =>
                    cambiar({ quietHours: { ...borrador.quietHours, end: evento.target.value } })
                  }
                  className="w-32"
                />
              </label>
              <label className="flex items-center gap-2 text-body text-text">
                <Switch
                  checked={borrador.urgentBypassesQuietHours}
                  onCheckedChange={(valor) => cambiar({ urgentBypassesQuietHours: valor })}
                />
                Dejar pasar las urgentes
              </label>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-caption font-bold uppercase tracking-wide text-muted">Canales</h3>
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-body text-text">
              <Switch checked={borrador.inApp} onCheckedChange={(valor) => cambiar({ inApp: valor })} />
              En la aplicación
            </label>
            <label className="flex items-center gap-2 text-body text-text">
              <Switch checked={borrador.push} onCheckedChange={(valor) => cambiar({ push: valor })} />
              Al teléfono
            </label>
          </div>

          {!pushConfigurado ? (
            <p className="flex items-start gap-2 rounded-lg bg-info-soft p-3 text-caption text-info">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Este servidor no tiene configurado el envío al teléfono con la app cerrada. Android
              seguirá avisándote de tus clases con alarmas locales, que funcionan sin conexión.
            </p>
          ) : null}

          {isDesktop ? (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={async () => {
                const concedido = await asegurarPermisoNotificaciones();
                if (concedido) toast.success('Avisos del escritorio activados');
                else
                  toast.warning(
                    'Sin permiso del sistema',
                    'Actívalo en las notificaciones de Windows para esta aplicación.',
                  );
              }}
            >
              Probar avisos del escritorio
            </Button>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
