import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { RiskLevel } from '@/domain/schemas/common';

/**
 * Insignia de estado.
 *
 * Lleva borde además del relleno suave. Sin él, un chip `success-soft` sobre
 * `--surface-alt` se distingue del fondo por unos pocos puntos de luminancia:
 * en la pantalla de riesgo, que es donde el color tiene que comunicar de un
 * vistazo, los chips se fundían con la fila y había que leer la etiqueta para
 * saber de qué color eran. El borde le da un contorno al bloque de color y ese
 * es todo el trabajo que el chip tiene que hacer.
 */
const badgeVariants = cva(
  cn(
    'inline-flex items-center gap-1.5 rounded-full border font-semibold',
    'transition-colors duration-200 ease-out',
  ),
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-alt text-muted',
        success: 'border-success-border bg-success-soft text-success',
        warning: 'border-warning-border bg-warning-soft text-warning',
        danger: 'border-danger-border bg-danger-soft text-danger',
        info: 'border-info-border bg-info-soft text-info',
        /* Marca: relleno lima suave con la oliva oscura como texto (5.3:1).
           `--accent` a pelo no puede llevar letra en claro. */
        accent: 'border-accent-secondary/35 bg-accent-soft text-accent-strong',
        primary: 'border-primary-tint bg-primary-soft text-primary',
      },
      size: {
        sm: 'px-2 py-px text-caption',
        md: 'px-2.5 py-0.5 text-caption',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/**
 * Punto de color con etiqueta.
 *
 * Para leyendas de gráficos y listas de estado donde un chip relleno por línea
 * llenaría la vista de rectángulos de color. El punto marca la categoría sin
 * competir con el texto que va al lado.
 */
export function BadgeDot({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'primary';
  children: React.ReactNode;
  className?: string;
}) {
  const dots = {
    neutral: 'bg-border-strong',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    accent: 'bg-accent',
    primary: 'bg-primary',
  } as const;

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-caption text-muted', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', dots[tone])} aria-hidden />
      {children}
    </span>
  );
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
    <Badge tone={passing ? 'success' : 'danger'} className={cn('font-mono tabular', className)}>
      {value.toFixed(2)}
    </Badge>
  );
}
