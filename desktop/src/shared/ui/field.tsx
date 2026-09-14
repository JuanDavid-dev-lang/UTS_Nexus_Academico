import { forwardRef, useCallback, useId, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { MenuDeSelect } from './select-menu';
import { elegirOpcion, opcionesDe, siguienteHabilitada, usarMenuPropio } from './select-menu-logica';

/**
 * Form primitives.
 *
 * The error message is wired with `aria-describedby` and `aria-invalid` so a
 * screen reader announces it. Colour alone never communicates an error - that
 * excludes anyone who cannot distinguish red from grey.
 */

const controlStyles = cn(
  'w-full rounded-lg border border-border bg-surface px-3 text-body text-text',
  // El marcador de posición va en `--text-subtle`, no en `--text-muted`: con el
  // mismo tono que un subtítulo, un campo vacío parecía un campo relleno y en
  // un formulario de seis campos había que tocarlos para saber cuáles faltaban.
  'placeholder:text-subtle',
  'shadow-[inset_0_1px_1px_rgb(16_24_40_/_0.03)]',
  'transition-[border-color,box-shadow] duration-200 ease-out',
  'hover:border-border-strong',
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25',
  'disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/20',
);

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlStyles, 'h-10', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(controlStyles, 'min-h-20 resize-none py-2 leading-relaxed', className)}
      {...props}
    />
  );
});

/**
 * Un `<select>` de verdad. En Linux, con el menú dibujado por la página
 * (`select-menu.tsx`): el de WebKitGTK sale claro en modo oscuro y se queda
 * flotando sobre otras aplicaciones.
 */
export const NativeSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function NativeSelect({ className, children, onMouseDown, onKeyDown, onBlur, ...props }, ref) {
  const local = useRef<HTMLSelectElement | null>(null);
  // El `<select>` sobre el que está abierto el menú, o `null`. En estado y no
  // leído del ref al pintar: el menú necesita el nodo, y un ref no se lee
  // durante el render.
  const [abiertoEn, setAbiertoEn] = useState<HTMLSelectElement | null>(null);
  const abierto = abiertoEn !== null;
  const [activo, setActivo] = useState(0);

  const unirRef = useCallback(
    (nodo: HTMLSelectElement | null) => {
      local.current = nodo;
      if (typeof ref === 'function') ref(nodo);
      else if (ref) ref.current = nodo;
    },
    [ref],
  );
  const cerrar = useCallback(() => setAbiertoEn(null), []);

  const menuPropio = usarMenuPropio && !props.multiple && !(props.size && props.size > 1);

  function abrir(evento: React.SyntheticEvent) {
    const select = local.current;
    if (!select || props.disabled) return;
    evento.preventDefault();
    select.focus();
    setActivo(Math.max(select.selectedIndex, 0));
    setAbiertoEn(select);
  }

  function teclaConMenu(evento: React.KeyboardEvent<HTMLSelectElement>) {
    const select = local.current;
    if (!select) return;
    const opciones = opcionesDe(select);
    const mover = (indice: number) => {
      evento.preventDefault();
      setActivo(indice);
    };
    switch (evento.key) {
      case 'ArrowDown':
        return mover(siguienteHabilitada(opciones, activo, 1));
      case 'ArrowUp':
        return mover(siguienteHabilitada(opciones, activo, -1));
      case 'Home':
        return mover(siguienteHabilitada(opciones, -1, 1));
      case 'End':
        return mover(siguienteHabilitada(opciones, opciones.length, -1));
      case 'Enter':
      case ' ':
        evento.preventDefault();
        if (!opciones[activo]?.deshabilitada) elegirOpcion(select, activo);
        return cerrar();
      case 'Escape':
        evento.preventDefault();
        // Que un Escape que solo cierra el menú no cierre también el diálogo.
        evento.stopPropagation();
        return cerrar();
      case 'Tab':
        return cerrar();
    }
  }

  return (
    <>
      <select
        ref={unirRef}
        className={cn(controlStyles, 'h-10 cursor-pointer pr-8', className)}
        {...(menuPropio ? { 'aria-expanded': abierto } : {})}
        onMouseDown={(evento) => {
          onMouseDown?.(evento);
          if (!menuPropio || evento.defaultPrevented || evento.button !== 0) return;
          if (abierto) {
            evento.preventDefault();
            cerrar();
          } else {
            abrir(evento);
          }
        }}
        onKeyDown={(evento) => {
          onKeyDown?.(evento);
          if (!menuPropio || evento.defaultPrevented) return;
          if (abierto) return teclaConMenu(evento);
          const abre =
            evento.key === ' ' || evento.key === 'Enter' || evento.key === 'F4' || (evento.altKey && evento.key === 'ArrowDown');
          if (abre) abrir(evento);
        }}
        onBlur={(evento) => {
          onBlur?.(evento);
          cerrar();
        }}
        {...props}
      >
        {children}
      </select>
      {abiertoEn ? (
        <MenuDeSelect select={abiertoEn} activo={activo} onActivo={setActivo} onCerrar={cerrar} />
      ) : null}
    </>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-caption font-semibold text-muted', className)} {...props} />;
}

type FieldProps = {
  label: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => React.ReactNode;
};

export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-message` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>

      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': messageId })}

      {error ? (
        <p id={messageId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
