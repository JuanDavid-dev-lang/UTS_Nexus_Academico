import logoUrl from '@/assets/logo.png';
import { cn } from '@/shared/lib/cn';

/**
 * Marca institucional.
 *
 * Un único punto de verdad para el logotipo: si mañana cambia el archivo, cambia
 * en toda la aplicación. Vite le pone hash al recurso, así que se cachea sin
 * riesgo de quedarse con una versión vieja.
 */
export function Logo({
  size = 36,
  className,
  /** Texto alternativo. Vacío cuando el logo acompaña a un título que ya lo nombra. */
  alt = 'UTS Nexus Académico',
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={cn('select-none object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
