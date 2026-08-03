import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '@/shared/ui';
import { PASOS, type PasoTour } from './pasos';

const CLAVE = 'uts.tutorial.visto';

/** ¿Ya lo vio esta persona? Se guarda por usuario, no por instalación. */
export function tutorialVisto(usuarioId: string): boolean {
  return localStorage.getItem(`${CLAVE}.${usuarioId}`) === '1';
}

export function marcarTutorialVisto(usuarioId: string): void {
  localStorage.setItem(`${CLAVE}.${usuarioId}`, '1');
}

type Recuadro = { top: number; left: number; width: number; height: number };

/**
 * Recorrido guiado de la aplicación.
 *
 * Cada paso ilumina un elemento real de la pantalla y explica para qué sirve.
 * Se navega con Siguiente y Atrás, y se puede abandonar en cualquier momento.
 *
 * El recuadro se calcula midiendo el elemento en el DOM, no con coordenadas
 * fijas: la ventana se redimensiona, el menú lateral se contrae y una posición
 * escrita a mano quedaría señalando el sitio equivocado. Si un paso apunta a
 * algo que no está en pantalla, se muestra centrado en vez de saltárselo, para
 * que la explicación no se pierda.
 */
export function Tour({ onFinish }: { onFinish: () => void }) {
  const [indice, setIndice] = useState(0);
  const [recuadro, setRecuadro] = useState<Recuadro | null>(null);
  const navigate = useNavigate();

  const paso: PasoTour | undefined = PASOS[indice];
  const ultimo = indice === PASOS.length - 1;

  // Cada paso puede vivir en otra pantalla; se navega antes de medir.
  useEffect(() => {
    if (paso?.ruta) navigate(paso.ruta);
  }, [paso, navigate]);

  useLayoutEffect(() => {
    if (!paso) return;

    function medir() {
      if (!paso?.selector) return setRecuadro(null);
      const elemento = document.querySelector(paso.selector);
      if (!elemento) return setRecuadro(null);

      const r = elemento.getBoundingClientRect();
      setRecuadro({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    // Un fotograma de margen: el paso puede haber cambiado de ruta y la pantalla
    // nueva todavía no está pintada cuando se ejecuta este efecto.
    const t = setTimeout(medir, 220);
    window.addEventListener('resize', medir);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', medir);
    };
  }, [paso]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onFinish();
      if (e.key === 'ArrowRight') setIndice(i => Math.min(i + 1, PASOS.length - 1));
      if (e.key === 'ArrowLeft') setIndice(i => Math.max(i - 1, 0));
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onFinish]);

  if (!paso) return null;

  // La nota se coloca debajo del elemento, salvo que no quepa: entonces encima.
  const margen = 14;
  const anchoNota = 340;
  const estiloNota: React.CSSProperties = recuadro
    ? {
        top:
          recuadro.top + recuadro.height + margen + 200 > window.innerHeight
            ? Math.max(margen, recuadro.top - 200 - margen)
            : recuadro.top + recuadro.height + margen,
        left: Math.min(
          Math.max(margen, recuadro.left),
          Math.max(margen, window.innerWidth - anchoNota - margen),
        ),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Tutorial">
      {/* Velo con un hueco: el elemento señalado se ve a través del recorte. */}
      <div className="absolute inset-0 bg-black/60" onClick={onFinish} />

      {recuadro && (
        <div
          className="pointer-events-none absolute rounded-lg ring-4 ring-primary transition-all duration-300"
          style={{
            top: recuadro.top - 4,
            left: recuadro.left - 4,
            width: recuadro.width + 8,
            height: recuadro.height + 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      )}

      <div
        className="absolute w-[340px] rounded-xl bg-surface p-4 shadow-pop"
        style={estiloNota}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="text-caption font-semibold uppercase tracking-wide text-primary">
            Paso {indice + 1} de {PASOS.length}
          </span>
          <button
            type="button"
            onClick={onFinish}
            aria-label="Cerrar el tutorial"
            className="rounded p-0.5 text-muted hover:text-text"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <h3 className="mb-1.5 text-body font-bold text-text">{paso.titulo}</h3>
        <p className="text-body text-muted">{paso.texto}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onFinish}
            className="text-caption text-muted underline-offset-2 hover:underline"
          >
            Saltar
          </button>

          <div className="flex gap-2">
            {indice > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setIndice(i => i - 1)}>
                <ArrowLeft className="size-4" aria-hidden />
                Atrás
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={() => (ultimo ? onFinish() : setIndice(i => i + 1))}
            >
              {ultimo ? 'Terminar' : 'Siguiente'}
              {!ultimo && <ArrowRight className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>

        {/* Progreso: barritas, no un porcentaje. Se ve de un vistazo cuánto falta. */}
        <div className="mt-3 flex gap-1">
          {PASOS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= indice ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
