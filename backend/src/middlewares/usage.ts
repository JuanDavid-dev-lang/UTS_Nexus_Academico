import type { RequestHandler } from 'express';
import { clienteDePeticion } from '../domains/usage/usage.js';
import { registrarUso } from '../modules/usage/usage.service.js';

/**
 * Anota la petición en el registro de uso. **No escribe en la base**: suma a
 * un acumulador en memoria que se vuelca por lotes cada minuto
 * (`modules/usage/usage.service.ts`). Solo cuenta peticiones con sesión, y
 * nunca corta ni retrasa nada: un fallo aquí se traga y la petición sigue.
 */
export const registrarPeticionDeUso: RequestHandler = (req, _res, next) => {
  const usuario = req.user;
  if (usuario?.id && req.method !== 'OPTIONS') {
    try {
      registrarUso({
        userId: usuario.id,
        rol: usuario.role,
        cliente: clienteDePeticion({
          canal: usuario.canal,
          origen: req.headers.origin,
          userAgent: req.headers['user-agent'],
        }),
        instante: new Date(),
      });
    } catch (causa) {
      console.error('[uso] no se pudo anotar la petición:', causa);
    }
  }
  next();
};
