import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimate } from 'framer-motion';
import { Rubri, type RubriEmotion } from '@/shared/ui/rubri';
import { useSinMovimiento } from '@/shared/hooks/use-sin-movimiento';
import {
  DURACION_DESMAYO_MS,
  SIN_TOQUES,
  faseDe,
  registrarToque,
  type FaseRubri,
} from '@/domain/rubri/desmayo';

/** Cara de Rubri en cada fase; la normal es la que pide la pantalla. */
function caraDe(fase: FaseRubri, normal: RubriEmotion): RubriEmotion {
  if (fase === 'desmayado') return 'offline';
  if (fase === 'mareado') return 'sad';
  if (fase === 'molesto') return 'neutral';
  return normal;
}

/** Cuánto se tambalea con cada toque: más cuanto más lo marean. */
const TAMBALEO: Record<Exclude<FaseRubri, 'desmayado'>, number> = {
  normal: 4,
  molesto: 9,
  mareado: 16,
};

/**
 * Rubri asomado sobre la tarjeta del acceso. Easter egg: no está señalado ni
 * entra en el orden de tabulación, y tocarlo no hace nada con el formulario.
 * Las reglas (cuántos toques, cuánto dura) viven en `domain/rubri/desmayo.ts`.
 */
export function RubriDelAcceso({ emocion }: { emocion: RubriEmotion }) {
  const sinMovimiento = useSinMovimiento();
  const [alcance, animar] = useAnimate<HTMLDivElement>();
  const [conteo, setConteo] = useState(SIN_TOQUES);
  const recuperacion = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fase = faseDe(conteo.toques);
  const desmayado = fase === 'desmayado';

  useEffect(
    () => () => {
      if (recuperacion.current) clearTimeout(recuperacion.current);
    },
    [],
  );

  function tocar() {
    if (desmayado) return;
    const siguiente = registrarToque(conteo, Date.now());
    const nuevaFase = faseDe(siguiente.toques);
    setConteo(siguiente);

    if (nuevaFase === 'desmayado') {
      recuperacion.current = setTimeout(() => setConteo(SIN_TOQUES), DURACION_DESMAYO_MS);
      return;
    }
    if (sinMovimiento || !alcance.current) return;
    const giro = TAMBALEO[nuevaFase];
    void animar(
      alcance.current,
      { scale: [1, 0.88, 1.06, 1], rotate: [0, -giro, giro * 0.6, 0] },
      { duration: 0.38, ease: 'easeOut' },
    );
  }

  return (
    <div className="relative">
      <motion.div
        animate={
          desmayado && !sinMovimiento
            ? { rotate: -90, x: -6, y: 18 }
            : { rotate: 0, x: 0, y: 0 }
        }
        transition={
          desmayado
            ? { duration: 0.55, ease: [0.55, 0, 0.9, 0.4] }
            : { duration: 0.45, ease: 'easeOut' }
        }
        style={{ transformOrigin: '50% 90%' }}
      >
        <div ref={alcance} onClick={tocar} className="cursor-default">
          <Rubri emotion={caraDe(fase, emocion)} size="medium" animated={false} />
        </div>
      </motion.div>

      <AnimatePresence>
        {desmayado ? (
          <motion.p
            role="status"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, delay: sinMovimiento ? 0 : 0.5 }}
            className="pointer-events-none absolute right-full top-1/3 mr-1 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-caption text-muted shadow-sm"
          >
            Rubri se desmayó. Dale un momento…
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
