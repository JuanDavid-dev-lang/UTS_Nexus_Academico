import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorUp, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Switch } from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { platform, type AjustesSistema } from '@/core/platform/tauri';
import { toAppError } from '@/core/api/errors';
import { toast } from '@/state/toast.store';

type Cambio = { campo: 'iniciarConWindows' | 'segundoPlano'; activo: boolean };

/**
 * Configuración → Inicio y sesión.
 *
 * Las dos primeras opciones solo existen en Windows (ver
 * `src-tauri/src/segundo_plano.rs`); fuera de él la tarjeta solo cuenta cómo
 * se mantiene la sesión, que vale en todos los sistemas.
 */
export function StartupCard() {
  const queryClient = useQueryClient();
  const clave = queryKeys.sistema.ajustes();

  const consulta = useQuery({ queryKey: clave, queryFn: () => platform.sistema.ajustes() });

  const cambiar = useMutation({
    mutationFn: ({ campo, activo }: Cambio) =>
      campo === 'iniciarConWindows'
        ? platform.sistema.iniciarConWindows(activo)
        : platform.sistema.segundoPlano(activo),
    // Optimista: el interruptor tiene que moverse al pulsarlo, no medio segundo
    // después, y si falla vuelve a su sitio con el motivo.
    onMutate: async ({ campo, activo }) => {
      await queryClient.cancelQueries({ queryKey: clave });
      const anterior = queryClient.getQueryData<AjustesSistema>(clave);
      if (anterior) queryClient.setQueryData(clave, { ...anterior, [campo]: activo });
      return { anterior };
    },
    onError: (error, _cambio, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(clave, contexto.anterior);
      toast.error('No se pudo guardar', toAppError(error).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: clave }),
  });

  const ajustes = consulta.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorUp className="size-4 text-muted" aria-hidden />
          Inicio y sesión
        </CardTitle>
        <CardDescription>Cómo arranca la aplicación y qué pasa al cerrarla.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ajustes?.disponible ? (
          <>
            <Opcion
              titulo="Iniciar con Windows"
              detalle="Se abre sola al encender el equipo, en segundo plano y sin mostrar la ventana."
              activo={ajustes.iniciarConWindows}
              onChange={(activo) => cambiar.mutate({ campo: 'iniciarConWindows', activo })}
            />
            <Opcion
              titulo="Seguir en segundo plano al cerrar"
              detalle="La ✕ oculta la ventana y la app sigue junto al reloj, con sus recordatorios. Para cerrarla del todo: clic derecho en su icono y «Salir»."
              activo={ajustes.segundoPlano}
              onChange={(activo) => cambiar.mutate({ campo: 'segundoPlano', activo })}
            />
          </>
        ) : null}
        <div className="flex items-start gap-3 rounded-xl border border-border p-3.5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <span>
            <span className="block text-body font-semibold text-text">Sesión siempre iniciada</span>
            <span className="block text-caption text-muted">
              Se renueva sola cada día mientras la aplicación esté abierta, también en segundo
              plano. Solo termina si cierras sesión o si pasan 30 días sin abrirla.
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Opcion({
  titulo,
  detalle,
  activo,
  onChange,
}: {
  titulo: string;
  detalle: string;
  activo: boolean;
  onChange: (activo: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5">
      <span>
        <span className="block text-body font-semibold text-text">{titulo}</span>
        <span className="block text-caption text-muted">{detalle}</span>
      </span>
      <Switch checked={activo} onCheckedChange={onChange} aria-label={titulo} />
    </label>
  );
}
