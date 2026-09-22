import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type Variants } from 'framer-motion';
import { ClipboardCheck, Maximize2, Minimize2, QrCode, ShieldCheck, Sparkles } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { Kbd } from '@/shared/ui/primitives';
import { cn } from '@/shared/lib/cn';
import { RESORTE } from './resorte';
import {
  alternarPantallaCompleta,
  usePantallaCompleta,
} from '@/core/platform/pantalla-completa';

/**
 * La capa visual de la pantalla de acceso, separada del formulario.
 *
 * Es la misma idea que el acceso del móvil (`login_page.dart`): la pantalla
 * entera es la superficie de marca —uno de los tres sitios a los que
 * DESIGN.md §4 se la reserva—, con nubes de la paleta que respiran despacio y
 * una apertura escalonada. Todo el color sale de los tokens: con el tono
 * Océano las nubes son azules sin que aquí cambie nada.
 */


/** Desplazamiento de una nube en su ida y vuelta (variables de `.acceso-nube`). */
function vaiven(x: string, y: string, retraso?: string): React.CSSProperties {
  return {
    ['--nube-x' as string]: x,
    ['--nube-y' as string]: y,
    ...(retraso ? { animationDelay: retraso } : {}),
  };
}

// ── Fondo ────────────────────────────────────────────────────────────────────

/** Recorrido máximo del paralaje, en píxeles, de borde a borde de la ventana. */
const PARALAJE_PX = 36;

/**
 * Degradado de marca (lo pone el contenedor), tres nubes y una trama de
 * puntos. Las nubes siguen al puntero con un paralaje corto montado en un
 * resorte, y la tercera va a contramano: da profundidad sin que nada se mueva
 * lo bastante como para distraer de escribir.
 */
export function FondoAcceso({ sinMovimiento }: { sinMovimiento: boolean }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const suaveX = useSpring(x, { stiffness: 40, damping: 18 });
  const suaveY = useSpring(y, { stiffness: 40, damping: 18 });
  const contraX = useTransform(suaveX, (v) => -v * 0.6);
  const contraY = useTransform(suaveY, (v) => -v * 0.6);

  useEffect(() => {
    if (sinMovimiento) return undefined;
    function mover(evento: PointerEvent) {
      x.set((evento.clientX / window.innerWidth - 0.5) * PARALAJE_PX);
      y.set((evento.clientY / window.innerHeight - 0.5) * PARALAJE_PX);
    }
    window.addEventListener('pointermove', mover, { passive: true });
    return () => window.removeEventListener('pointermove', mover);
  }, [sinMovimiento, x, y]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div className="absolute inset-0" style={{ x: suaveX, y: suaveY }}>
        <div
          className="acceso-nube -left-[12%] -top-[18%] size-[46rem] bg-accent/25 dark:bg-accent/10"
          style={vaiven('6%', '5%')}
        />
        <div
          className="acceso-nube -bottom-[26%] left-[18%] size-[40rem] bg-on-primary/10 dark:bg-accent/5"
          style={vaiven('-5%', '-6%', '-9s')}
        />
      </motion.div>
      <motion.div className="absolute inset-0" style={{ x: contraX, y: contraY }}>
        <div
          className="acceso-nube -right-[14%] top-[22%] size-[36rem] bg-accent/15 dark:bg-accent/5"
          style={vaiven('-7%', '4%', '-4s')}
        />
      </motion.div>
      {/* Trama de puntos que se apaga hacia fuera: textura, no contenido. */}
      <div
        className={cn(
          'absolute inset-0 opacity-[0.08]',
          'bg-[radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px]',
          '[mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_70%)]',
        )}
      />
    </div>
  );
}

// ── Héroe ────────────────────────────────────────────────────────────────────

const escalonado: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};

const sube: Variants = {
  oculto: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: RESORTE },
};

const entraDeLado: Variants = {
  oculto: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: RESORTE },
};

const FUNCIONES = [
  { Icono: ClipboardCheck, titulo: 'Notas por corte', detalle: 'Con plantillas y pesos por nota.' },
  { Icono: QrCode, titulo: 'Asistencia con QR', detalle: 'El estudiante confirma desde UniPlanner.' },
  { Icono: Sparkles, titulo: 'Riesgo académico', detalle: 'Un modelo que explica cada alerta.' },
] as const;

/** Columna de marca: solo en ventanas anchas, donde el formulario ya tiene sitio. */
export function HeroAcceso() {
  return (
    <motion.section
      variants={escalonado}
      initial="oculto"
      animate="visible"
      className="hidden max-w-xl flex-1 flex-col justify-center gap-8 lg:flex"
    >
      <motion.div variants={sube} className="flex items-center gap-4">
        <LogoConAnillo size={64} />
        <div className="flex flex-col">
          <span className="text-h3 font-bold leading-tight">UTS Nexus Académico</span>
          <span className="text-caption uppercase tracking-[0.14em] opacity-80">
            Unidades Tecnológicas de Santander
          </span>
        </div>
      </motion.div>

      <motion.h2 variants={sube} className="text-h1 font-bold leading-[1.08] tracking-tight">
        Menos planillas.
        <br />
        <span className="text-accent">Más tiempo</span> con tus estudiantes.
      </motion.h2>

      <motion.p variants={sube} className="max-w-md text-body leading-relaxed opacity-85">
        Notas, asistencia y riesgo académico en un solo lugar, sincronizados con tu teléfono en
        tiempo real.
      </motion.p>

      <motion.ul variants={escalonado} className="flex flex-col gap-3">
        {FUNCIONES.map(({ Icono, titulo, detalle }) => (
          <motion.li key={titulo} variants={entraDeLado} className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-on-primary/10 ring-1 ring-on-primary/15 backdrop-blur-sm">
              <Icono className="size-5 text-accent" aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-body font-semibold">{titulo}</span>
              <span className="text-caption opacity-75">{detalle}</span>
            </span>
          </motion.li>
        ))}
      </motion.ul>

      <motion.p variants={sube} className="flex items-center gap-2 text-caption opacity-75">
        <ShieldCheck className="size-4" aria-hidden />
        Sesión cifrada por el sistema y atada a este equipo.
      </motion.p>
    </motion.section>
  );
}

/** El logo sobre un disco de cristal con un anillo que gira despacio. */
export function LogoConAnillo({ size }: { size: number }) {
  const lado = size + 20;
  return (
    <motion.span
      initial={{ opacity: 0, y: -40, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...RESORTE, stiffness: 220, damping: 14 }}
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: lado, height: lado }}
    >
      <span
        aria-hidden
        className="acceso-anillo absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--accent),transparent_40%,var(--accent)_70%,transparent)] opacity-70"
      />
      <span aria-hidden className="absolute inset-[3px] rounded-full bg-primary-active/80 dark:bg-surface/80" />
      <Logo size={size} alt="" className="relative" />
    </motion.span>
  );
}

// ── Pantalla completa ────────────────────────────────────────────────────────

/** Botón flotante arriba a la derecha. F11 hace lo mismo desde cualquier pantalla. */
export function BotonPantallaCompletaAcceso() {
  const completa = usePantallaCompleta();
  const etiqueta = completa ? 'Salir de pantalla completa' : 'Pantalla completa';
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...RESORTE, delay: 0.5 }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => void alternarPantallaCompleta()}
      aria-label={`${etiqueta} (F11)`}
      aria-pressed={completa}
      className={cn(
        'absolute right-5 top-5 z-10 flex items-center gap-2 rounded-full px-3.5 py-2',
        'bg-on-primary/10 text-caption font-semibold ring-1 ring-on-primary/20 backdrop-blur-md',
        'transition-colors hover:bg-on-primary/20',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      )}
    >
      {completa ? (
        <Minimize2 className="size-4" aria-hidden />
      ) : (
        <Maximize2 className="size-4" aria-hidden />
      )}
      <span className="hidden sm:inline">{etiqueta}</span>
      <Kbd className="hidden bg-on-primary/15 text-current sm:inline-flex">F11</Kbd>
    </motion.button>
  );
}
