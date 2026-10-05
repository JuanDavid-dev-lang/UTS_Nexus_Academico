import { PlugZap } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Estado para lo que no funciona sin servidor (asistente, reportes, lectura de
 * fotos y PDF, importaciones). Dice qué pasa y que lo guardado sigue
 * disponible, en vez de dejar que el error de red de la primera petición sea
 * lo que lea el docente.
 */
export function RequiereConexion({
  funcion,
  className,
}: {
  /** Qué no está disponible, con artículo: «El asistente», «Los reportes». */
  funcion: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-surface-alt/70">
        <div className="flex size-11 items-center justify-center rounded-full bg-surface text-warning shadow-sm">
          <PlugZap className="size-6" aria-hidden />
        </div>
      </div>
      <h3 className="text-body font-semibold text-text">Requiere conexión</h3>
      <p className="max-w-sm text-caption leading-relaxed text-muted">
        {funcion} necesita al servidor y ahora no responde. Puedes seguir calificando y pasando
        lista: lo que escribas se guarda en este equipo y se envía solo al volver la conexión.
      </p>
    </div>
  );
}

/** Texto para el `title` de un botón desactivado por falta de conexión. */
export const TEXTO_SIN_CONEXION = 'Requiere conexión con el servidor';
