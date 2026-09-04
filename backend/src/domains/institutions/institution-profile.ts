/**
 * Perfiles institucionales: reglas puras, sin I/O.
 *
 * Una institución es un dato de la base, no una lista escrita en el código:
 * la administración las crea desde el panel y el selector del registro las
 * lee de ahí. Lo que sí vive aquí —y queda fijado por pruebas— es lo que hace
 * que dos instituciones sean «la misma» y qué configuración académica es
 * válida. Repartir esas reglas por las rutas garantizaría que el registro
 * aceptara un duplicado que el panel rechaza.
 *
 * Solo la configuración de las UTS se deriva de `RUBRICA`: es la que el motor
 * de calificación aplica hoy. Las demás nacen sin configuración y la fija un
 * administrador; inventarles pesos sería publicar un acta con números que
 * nadie decidió.
 */
import { RUBRICA, type ComponenteTipo, type CorteNumero } from '../grading/grading.service.js';

// ── Formas ──────────────────────────────────────────────────────────────────

export type CorteConfigurado = {
  /** 1..N, consecutivo. */
  numero: number;
  nombre: string;
  /** Fracción del total (0–1). Entre todos los cortes suman 1. */
  peso: number;
};

export type ComponenteConfigurado = {
  /** Identificador estable en mayúsculas: `TRABAJOS`, `PARCIALES`… */
  id: string;
  nombre: string;
  /** Fracción del corte (0–1). Entre todos los componentes suman 1. */
  peso: number;
};

export type ConfiguracionAcademica = {
  cortes: CorteConfigurado[];
  componentes: ComponenteConfigurado[];
  notaMinima: number;
  notaMaxima: number;
  notaAprobacion: number;
};

export type PerfilInstitucional = {
  /** Identificador interno estable (slug). No cambia nunca. */
  institutionId: string;
  nombre: string;
  sigla: string;
  aliases: string[];
  activa: boolean;
  configuracionAcademica: ConfiguracionAcademica | null;
};

export type ErrorPerfil = { campo: string; mensaje: string };

// ── Límites ─────────────────────────────────────────────────────────────────

export const LIMITES = {
  NOMBRE_MIN: 3,
  NOMBRE_MAX: 160,
  SIGLA_MIN: 2,
  SIGLA_MAX: 12,
  ID_MIN: 2,
  ID_MAX: 40,
  ALIASES_MAX: 20,
  CORTES_MAX: 12,
  COMPONENTES_MAX: 12,
  /** Tolerancia al sumar pesos: 0.33+0.33+0.34 no da exactamente 1 en coma flotante. */
  TOLERANCIA_SUMA: 0.001,
} as const;

export const PATRON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PATRON_SIGLA = /^[A-ZÁÉÍÓÚÑ0-9]+$/;
export const PATRON_COMPONENTE = /^[A-Z][A-Z0-9_]*$/;

// ── Normalización ───────────────────────────────────────────────────────────

/**
 * Forma canónica de un nombre para comparar.
 *
 * Sin tildes, en minúsculas, sin puntuación y con un solo espacio entre
 * palabras: «Universidad de Santander», «UNIVERSIDAD DE SANTANDER » y
 * «Universidad de Santander.» son la misma clave. Es lo que se guarda como
 * `clavesBusqueda` y lo que decide un duplicado.
 */
export function normalizarNombre(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PALABRAS_VACIAS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'para', 'por',
  'universidad', 'universitaria', 'universitario', 'institucion', 'instituto',
  'fundacion', 'corporacion', 'unidades', 'unidad', 'escuela', 'colegio',
]);

/** Palabras que distinguen a una institución: sin artículos ni «universidad». */
export function palabrasClave(valor: string): string[] {
  return normalizarNombre(valor)
    .split(' ')
    .filter(palabra => palabra.length > 1 && !PALABRAS_VACIAS.has(palabra));
}

/**
 * Claves con las que un perfil «responde» al buscar: su nombre, su sigla y
 * sus alias, ya normalizados y sin repetidos. Dos perfiles no pueden
 * compartir ninguna.
 */
export function clavesDePerfil(perfil: {
  nombre: string;
  sigla: string;
  aliases?: readonly string[] | null;
}): string[] {
  const crudas = [perfil.nombre, perfil.sigla, ...(perfil.aliases ?? [])];
  const claves = crudas.map(normalizarNombre).filter(clave => clave.length > 0);
  return [...new Set(claves)];
}

/** Deja los alias limpios: sin espacios sobrantes, sin vacíos, sin repetidos. */
export function limpiarAliases(aliases: readonly string[] | null | undefined): string[] {
  const vistos = new Set<string>();
  const limpios: string[] = [];
  for (const alias of aliases ?? []) {
    const texto = alias.replace(/\s+/g, ' ').trim();
    const clave = normalizarNombre(texto);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    limpios.push(texto);
  }
  return limpios;
}

// ── Validación del perfil ───────────────────────────────────────────────────

/**
 * Valida los datos identitarios de un perfil. No mira la base: los duplicados
 * contra otros perfiles los decide `buscarCoincidencias` con la lista real.
 */
export function validarPerfil(input: {
  institutionId: string;
  nombre: string;
  sigla: string;
  aliases?: readonly string[] | null;
}): ErrorPerfil[] {
  const errores: ErrorPerfil[] = [];

  const nombre = input.nombre.replace(/\s+/g, ' ').trim();
  if (nombre.length < LIMITES.NOMBRE_MIN) {
    errores.push({ campo: 'nombre', mensaje: 'La institución necesita un nombre.' });
  } else if (nombre.length > LIMITES.NOMBRE_MAX) {
    errores.push({ campo: 'nombre', mensaje: 'El nombre es demasiado largo.' });
  }

  const sigla = input.sigla.trim().toUpperCase();
  if (sigla.length < LIMITES.SIGLA_MIN || sigla.length > LIMITES.SIGLA_MAX) {
    errores.push({
      campo: 'sigla',
      mensaje: `La sigla debe tener entre ${LIMITES.SIGLA_MIN} y ${LIMITES.SIGLA_MAX} caracteres.`,
    });
  } else if (!PATRON_SIGLA.test(sigla)) {
    errores.push({ campo: 'sigla', mensaje: 'La sigla solo admite letras y números, sin espacios.' });
  }

  const id = input.institutionId.trim();
  if (id.length < LIMITES.ID_MIN || id.length > LIMITES.ID_MAX) {
    errores.push({
      campo: 'institutionId',
      mensaje: `El identificador debe tener entre ${LIMITES.ID_MIN} y ${LIMITES.ID_MAX} caracteres.`,
    });
  } else if (!PATRON_ID.test(id)) {
    errores.push({
      campo: 'institutionId',
      mensaje: 'El identificador solo admite minúsculas, números y guiones (por ejemplo, «uts»).',
    });
  }

  const aliases = input.aliases ?? [];
  if (aliases.length > LIMITES.ALIASES_MAX) {
    errores.push({ campo: 'aliases', mensaje: `Como mucho ${LIMITES.ALIASES_MAX} alias.` });
  }
  for (const alias of aliases) {
    if (alias.trim().length > LIMITES.NOMBRE_MAX) {
      errores.push({ campo: 'aliases', mensaje: 'Hay un alias demasiado largo.' });
      break;
    }
  }
  const claveNombre = normalizarNombre(nombre);
  if (claveNombre && aliases.some(alias => normalizarNombre(alias) === claveNombre)) {
    errores.push({ campo: 'aliases', mensaje: 'Un alias no puede ser el mismo nombre de la institución.' });
  }

  return errores;
}

/** Propone un identificador a partir de la sigla (o del nombre si no hay sigla). */
export function sugerirInstitutionId(sigla: string, nombre = ''): string {
  const base = normalizarNombre(sigla) || palabrasClave(nombre).join('-');
  return base.replace(/\s+/g, '-').replace(/ñ/g, 'n').slice(0, LIMITES.ID_MAX);
}

/**
 * Identificador definitivo: la sugerencia, y si ya está en uso, la misma con
 * `-2`, `-3`… El administrador no lo escribe —es un dato técnico que otros
 * sistemas leen— y por eso tampoco puede chocar: dos «UNAB» dan `unab` y
 * `unab-2`, nunca un 409 por algo que nadie tecleó.
 */
export function generarInstitutionId(
  sigla: string,
  nombre: string,
  enUso: ReadonlySet<string> | readonly string[],
): string {
  const ocupados = enUso instanceof Set ? enUso : new Set(enUso);
  const base = sugerirInstitutionId(sigla, nombre) || 'institucion';
  if (!ocupados.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const sufijo = `-${n}`;
    const candidato = `${base.slice(0, LIMITES.ID_MAX - sufijo.length)}${sufijo}`;
    if (!ocupados.has(candidato)) return candidato;
  }
  throw new Error(`No hay identificador libre para «${base}».`);
}

// ── Configuración académica ─────────────────────────────────────────────────

function sumaCercaDeUno(pesos: number[]): boolean {
  const suma = pesos.reduce((total, peso) => total + peso, 0);
  return Math.abs(suma - 1) <= LIMITES.TOLERANCIA_SUMA;
}

function esNumeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * Valida cortes, componentes y escala. Devuelve la lista de errores; vacía
 * si la configuración se puede guardar.
 *
 * Los pesos son fracciones que suman 1 entre sí. Un corte con peso 0 o un
 * componente que pese más que el corte entero no dan error de tipo: dan un
 * acta con una nota que no corresponde a nada, y eso se descubre cuando ya
 * está firmada.
 */
export function validarConfiguracionAcademica(config: ConfiguracionAcademica): ErrorPerfil[] {
  const errores: ErrorPerfil[] = [];

  const cortes = config.cortes ?? [];
  if (cortes.length === 0) {
    errores.push({ campo: 'cortes', mensaje: 'Define al menos un corte.' });
  } else if (cortes.length > LIMITES.CORTES_MAX) {
    errores.push({ campo: 'cortes', mensaje: `Como mucho ${LIMITES.CORTES_MAX} cortes.` });
  } else {
    cortes.forEach((corte, indice) => {
      if (corte.numero !== indice + 1) {
        errores.push({ campo: 'cortes', mensaje: 'Los cortes deben numerarse 1, 2, 3… sin saltos.' });
      }
      if (!corte.nombre || !corte.nombre.trim()) {
        errores.push({ campo: 'cortes', mensaje: `El corte ${indice + 1} necesita un nombre.` });
      }
      if (!esNumeroFinito(corte.peso) || corte.peso <= 0 || corte.peso > 1) {
        errores.push({ campo: 'cortes', mensaje: `El peso del corte ${indice + 1} debe estar entre 0 y 1.` });
      }
    });
    if (cortes.every(corte => esNumeroFinito(corte.peso)) && !sumaCercaDeUno(cortes.map(c => c.peso))) {
      errores.push({ campo: 'cortes', mensaje: 'Los pesos de los cortes deben sumar 100 %.' });
    }
  }

  const componentes = config.componentes ?? [];
  if (componentes.length === 0) {
    errores.push({ campo: 'componentes', mensaje: 'Define al menos un componente por corte.' });
  } else if (componentes.length > LIMITES.COMPONENTES_MAX) {
    errores.push({ campo: 'componentes', mensaje: `Como mucho ${LIMITES.COMPONENTES_MAX} componentes.` });
  } else {
    const ids = new Set<string>();
    componentes.forEach((componente, indice) => {
      if (!componente.id || !PATRON_COMPONENTE.test(componente.id)) {
        errores.push({
          campo: 'componentes',
          mensaje: `El componente ${indice + 1} necesita un identificador en mayúsculas (TRABAJOS, PARCIALES…).`,
        });
      } else if (ids.has(componente.id)) {
        errores.push({ campo: 'componentes', mensaje: `El componente ${componente.id} está repetido.` });
      }
      ids.add(componente.id);
      if (!componente.nombre || !componente.nombre.trim()) {
        errores.push({ campo: 'componentes', mensaje: `El componente ${indice + 1} necesita un nombre.` });
      }
      if (!esNumeroFinito(componente.peso) || componente.peso <= 0 || componente.peso > 1) {
        errores.push({
          campo: 'componentes',
          mensaje: `El peso del componente ${indice + 1} debe estar entre 0 y 1.`,
        });
      }
    });
    if (
      componentes.every(componente => esNumeroFinito(componente.peso)) &&
      !sumaCercaDeUno(componentes.map(c => c.peso))
    ) {
      errores.push({ campo: 'componentes', mensaje: 'Los pesos de los componentes deben sumar 100 %.' });
    }
  }

  const { notaMinima, notaMaxima, notaAprobacion } = config;
  if (![notaMinima, notaMaxima, notaAprobacion].every(esNumeroFinito)) {
    errores.push({ campo: 'escala', mensaje: 'La escala de notas necesita mínimo, máximo y nota de aprobación.' });
  } else {
    if (notaMinima >= notaMaxima) {
      errores.push({ campo: 'escala', mensaje: 'La nota mínima debe ser menor que la máxima.' });
    }
    if (notaAprobacion <= notaMinima || notaAprobacion > notaMaxima) {
      errores.push({ campo: 'escala', mensaje: 'La nota de aprobación debe estar dentro de la escala.' });
    }
  }

  return errores;
}

/**
 * Configuración de las UTS, derivada de `RUBRICA` y no copiada: si el motor
 * cambia un peso, el perfil lo refleja, y la prueba que compara los dos lo
 * afirma. Es la única institución que nace configurada.
 */
export const NOMBRE_COMPONENTE: Record<ComponenteTipo, string> = {
  TRABAJOS: 'Trabajos',
  PARCIALES: 'Parciales',
  AUTOEVALUACION: 'Autoevaluación',
};

export function configuracionDesdeRubrica(): ConfiguracionAcademica {
  const cortes = (Object.keys(RUBRICA.CORTES) as unknown as CorteNumero[]).map(numero => ({
    numero: Number(numero),
    nombre: `Corte ${numero}`,
    peso: RUBRICA.CORTES[numero],
  }));
  const componentes = (Object.keys(RUBRICA.COMPONENTES) as ComponenteTipo[]).map(tipo => ({
    id: tipo,
    nombre: NOMBRE_COMPONENTE[tipo],
    peso: RUBRICA.COMPONENTES[tipo],
  }));
  return {
    cortes,
    componentes,
    notaMinima: RUBRICA.NOTA_MINIMA,
    notaMaxima: RUBRICA.NOTA_MAXIMA,
    notaAprobacion: RUBRICA.NOTA_APROBACION,
  };
}

// ── Perfiles iniciales ──────────────────────────────────────────────────────

/**
 * Los tres perfiles con los que arranca una instalación. Se crean si faltan y
 * **no se tocan si ya existen**: lo que la administración haya editado manda.
 * Solo las UTS llevan configuración; ver la cabecera del archivo.
 */
export const PERFILES_INICIALES: readonly PerfilInstitucional[] = [
  {
    institutionId: 'uts',
    nombre: 'Unidades Tecnológicas de Santander',
    sigla: 'UTS',
    aliases: [],
    activa: true,
    configuracionAcademica: configuracionDesdeRubrica(),
  },
  {
    institutionId: 'uis',
    nombre: 'Universidad Industrial de Santander',
    sigla: 'UIS',
    aliases: [],
    activa: true,
    configuracionAcademica: null,
  },
  {
    institutionId: 'udes',
    nombre: 'Universidad de Santander',
    sigla: 'UDES',
    aliases: [],
    activa: true,
    configuracionAcademica: null,
  },
];

export const INSTITUTION_ID_UTS = 'uts';

// ── Coincidencias ───────────────────────────────────────────────────────────

export type TipoCoincidencia = 'exacta' | 'posible';

export type Coincidencia<T> = {
  perfil: T;
  tipo: TipoCoincidencia;
  /** Qué hizo saltar la coincidencia, para poder mostrarlo. */
  motivo: string;
};

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const conjuntoA = new Set(a);
  const conjuntoB = new Set(b);
  let comunes = 0;
  for (const palabra of conjuntoA) if (conjuntoB.has(palabra)) comunes += 1;
  return comunes / (conjuntoA.size + conjuntoB.size - comunes);
}

/** Iniciales de las palabras con contenido: «Unidades Tecnológicas de Santander» → «uts». */
function iniciales(nombre: string): string {
  return normalizarNombre(nombre)
    .split(' ')
    .filter(palabra => palabra.length > 1 && !['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e'].includes(palabra))
    .map(palabra => palabra[0])
    .join('');
}

/**
 * Busca, entre los perfiles existentes, los que podrían ser la misma
 * institución que la candidata.
 *
 * `exacta`: alguna clave de la candidata (nombre, sigla o alias) coincide con
 * una clave de un perfil. Es lo que impide crear «UDES» cuando «Universidad
 * de Santander» ya tiene ese alias.
 *
 * `posible`: las palabras con contenido se parecen mucho, o la sigla de una
 * son las iniciales del nombre de la otra. No bloquea: se muestra a quien
 * crea para que decida.
 *
 * `excluirId` deja fuera al propio perfil cuando se edita.
 */
export function buscarCoincidencias<T extends { institutionId: string; nombre: string; sigla: string; aliases?: readonly string[] | null }>(
  candidata: { nombre: string; sigla?: string; aliases?: readonly string[] | null },
  existentes: readonly T[],
  excluirId?: string,
): Coincidencia<T>[] {
  const clavesCandidata = new Set(
    clavesDePerfil({ nombre: candidata.nombre, sigla: candidata.sigla ?? '', aliases: candidata.aliases }),
  );
  const palabrasCandidata = palabrasClave(candidata.nombre);
  const siglaCandidata = normalizarNombre(candidata.sigla ?? '');
  const inicialesCandidata = iniciales(candidata.nombre);

  const resultado: Coincidencia<T>[] = [];
  for (const perfil of existentes) {
    if (excluirId && perfil.institutionId === excluirId) continue;

    const clavesPerfil = clavesDePerfil(perfil);
    const comun = clavesPerfil.find(clave => clavesCandidata.has(clave));
    if (comun) {
      resultado.push({ perfil, tipo: 'exacta', motivo: `Coincide con «${comun}».` });
      continue;
    }

    const palabrasPerfil = palabrasClave(perfil.nombre);
    const parecido = jaccard(palabrasCandidata, palabrasPerfil);
    if (parecido >= 0.6) {
      resultado.push({ perfil, tipo: 'posible', motivo: 'El nombre se parece mucho.' });
      continue;
    }
    const siglaPerfil = normalizarNombre(perfil.sigla);
    // «Universidad de Santander UDES»: el nombre lleva dentro la sigla de otro perfil.
    if (siglaPerfil && palabrasCandidata.includes(siglaPerfil)) {
      resultado.push({ perfil, tipo: 'posible', motivo: `El nombre contiene la sigla ${perfil.sigla}.` });
      continue;
    }
    if (siglaCandidata && siglaCandidata === iniciales(perfil.nombre)) {
      resultado.push({ perfil, tipo: 'posible', motivo: `La sigla ${candidata.sigla} son las iniciales de «${perfil.nombre}».` });
      continue;
    }
    if (siglaPerfil && siglaPerfil === inicialesCandidata) {
      resultado.push({ perfil, tipo: 'posible', motivo: `Sus iniciales coinciden con la sigla ${perfil.sigla}.` });
    }
  }
  return resultado;
}
