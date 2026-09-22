import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge no conoce la rampa tipográfica propia (`text-h1 … text-caption`,
 * DESIGN.md): sin declararla, `text-body` le parece un color y borra el color
 * que vaya antes. Así el botón primario perdía `text-on-primary` en cuanto su
 * tamaño añadía `text-body`, y la etiqueta heredaba el color de lo que lo
 * rodeara — oscura sobre verde en una tarjeta clara. No daba ningún error.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['h1', 'h2', 'h3', 'body', 'caption'] }],
    },
  },
});

/**
 * Merges Tailwind classes, letting later classes win over earlier conflicting
 * ones. Without this, `cn('p-2', 'p-4')` would emit both and the result would
 * depend on stylesheet order rather than on intent.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
