import swaggerJSDoc from 'swagger-jsdoc';
import path from 'node:path';
import { APP_VERSION } from './version.js';

/**
 * Especificación OpenAPI servida en `/docs`.
 *
 * **`apis` estaba vacío**, así que el Swagger interactivo llevaba tiempo
 * mostrando una especificación sin un solo endpoint mientras el README lo
 * anunciaba como «la referencia completa y siempre al día». Una referencia
 * vacía es peor que ninguna: quien la abre concluye que la API no existe, o
 * que la página está rota.
 *
 * Ahora se leen los comentarios `@openapi` de los archivos de rutas. Los globs
 * cubren las dos formas en que corre el proceso —`tsx` sobre `src/` y Node
 * sobre `dist/`—, porque el mismo servidor sirve `/docs` en desarrollo y en
 * producción y no puede quedarse mudo en una de las dos.
 *
 * La cobertura es parcial y esto lo dice por escrito en la descripción: los
 * módulos de la v3 están anotados y el resto se irá anotando cuando se toquen,
 * como con la migración de módulos a `.service.ts`. Prometer completitud que no
 * existe es exactamente el problema que había.
 */
const raiz = path.resolve(process.cwd());

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UTS Nexus Académico — API',
      version: APP_VERSION,
      description:
        'Documentación generada de los comentarios `@openapi` de las rutas. ' +
        'La cobertura es parcial: están anotados los módulos de la evolución v3 ' +
        '(periodos, actividades, auditoría, salud, telemetría e historial). ' +
        'Los demás endpoints existen y funcionan aunque todavía no aparezcan aquí; ' +
        'el listado completo está en el README.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        RespuestaPaginada: {
          type: 'object',
          description:
            '`items` va en la raíz y cada endpoint conserva por defecto el tope ' +
            'que ya devolvía, para no romper a los clientes publicados.',
          properties: {
            ok: { type: 'boolean', example: true },
            items: { type: 'array', items: { type: 'object' } },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: false },
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    path.join(raiz, 'src/modules/**/*.routes.ts'),
    path.join(raiz, 'dist/modules/**/*.routes.js'),
  ],
});
