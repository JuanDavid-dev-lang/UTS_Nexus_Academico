import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/shared/lib/cn';
import { initials } from '@/shared/lib/format';

// ── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = { sm: 'size-8 text-caption', md: 'size-9 text-caption', lg: 'size-12 text-body' };

  return (
    <AvatarPrimitive.Root
      className={cn(
        // El anillo separa el avatar de la superficie sin dibujar un borde: en
        // una lista de treinta filas, treinta bordes de 1 px son treinta líneas
        // más compitiendo con las que separan las filas.
        'relative flex shrink-0 overflow-hidden rounded-full bg-primary-soft ring-1 ring-inset ring-primary/10',
        sizes[size],
        className,
      )}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center font-semibold text-primary"
        delayMs={src ? 300 : 0}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

// ── Switch ──────────────────────────────────────────────────────────────────
export function Switch({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        // 44×24 en vez de 36×20: el objetivo táctil de un interruptor de
        // configuración es lo último que conviene apretar, y a 20 px de alto el
        // pulgar sobre un portátil táctil falla más de lo que acierta.
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
        'border-2 border-transparent transition-colors duration-200 ease-out',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-surface shadow-sm',
          'transition-transform duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)]',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        // El carril va hundido y la pestaña activa elevada: es la relación que
        // hace que se lea como «esta está encima» en vez de «esta está pintada
        // de otro color».
        'inline-flex h-10 items-center gap-1 rounded-xl bg-surface-sunken p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-caption font-semibold',
        'text-muted transition-all duration-200 ease-out',
        'hover:text-text',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        'data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('mt-4 focus-visible:outline-none', className)}
      {...props}
    />
  );
}

// ── Tooltip ─────────────────────────────────────────────────────────────────
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
  shortcut,
}: {
  content: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  shortcut?: string;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className={cn(
            'z-50 flex max-w-72 items-center gap-2 rounded-lg bg-text px-2.5 py-1.5',
            'text-caption font-medium text-bg shadow-lg',
          )}
        >
          {content}
          {shortcut ? <Kbd className="border-bg/30 text-bg/80">{shortcut}</Kbd> : null}
          <TooltipPrimitive.Arrow className="fill-text" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ── Keyboard hint ───────────────────────────────────────────────────────────
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded border border-border bg-surface-alt px-1.5 py-0.5 font-mono text-caption font-medium text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ── Progress ────────────────────────────────────────────────────────────────
export function Progress({
  value,
  tone = 'primary',
  size = 'md',
  className,
  label,
}: {
  value: number;
  tone?: 'primary' | 'accent' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const tones = {
    primary: 'bg-primary',
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progreso'}
      className={cn(
        'w-full overflow-hidden rounded-full bg-surface-sunken',
        size === 'sm' ? 'h-1' : 'h-2',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out', tones[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
