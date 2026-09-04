/**
 * Adaptador HTTP de los perfiles institucionales.
 *
 * Delgado a propósito: traduce argumentos al contrato del endpoint, valida y
 * devuelve tipos de dominio. `detalleDeError` es la única pieza con algo de
 * lógica, y no calcula nada — solo desempaqueta lo que el servidor ya decidió
 * (mensaje, campos con error, coincidencias) para que el formulario no tenga
 * que adivinar la forma del cuerpo de un 400/409.
 */
import { z } from 'zod';
import { http } from '@/core/api/http-client';
import { AppError, toAppError } from '@/core/api/errors';
import { itemResponse, itemsResponse } from '@/domain/schemas/common';
import {
  coincidenciaSchema,
  docenteInstitucionSchema,
  institucionPublicaSchema,
  institucionSchema,
  solicitudInstitucionSchema,
  type Coincidencia,
  type ConfiguracionAcademica,
  type DocenteInstitucion,
  type Institucion,
  type InstitucionPublica,
  type SolicitudInstitucion,
} from '@/domain/schemas/institutions';

export type NuevaInstitucion = {
  /** Opcional: el servidor lo genera desde la sigla si no viene. */
  institutionId?: string;
  nombre: string;
  sigla: string;
  aliases?: string[];
  activa?: boolean;
};

export type CambiosInstitucion = {
  nombre?: string;
  sigla?: string;
  aliases?: string[];
  activa?: boolean;
};

export type FiltroInstituciones = { q?: string; activa?: boolean };

export const institutionsRepository = {
  /**
   * Instituciones activas para cualquier sesión autenticada.
   *
   * El formulario de registro NO llama a este método: antes de tener sesión
   * usa el arreglo `instituciones` que ya viene dentro de
   * `GET /registro/catalogo` (ese sí sin sesión). Este endpoint es para
   * selectores dentro de la aplicación ya autenticada.
   */
  async activas(): Promise<InstitucionPublica[]> {
    const data = await http.get('/instituciones/activas', {
      schema: itemsResponse(institucionPublicaSchema),
    });
    return data.items;
  },

  async list(filtro: FiltroInstituciones = {}): Promise<Institucion[]> {
    const data = await http.get('/instituciones', {
      schema: itemsResponse(institucionSchema),
      query: { q: filtro.q, activa: filtro.activa === undefined ? undefined : String(filtro.activa) },
    });
    return data.items;
  },

  async get(id: string): Promise<Institucion> {
    return (await http.get(`/instituciones/${id}`, { schema: itemResponse(institucionSchema) })).item;
  },

  /** Nombre/sigla/alias parecidos. El formulario la llama antes de guardar una institución nueva. */
  async coincidencias(params: {
    nombre?: string;
    sigla?: string;
    aliases?: string[];
    excluir?: string;
  }): Promise<Coincidencia[]> {
    const data = await http.get('/instituciones/coincidencias', {
      schema: itemsResponse(coincidenciaSchema),
      query: {
        nombre: params.nombre,
        sigla: params.sigla,
        aliases: params.aliases && params.aliases.length > 0 ? params.aliases.join('|') : undefined,
        excluir: params.excluir,
      },
    });
    return data.items;
  },

  async solicitudes(): Promise<SolicitudInstitucion[]> {
    const data = await http.get('/instituciones/solicitudes', {
      schema: itemsResponse(solicitudInstitucionSchema),
    });
    return data.items;
  },

  async docentes(id: string): Promise<DocenteInstitucion[]> {
    const data = await http.get(`/instituciones/${id}/docentes`, {
      schema: itemsResponse(docenteInstitucionSchema),
    });
    return data.items;
  },

  async crear(input: NuevaInstitucion): Promise<Institucion> {
    return (await http.post('/instituciones', input, { schema: itemResponse(institucionSchema) })).item;
  },

  async actualizar(id: string, cambios: CambiosInstitucion): Promise<Institucion> {
    return (
      await http.patch(`/instituciones/${id}`, cambios, { schema: itemResponse(institucionSchema) })
    ).item;
  },

  /** `null` quita la configuración: la institución vuelve a quedar sin cortes ni ponderados. */
  async configurar(id: string, config: ConfiguracionAcademica | null): Promise<Institucion> {
    return (
      await http.put(`/instituciones/${id}/configuracion`, config, {
        schema: itemResponse(institucionSchema),
      })
    ).item;
  },

  async eliminar(id: string): Promise<Institucion> {
    return (await http.delete(`/instituciones/${id}`, { schema: itemResponse(institucionSchema) })).item;
  },

  /** `institutionId: null` desvincula al docente de cualquier institución. */
  async asignarDocente(profesorId: string, institutionId: string | null): Promise<DocenteInstitucion> {
    return (
      await http.patch(
        `/instituciones/docentes/${profesorId}`,
        { institutionId },
        { schema: itemResponse(docenteInstitucionSchema) },
      )
    ).item;
  },

  async asociarSolicitud(profesorId: string, institutionId: string): Promise<DocenteInstitucion> {
    return (
      await http.post(
        `/instituciones/solicitudes/${profesorId}/asociar`,
        { institutionId },
        { schema: itemResponse(docenteInstitucionSchema) },
      )
    ).item;
  },

  async crearDesdeSolicitud(
    profesorId: string,
    input: NuevaInstitucion,
  ): Promise<{ item: Institucion; docente: DocenteInstitucion }> {
    return http.post(`/instituciones/solicitudes/${profesorId}/crear`, input, {
      schema: z.object({
        ok: z.literal(true),
        item: institucionSchema,
        docente: docenteInstitucionSchema,
      }),
    });
  },
};

export type DetalleErrorInstitucion = {
  mensaje: string;
  errores: { campo: string; mensaje: string }[];
  coincidencias: Coincidencia[];
};

const detalleErrorSchema = z.object({
  errores: z.array(z.object({ campo: z.string(), mensaje: z.string() })).default([]),
  coincidencias: z.array(coincidenciaSchema).default([]),
});

/**
 * Desempaqueta un error de `institutionsRepository` para el formulario.
 *
 * `AppError.message` ya trae el texto pensado para la persona (400/409 pasan
 * por `USER_FACING_STATUSES` en `core/api/errors.ts`); `AppError.details` es
 * el cuerpo crudo de la respuesta, que es donde viajan `errores` (validación
 * por campo) y `coincidencias` (duplicado). Un cuerpo que no calza con la
 * forma esperada no revienta el formulario: se queda en listas vacías.
 */
export function detalleDeError(error: unknown): DetalleErrorInstitucion {
  const appError = error instanceof AppError ? error : toAppError(error);
  const parsed = detalleErrorSchema.safeParse(appError.details);
  return {
    mensaje: appError.message,
    errores: parsed.success ? parsed.data.errores : [],
    coincidencias: parsed.success ? parsed.data.coincidencias : [],
  };
}
