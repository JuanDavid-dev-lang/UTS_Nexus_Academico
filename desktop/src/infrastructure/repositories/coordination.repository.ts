import { z } from 'zod';
import { http } from '@/core/api/http-client';
import { itemsResponse } from '@/domain/schemas/common';
import {
  docenteCoordinacionSchema,
  grupoCoordinacionSchema,
  materiaCoordinacionSchema,
  programasResponseSchema,
  resumenCoordinacionSchema,
  type DocenteCoordinacion,
  type FiltroCoordinacion,
  type GrupoCoordinacion,
  type MateriaCoordinacion,
  type ResumenCoordinacion,
} from '@/domain/schemas/coordination';
import {
  rolCatalogoSchema,
  usuarioPersonalSchema,
  type CambioDeUsuario,
  type NuevaCuenta,
  type RolCatalogo,
  type UsuarioPersonal,
} from '@/domain/schemas/users';

/**
 * Coordinación y personal.
 *
 * Adaptadores delgados: traducen el filtro a la consulta y validan la
 * respuesta. El acotado por carrera lo hace el servidor —no se manda ningún
 * `programa` "por si acaso"—; lo que este cliente pide de más lo recibe vacío.
 */

const consulta = (filtro?: FiltroCoordinacion) => ({
  period: filtro?.period || undefined,
  programa: filtro?.programa || undefined,
  q: filtro?.q?.trim() || undefined,
});

export const coordinationRepository = {
  /** Programas que esta cuenta puede mirar. Alimenta el selector de carrera. */
  async programas(): Promise<{ items: { id: string; nombre: string }[]; alcanceTotal: boolean }> {
    const data = await http.get('/coordinacion/programas', { schema: programasResponseSchema });
    return { items: data.items, alcanceTotal: data.alcanceTotal };
  },

  async resumen(filtro?: FiltroCoordinacion): Promise<ResumenCoordinacion> {
    return http.get('/coordinacion/resumen', {
      schema: resumenCoordinacionSchema,
      query: consulta(filtro),
    });
  },

  async materias(filtro?: FiltroCoordinacion): Promise<MateriaCoordinacion[]> {
    const data = await http.get('/coordinacion/materias', {
      schema: itemsResponse(materiaCoordinacionSchema),
      query: consulta(filtro),
    });
    return data.items;
  },

  async docentes(filtro?: FiltroCoordinacion): Promise<DocenteCoordinacion[]> {
    const data = await http.get('/coordinacion/docentes', {
      schema: itemsResponse(docenteCoordinacionSchema),
      query: consulta(filtro),
    });
    return data.items;
  },

  async grupos(filtro?: FiltroCoordinacion): Promise<GrupoCoordinacion[]> {
    const data = await http.get('/coordinacion/grupos', {
      schema: itemsResponse(grupoCoordinacionSchema),
      query: consulta(filtro),
    });
    return data.items;
  },

  /** Un libro con las tres hojas. Es `GET`: exportar es leer. */
  async exportar(filtro?: FiltroCoordinacion): Promise<Blob> {
    return http.blob('/coordinacion/export.xlsx', consulta(filtro));
  },
};

export const usersRepository = {
  async roles(): Promise<RolCatalogo[]> {
    const data = await http.get('/usuarios/roles', { schema: itemsResponse(rolCatalogoSchema) });
    return data.items;
  },

  async list(filtro?: { role?: string; q?: string }): Promise<UsuarioPersonal[]> {
    const data = await http.get('/usuarios', {
      schema: z.object({
        ok: z.literal(true),
        items: z.array(usuarioPersonalSchema),
        total: z.number().optional(),
      }),
      query: { role: filtro?.role || undefined, q: filtro?.q?.trim() || undefined },
    });
    return data.items;
  },

  /**
   * Alta de una cuenta. Va a `POST /usuarios`, no a `/auth/register`: aquella
   * ruta devuelve los tokens de la cuenta recien creada, y no hay ninguna razon
   * para que la sesion de quien la crea reciba las credenciales de otra persona.
   */
  async create(input: NuevaCuenta): Promise<UsuarioPersonal> {
    const data = await http.post('/usuarios', input, {
      schema: z.object({ ok: z.literal(true), item: usuarioPersonalSchema }),
    });
    return data.item;
  },

  async update(id: string, cambios: CambioDeUsuario): Promise<UsuarioPersonal> {
    const data = await http.patch(`/usuarios/${id}`, cambios, {
      schema: z.object({ ok: z.literal(true), item: usuarioPersonalSchema }),
    });
    return data.item;
  },

  async desactivar(id: string): Promise<void> {
    await http.delete(`/usuarios/${id}`, { schema: z.object({ ok: z.literal(true) }) });
  },
};
