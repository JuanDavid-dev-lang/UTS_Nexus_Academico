import { forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * La card responde al puntero elevándose.
   *
   * Solo si pulsarla lleva a algún sitio. Una card que se eleva y no hace nada
   * es una promesa incumplida y enseña a desconfiar de las que sí navegan.
   */
  interactive?: boolean;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, ...props },
  ref,
) {
  return (
    <section
      ref={ref}
      className={cn('surface-card', interactive && 'surface-card-interactive cursor-pointer', className)}
      {...props}
    />
  );
});

/**
 * Cabecera de tarjeta.
 *
 * El relleno bajó de 24 a 20. En un panel de seis tarjetas eran 48 px de aire
 * interior recuperados, que es una fila más de contenido visible sin que nada
 * se apriete: 20 sigue siendo más que el gap de 16 entre tarjetas, así que la
 * jerarquía —dentro respira más que fuera— se conserva.
 */
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <header className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />;
}

/**
 * Título de tarjeta.
 *
 * `text-h3` (24px) era el tamaño de un título de página dentro de una tarjeta:
 * seis tarjetas en un panel daban seis titulares compitiendo con el h1 real.
 * El rol aquí es «etiqueta de sección», que en la escala de DESIGN.md §5 es
 * body con énfasis.
 */
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-body font-semibold text-text', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-caption text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <footer
      className={cn(
        'flex items-center gap-2 rounded-b-card border-t border-border bg-surface-alt/60 px-5 py-3',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Fila de acciones a la derecha del título, en la misma línea.
 *
 * Existe porque cada tarjeta con botones resolvía la alineación a mano y salían
 * tres alturas distintas de cabecera según si el botón era `sm` o `icon`.
 */
export function CardToolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex shrink-0 items-center gap-1.5', className)} {...props} />;
}

/** Cabecera con título a la izquierda y acciones a la derecha. */
export function CardHeaderRow({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <CardHeader className={cn('flex-row items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {actions ? <CardToolbar>{actions}</CardToolbar> : null}
    </CardHeader>
  );
}
