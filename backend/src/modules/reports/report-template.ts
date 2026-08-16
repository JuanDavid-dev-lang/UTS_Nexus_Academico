/**
 * Plantilla de los reportes exportados (PDF y Excel).
 *
 * El administrador personaliza encabezado, logo, colores del documento y qué
 * columnas salen por tipo de reporte. Se guarda en `ConfigModel` bajo una sola
 * clave y los generadores la leen en cada descarga: no hay que reiniciar nada.
 *
 * Los colores de aquí son CONTENIDO del documento (como el membrete de un acta
 * en papel), no interfaz de la aplicación — por eso no pasan por los tokens
 * del design system.
 */
import { z } from 'zod';
import { ConfigModel } from '../../models/config.model.js';
import { CATALOGOS, type ColumnaReporte, type TipoCatalogo } from './report-columns.js';

export const CLAVE_PLANTILLA = 'report_template';

const hex = () =>
  z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color en formato #RRGGBB');

/** Ruta subida por `POST /uploads/image`, nunca una URL remota. */
const rutaDeLogo = z
  .string()
  .refine(valor => valor.startsWith('/uploads/'), 'Debe ser una ruta subida a /uploads');

export const plantillaSchema = z.object({
  /** Nombre institucional bajo el título. OJO: "Universidad de Santander" es OTRA institución (UDES). */
  institucion: z.string().trim().min(3).max(120).default('Unidades Tecnológicas de Santander'),
  /** Sigla del recuadro del membrete cuando no hay logo. */
  sigla: z.string().trim().min(1).max(6).default('UTS'),
  /** Título por tipo de reporte; el que falte usa el título por defecto. */
  titulos: z
    .object({
      consolidado: z.string().trim().min(3).max(80).optional(),
      grades: z.string().trim().min(3).max(80).optional(),
      attendance: z.string().trim().min(3).max(80).optional(),
      combined: z.string().trim().min(3).max(80).optional(),
    })
    .default({}),
  logoUrl: rutaDeLogo.nullable().default(null),
  colores: z
    .object({
      /** Recuadro del membrete en el PDF. */
      marca: hex().default('#74d3b2'),
      /** Fondo de la fila de encabezado de las tablas del PDF. */
      encabezadoTabla: hex().default('#d7f0e5'),
      /** Fondo de la fila 1 del Excel. */
      encabezadoExcel: hex().default('#17313b'),
    })
    .default({}),
  /** Claves de columna visibles por tipo; ausente = todas las del catálogo. */
  columnas: z
    .object({
      consolidado: z.array(z.string()).optional(),
      grades: z.array(z.string()).optional(),
      attendance: z.array(z.string()).optional(),
    })
    .default({}),
});

export type Plantilla = z.infer<typeof plantillaSchema>;

export const PLANTILLA_POR_DEFECTO: Plantilla = plantillaSchema.parse({});

/**
 * Lee la plantilla guardada mezclada con los valores por defecto. Un valor
 * corrupto en la base (una edición a mano, una versión vieja del shape) cae a
 * los defaults en vez de tumbar todos los reportes.
 */
export async function getPlantilla(): Promise<Plantilla> {
  const doc = await ConfigModel.findOne({ key: CLAVE_PLANTILLA, deletedAt: null }).lean();
  const parsed = plantillaSchema.safeParse(doc?.value ?? {});
  return parsed.success ? parsed.data : PLANTILLA_POR_DEFECTO;
}

/**
 * Columnas efectivas de un reporte según la plantilla.
 *
 * Pura para poder probarla sin base. Si la selección queda vacía o pierde la
 * cédula (`code`) se ignora y sale el catálogo completo: un acta sin forma de
 * identificar al estudiante no es un acta, es un accidente de configuración.
 */
export function resolverColumnas(plantilla: Plantilla, tipo: TipoCatalogo): ColumnaReporte[] {
  const catalogo = CATALOGOS[tipo] as ColumnaReporte[];
  const elegidas = tipo === 'consolidado' || tipo === 'grades' || tipo === 'attendance'
    ? plantilla.columnas[tipo]
    : undefined;
  if (!elegidas?.length) return catalogo;

  const visibles = catalogo.filter(col => elegidas.includes(col.key));
  if (!visibles.length || !visibles.some(col => col.key === 'code')) return catalogo;
  return visibles;
}

/** Convierte `#rrggbb` al ARGB que pide ExcelJS (`FFRRGGBB`). */
export function hexAArgb(color: string): string {
  return `FF${color.replace('#', '').toUpperCase()}`;
}
