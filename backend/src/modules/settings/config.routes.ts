import { Router } from 'express';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { ConfigModel } from '../../models/config.model.js';
import { auditChange } from '../../shared/audit.js';

export const configRouter = Router();
configRouter.use(identificar);

/**
 * Claves que esta ruta genérica puede escribir, con su esquema.
 *
 * Antes el cuerpo era `{ key: z.string().min(1), value: z.any() }` y eso
 * convertía este endpoint en la puerta de atrás de toda la configuración que
 * **otras** rutas validan con cuidado:
 *
 *  - `descargas` — `PUT /descargas` obliga a HTTPS y a una lista de hosts,
 *    porque quien controle ese enlace controla el instalador que la gente baja
 *    creyendo que es la aplicación. Desde aquí se escribía la misma fila sin
 *    ninguna de las dos comprobaciones.
 *  - `report_template` — membrete, logo y colores del PDF oficial.
 *  - `registro_docentes_abierto` — el interruptor del autorregistro.
 *
 * Que la ruta sea solo ADMIN no lo arregla: el sentido de tener validación por
 * clave es que un error de la interfaz, un script viejo o una sesión robada no
 * puedan dejar la fila en un estado que el resto del sistema no espera. Y la
 * escritura no quedaba en la auditoría, mientras que la de `/descargas` sí.
 *
 * Las claves que tienen ruta propia **no están aquí a propósito**: se escriben
 * por la suya, con su validación. Esta lista es para configuración simple que
 * no la tiene.
 */
const CLAVES_ESCRIBIBLES: Record<string, z.ZodTypeAny> = {
  /** Interruptor del autorregistro de docentes. También lo escribe `PATCH /registro/estado`. */
  registro_docentes_abierto: z.boolean(),
  /** Texto libre que la administración muestra en el panel. */
  mensaje_institucional: z.string().trim().max(500),
  /** Periodo académico que los clientes preseleccionan. */
  periodo_por_defecto: z.string().trim().max(20),
};

/** Claves con ruta propia y validación propia: no se tocan desde aquí. */
const CLAVES_CON_RUTA_PROPIA = ['descargas', 'report_template'];

configRouter.get('/', requireRole('ADMIN', 'COORDINATOR'), async (_req, res, next) => {
  try {
    const items = await ConfigModel.find({ deletedAt: null }).lean();
    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});

configRouter.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { key } = z.object({ key: z.string().trim().min(1).max(80) }).parse(req.body);

    if (CLAVES_CON_RUTA_PROPIA.includes(key)) {
      return res.status(409).json({
        ok: false,
        message: `«${key}» se escribe por su propia ruta, que valida el contenido. No se puede cambiar desde aquí.`,
      });
    }

    const esquema = CLAVES_ESCRIBIBLES[key];
    if (!esquema) {
      return res.status(400).json({
        ok: false,
        message: `Clave de configuración desconocida: «${key}».`,
        claves: Object.keys(CLAVES_ESCRIBIBLES),
      });
    }

    const value = esquema.parse(req.body.value);

    const antes = await ConfigModel.findOne({ key }).lean();
    const item = await ConfigModel.findOneAndUpdate(
      { key },
      { $set: { key, value, deletedAt: null } },
      { upsert: true, new: true },
    );

    // Igual que `PUT /descargas`: cambiar la configuración del sistema es de las
    // cosas que hay que poder mirar después y saber quién las hizo.
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'Configuracion',
      entityId: item.id,
      before: antes?.value,
      after: value,
    });

    res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});
