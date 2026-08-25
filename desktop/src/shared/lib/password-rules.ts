/**
 * Las reglas de una contraseña nueva, en un solo sitio del cliente.
 *
 * El backend las impone (`passwordNueva` en `shared/validation.ts`) y aquí solo
 * se muestran mientras se escribe: enterarse de la política por un 400 después
 * de rellenar el formulario entero es la peor forma de conocerla.
 *
 * Vive aparte porque hay tres formularios que fijan una contraseña —el alta de
 * personal, el cambio propio y la recuperación— y tres copias de la misma lista
 * garantizan que alguna se quede atrás el día que la política cambie.
 */
export type ReglaDeContrasena = { texto: string; cumple: (valor: string) => boolean };

export const REGLAS_CONTRASENA: ReglaDeContrasena[] = [
  { texto: 'Al menos 10 caracteres', cumple: valor => valor.length >= 10 },
  { texto: 'Una minúscula', cumple: valor => /[a-z]/.test(valor) },
  { texto: 'Una mayúscula', cumple: valor => /[A-Z]/.test(valor) },
  { texto: 'Un número', cumple: valor => /[0-9]/.test(valor) },
];

export function contrasenaValida(valor: string): boolean {
  return REGLAS_CONTRASENA.every(regla => regla.cumple(valor));
}
