import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [altoCardReal, setAltoCardReal] = useState<number>(280);
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

  // Medir la altura real de la tarjeta para asegurar que la barra de progreso nunca se corte abajo.
  useLayoutEffect(() => {
    if (cardRef.current) {
      const h = cardRef.current.offsetHeight;
      if (h > 0 && h !== altoCardReal) {
        setAltoCardReal(h);
      }
    }
  }, [indice, paso, altoCardReal]);

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

  // Cálculo dinámico de la posición de la tarjeta para no tapar el elemento ni las pestañas del menú.
  const margen = 20;
  const anchoNota = 340;
  const altoNota = Math.max(280, altoCardReal);

  let estiloNota: React.CSSProperties;

  if (!recuadro) {
    estiloNota = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    // Si el elemento está en la barra lateral (menú de navegación a la izquierda)
    const esBarraLateral = recuadro.left < 280;
    const cabeALaDerecha = recuadro.left + recuadro.width + margen + anchoNota <= window.innerWidth - margen;

    if (esBarraLateral && cabeALaDerecha) {
      // Posicionar a la derecha del ítem del menú asegurando margen holgado con el borde inferior
      const maxTop = window.innerHeight - altoNota - margen;
      estiloNota = {
        top: Math.max(margen, Math.min(recuadro.top, maxTop)),
        left: recuadro.left + recuadro.width + margen,
      };
    } else if (recuadro.top + recuadro.height + margen + altoNota <= window.innerHeight - margen) {
      // Posicionar debajo del elemento si cabe holgadamente
      estiloNota = {
        top: recuadro.top + recuadro.height + margen,
        left: Math.min(
          Math.max(margen, recuadro.left),
          Math.max(margen, window.innerWidth - anchoNota - margen),
        ),
      };
    } else if (recuadro.top - altoNota - margen >= margen) {
      // Posicionar encima del elemento sin solapar la pestaña
      estiloNota = {
        top: recuadro.top - altoNota - margen,
        left: Math.min(
          Math.max(margen, recuadro.left),
          Math.max(margen, window.innerWidth - anchoNota - margen),
        ),
      };
    } else if (cabeALaDerecha) {
      // Posicionar a la derecha si no cabe verticalmente
      estiloNota = {
        top: Math.max(margen, Math.min(recuadro.top, window.innerHeight - altoNota - margen)),
        left: recuadro.left + recuadro.width + margen,
      };
    } else {
      // Ajuste de respaldo
      estiloNota = {
        top: Math.max(margen, Math.min(recuadro.top - altoNota, window.innerHeight - altoNota - margen)),
        left: Math.max(margen, window.innerWidth - anchoNota - margen),
      };
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Tutorial">
      {/* Definición de máscara SVG para recortar la opción señalada */}
      <svg className="pointer-events-none absolute inset-0 size-full">
        <defs>
          <mask id="uts-tour-spotlight-mask" x="0" y="0" width="100%" height="100%">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {recuadro && (
              <rect
                x={recuadro.left - 6}
                y={recuadro.top - 6}
                width={recuadro.width + 12}
                height={recuadro.height + 12}
                rx="10"
                ry="10"
                fill="black"
                className="transition-all duration-300"
              />
            )}
          </mask>
        </defs>
      </svg>

      {/* Velo desenfocado (backdrop blur) y oscurecido con hueco transparente para la opción destacada */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-all duration-300"
        style={
          recuadro
            ? {
                mask: 'url(#uts-tour-spotlight-mask)',
                WebkitMask: 'url(#uts-tour-spotlight-mask)',
              }
            : undefined
        }
        onClick={onFinish}
      />

      {/* Anillo de resalte alrededor de la opción destacada (original) */}
      {recuadro && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-transparent shadow-xl transition-all duration-300"
          style={{
            top: recuadro.top - 6,
            left: recuadro.left - 6,
            width: recuadro.width + 12,
            height: recuadro.height + 12,
          }}
        />
      )}

      <div
        ref={cardRef}
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
