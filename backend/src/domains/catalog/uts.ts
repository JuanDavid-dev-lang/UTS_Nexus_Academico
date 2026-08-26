/**
 * Catálogo académico de las Unidades Tecnológicas de Santander.
 *
 * Sedes, facultades, niveles y programas. Dato puro, sin I/O, para que el
 * backend valide contra él y los clientes construyan sus desplegables desde la
 * misma fuente: si el catálogo vive duplicado en tres sitios, tarde o temprano
 * un programa existe en el móvil y no en el escritorio.
 *
 * Un programa pertenece a UNA facultad y a UN nivel. Eso permite que el
 * formulario de registro se encadene —elijo facultad, veo solo sus programas—
 * y que el servidor rechace combinaciones imposibles, como un docente de
 * Ingeniería Civil adscrito a la facultad de empresariales.
 */

export const SEDES = ['BUCARAMANGA', 'PIEDECUESTA', 'VELEZ', 'BARRANCABERMEJA'] as const;
export type Sede = (typeof SEDES)[number];

export const NOMBRE_SEDE: Record<Sede, string> = {
  BUCARAMANGA: 'Bucaramanga',
  PIEDECUESTA: 'Piedecuesta',
  VELEZ: 'Vélez',
  BARRANCABERMEJA: 'Barrancabermeja',
};

export const FACULTADES = ['SOCIOECONOMICAS', 'NATURALES_INGENIERIAS'] as const;
export type Facultad = (typeof FACULTADES)[number];

export const NOMBRE_FACULTAD: Record<Facultad, string> = {
  SOCIOECONOMICAS: 'Facultad de Ciencias Socioeconómicas y Empresariales',
  NATURALES_INGENIERIAS: 'Facultad de Ciencias Naturales e Ingenierías',
};

/** Un docente puede dictar en uno de los dos niveles o en ambos. */
export const NIVELES = ['TECNOLOGICO', 'PROFESIONAL'] as const;
export type Nivel = (typeof NIVELES)[number];

export const NOMBRE_NIVEL: Record<Nivel, string> = {
  TECNOLOGICO: 'Nivel tecnológico',
  PROFESIONAL: 'Nivel universitario',
};

export type Programa = {
  /** Identificador estable. No cambia aunque se ajuste el nombre visible. */
  id: string;
  nombre: string;
  facultad: Facultad;
  nivel: Nivel;
};

export const PROGRAMAS: readonly Programa[] = [
  // ── Ciencias Socioeconómicas y Empresariales · tecnológico ────────────────
  { id: 'TEC_GESTION_EMPRESARIAL', nombre: 'Tecnología en Gestión Empresarial', facultad: 'SOCIOECONOMICAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_INFORMACION_CONTABLE', nombre: 'Tecnología en Manejo de la Información Contable', facultad: 'SOCIOECONOMICAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_GESTION_ECONOMICA_PROYECTOS', nombre: 'Tecnología en Gestión Económica de Proyectos', facultad: 'SOCIOECONOMICAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_MERCADEO_GESTION_COMERCIAL', nombre: 'Tecnología en Mercadeo y Gestión Comercial', facultad: 'SOCIOECONOMICAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_TURISTICAS_HOTELERAS', nombre: 'Tecnología en Gestión de Empresas Turísticas y Hoteleras', facultad: 'SOCIOECONOMICAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_DISENO_GESTION_MODA', nombre: 'Tecnología en Diseño y Gestión de la Moda', facultad: 'SOCIOECONOMICAS', nivel: 'TECNOLOGICO' },

  // ── Ciencias Socioeconómicas y Empresariales · profesional ────────────────
  { id: 'PRO_ADMINISTRACION_EMPRESAS', nombre: 'Administración de Empresas', facultad: 'SOCIOECONOMICAS', nivel: 'PROFESIONAL' },
  { id: 'PRO_CONTADURIA_PUBLICA', nombre: 'Contaduría Pública', facultad: 'SOCIOECONOMICAS', nivel: 'PROFESIONAL' },
  { id: 'PRO_ECONOMIA', nombre: 'Economía', facultad: 'SOCIOECONOMICAS', nivel: 'PROFESIONAL' },
  { id: 'PRO_MERCADEO', nombre: 'Profesional en Mercadeo', facultad: 'SOCIOECONOMICAS', nivel: 'PROFESIONAL' },
  { id: 'PRO_TURISMO', nombre: 'Profesional en Turismo', facultad: 'SOCIOECONOMICAS', nivel: 'PROFESIONAL' },

  // ── Ciencias Naturales e Ingenierías · tecnológico ────────────────────────
  { id: 'TEC_DESARROLLO_SISTEMAS', nombre: 'Tecnología en Desarrollo de Sistemas Informáticos', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_PRODUCCION_INDUSTRIAL', nombre: 'Tecnología en Gestión de la Producción Industrial', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_OBRAS_CIVILES', nombre: 'Tecnología en Construcción de Obras Civiles', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_RECURSOS_AMBIENTALES', nombre: 'Tecnología en Manejo de Recursos Ambientales', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_LEVANTAMIENTOS_TOPOGRAFICOS', nombre: 'Tecnología en Levantamientos Topográficos', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_MANTENIMIENTO_ELECTROMECANICO', nombre: 'Tecnología en Mantenimiento Electromecánico', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_SISTEMAS_ELECTRICOS', nombre: 'Tecnología en Gestión de Sistemas Eléctricos', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_REDES_TELECOMUNICACIONES', nombre: 'Tecnología en Gestión de Redes de Telecomunicaciones', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_SISTEMAS_TRANSPORTE', nombre: 'Tecnología en Operación de Sistemas de Transporte', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_AGROFORESTAL', nombre: 'Tecnología en Gestión Agroforestal', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },
  { id: 'TEC_DEPORTIVA', nombre: 'Tecnología Deportiva', facultad: 'NATURALES_INGENIERIAS', nivel: 'TECNOLOGICO' },

  // ── Ciencias Naturales e Ingenierías · profesional ────────────────────────
  { id: 'ING_SISTEMAS', nombre: 'Ingeniería de Sistemas', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_INDUSTRIAL', nombre: 'Ingeniería Industrial', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_CIVIL', nombre: 'Ingeniería Civil', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_AMBIENTAL', nombre: 'Ingeniería Ambiental', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_TOPOGRAFIA', nombre: 'Ingeniería en Topografía', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_ELECTROMECANICA', nombre: 'Ingeniería Electromecánica', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_ELECTRICA', nombre: 'Ingeniería Eléctrica', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_TELECOMUNICACIONES', nombre: 'Ingeniería de Telecomunicaciones', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_SISTEMAS_TRANSPORTE', nombre: 'Ingeniería en Sistemas de Transporte', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
  { id: 'ING_AGROFORESTAL', nombre: 'Ingeniería Agroforestal', facultad: 'NATURALES_INGENIERIAS', nivel: 'PROFESIONAL' },
];

/**
 * Áreas académicas: la carrera completa, no cada título por separado.
 *
 * En las UTS una carrera es una **cadena propedéutica**: se entra al ciclo
 * tecnológico y se continúa al profesional sobre la misma línea —Tecnología en
 * Desarrollo de Sistemas Informáticos e Ingeniería de Sistemas son dos títulos
 * de una sola carrera, con los mismos estudiantes avanzando de uno al otro—.
 *
 * Quien coordina, coordina la cadena entera. Pedirle que marque los dos
 * programas por separado invita al error que peor se detecta: marcar solo el
 * tecnológico y no enterarse nunca de que la mitad profesional de su propia
 * carrera no aparece en sus listados, porque una lista incompleta no se
 * distingue de una lista corta.
 *
 * El alcance sigue guardándose como **ids de programa**, no de área: el área es
 * cómo se elige, no cómo se guarda. Así el motor de alcance no cambia y una
 * adscripción a medias —heredada, o hecha a propósito— sigue siendo posible.
 *
 * Dos áreas no comparten programa y **ningún programa se queda fuera**; hay una
 * prueba que lo afirma, porque un programa huérfano no daría error: sería una
 * carrera que nadie puede coordinar.
 */
export type Area = {
  /** Identificador estable. No se guarda en la base; se expande a programas. */
  id: string;
  nombre: string;
  facultad: Facultad;
  /** Programas de la cadena, del ciclo tecnológico al profesional. */
  programas: string[];
};

export const AREAS: readonly Area[] = [
  // ── Ciencias Naturales e Ingenierías ──────────────────────────────────────
  {
    id: 'AREA_SISTEMAS',
    nombre: 'Sistemas e informática',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_DESARROLLO_SISTEMAS', 'ING_SISTEMAS'],
  },
  {
    id: 'AREA_INDUSTRIAL',
    nombre: 'Producción industrial',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_PRODUCCION_INDUSTRIAL', 'ING_INDUSTRIAL'],
  },
  {
    id: 'AREA_CIVIL',
    nombre: 'Obras civiles',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_OBRAS_CIVILES', 'ING_CIVIL'],
  },
  {
    id: 'AREA_AMBIENTAL',
    nombre: 'Recursos ambientales',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_RECURSOS_AMBIENTALES', 'ING_AMBIENTAL'],
  },
  {
    id: 'AREA_TOPOGRAFIA',
    nombre: 'Topografía',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_LEVANTAMIENTOS_TOPOGRAFICOS', 'ING_TOPOGRAFIA'],
  },
  {
    id: 'AREA_ELECTROMECANICA',
    nombre: 'Electromecánica',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_MANTENIMIENTO_ELECTROMECANICO', 'ING_ELECTROMECANICA'],
  },
  {
    id: 'AREA_ELECTRICA',
    nombre: 'Sistemas eléctricos',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_SISTEMAS_ELECTRICOS', 'ING_ELECTRICA'],
  },
  {
    id: 'AREA_TELECOMUNICACIONES',
    nombre: 'Telecomunicaciones',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_REDES_TELECOMUNICACIONES', 'ING_TELECOMUNICACIONES'],
  },
  {
    id: 'AREA_TRANSPORTE',
    nombre: 'Sistemas de transporte',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_SISTEMAS_TRANSPORTE', 'ING_SISTEMAS_TRANSPORTE'],
  },
  {
    id: 'AREA_AGROFORESTAL',
    nombre: 'Agroforestal',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_AGROFORESTAL', 'ING_AGROFORESTAL'],
  },
  {
    // Sin continuidad profesional hoy. Se declara igual: un área de un solo
    // programa es una carrera que existe, no un dato incompleto.
    id: 'AREA_DEPORTIVA',
    nombre: 'Deportiva',
    facultad: 'NATURALES_INGENIERIAS',
    programas: ['TEC_DEPORTIVA'],
  },

  // ── Ciencias Socioeconómicas y Empresariales ──────────────────────────────
  {
    id: 'AREA_EMPRESARIAL',
    nombre: 'Gestión empresarial y administración',
    facultad: 'SOCIOECONOMICAS',
    programas: ['TEC_GESTION_EMPRESARIAL', 'PRO_ADMINISTRACION_EMPRESAS'],
  },
  {
    id: 'AREA_CONTABLE',
    nombre: 'Contable y financiera',
    facultad: 'SOCIOECONOMICAS',
    programas: ['TEC_INFORMACION_CONTABLE', 'PRO_CONTADURIA_PUBLICA'],
  },
  {
    id: 'AREA_ECONOMIA',
    nombre: 'Económica y de proyectos',
    facultad: 'SOCIOECONOMICAS',
    programas: ['TEC_GESTION_ECONOMICA_PROYECTOS', 'PRO_ECONOMIA'],
  },
  {
    id: 'AREA_MERCADEO',
    nombre: 'Mercadeo',
    facultad: 'SOCIOECONOMICAS',
    programas: ['TEC_MERCADEO_GESTION_COMERCIAL', 'PRO_MERCADEO'],
  },
  {
    id: 'AREA_TURISMO',
    nombre: 'Turismo y hotelería',
    facultad: 'SOCIOECONOMICAS',
    programas: ['TEC_TURISTICAS_HOTELERAS', 'PRO_TURISMO'],
  },
  {
    id: 'AREA_MODA',
    nombre: 'Diseño y gestión de la moda',
    facultad: 'SOCIOECONOMICAS',
    programas: ['TEC_DISENO_GESTION_MODA'],
  },
];

const AREAS_POR_ID = new Map(AREAS.map(a => [a.id, a]));

const AREA_DE_PROGRAMA = new Map<string, Area>(
  AREAS.flatMap(area => area.programas.map(programa => [programa, area] as const)),
);

export function buscarArea(id: string): Area | undefined {
  return AREAS_POR_ID.get(id);
}

/** El área a la que pertenece un programa. */
export function areaDePrograma(programaId: string): Area | undefined {
  return AREA_DE_PROGRAMA.get(programaId);
}

/**
 * Expande áreas a los ids de programa que se guardan.
 *
 * Ignora en silencio un área desconocida y **no** falla: quien valida lo que
 * entra es la ruta, que puede decir cuál es el id malo. Aquí, tirar una
 * excepción convertiría un id viejo en una pantalla rota.
 */
export function programasDeAreas(areas: string[]): string[] {
  const ids = new Set<string>();
  for (const id of areas) {
    for (const programa of buscarArea(id)?.programas ?? []) ids.add(programa);
  }
  return [...ids];
}

/**
 * Agrupa una selección de programas por área, diciendo si está completa.
 *
 * Es lo que necesita una pantalla para dibujar la casilla de un área: marcada,
 * a medias o vacía. Sin el `completa`, marcar solo el tecnológico se vería
 * igual que marcar la carrera entera.
 */
export function areasDeProgramas(
  programas: string[],
): { area: Area; elegidos: string[]; completa: boolean }[] {
  const elegidos = new Set(programas);
  return AREAS.map(area => {
    const dentro = area.programas.filter(programa => elegidos.has(programa));
    return { area, elegidos: dentro, completa: dentro.length === area.programas.length };
  }).filter(entrada => entrada.elegidos.length > 0);
}

const PROGRAMAS_POR_ID = new Map(PROGRAMAS.map(p => [p.id, p]));

export function buscarPrograma(id: string): Programa | undefined {
  return PROGRAMAS_POR_ID.get(id);
}

/** Programas de una facultad, opcionalmente acotados a un nivel. */
export function programasDe(facultad: Facultad, nivel?: Nivel): Programa[] {
  return PROGRAMAS.filter(p => p.facultad === facultad && (!nivel || p.nivel === nivel));
}

export type ErrorCatalogo = { campo: string; mensaje: string };

/**
 * Comprueba que la combinación facultad / niveles / programas sea posible.
 *
 * No basta con que cada valor exista por separado: hay que verificar que los
 * programas elegidos pertenezcan a la facultad declarada y a alguno de los
 * niveles marcados. Sin esto se podría registrar un docente de la facultad de
 * empresariales dictando Ingeniería Civil, y ese dato acabaría en los reportes
 * institucionales sin que nadie lo hubiera revisado.
 */
export function validarAdscripcion(input: {
  facultad: string;
  niveles: string[];
  programas: string[];
}): ErrorCatalogo[] {
  const errores: ErrorCatalogo[] = [];

  if (!FACULTADES.includes(input.facultad as Facultad)) {
    errores.push({ campo: 'facultad', mensaje: 'Facultad desconocida.' });
    return errores;
  }

  if (input.niveles.length === 0) {
    errores.push({ campo: 'niveles', mensaje: 'Indica al menos un nivel.' });
  }
  for (const nivel of input.niveles) {
    if (!NIVELES.includes(nivel as Nivel)) {
      errores.push({ campo: 'niveles', mensaje: `Nivel desconocido: ${nivel}.` });
    }
  }

  if (input.programas.length === 0) {
    errores.push({ campo: 'programas', mensaje: 'Indica al menos un programa.' });
  }

  for (const id of input.programas) {
    const programa = buscarPrograma(id);
    if (!programa) {
      errores.push({ campo: 'programas', mensaje: `Programa desconocido: ${id}.` });
      continue;
    }
    if (programa.facultad !== input.facultad) {
      errores.push({
        campo: 'programas',
        mensaje: `${programa.nombre} no pertenece a la facultad indicada.`,
      });
    }
    if (!input.niveles.includes(programa.nivel)) {
      errores.push({
        campo: 'programas',
        mensaje: `${programa.nombre} es de ${NOMBRE_NIVEL[programa.nivel].toLowerCase()}, que no marcaste.`,
      });
    }
  }

  return errores;
}
