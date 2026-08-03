import { Router } from 'express';
import { z } from 'zod';
import { ConfigModel } from '../../models/config.model.js';
import { auth, requireRole } from '../../middlewares/auth.js';
import { auditChange } from '../../shared/audit.js';

/**
 * Enlaces de descarga que enseña la página pública.
 *
 * Existen para que publicar una versión no obligue a editar el HTML del sitio.
 * La administración los cambia desde la app; la página los lee al cargar y, si
 * el servidor no responde, se queda con los que trae escritos —una página de
 * descargas que se queda en blanco porque la API está caída es peor que una con
 * enlaces de la versión anterior.
 */
export const downloadRouter = Router();

/** Fila de `configuraciones` donde viven. Una sola, sobrescrita cada vez. */
const CLAVE = 'descargas';

/**
 * Dónde se permite alojarlos.
 *
 * Un administrador con la sesión robada podría apuntar el botón «Descargar»
 * a un ejecutable cualquiera, y quien lo pulsara instalaría eso creyendo que
 * es la aplicación. La lista no evita que alguien suba algo malo a su propio
 * Dropbox, pero sí que el enlace lleve a un dominio recién registrado.
 */
const HOSTS_PERMITIDOS = [
  'dropbox.com',
  'www.dropbox.com',
  'dl.dropboxusercontent.com',
  'github.com',
  'objects.githubusercontent.com',
];

/** Enlace válido, o cadena vacía para «no hay». */
const enlace = z
  .string()
  .trim()
  .max(2000)
  .refine(valor => {
    if (valor === '') return true;
    let url: URL;
    try {
      url = new URL(valor);
    } catch {
      return false;
    }
    // Solo HTTPS: un instalador por HTTP se puede sustituir en tránsito.
    if (url.protocol !== 'https:') return false;
    return HOSTS_PERMITIDOS.includes(url.hostname);
  }, `El enlace tiene que ser https y estar en: ${HOSTS_PERMITIDOS.join(', ')}.`);

const cuerpo = z.object({
  windows: enlace,
  android: enlace,
  admin: enlace,
});

type Enlaces = z.infer<typeof cuerpo>;

/**
 * A dónde apuntan mientras nadie los haya cambiado.
 *
 * La publicación de GitHub siempre existe y siempre es la última, así que la
 * página funciona desde el primer día sin que nadie entre a configurarla.
 */
const POR_DEFECTO: Enlaces = {
  windows: 'https://github.com/JuanDavid-dev-lang/UTS_Nexus_Releases/releases/latest',
  android: 'https://github.com/JuanDavid-dev-lang/UTS_Nexus_Releases/releases/latest',
  admin: 'https://github.com/JuanDavid-dev-lang/UTS_Nexus_Releases/releases/latest',
};

async function leer(): Promise<Enlaces> {
  const fila = await ConfigModel.findOne({ key: CLAVE, deletedAt: null }).lean();
  const guardado = cuerpo.partial().safeParse(fila?.value ?? {});
  // Un valor corrupto en base no debe tumbar la página: se cae a los por defecto
  // campo a campo, no todo o nada.
  const valores = guardado.success ? guardado.data : {};
  return {
    windows: valores.windows || POR_DEFECTO.windows,
    android: valores.android || POR_DEFECTO.android,
    admin: valores.admin || POR_DEFECTO.admin,
  };
}

/**
 * Lectura pública, sin sesión.
 *
 * La consulta un sitio estático alojado en otro dominio, que no tiene forma de
 * autenticarse ni motivo para hacerlo: son los mismos enlaces que ya salen
 * impresos en la página. Por eso se abre el CORS solo aquí y se quita
 * `Allow-Credentials`, que con `*` el navegador rechaza.
 */
downloadRouter.get('/', async (_req, res, next) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    res.removeHeader('Access-Control-Allow-Credentials');
    // Un minuto: suficiente para que una ráfaga de visitas no llegue a la base,
    // corto para que un cambio se vea casi al momento.
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ok: true, enlaces: await leer() });
  } catch (err) {
    next(err);
  }
});

downloadRouter.put('/', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const enlaces = cuerpo.parse(req.body);

    const antes = await ConfigModel.findOne({ key: CLAVE }).lean();
    const item = await ConfigModel.findOneAndUpdate(
      { key: CLAVE },
      { $set: { key: CLAVE, value: enlaces, deletedAt: null } },
      { upsert: true, new: true },
    );

    // Queda en la auditoría: cambiar a dónde apunta «Descargar» es de las cosas
    // que hay que poder mirar después y saber quién la hizo.
    await auditChange({
      actorId: req.user?.id,
      action: 'UPDATE',
      entity: 'EnlacesDescarga',
      entityId: item.id,
      before: antes?.value,
      after: enlaces,
    });

    res.json({ ok: true, enlaces: await leer() });
  } catch (err) {
    next(err);
  }
});
