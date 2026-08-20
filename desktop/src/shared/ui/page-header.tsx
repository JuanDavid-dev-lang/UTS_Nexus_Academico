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
  eyebrow,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  /**
   * Línea corta encima del título: el periodo activo, la materia, el grupo.
   *
   * Antes ese contexto se metía en el subtítulo y competía con la explicación
   * de la pantalla; o se colgaba de un chip suelto a la derecha, donde no se
   * lee porque el ojo entra por el título.
   */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? (
          <div className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wide text-accent-strong">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-h1 font-bold text-text">{title}</h1>
        {subtitle ? <p className="text-body text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * Cabecera sobre la superficie de marca.
 *
 * Para la pantalla que representa a la aplicación —el panel—, no para todas: si
 * cada pantalla abriera con un bloque verde, el verde dejaría de significar
 * «esto es UTS Nexus» y pasaría a significar «esto es una cabecera».
 */
export function PageHero({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  /** Métricas o accesos que van dentro del bloque, bajo el título. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('surface-brand p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? (
            <div className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wide text-white/70 dark:text-muted">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-h2 font-bold">{title}</h1>
          {subtitle ? (
            <p className="max-w-prose text-body text-white/75 dark:text-muted">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
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

/**
 * Título de una sección dentro de una página.
 *
 * El escalón intermedio que faltaba entre el h1 de la pantalla y el título de
 * una tarjeta. Sin él, una sección con cuatro tarjetas dentro se anunciaba con
 * un `text-h3` que pesaba igual que el contenido que agrupaba.
 */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-2', className)}>
      <div className="flex min-w-0 flex-col">
        <h2 className="text-h3 font-semibold text-text">{title}</h2>
        {description ? <p className="text-caption text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
