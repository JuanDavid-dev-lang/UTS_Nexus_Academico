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
  const sizes = { sm: 'size-7 text-[10px]', md: 'size-9 text-xs', lg: 'size-12 text-sm' };

  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full bg-primary/10',
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
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
        'border-2 border-transparent transition-colors duration-200',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-surface shadow-sm',
          'transition-transform duration-200',
          'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
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
        'inline-flex h-9 items-center gap-1 rounded-lg bg-surface-alt p-1',
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
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium',
        'text-muted transition-all duration-150',
        'hover:text-text',
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
  return <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none', className)} {...props} />;
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
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-md bg-text px-2.5 py-1.5 text-xs font-medium text-bg shadow-md"
        >
          {content}
          {shortcut ? <Kbd className="border-bg/30 text-bg/80">{shortcut}</Kbd> : null}
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
        'rounded border border-border px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted',
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
  className,
  label,
}: {
  value: number;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const tones = {
    primary: 'bg-primary',
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
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-alt', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', tones[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
