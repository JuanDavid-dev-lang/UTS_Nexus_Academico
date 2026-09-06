import { describe, expect, it } from 'vitest';
import { historialParaEnviar, TOPE_HISTORIAL } from '@/domain/assistant/historial';

/**
 * El chat mandaba el historial completo y el backend lo valida con `.max(20)`.
 * A partir de la pregunta 11 la petición se rechazaba con un 400 y el asistente
 * dejaba de responder, sin que el mensaje de error mencionara el historial.
 *
 * Es exactamente el fallo que vuelve solo: quien añada un campo al chat toca
 * esta llamada y quitar el recorte no rompe nada visible hasta la undécima
 * pregunta, que ninguna prueba manual llega a hacer.
 */
describe('historialParaEnviar', () => {
  const conversacion = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);

  it('deja pasar una conversación corta sin tocarla', () => {
    const mensajes = conversacion(6);
    expect(historialParaEnviar(mensajes)).toEqual(mensajes);
  });

  it('nunca supera el tope que valida el backend', () => {
    expect(historialParaEnviar(conversacion(200))).toHaveLength(TOPE_HISTORIAL);
  });

  it('conserva los mensajes recientes, no los primeros', () => {
    // Lo que da contexto a la pregunta actual es lo último que se dijo.
    const recortado = historialParaEnviar(conversacion(30));
    expect(recortado.at(0)).toBe('m10');
    expect(recortado.at(-1)).toBe('m29');
  });

  it('en el límite exacto no recorta nada', () => {
    const mensajes = conversacion(TOPE_HISTORIAL);
    expect(historialParaEnviar(mensajes)).toEqual(mensajes);
  });

  it('una conversación vacía no falla', () => {
    expect(historialParaEnviar([])).toEqual([]);
  });
});
