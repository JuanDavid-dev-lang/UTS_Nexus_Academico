import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/shared/ui/logo';
import { Button } from '@/shared/ui';
import { useSession } from '@/state/session.store';

/**
 * Startup screen shown while the stored session is being validated.
 *
 * It carries the brand instead of a bare spinner, so the first thing the user
 * sees already looks like the product.
 */
export function BootScreen({ message = 'Preparando tu espacio…' }: { message?: string }) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg">
      <Logo size={72} className="animate-pulse" alt="" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-body font-semibold text-text">UTS Nexus Académico</p>
        <p className="text-caption text-muted">{message}</p>
      </div>
    </div>
  );
}

/** Cada cuánto se reintenta sola mientras el servidor no contesta. */
const REINTENTO_MS = 15_000;

/**
 * Hay una sesión guardada, pero el servidor no contestó al arrancar.
 *
 * La sesión se conserva: no contestar no dice nada de si sigue siendo válida.
 * Antes se borraba y cada arranque con el servidor apagado —o aún despertando—
 * acababa en el formulario de inicio de sesión. Se reintenta sola, porque lo
 * normal es que el servidor vuelva en un momento y nadie tenga que hacer nada.
 */
export function UnreachableScreen() {
  const serverUrl = useSession((state) => state.serverUrl);
  const reconnect = useSession((state) => state.reconnect);
  const forget = useSession((state) => state.forget);
  const [intentando, setIntentando] = useState(false);

  const intentar = useCallback(async () => {
    setIntentando(true);
    try {
      await reconnect();
    } finally {
      setIntentando(false);
    }
  }, [reconnect]);

  useEffect(() => {
    const id = window.setInterval(() => void intentar(), REINTENTO_MS);
    return () => window.clearInterval(id);
  }, [intentar]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <Logo size={72} alt="" />
      <div className="flex max-w-md flex-col items-center gap-1.5">
        <p className="text-body font-semibold text-text">No se pudo conectar con el servidor</p>
        <p className="text-caption text-muted">
          Tu sesión sigue guardada. Se vuelve a intentar sola cada pocos segundos; si el servidor estaba
          apagado, entrarás en cuanto responda.
        </p>
        <p className="font-mono text-caption text-subtle">{serverUrl}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" loading={intentando} onClick={() => void intentar()}>
          Reintentar ahora
        </Button>
        <Button variant="ghost" onClick={() => void forget()}>
          Usar otra cuenta
        </Button>
      </div>
    </div>
  );
}
