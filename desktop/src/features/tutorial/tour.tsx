import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button, Rubri } from '@/shared/ui';
import { useTheme } from '@/state/theme.store';
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

const MARGEN = 20;
const ANCHO_NOTA = 360;
const HOLGURA = 8;
/** Cuánto se espera a que aparezca el elemento tras cambiar de pantalla. */
const ESPERA_MAX_MS = 1200;

const RESORTE = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 } as const;

/**
 * Dónde va la tarjeta respecto al elemento iluminado.
 *
 * Se prueba en el orden del lado con más sitio: derecha o izquierda si el
 * elemento está pegado a un borde lateral (el menú), debajo o encima si está
 * pegado arriba o abajo (la barra). Ningún lado asume dónde está el menú:
 * ahora puede estar en cualquiera de los cuatro.
 */
function posicionarNota(recuadro: Recuadro, altoNota: number): { top: number; left: number } {
  const anchoVentana = window.innerWidth;
  const altoVentana = window.innerHeight;
  const acotarX = (x: number) => Math.min(Math.max(MARGEN, x), Math.max(MARGEN, anchoVentana - ANCHO_NOTA - MARGEN));
  const acotarY = (y: number) => Math.min(Math.max(MARGEN, y), Math.max(MARGEN, altoVentana - altoNota - MARGEN));

  const derecha = anchoVentana - (recuadro.left + recuadro.width);
  const abajo = altoVentana - (recuadro.top + recuadro.height);
  const cabeDerecha = derecha >= ANCHO_NOTA + MARGEN * 2;
  const cabeIzquierda = recuadro.left >= ANCHO_NOTA + MARGEN * 2;
  const cabeAbajo = abajo >= altoNota + MARGEN * 2;
  const cabeArriba = recuadro.top >= altoNota + MARGEN * 2;

  // Pegado a un lado: la tarjeta va al lado, alineada por arriba.
  const lateral = recuadro.left < anchoVentana * 0.25 || derecha < anchoVentana * 0.25;
  const orden: Array<'derecha' | 'izquierda' | 'abajo' | 'arriba'> = lateral
    ? recuadro.left < derecha
      ? ['derecha', 'izquierda', 'abajo', 'arriba']
      : ['izquierda', 'derecha', 'abajo', 'arriba']
    : recuadro.top < abajo
      ? ['abajo', 'arriba', 'derecha', 'izquierda']
      : ['arriba', 'abajo', 'derecha', 'izquierda'];

  for (const lado of orden) {
    if (lado === 'derecha' && cabeDerecha) {
      return { top: acotarY(recuadro.top), left: recuadro.left + recuadro.width + MARGEN };
    }
    if (lado === 'izquierda' && cabeIzquierda) {
      return { top: acotarY(recuadro.top), left: recuadro.left - ANCHO_NOTA - MARGEN };
    }
    if (lado === 'abajo' && cabeAbajo) {
      return { top: recuadro.top + recuadro.height + MARGEN, left: acotarX(recuadro.left) };
    }
    if (lado === 'arriba' && cabeArriba) {
      return { top: recuadro.top - altoNota - MARGEN, left: acotarX(recuadro.left) };
    }
  }
  // Respaldo: esquina inferior derecha, sin tapar el elemento si se puede.
  return { top: acotarY(altoVentana - altoNota - MARGEN), left: acotarX(anchoVentana - ANCHO_NOTA - MARGEN) };
}

/**
 * Recorrido guiado de la aplicación.
 *
 * Cada paso ilumina un elemento real de la pantalla y explica para qué sirve.
 * Se navega con Siguiente y Atrás, y se puede abandonar en cualquier momento.
 *
 * El recuadro se calcula midiendo el elemento en el DOM, no con coordenadas
 * fijas: la ventana se redimensiona, el menú se contrae o cambia de lado, y
 * una posición escrita a mano quedaría señalando el sitio equivocado. Si un
 * paso apunta a algo que no está en pantalla, se muestra centrado en vez de
 * saltárselo, para que la explicación no se pierda.
 *
 * Por qué se ve fluido: el foco es **un solo `div` con una sombra enorme**
 * que se mueve con un resorte de framer-motion. La versión anterior era un
 * velo a pantalla completa con `backdrop-blur` recortado por una máscara SVG,
 * y eso obliga al navegador a desenfocar toda la ventana en cada fotograma
 * —en WebView2 y WebKitGTK se notaba como un tirón en cada paso—. Además el
 * elemento se espera con `requestAnimationFrame` hasta que existe, en vez de
 * un temporizador fijo que llegaba tarde en pantallas lentas y dejaba la
 * tarjeta centrada sin nada iluminado.
 */
export function Tour({ onFinish }: { onFinish: () => void }) {
  const [indice, setIndice] = useState(0);
  const [direccion, setDireccion] = useState<1 | -1>(1);
  // Se guarda con el índice del paso que se midió: al cambiar de paso el
  // recuadro anterior deja de valer solo, sin un `setState` de reinicio.
  const [medido, setMedido] = useState<{ indice: number; recuadro: Recuadro } | null>(null);
  const recuadro = medido?.indice === indice ? medido.recuadro : null;
  const [altoNota, setAltoNota] = useState(280);
  const cardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const prefiereMenos = useReducedMotion();
  const reducirMovimiento = useTheme((state) => state.apariencia.reducirMovimiento);
  const sinMovimiento = Boolean(prefiereMenos) || reducirMovimiento;
  const transicion = sinMovimiento ? { duration: 0 } : RESORTE;

  const paso: PasoTour | undefined = PASOS[indice];
  const ultimo = indice === PASOS.length - 1;

  const avanzar = useCallback(() => {
    setDireccion(1);
    setIndice((i) => Math.min(i + 1, PASOS.length - 1));
  }, []);
  const retroceder = useCallback(() => {
    setDireccion(-1);
    setIndice((i) => Math.max(i - 1, 0));
  }, []);

  // Cada paso puede vivir en otra pantalla; se navega antes de medir.
  useEffect(() => {
    if (paso?.ruta) navigate(paso.ruta);
  }, [paso, navigate]);

  // Medir el elemento del paso. Se espera a que exista —la pantalla nueva
  // puede tardar en pintarse— y después se sigue midiendo en cada resize.
  useLayoutEffect(() => {
    if (!paso) return;
    const selector = paso.selector;
    if (!selector) return;
    const pasoMedido = indice;

    let vivo = true;
    let cuadro = 0;
    const inicio = performance.now();

    function medir(): boolean {
      const elemento = document.querySelector(selector as string);
      if (!elemento) return false;
      const r = elemento.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      setMedido({ indice: pasoMedido, recuadro: { top: r.top, left: r.left, width: r.width, height: r.height } });
      return true;
    }

    function esperar() {
      if (!vivo) return;
      if (medir()) return;
      // Pasado el plazo, el paso se queda centrado: `recuadro` ya es null
      // para este índice.
      if (performance.now() - inicio > ESPERA_MAX_MS) return;
      cuadro = requestAnimationFrame(esperar);
    }
    esperar();

    // Un solo `rAF` en vuelo: el resize dispara decenas de eventos por segundo
    // y medir en cada uno era la otra mitad del tirón.
    let pendiente = 0;
    function alCambiar() {
      if (pendiente) return;
      pendiente = requestAnimationFrame(() => {
        pendiente = 0;
        if (vivo) medir();
      });
    }
    window.addEventListener('resize', alCambiar);
    // El menú puede contraerse o cambiar de lado mientras el tour está abierto.
    const observador = new ResizeObserver(alCambiar);
    observador.observe(document.body);

    return () => {
      vivo = false;
      cancelAnimationFrame(cuadro);
      cancelAnimationFrame(pendiente);
      window.removeEventListener('resize', alCambiar);
      observador.disconnect();
    };
  }, [paso, indice]);

  // El alto real de la tarjeta decide si cabe debajo o encima del elemento.
  useLayoutEffect(() => {
    const nodo = cardRef.current;
    if (!nodo) return;
    const observador = new ResizeObserver(([entrada]) => {
      const alto = entrada?.contentRect.height;
      if (alto && alto > 0) setAltoNota(Math.ceil(alto) + 32);
    });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onFinish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') avanzar();
      if (e.key === 'ArrowLeft') retroceder();
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onFinish, avanzar, retroceder]);

  const posicionNota = useMemo(
    () => (recuadro ? posicionarNota(recuadro, altoNota) : null),
    [recuadro, altoNota],
  );

  if (!paso) return null;

  const Icono = paso.icono;
  const progreso = ((indice + 1) / PASOS.length) * 100;

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Tutorial">
      {/*
        El foco. Un rectángulo transparente con una sombra de 200vmax que
        oscurece todo lo demás: una capa, sin desenfoque, y se anima con un
        resorte de un elemento al siguiente. Sin elemento, el rectángulo se
        encoge al centro y la sombra cubre la pantalla entera.
      */}
      <motion.div
        aria-hidden
        onClick={onFinish}
        className="absolute rounded-xl"
        initial={false}
        animate={
          recuadro
            ? {
                top: recuadro.top - HOLGURA,
                left: recuadro.left - HOLGURA,
                width: recuadro.width + HOLGURA * 2,
                height: recuadro.height + HOLGURA * 2,
                opacity: 1,
              }
            : {
                top: window.innerHeight / 2,
                left: window.innerWidth / 2,
                width: 0,
                height: 0,
                opacity: 1,
              }
        }
        transition={transicion}
        style={{ boxShadow: '0 0 0 200vmax rgb(0 0 0 / 0.58)' }}
      />

      {/* Anillo de resalte que respira sobre el elemento. Es lo que dice
          «mira aquí» cuando el foco ya está quieto. */}
      <AnimatePresence>
        {recuadro ? (
          <motion.div
            key="anillo"
            aria-hidden
            className="pointer-events-none absolute rounded-xl ring-2 ring-primary"
            initial={{ opacity: 0 }}
            animate={{
              top: recuadro.top - HOLGURA,
              left: recuadro.left - HOLGURA,
              width: recuadro.width + HOLGURA * 2,
              height: recuadro.height + HOLGURA * 2,
              opacity: 1,
            }}
            exit={{ opacity: 0 }}
            transition={transicion}
          >
            {!sinMovimiento ? (
              <motion.span
                className="absolute inset-0 rounded-xl ring-4 ring-primary/40"
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.06, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* La tarjeta. Se desliza hasta su sitio nuevo; el texto entra por el
          lado hacia el que se avanza. */}
      <motion.div
        ref={cardRef}
        className="absolute rounded-xl border border-border bg-surface p-4 shadow-pop"
        style={{ width: ANCHO_NOTA }}
        initial={false}
        animate={
          posicionNota
            ? { top: posicionNota.top, left: posicionNota.left, x: 0, y: 0 }
            : { top: window.innerHeight / 2, left: window.innerWidth / 2, x: '-50%', y: '-50%' }
        }
        transition={transicion}
        onClick={(e) => e.stopPropagation()}
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

        <AnimatePresence mode="wait" initial={false} custom={direccion}>
          <motion.div
            key={indice}
            custom={direccion}
            initial={sinMovimiento ? false : { opacity: 0, x: 18 * direccion }}
            animate={{ opacity: 1, x: 0 }}
            exit={sinMovimiento ? undefined : { opacity: 0, x: -18 * direccion }}
            transition={sinMovimiento ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex gap-3"
          >
            <div className="shrink-0 pt-0.5">
              {Icono ? (
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icono className="size-5" aria-hidden />
                </span>
              ) : (
                <Rubri emotion="happy" size="small" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="mb-1 text-body font-bold text-text">{paso.titulo}</h3>
              <p className="text-body text-muted">{paso.texto}</p>
            </div>
          </motion.div>
        </AnimatePresence>

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
              <Button size="sm" variant="secondary" onClick={retroceder}>
                <ArrowLeft className="size-4" aria-hidden />
                Atrás
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => (ultimo ? onFinish() : avanzar())}>
              {ultimo ? 'Terminar' : 'Siguiente'}
              {!ultimo && <ArrowRight className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>

        {/* Progreso: una barra que crece. Se ve de un vistazo cuánto falta. */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-border" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${progreso}%` }}
            transition={transicion}
          />
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
