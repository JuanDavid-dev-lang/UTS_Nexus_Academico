import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Button.
 *
 * Variants encode intent, not looks: `danger` is for destructive actions only,
 * so a red button always means the same thing everywhere in the app.
 *
 * El estado pulsado baja un píxel en vez de escalar. `scale()` sobre un botón
 * rasteriza el texto en un tamaño intermedio durante la transición y la
 * etiqueta se ve borrosa justo en el fotograma en el que el usuario está
 * mirándola; un desplazamiento de un píxel comunica lo mismo y no toca el
 * texto.
 *
 * Ningún botón lleva sombra. El primario tenía un halo verde debajo, y un
 * botón que brilla es un botón que pide atención incluso cuando no es lo
 * siguiente que hay que hacer. El peso lo da el relleno, no el resplandor.
 */
const buttonVariants = cva(
  cn(
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active',
        /*
         * Acento de marca: relleno lima con texto oscuro encima (8.9:1). Es el
         * botón de «esto es lo siguiente que vas a querer hacer», no el de
         * confirmar: si conviven los dos en una vista, el primario es el que
         * ejecuta y este el que sugiere. Nunca dos en el mismo bloque.
         */
        accent: 'bg-accent text-on-accent hover:brightness-105',
        /* Verde de marca sin el peso del relleno: acciones secundarias que
           siguen siendo de la aplicación (añadir fila, importar). */
        soft: 'bg-primary-soft text-primary hover:bg-primary-tint',
        secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-alt',
        outline: 'border border-border-strong text-text hover:bg-surface-alt hover:border-primary',
        ghost: 'text-muted hover:bg-surface-alt hover:text-text',
        danger: 'bg-danger text-white hover:brightness-110',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-sm px-3 text-caption [&_svg]:size-3.5',
        md: 'h-10 rounded-md px-4 text-body [&_svg]:size-4',
        lg: 'h-11 rounded-md px-6 text-body [&_svg]:size-4',
        icon: 'size-9 rounded-md [&_svg]:size-4',
        'icon-sm': 'size-8 rounded-sm [&_svg]:size-3.5',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Renders the child element instead of a <button> (e.g. a router Link). */
    asChild?: boolean;
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, disabled, children, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size, block }), className);

  // `Slot` exige UN solo hijo. El hueco del spinner (`null`) ya cuenta como
  // segundo hijo, y desde @radix-ui/react-slot 1.2 eso revienta la página
  // entera («Slot failed to slot onto its children»), como pasó en Personal.
  // Con `asChild` el spinner no tiene sentido: el hijo es un enlace.
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} aria-disabled={disabled || loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export { buttonVariants };
