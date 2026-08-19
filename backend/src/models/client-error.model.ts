import { Schema, model } from 'mongoose';

/**
 * Defecto reportado por un cliente (escritorio o móvil).
 *
 * **Un documento por firma, no por ocurrencia.** Una pantalla que falla en
 * bucle manda el mismo error cincuenta veces por minuto; guardar cada uno
 * llena la colección de ruido y esconde los otros diez defectos distintos que
 * sí hay. La firma agrupa, `occurrences` cuenta y `lastSeenAt` ordena.
 *
 * Lo que NO entra aquí está en `shared/sanitize.ts` y no es negociable:
 * contraseñas, tokens, cédulas, correos, cuerpos de peticiones y respuestas.
 * Un panel de errores con datos personales dentro es una filtración con
 * buena presentación.
 */
const schema = new Schema(
  {
    /** De dónde viene. `desktop` | `mobile`. */
    client: { type: String, enum: ['desktop', 'mobile'], required: true, index: true },
    /** Versión de la aplicación que lo reportó. */
    appVersion: { type: String, default: '', index: true },
    /** `windows`, `android`, `web`… tal y como lo declara el cliente. */
    platform: { type: String, default: '' },

    /** Ruta o pantalla donde ocurrió, ya sin parámetros identificables. */
    route: { type: String, default: '' },
    /**
     * Naturaleza del fallo. `network` se separa a propósito: un teléfono sin
     * cobertura no es un defecto del programa, y mezclarlo con los demás
     * ahoga la lista con lo único que nunca hay que arreglar.
     */
    category: {
      type: String,
      enum: ['render', 'network', 'runtime', 'unhandled', 'promise', 'otro'],
      default: 'runtime',
      index: true,
    },

    /**
     * Firma de deduplicación. La calcula el backend a partir de categoría,
     * cliente, ruta y mensaje normalizado: si la calculara el cliente, dos
     * versiones distintas agruparían distinto el mismo defecto.
     */
    signature: { type: String, required: true, index: true },

    /** Mensaje ya saneado y acotado. */
    message: { type: String, default: '' },
    /** Contexto técnico limitado: primeras líneas de pila, ya saneadas. */
    context: { type: String, default: '' },

    occurrences: { type: Number, default: 1 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },

    /**
     * Quién lo vio. Sale de la sesión, nunca del cuerpo: un cliente que
     * declara su propio `userId` puede declarar el de otro.
     */
    lastUserId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    /** Cuántas personas distintas lo han sufrido (aproximado, acotado). */
    affectedUsers: { type: Number, default: 1 },

    status: { type: String, enum: ['ABIERTO', 'RESUELTO', 'IGNORADO'], default: 'ABIERTO', index: true },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  },
  { timestamps: true },
);

// La firma es la identidad: el segundo reporte idéntico incrementa, no inserta.
schema.index({ signature: 1 }, { unique: true });
// El listado del panel: lo abierto, lo más reciente primero.
schema.index({ status: 1, lastSeenAt: -1 });

export const ClientErrorModel = model('ErrorCliente', schema, 'errores_cliente');
