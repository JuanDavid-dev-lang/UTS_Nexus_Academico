import bcrypt from 'bcryptjs';
import { UserModel } from '../../models/user.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { areasDeProgramas, buscarPrograma } from '../../domains/catalog/uts.js';
import type { Role } from '../../shared/types.js';

/**
 * Acceso a datos del personal.
 *
 * Las rutas no tocan `UserModel` directamente: aquí se decide qué campos salen
 * —nunca `passwordHash` ni los rastros de recuperación— y qué arrastra un
 * cambio de rol. Una consulta suelta en una ruta se olvida del `select`, y lo
 * que se olvida en un listado viaja a los tres clientes.
 */

const CAMPOS_PUBLICOS = '_id email fullName role programas sede facultad photoUrl lastLoginAt createdAt';

export type UsuarioDePersonal = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  programas: string[];
  programasNombres: string[];
  /**
   * Las mismas carreras, agrupadas como se eligen: por área.
   *
   * `completa` distingue «coordina la carrera» de «coordina solo el ciclo
   * tecnológico». Sin ese dato, media carrera se lee igual que la carrera
   * entera y la mitad que falta no la echa nadie de menos.
   */
  areas: { id: string; nombre: string; completa: boolean }[];
  photoUrl: string | null;
  lastLoginAt: Date | null;
  /** Ficha docente, cuando la tiene. */
  profesor: {
    id: string;
    cedula: string | null;
    estado: string;
    esDirectorTrabajoGrado: boolean;
    programas: string[];
    /** Perfil institucional al que pertenece; `null` si aún no se le asignó. */
    institucion: { id: string; institutionId: string; nombre: string; sigla: string } | null;
    institucionSolicitada: string | null;
  } | null;
};

function nombrePrograma(id: string): string {
  return buscarPrograma(id)?.nombre ?? id;
}

/**
 * Forma minima de lo que devuelven las consultas. Se declara en vez de usar
 * `any`: con `any`, quitar un campo del `select` no da error aqui — da
 * `undefined` en el listado, que llega al cliente como una fila a medias.
 */
type UsuarioCrudo = {
  _id: unknown;
  email: string;
  fullName: string;
  role: string;
  programas?: string[] | null;
  photoUrl?: string | null;
  lastLoginAt?: Date | null;
};

type FichaCruda = {
  _id: unknown;
  cedula?: string | null;
  estado: string;
  esDirectorTrabajoGrado?: boolean | null;
  programas?: string[] | null;
  /** Poblado con `institutionId nombre sigla`; un id suelto si no se pobló. */
  institutionId?: unknown;
  institucionSolicitada?: string | null;
};

function institucionDe(ficha: FichaCruda): NonNullable<UsuarioDePersonal['profesor']>['institucion'] {
  const valor = ficha.institutionId;
  if (!valor || typeof valor !== 'object' || !('institutionId' in valor)) return null;
  const doc = valor as { _id: unknown; institutionId: string; nombre: string; sigla: string };
  return { id: String(doc._id), institutionId: doc.institutionId, nombre: doc.nombre, sigla: doc.sigla };
}

/** Une la cuenta con su ficha docente y traduce los programas a nombre visible. */
function aPersonal(usuario: UsuarioCrudo, ficha: FichaCruda | undefined): UsuarioDePersonal {
  const programas: string[] = usuario.programas ?? [];
  return {
    id: String(usuario._id),
    email: usuario.email,
    fullName: usuario.fullName,
    role: usuario.role as Role,
    programas,
    programasNombres: programas.map(nombrePrograma),
    areas: areasDeProgramas(programas).map(entrada => ({
      id: entrada.area.id,
      nombre: entrada.area.nombre,
      completa: entrada.completa,
    })),
    photoUrl: usuario.photoUrl ?? null,
    lastLoginAt: usuario.lastLoginAt ?? null,
    profesor: ficha
      ? {
          id: String(ficha._id),
          cedula: ficha.cedula ?? null,
          estado: ficha.estado,
          esDirectorTrabajoGrado: Boolean(ficha.esDirectorTrabajoGrado),
          programas: ficha.programas ?? [],
          institucion: institucionDe(ficha),
          institucionSolicitada: ficha.institucionSolicitada ?? null,
        }
      : null,
  };
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listarUsuarios(
  filtro: { role?: string; q?: string },
  skip: number,
  limit: number,
): Promise<{ items: UsuarioDePersonal[]; total: number }> {
  const query: Record<string, unknown> = { deletedAt: null };
  if (filtro.role) query.role = filtro.role;
  if (filtro.q) {
    const patron = new RegExp(escaparRegex(filtro.q), 'i');
    query.$or = [{ fullName: patron }, { email: patron }];
  }

  const [usuarios, total] = await Promise.all([
    UserModel.find(query)
      .select(CAMPOS_PUBLICOS)
      .sort({ role: 1, fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UserModel.countDocuments(query),
  ]);

  const fichas = await ProfessorModel.find({
    userId: { $in: usuarios.map(usuario => usuario._id) },
    deletedAt: null,
  })
    .select('_id userId cedula estado esDirectorTrabajoGrado programas institutionId institucionSolicitada')
    .populate('institutionId', 'institutionId nombre sigla')
    .lean();
  const porUsuario = new Map(fichas.map(ficha => [String(ficha.userId), ficha]));

  return {
    items: usuarios.map(usuario => aPersonal(usuario, porUsuario.get(String(usuario._id)))),
    total,
  };
}

export async function obtenerUsuario(id: string): Promise<UsuarioDePersonal | null> {
  const usuario = await UserModel.findOne({ _id: id, deletedAt: null })
    .select(CAMPOS_PUBLICOS)
    .lean();
  if (!usuario) return null;

  const ficha = await ProfessorModel.findOne({ userId: id, deletedAt: null })
    .select('_id userId cedula estado esDirectorTrabajoGrado programas institutionId institucionSolicitada')
    .populate('institutionId', 'institutionId nombre sigla')
    .lean();

  return aPersonal(usuario, ficha ?? undefined);
}

/**
 * Alta de una cuenta hecha por la administracion.
 *
 * Existe aparte de `POST /auth/register` por una razon concreta: aquella ruta
 * **abre sesion de la cuenta recien creada** —devuelve sus tokens y le guarda
 * una `Session`— porque nacio para el alta del primer administrador. Usarla
 * desde la pantalla de personal significaba emitir un par de tokens de otra
 * persona en la maquina de quien la crea, y dejarlos ahi por si acaso.
 *
 * Aqui no se firma nada: se crea la cuenta y se acabo. Quien la use entrara con
 * su contrasena, que es el unico camino que despues queda registrado.
 */
export async function crearUsuario(input: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  programas?: string[];
  employeeCode?: string;
}): Promise<UsuarioDePersonal | null> {
  const existente = await UserModel.findOne({ email: input.email }).select('_id').lean();
  if (existente) return null;

  const passwordHash = await bcrypt.hash(input.password, 12);
  const usuario = await UserModel.create({
    email: input.email,
    passwordHash,
    fullName: input.fullName,
    role: input.role,
    // Solo significan algo para coordinacion y secretaria. Para el resto se
    // guardan vacios en vez de rechazarlos: el formulario no los ofrece, y un
    // 400 por un campo que la pantalla no muestra no se puede corregir.
    programas: input.role === 'COORDINATOR' || input.role === 'SECRETARY'
      ? (input.programas ?? [])
      : [],
  });

  // Un docente sin ficha no aparece en el listado de docentes ni puede recibir
  // la direccion de trabajos de grado: nace con ella, no cuando alguien lo nota.
  if (input.role === 'PROFESSOR') {
    await ProfessorModel.create({
      userId: usuario.id,
      employeeCode: input.employeeCode ?? null,
      estado: 'APROBADO',
    });
  }

  return obtenerUsuario(usuario.id);
}

export async function actualizarUsuario(
  id: string,
  cambios: { fullName?: string; role?: string; programas?: string[] },
): Promise<{ antes: { role: Role; programas: string[] } | null; item: UsuarioDePersonal | null }> {
  const antes = await UserModel.findOne({ _id: id, deletedAt: null }).select('role programas').lean();
  if (!antes) return { antes: null, item: null };

  await UserModel.updateOne({ _id: id, deletedAt: null }, { $set: cambios });

  // Un ascenso a docente sin ficha deja una cuenta que no puede registrarse en
  // ningún grupo y que no aparece en el listado de docentes: la ficha se crea
  // aquí en vez de esperar a que alguien lo note.
  if (cambios.role === 'PROFESSOR') {
    await ProfessorModel.updateOne(
      { userId: id },
      { $setOnInsert: { userId: id, estado: 'APROBADO' } },
      { upsert: true },
    );
  }

  return {
    antes: { role: antes.role as Role, programas: antes.programas ?? [] },
    item: await obtenerUsuario(id),
  };
}

export async function desactivarUsuario(id: string) {
  const usuario = await UserModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { deletedAt: new Date(), status: 'INACTIVE' } },
    { new: true },
  )
    .select('_id email role')
    .lean();
  if (!usuario) return null;

  // La ficha docente se da de baja con la cuenta: dejarla viva la mantendría en
  // el listado de docentes de coordinación, con materias que ya nadie dicta.
  await ProfessorModel.updateOne({ userId: id, deletedAt: null }, { $set: { deletedAt: new Date() } });

  return { id: String(usuario._id), email: usuario.email, role: usuario.role as Role };
}
