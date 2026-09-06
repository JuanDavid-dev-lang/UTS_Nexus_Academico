import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as campo from '../src/shared/validation.js';

/**
 * Los topes de la confirmación de una planilla escaneada.
 *
 * Aquí el número de escrituras no es el largo de una lista: es el **producto**
 * de dos. Las tres listas estaban con `.min(1)` y sin `.max()`, así que 200
 * filas × 1 900 fechas —1,96 MB, dentro del límite de cuerpo de Express— eran
 * 380 000 upserts de Asistencia más otros 380 000 documentos de auditoría en
 * una sola petición.
 *
 * El esquema vive dentro de la ruta, así que estas pruebas replican su forma.
 * Es una copia, y eso es una deuda consciente: montar el router entero para
 * probar un esquema exigiría base de datos, que es justo lo que `npm test` no
 * usa. Lo que sí se comparte son las constantes, que es donde está la decisión.
 */
const confirmacion = z
  .object({
    groupId: z.string().min(1),
    fechas: z.array(z.coerce.date()).min(1).max(campo.TOPE_FECHAS),
    durationMinutes: z.number().int().min(30).max(300).default(90),
    filas: z
      .array(
        z.object({
          studentId: z.string().min(1),
          presentes: z.array(z.boolean()).max(campo.TOPE_FECHAS),
        }),
      )
      .min(1)
      .max(campo.TOPE_LOTE),
  })
  .refine(datos => datos.filas.every(fila => fila.presentes.length === datos.fechas.length), {
    path: ['filas'],
  })
  .refine(datos => datos.filas.length * datos.fechas.length <= campo.TOPE_CELDAS, {
    path: ['filas'],
  });

/** Planilla de `filas` × `fechas`, toda presente. */
function planilla(filas: number, fechas: number) {
  return {
    groupId: 'g1',
    fechas: Array.from({ length: fechas }, (_, i) => `2026-03-${String((i % 28) + 1).padStart(2, '0')}`),
    filas: Array.from({ length: filas }, (_, i) => ({
      studentId: `est-${i}`,
      presentes: Array.from({ length: fechas }, () => true),
    })),
  };
}

describe('topes de la confirmación de una planilla', () => {
  it('acepta una planilla realista: un grupo de 40 por un corte de 16 clases', () => {
    expect(confirmacion.safeParse(planilla(40, 16)).success).toBe(true);
  });

  it('acepta justo el tope de casillas', () => {
    // 100 × 50 = 5 000, y las dos listas están por debajo de su tope propio.
    expect(campo.TOPE_CELDAS).toBe(5000);
    expect(confirmacion.safeParse(planilla(100, 50)).success).toBe(true);
  });

  it('rechaza el producto aunque cada lista esté dentro de su tope', () => {
    // 500 filas (= TOPE_LOTE) × 60 fechas (= TOPE_FECHAS) = 30 000 casillas.
    // Las dos listas pasan su propio `.max()`; el producto no. Es exactamente el
    // caso que un tope por lista no puede detectar.
    const resultado = confirmacion.safeParse(planilla(campo.TOPE_LOTE, campo.TOPE_FECHAS));
    expect(resultado.success).toBe(false);
  });

  it('rechaza el ataque original: muchas fechas', () => {
    expect(confirmacion.safeParse(planilla(200, 1900)).success).toBe(false);
  });

  it('rechaza más filas que el tope del lote', () => {
    expect(confirmacion.safeParse(planilla(campo.TOPE_LOTE + 1, 2)).success).toBe(false);
  });

  it('rechaza una fila con menos valores que fechas', () => {
    // Sin esto, `presentes[i]` era `undefined`, el `as boolean` lo dejaba pasar
    // y Mongoose lo casteaba a `false`: una falta que nadie marcó.
    const cuerpo = planilla(3, 5);
    cuerpo.filas[1]!.presentes = [true, true];
    const resultado = confirmacion.safeParse(cuerpo);
    expect(resultado.success).toBe(false);
  });

  it('rechaza una fila con más valores que fechas', () => {
    const cuerpo = planilla(3, 5);
    cuerpo.filas[0]!.presentes = [true, true, true, true, true, true];
    expect(confirmacion.safeParse(cuerpo).success).toBe(false);
  });

  it('sigue exigiendo al menos una fila y una fecha', () => {
    expect(confirmacion.safeParse({ groupId: 'g1', fechas: [], filas: [] }).success).toBe(false);
  });
});
