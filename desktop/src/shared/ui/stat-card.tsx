import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

/**
 * Cada tono resuelve cuatro cosas a la vez, y por eso vive en una tabla y no
 * repartido por la tarjeta: el color de la cifra, el fondo y el color del icono,
 * y la franja superior. Cuando estaban sueltos, `accent` acabó con el icono en
 * lima sobre fondo lima —invisible— porque nadie comprobó ese par.
 */
const TONE_CLASSES: Record<Tone, { value: string; iconBg: string; icon: string; rail: string }> = {
  primary: {
    value: 'text-primary',
    iconBg: 'bg-primary-soft',
    icon: 'text-primary',
    rail: 'bg-primary',
  },
  success: {
    value: 'text-success',
    iconBg: 'bg-success-soft',
    icon: 'text-success',
    rail: 'bg-success',
  },
  warning: {
    value: 'text-warning',
    iconBg: 'bg-warning-soft',
    icon: 'text-warning',
    rail: 'bg-warning',
  },
  danger: {
    value: 'text-danger',
    iconBg: 'bg-danger-soft',
    icon: 'text-danger',
    rail: 'bg-danger',
  },
  info: { value: 'text-info', iconBg: 'bg-info-soft', icon: 'text-info', rail: 'bg-info' },
  accent: {
    value: 'text-accent-strong',
    iconBg: 'bg-accent-soft',
    icon: 'text-accent-strong',
    rail: 'bg-accent',
  },
  neutral: {
    value: 'text-text',
    iconBg: 'bg-surface-alt',
    icon: 'text-muted',
    rail: 'bg-border-strong',
  },
};

/**
 * Metric tile.
 *
 * The value is the largest element because it is what the teacher scans for.
 * Tone carries meaning: green is good, amber needs follow-up, red needs action.
 *
 * La franja superior de color es lo que permite reconocer una tarjeta sin
 * leerla. En una fila de seis, el tono solo estaba en la cifra y en un icono de
 * 14 px, así que a un metro de distancia las seis eran el mismo rectángulo
 * blanco y había que leerlas todas para encontrar la que estaba en rojo.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  trend,
  progress,
  index = 0,
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
  /** Stagger position, so a grid of cards animates in sequence. */
  index?: number;
  onClick?: () => void;
}) {
  const classes = TONE_CLASSES[tone];
  const interactive = Boolean(onClick);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'surface-card group relative flex flex-col gap-2 overflow-hidden p-5',
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
      {/* Franja de tono. 3 px: suficiente para reconocerse de lejos, no tanto
          como para convertirse en un bloque de color más de la pantalla. */}
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', classes.rail)} aria-hidden />

      <div className="flex items-start justify-between gap-2 pt-1">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</p>
        {Icon ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              classes.iconBg,
            )}
          >
            <Icon className={cn('size-4', classes.icon)} aria-hidden />
          </span>
        ) : null}
      </div>

      <p className={cn('font-mono text-h2 font-bold leading-none tabular', classes.value)}>
        {value}
      </p>

      {typeof progress === 'number' && Number.isFinite(progress) ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-alt">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300 ease-out', classes.rail)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}

      <div className="flex min-h-5 items-center gap-2">
        {typeof trend === 'number' && Number.isFinite(trend) ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-caption font-semibold tabular',
              trend >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
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
        {hint ? <p className="truncate text-caption text-muted">{hint}</p> : null}
        {interactive ? (
          <ArrowRight
            className="ml-auto size-3.5 shrink-0 text-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            aria-hidden
          />
        ) : null}
      </div>
    </motion.div>
  );
}
