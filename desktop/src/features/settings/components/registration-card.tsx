import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldQuestion, UserPlus, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@/shared/ui';
import { Switch } from '@/shared/ui/primitives';
import { registroRepository } from '@/infrastructure/repositories/academic.repository';
import { useUserRole } from '@/state/session.store';
import { toast } from '@/state/toast.store';

/**
 * Registro de docentes: el interruptor y la cola de solicitudes.
 *
 * Son dos controles distintos a propósito. El interruptor decide CUÁNDO se
 * puede solicitar; aprobar decide QUIÉN entra. Una cuenta de docente puede
 * buscar en el directorio de estudiantes, así que dejar entrar a cualquiera que
 * rellene el formulario sería dar acceso a la identidad de los estudiantes.
 */
export function RegistrationCard() {
  const role = useUserRole();
  const esAdmin = role === 'ADMIN';
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const queryClient = useQueryClient();
  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: ['registro'] });
  };

  const estado = useQuery({
    queryKey: ['registro', 'estado'],
    queryFn: () => registroRepository.estado(),
  });

  const solicitudes = useQuery({
    queryKey: ['registro', 'solicitudes'],
    queryFn: () => registroRepository.solicitudes('PENDIENTE'),
  });

  const alternar = useMutation({
    mutationFn: (abierto: boolean) => registroRepository.cambiarEstado(abierto),
    onSuccess: ({ abierto }) => {
      recargar();
      toast.success(abierto ? 'Registro abierto' : 'Registro cerrado');
    },
    onError: causa => toast.fromError(causa, 'No se pudo cambiar'),
  });

  const decidir = useMutation({
    mutationFn: ({ id, decision, motivo }: { id: string; decision: 'APROBADO' | 'RECHAZADO'; motivo?: string }) =>
      registroRepository.decidir(id, decision, motivo),
    onSuccess: (_, variables) => {
      recargar();
      toast.success(variables.decision === 'APROBADO' ? 'Docente aprobado' : 'Solicitud rechazada');
      setRechazando(null);
      setMotivo('');
    },
    onError: causa => toast.fromError(causa, 'No se pudo procesar'),
  });

  if (!esAdmin) return null;

  const pendientes = solicitudes.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4 text-muted" aria-hidden />
          Registro de docentes
        </CardTitle>
        <CardDescription>
          Quién puede crear una cuenta, y quién entra de verdad
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-alt p-3">
          <div className="min-w-0">
            <p className="text-body font-medium text-text">Permitir solicitudes</p>
            <p className="text-caption text-muted">
              Con esto abierto, cualquiera con la dirección de la app puede enviar una
              solicitud. Ciérralo cuando termine el periodo de inscripción.
            </p>
          </div>
          <Switch
            checked={estado.data?.abierto ?? false}
            disabled={alternar.isPending || estado.isPending}
            onCheckedChange={valor => alternar.mutate(valor)}
            aria-label="Permitir solicitudes de registro"
          />
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-body font-medium text-text">
            Solicitudes por revisar
            {pendientes.length > 0 && <Badge tone="warning">{pendientes.length}</Badge>}
          </p>

          {solicitudes.isPending ? (
            <p className="text-caption text-muted">Cargando…</p>
          ) : pendientes.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg bg-surface-alt p-3 text-caption text-muted">
              <ShieldQuestion className="size-4 shrink-0" aria-hidden />
              No hay nada pendiente. Las cuentas nuevas aparecen aquí antes de poder entrar.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {pendientes.map(s => (
                <div key={s._id} className="flex flex-col gap-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-body font-medium text-text">
                        {s.nombres} {s.apellidos}
                      </p>
                      <p className="text-caption text-muted">
                        C.C. {s.cedula} · {s.userId?.email}
                      </p>
                      <p className="text-caption text-muted">
                        {s.sede} · {s.programas.length} programa(s) · {s.niveles.join(', ')}
                      </p>
                    </div>

                    {rechazando !== s._id && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-danger"
                          onClick={() => setRechazando(s._id)}
                        >
                          <X className="size-4" aria-hidden />
                          Rechazar
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={decidir.isPending}
                          onClick={() => decidir.mutate({ id: s._id, decision: 'APROBADO' })}
                        >
                          <Check className="size-4" aria-hidden />
                          Aprobar
                        </Button>
                      </div>
                    )}
                  </div>

                  {rechazando === s._id && (
                    <div className="flex flex-col gap-2">
                      <Input
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        placeholder="Motivo del rechazo (lo verá al intentar entrar)"
                        aria-label="Motivo del rechazo"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setRechazando(null)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={decidir.isPending}
                          onClick={() => decidir.mutate({ id: s._id, decision: 'RECHAZADO', motivo })}
                        >
                          Confirmar rechazo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
