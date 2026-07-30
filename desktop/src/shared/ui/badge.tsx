import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { RiskLevel } from '@/domain/schemas/common';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-alt text-muted',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
        accent: 'bg-accent-soft text-on-accent',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const RISK_PRESENTATION = {
  HIGH: { tone: 'danger', label: 'Riesgo alto', Icon: ShieldAlert },
  MEDIUM: { tone: 'warning', label: 'Riesgo medio', Icon: AlertTriangle },
  LOW: { tone: 'success', label: 'Sin riesgo', Icon: CheckCircle2 },
} as const;

/**
 * Risk badge.
 *
 * Always carries an icon and a written level alongside the colour. Colour on
 * its own fails for colour-blind users, and this badge decides whether a
 * teacher intervenes with a student - it has to be unambiguous.
 */
export function RiskBadge({
  level,
  reason,
  className,
}: {
  level: RiskLevel;
  reason?: string;
  className?: string;
}) {
  const { tone, label, Icon } = RISK_PRESENTATION[level];

  return (
    <span
      className={cn(badgeVariants({ tone }), 'max-w-full', className)}
      title={reason || label}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {label}
        {reason ? ` — ${reason}` : ''}
      </span>
    </span>
  );
}

/** Grade pill: green when passing, red when failing, grey when ungraded. */
export function GradeBadge({ value, className }: { value: number | null; className?: string }) {
  if (value === null || Number.isNaN(value)) {
    return <Badge className={className}>Sin nota</Badge>;
  }
  const passing = value >= 3;
  return (
    <Badge tone={passing ? 'success' : 'danger'} className={cn('font-mono', className)}>
      {value.toFixed(2)}
    </Badge>
  );
}
