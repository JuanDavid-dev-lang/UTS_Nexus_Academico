import type { LucideIcon } from 'lucide-react';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

/**
 * Cada tono resuelve dos cosas: el color de la cifra y el de la barra de
 * proporción. El icono ya no lleva tono ni cuadro de color: un icono en un
 * cuadrado pastel por tarjeta es la plantilla de panel más repetida que hay, y
 * en una fila de seis el ojo leía seis cuadrados de colores antes que seis
 * cifras.
 */
const TONE_CLASSES: Record<Tone, { value: string; bar: string }> = {
  primary: { value: 'text-primary', bar: 'bg-primary' },
  success: { value: 'text-success', bar: 'bg-success' },
  warning: { value: 'text-warning', bar: 'bg-warning' },
  danger: { value: 'text-danger', bar: 'bg-danger' },
  info: { value: 'text-info', bar: 'bg-info' },
  accent: { value: 'text-accent-strong', bar: 'bg-accent' },
  neutral: { value: 'text-text', bar: 'bg-border-strong' },
};

/**
 * Metric tile.
 *
 * The value is the largest element because it is what the teacher scans for.
 * Tone carries meaning: green is good, amber needs follow-up, red needs action.
 *
 * Sin franja de color arriba ni entrada escalonada. La franja convertía cada
 * fila de métricas en una tira de caramelos; el tono ya está en la cifra, que
 * es lo que se busca de lejos. La etiqueta va en minúscula de frase: en
 * versalitas con interletrado, seis etiquetas seguidas se leían como gritos.
 * La cifra es Inter con cifras tabulares, no monoespaciada: es un dato, no
 * código.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  trend,
  progress,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: LucideIcon;
  /** Percentage change against the previous period, if known. */
  trend?: number;
  /** Barra 0–100 al pie: para métricas que son una proporción de un total. */
  progress?: number;
  /** Se conserva por compatibilidad; las tarjetas ya no entran escalonadas. */
  index?: number;
  onClick?: () => void;
}) {
  const classes = TONE_CLASSES[tone];
  const interactive = Boolean(onClick);

  return (
    <div
      className={cn(
        'surface-card group relative flex flex-col gap-3 p-5',
        interactive && 'surface-card-interactive cursor-pointer',
      )}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            onClick,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption font-medium text-muted">{label}</p>
        {Icon ? <Icon className="size-4 shrink-0 text-subtle" aria-hidden /> : null}
      </div>

      <p
        className={cn(
          'text-h2 font-semibold leading-none tracking-[-0.02em] tabular',
          classes.value,
        )}
      >
        {value}
      </p>

      {typeof progress === 'number' && Number.isFinite(progress) ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300 ease-out', classes.bar)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}

      {hint || interactive || (typeof trend === 'number' && Number.isFinite(trend)) ? (
        <div className="mt-auto flex min-h-5 items-start gap-2">
          {typeof trend === 'number' && Number.isFinite(trend) ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-caption font-semibold tabular',
                trend >= 0 ? 'text-success' : 'text-danger',
              )}
            >
              {trend >= 0 ? (
                <TrendingUp className="size-3" aria-hidden />
              ) : (
                <TrendingDown className="size-3" aria-hidden />
              )}
              {Math.abs(trend).toFixed(1)}%
            </span>
          ) : null}
          {/* Dos líneas antes de cortar: en una fila de seis, una sola dejaba
              «Proyección al día d…» y la pista no decía nada. */}
          {hint ? <p className="line-clamp-2 min-w-0 text-caption text-muted">{hint}</p> : null}
          {interactive ? (
            <ArrowRight
              className="ml-auto mt-0.5 size-3.5 shrink-0 text-subtle transition-colors duration-200 group-hover:text-text"
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
