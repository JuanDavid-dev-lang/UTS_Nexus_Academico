/**
 * Avisos institucionales.
 */
import { z } from 'zod';
import { mongoDoc } from './common';
import { facultadId, sedeId } from './registration';

// ── Avisos ──────────────────────────────────────────────────────────────────

export const tipoAviso = z.enum(['INFORMATIVO', 'IMPORTANTE', 'URGENTE']);
export type TipoAviso = z.infer<typeof tipoAviso>;

/**
 * Autor del aviso.
 *
 * El listado lo devuelve poblado (`{ fullName }`) y la respuesta de crear traía
 * el ObjectId a secas: Mongoose no puebla lo que acaba de insertar. Aceptar
 * solo la forma poblada hacía que publicar terminara siempre en «El servidor
 * respondió en un formato inesperado» — con el aviso ya guardado, así que el
 * administrador reintentaba y salían duplicados. Las dos formas valen y se
 * normalizan a una: sin nombre, no hay autor que mostrar.
 */
export const autorAviso = z
  .union([z.object({ fullName: z.string() }).partial(), z.string(), z.null()])
  .optional()
  .transform(valor => (valor && typeof valor === 'object' ? valor : null));

export const avisoSchema = mongoDoc.extend({
  titulo: z.string(),
  cuerpo: z.string(),
  tipo: tipoAviso,
  sedes: z.array(z.string()).optional().default([]),
  facultades: z.array(z.string()).optional().default([]),
  programas: z.array(z.string()).optional().default([]),
  publicadoEn: z.string(),
  expiraEn: z.string().nullable().optional(),
  fijado: z.boolean().optional().default(false),
  leido: z.boolean().optional().default(false),
  lecturas: z.number().optional().default(0),
  autorId: autorAviso,
  /**
   * Lo decide el servidor con su reloj. Solo ADMIN recibe `PROGRAMADO` y
   * `CADUCADO`; a los demás el filtro ya se los quita. Un servidor anterior no
   * lo manda y se lee como vigente, que es lo único que entonces veían.
   */
  estado: z.enum(['PROGRAMADO', 'VIGENTE', 'CADUCADO']).catch('VIGENTE').optional().default('VIGENTE'),
});
export type Aviso = z.infer<typeof avisoSchema>;
export type EstadoAviso = Aviso['estado'];

export const avisoInputSchema = z.object({
  titulo: z.string().min(4, 'El título es demasiado corto').max(140),
  cuerpo: z.string().min(10, 'Escribe el contenido').max(4000),
  tipo: tipoAviso,
  sedes: z.array(sedeId).default([]),
  facultades: z.array(facultadId).default([]),
  programas: z.array(z.string()).default([]),
  fijado: z.boolean().default(false),
  /** Instante ISO de salida; sin él el servidor publica ahora. */
  publicadoEn: z.string().optional(),
  /** Instante ISO de caducidad, o `null` si no caduca. */
  expiraEn: z.string().nullable().optional(),
});
export type AvisoInput = z.infer<typeof avisoInputSchema>;
