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
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ConfigModel } from '../../models/config.model.js';
import { CATALOGOS, COLUMNAS_SUSTITUIDAS, type ColumnaReporte, type TipoCatalogo } from './report-columns.js';
import { dimensionesDeImagen, formatoDeImagen } from './report-layout.js';

export const CLAVE_PLANTILLA = 'report_template';

const hex = () =>
  z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color en formato #RRGGBB');

/** Verde institucional UTS (`DESIGN.md` §4). */
export const VERDE_UTS = '#144D37';

/**
 * Colores por defecto de la primera plantilla: un menta, un menta pálido y un
 * azul petróleo que no eran de la UTS. El editor guarda la plantilla entera,
 * así que quien la guardó sin tocar los colores los tiene escritos en la base
 * tal cual; se leen como «sin elegir» y pasan al verde institucional. Elegir
 * uno de estos tres a propósito después de este cambio también lo sustituye:
 * es el precio de no dejar a todas las instalaciones con los colores viejos.
 */
const COLORES_ANTERIORES: Record<'marca' | 'encabezadoTabla' | 'encabezadoExcel', string> = {
  marca: '#74d3b2',
  encabezadoTabla: '#d7f0e5',
  encabezadoExcel: '#17313b',
};

const color = (campo: keyof typeof COLORES_ANTERIORES) =>
  hex()
    .default(VERDE_UTS)
    .transform(valor => (valor.toLowerCase() === COLORES_ANTERIORES[campo] ? VERDE_UTS : valor));

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
      /** Franja superior, título y filetes del membrete (y el recuadro de la sigla sin logo). */
      marca: color('marca'),
      /** Fondo de la fila de encabezado de las tablas del PDF; el texto se elige por contraste. */
      encabezadoTabla: color('encabezadoTabla'),
      /** Fondo de la fila de encabezado del Excel. */
      encabezadoExcel: color('encabezadoExcel'),
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
  const guardadas = tipo === 'consolidado' || tipo === 'grades' || tipo === 'attendance'
    ? plantilla.columnas[tipo]
    : undefined;
  if (!guardadas?.length) return catalogo;

  const elegidas = guardadas.flatMap(clave => COLUMNAS_SUSTITUIDAS[clave] ?? [clave]);

  const visibles = catalogo.filter(col => elegidas.includes(col.key));
  if (!visibles.length || !visibles.some(col => col.key === 'code')) return catalogo;
  return visibles;
}

/** Convierte `#rrggbb` al ARGB que pide ExcelJS (`FFRRGGBB`). */
export function hexAArgb(color: string): string {
  return `FF${color.replace('#', '').toUpperCase()}`;
}

export type LogoDelDocumento = {
  ruta: string;
  formato: 'png' | 'jpeg';
  /** Proporción ancho / alto; 1 si la cabecera no la dice. */
  proporcion: number;
};

/**
 * Logo del membrete, en orden de preferencia: el que subió la administración y
 * el institucional de la UTS que viaja con el backend.
 *
 * Se decide por la firma del archivo y no por la extensión: pdfkit solo lee PNG
 * y JPEG, y un WebP subido a la plantilla dejaba el acta sin logo sin avisar.
 * Sin ninguno válido, el membrete dibuja el recuadro con la sigla.
 */
export function logoDelDocumento(plantilla: Plantilla): LogoDelDocumento | null {
  const candidatos: string[] = [];
  if (plantilla.logoUrl) {
    candidatos.push(path.join(process.cwd(), 'uploads', path.basename(plantilla.logoUrl)));
  }
  candidatos.push(path.join(process.cwd(), 'assets', 'logo-uts.png'));

  for (const ruta of candidatos) {
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(ruta);
    } catch {
      continue; // No existe o no se puede leer: el siguiente candidato.
    }
    const formato = formatoDeImagen(bytes);
    if (!formato) continue;
    const medidas = dimensionesDeImagen(bytes);
    const proporcion = medidas && medidas.alto > 0 ? medidas.ancho / medidas.alto : 1;
    return { ruta, formato, proporcion };
  }
  return null;
}
