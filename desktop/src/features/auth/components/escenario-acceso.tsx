import { motion } from 'framer-motion';
import { ClipboardCheck, ListChecks, Maximize2, Minimize2, QrCode, ShieldCheck } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { Kbd } from '@/shared/ui/primitives';
import { cn } from '@/shared/lib/cn';
import { esWeb } from '@/core/platform/tauri';
import {
  ATAJO_PANTALLA_COMPLETA,
  alternarPantallaCompleta,
  usePantallaCompleta,
} from '@/core/platform/pantalla-completa';

/**
 * La capa visual de la pantalla de acceso, separada del formulario.
 *
 * Una columna de marca en verde institucional plano y el formulario sobre el
 * fondo de la aplicación. Antes la pantalla entera era un degradado con tres
 * nubes desenfocadas que respiraban, una trama de puntos, un anillo cónico
 * girando detrás del logo y un paralaje que seguía al puntero: cinco efectos
 * para decir «UTS». Ahora lo dice el color, el nombre y una frase. Todo sale
 * de los tokens: con el tono Océano la columna es azul sin tocar nada aquí.
 */

const FUNCIONES = [
  { Icono: ClipboardCheck, titulo: 'Notas por corte', detalle: 'Con plantillas y pesos por nota.' },
  { Icono: QrCode, titulo: 'Asistencia con QR', detalle: 'El estudiante confirma desde UniPlanner.' },
  { Icono: ListChecks, titulo: 'Riesgo académico', detalle: 'Un modelo que explica cada alerta.' },
] as const;

/** Nombre de la aplicación junto al logo. Hereda el color de lo que la rodea. */
export function MarcaAcceso({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={size} alt="" className="shrink-0" />
      <div className="flex min-w-0 flex-col">
        <span className="text-body font-semibold leading-tight">UTS Nexus Académico</span>
        <span className="text-caption leading-tight opacity-80">
          Unidades Tecnológicas de Santander
        </span>
      </div>
    </div>
  );
}

/**
 * Columna de marca: solo en ventanas anchas, donde el formulario ya tiene
 * sitio. Arriba la marca, en medio la frase y lo que hace la aplicación como
 * una lista con filo —no tres iconos en burbujas—, abajo la nota de la sesión.
 */
export function HeroAcceso() {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="surface-brand hidden w-[44%] max-w-[640px] shrink-0 flex-col justify-between gap-12 rounded-none px-12 py-10 lg:flex"
    >
      <MarcaAcceso />

      <div className="flex max-w-md flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h2 className="text-h1 font-semibold leading-[1.1] tracking-[-0.03em] [text-wrap:balance]">
            Menos planillas. Más tiempo con tus estudiantes.
          </h2>
          <p className="text-body leading-relaxed opacity-80">
            Notas, asistencia y riesgo académico en un solo lugar, sincronizados con tu teléfono en
            tiempo real.
          </p>
        </div>

        <ul className="flex flex-col border-t border-current/20">
          {FUNCIONES.map(({ Icono, titulo, detalle }) => (
            <li key={titulo} className="flex items-start gap-3 border-b border-current/20 py-3.5">
              <Icono className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
              <span className="flex flex-col">
                <span className="text-body font-semibold">{titulo}</span>
                <span className="text-caption opacity-75">{detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="flex items-center gap-2 text-caption opacity-75">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        {esWeb
          ? 'Versión web. La aplicación añade agenda, reportes y el asistente completo.'
          : 'Sesión cifrada por el sistema y atada a este equipo.'}
      </p>
    </motion.section>
  );
}

// ── Pantalla completa ────────────────────────────────────────────────────────

/** Botón arriba a la derecha. El atajo hace lo mismo desde cualquier pantalla. */
export function BotonPantallaCompletaAcceso() {
  const completa = usePantallaCompleta();
  const etiqueta = completa ? 'Salir de pantalla completa' : 'Pantalla completa';
  return (
    <button
      type="button"
      onClick={() => void alternarPantallaCompleta()}
      aria-label={`${etiqueta} (${ATAJO_PANTALLA_COMPLETA})`}
      aria-pressed={completa}
      className={cn(
        'absolute right-5 top-5 z-10 flex items-center gap-2 rounded-md px-2.5 py-1.5',
        'text-caption font-medium text-muted transition-colors',
        'hover:bg-surface-alt hover:text-text',
      )}
    >
      {completa ? (
        <Minimize2 className="size-4" aria-hidden />
      ) : (
        <Maximize2 className="size-4" aria-hidden />
      )}
      <span className="hidden sm:inline">{etiqueta}</span>
      <Kbd className="hidden sm:inline-flex">{ATAJO_PANTALLA_COMPLETA}</Kbd>
    </button>
  );
}
