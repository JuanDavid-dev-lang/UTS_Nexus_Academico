import { Schema, model } from 'mongoose';
import { baseFields } from './base.js';

/**
 * Perfil institucional.
 *
 * Es un documento y no una entrada de una enumeración a propósito: la
 * administración crea universidades desde el panel, y el selector del
 * registro las lee de aquí. Nada de esto exige recompilar ni desplegar.
 *
 * `institutionId` es el identificador estable que otros sistemas (UniPlanner)
 * usarán para referirse a la institución; no cambia una vez creado. `_id` es
 * la clave interna que enlaza a los docentes.
 *
 * `clavesBusqueda` guarda nombre, sigla y alias normalizados; su índice único
 * es la última barrera contra duplicados —«UDES» y «Universidad de Santander»
 * no pueden acabar en dos perfiles— aunque la validación del servicio ya lo
 * impide con un mensaje legible.
 */
const corteSchema = new Schema(
  {
    numero: { type: Number, required: true },
    nombre: { type: String, required: true },
    peso: { type: Number, required: true },
  },
  { _id: false },
);

const componenteSchema = new Schema(
  {
    id: { type: String, required: true },
    nombre: { type: String, required: true },
    peso: { type: Number, required: true },
  },
  { _id: false },
);

const configuracionSchema = new Schema(
  {
    cortes: { type: [corteSchema], default: [] },
    componentes: { type: [componenteSchema], default: [] },
    notaMinima: { type: Number, required: true },
    notaMaxima: { type: Number, required: true },
    notaAprobacion: { type: Number, required: true },
  },
  { _id: false },
);

const schema = new Schema(
  {
    ...baseFields,
    institutionId: { type: String, required: true, unique: true, index: true },
    nombre: { type: String, required: true },
    sigla: { type: String, required: true },
    aliases: { type: [String], default: [] },
    clavesBusqueda: { type: [String], default: [], index: true },
    activa: { type: Boolean, default: true, index: true },
    /** `null` hasta que un administrador la configure. Nunca se inventa. */
    configuracionAcademica: { type: configuracionSchema, default: null },
    configuradaPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    configuradaEn: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index(
  { clavesBusqueda: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export const InstitutionModel = model('Institucion', schema, 'instituciones');
