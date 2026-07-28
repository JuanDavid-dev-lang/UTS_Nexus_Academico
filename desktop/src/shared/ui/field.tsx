import { forwardRef, useId } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Form primitives.
 *
 * The error message is wired with `aria-describedby` and `aria-invalid` so a
 * screen reader announces it. Colour alone never communicates an error - that
 * excludes anyone who cannot distinguish red from grey.
 */

const controlStyles = cn(
  'w-full rounded-lg border border-border bg-surface px-3 text-sm text-text',
  'placeholder:text-muted',
  'transition-colors duration-150',
  'hover:border-border-strong',
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/25',
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

export const NativeSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(controlStyles, 'h-10 cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-semibold text-muted', className)} {...props} />;
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
        <p id={messageId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
