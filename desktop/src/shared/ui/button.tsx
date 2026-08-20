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
        primary: cn(
          'bg-primary text-on-primary shadow-primary',
          'hover:bg-primary-hover hover:shadow-md',
          'active:bg-primary-active active:shadow-sm',
        ),
        /*
         * Acento de marca: relleno lima con texto oscuro encima (8.9:1). Es el
         * botón de «esto es lo siguiente que vas a querer hacer», no el de
         * confirmar: si conviven los dos en una vista, el primario es el que
         * ejecuta y este el que sugiere. Nunca dos en el mismo bloque.
         */
        accent: cn(
          'bg-accent text-on-accent shadow-sm',
          'hover:brightness-105 hover:shadow-md',
        ),
        /* Verde de marca sin el peso del relleno: acciones secundarias que
           siguen siendo de la aplicación (añadir fila, importar). */
        soft: 'bg-primary-soft text-primary hover:bg-primary-tint',
        secondary: 'bg-surface-alt text-text border border-border hover:bg-surface-hover hover:border-border-strong',
        outline: 'border border-border-strong text-text hover:bg-surface-alt hover:border-primary',
        ghost: 'text-muted hover:bg-surface-alt hover:text-text',
        danger: 'bg-danger text-white shadow-sm hover:brightness-110 hover:shadow-md',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-caption [&_svg]:size-3.5',
        md: 'h-10 rounded-lg px-4 text-body [&_svg]:size-4',
        lg: 'h-11 rounded-lg px-6 text-body [&_svg]:size-4',
        icon: 'size-9 rounded-lg [&_svg]:size-4',
        'icon-sm': 'size-8 rounded-md [&_svg]:size-3.5',
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
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Component>
  );
});

export { buttonVariants };
