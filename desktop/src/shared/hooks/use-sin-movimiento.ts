import { useReducedMotion } from 'framer-motion';
import { useTheme } from '@/state/theme.store';

/**
 * ¿Hay que quitar el movimiento? Sí si lo pide el sistema o si la persona lo
 * activó en Apariencia. framer-motion solo mira lo primero, así que cada
 * animación con JS tiene que preguntar por las dos.
 */
export function useSinMovimiento(): boolean {
  const delSistema = useReducedMotion();
  const deApariencia = useTheme((state) => state.apariencia.reducirMovimiento);
  return Boolean(delSistema) || deApariencia;
}
