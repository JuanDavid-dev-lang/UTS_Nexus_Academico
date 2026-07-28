import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASSES: Record<Tone, { value: string; iconBg: string; icon: string }> = {
  primary: { value: 'text-primary', iconBg: 'bg-primary/10', icon: 'text-primary' },
  success: { value: 'text-success', iconBg: 'bg-success-soft', icon: 'text-success' },
  warning: { value: 'text-warning', iconBg: 'bg-warning-soft', icon: 'text-warning' },
  danger: { value: 'text-danger', iconBg: 'bg-danger-soft', icon: 'text-danger' },
  info: { value: 'text-info', iconBg: 'bg-info-soft', icon: 'text-info' },
  neutral: { value: 'text-text', iconBg: 'bg-surface-alt', icon: 'text-muted' },
};

/**
 * Metric tile.
 *
 * The value is the largest element because it is what the teacher scans for.
 * Tone carries meaning: green is good, amber needs follow-up, red needs action.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  trend,
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
      transition={{ duration: 0.24, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'surface-card flex flex-col gap-2 p-5',
        interactive &&
          'cursor-pointer transition-shadow duration-200 hover:shadow-md focus-visible:shadow-md',
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
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        {Icon ? (
          <span className={cn('flex size-7 items-center justify-center rounded-lg', classes.iconBg)}>
            <Icon className={cn('size-3.5', classes.icon)} aria-hidden />
          </span>
        ) : null}
      </div>

      <p className={cn('font-mono text-3xl font-bold leading-none tabular-nums', classes.value)}>
        {value}
      </p>

      <div className="flex items-center gap-2">
        {typeof trend === 'number' && Number.isFinite(trend) ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-semibold',
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
        {hint ? <p className="truncate text-[11px] text-muted">{hint}</p> : null}
      </div>
    </motion.div>
  );
}
