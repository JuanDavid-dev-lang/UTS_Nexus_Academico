import { cn } from '@/shared/lib/cn';

/**
 * Section header used at the top of every page body.
 *
 * Title answers "where am I", subtitle answers "what can I do here" - the two
 * questions that make navigation feel obvious instead of guessed.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-h1 font-bold tracking-tight text-text">{title}</h1>
        {subtitle ? <p className="text-body text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Wraps a page body with consistent padding, max width and scroll behaviour. */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-slim h-full overflow-y-auto', className)}>
      {/* p-6 / gap-4 are DESIGN.md S7's 24px page padding and 16px gap. */}
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-6">{children}</div>
    </div>
  );
}
