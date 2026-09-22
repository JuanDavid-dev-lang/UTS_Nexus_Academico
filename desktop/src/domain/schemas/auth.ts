import { z } from 'zod';
import { objectId, role } from './common';

/**
 * El usuario de la sesión.
 *
 * Acepta `_id` además de `id`, y ese detalle no es cosmético: `GET /auth/me`
 * respondía con el documento tal cual sale de Mongo (`_id`), mientras que
 * `/auth/login` devuelve `id`. Entrar funcionaba y **restaurar la sesión al
 * arrancar no**: el parse fallaba, el error no es reintentable, y `bootstrap`
 * borraba unos tokens perfectamente válidos y mandaba al inicio de sesión. Sin
 * ningún error en pantalla: se leía como «la aplicación no recuerda la sesión».
 * El servidor ya devuelve `id` en las dos rutas, pero esto se queda porque un
 * cliente publicado habla con servidores de cualquier versión.
 */
export const userSchema = z.preprocess((valor) => {
  if (valor && typeof valor === 'object' && '_id' in valor && !('id' in valor)) {
    return { ...valor, id: (valor as { _id: unknown })._id };
  }
  return valor;
}, z.object({
  id: objectId,
  email: z.string().email(),
  role,
  fullName: z.string(),
  photoUrl: z.string().nullable().optional(),
}));

export type User = z.infer<typeof userSchema>;

export const loginResponseSchema = z.object({
  ok: z.literal(true),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: userSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = z.object({
  ok: z.literal(true),
  user: userSchema,
});

export const loginInputSchema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const recoveryRequestSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
  devCode: z.string().optional(),
});

export const recoveryResetSchema = z.object({ ok: z.literal(true), message: z.string() });

/**
 * Respuesta del cambio de contraseña propio.
 *
 * Trae un par de tokens porque el servidor acaba de revocar todas las sesiones,
 * esta incluida. El `message` no es decorativo: dice que las demás se cerraron,
 * que es la mitad del efecto del gesto.
 */
export const changePasswordSchema = z.object({
  ok: z.literal(true),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  message: z.string(),
});

export const recoveryEmailSchema = z.string().trim().toLowerCase().email('Correo inválido');
/**
 * Misma política que el autorregistro (`schemas/registration.ts`) y que
 * `passwordNueva` en el backend.
 *
 * Pedía ocho caracteres sin más: quien se registraba con la política larga
 * podía dejarla en «12345678» a los cinco minutos por la puerta de la
 * recuperación. La más floja de las puertas es la que manda.
 */
export const recoveryPasswordSchema = z.string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128, 'La contraseña no puede superar 128 caracteres')
  .regex(/[a-z]/, 'Incluye alguna letra minúscula')
  .regex(/[A-Z]/, 'Incluye alguna letra mayúscula')
  .regex(/[0-9]/, 'Incluye algún número');
