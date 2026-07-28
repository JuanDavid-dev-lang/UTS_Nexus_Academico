import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind classes, letting later classes win over earlier conflicting
 * ones. Without this, `cn('p-2', 'p-4')` would emit both and the result would
 * depend on stylesheet order rather than on intent.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
