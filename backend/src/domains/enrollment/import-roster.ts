export type FilaListado = {
  indice: number;
  cedula: string;
  nombre: string;
  correo: string;
  programa: string;
  confianza: number;
  avisos: string[];
};

export type ListadoInterpretado = {
  filas: FilaListado[];
  avisos: string[];
};

const ALIAS = {
  cedula: new Set(['cedula', 'documento', 'identificacion', 'codigo', 'codigoestudiante', 'codestudiante', 'idestudiante']),
  nombre: new Set(['nombre', 'nombres', 'nombrecompleto', 'estudiante', 'alumno']),
  correo: new Set(['correo', 'email', 'correoinstitucional']),
  programa: new Set(['programa', 'carrera', 'plan']),
};

function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function limpiarCodigo(valor: string): string {
  return valor.replace(/[\s.]/g, '').trim();
}

/** Interpreta una hoja tabular sin I/O. La cabecera admite nombres institucionales equivalentes. */
export function interpretarMatrizListado(matriz: string[][]): ListadoInterpretado {
  const noVacias = matriz.filter(fila => fila.some(celda => celda.trim()));
  if (noVacias.length === 0) return { filas: [], avisos: ['El archivo está vacío.'] };

  const cabecera = noVacias[0]!.map(normalizar);
  const indiceDe = (campo: keyof typeof ALIAS) => cabecera.findIndex(valor => ALIAS[campo].has(valor));
  const indices = {
    cedula: indiceDe('cedula'),
    nombre: indiceDe('nombre'),
    correo: indiceDe('correo'),
    programa: indiceDe('programa'),
  };
  const tieneCabecera = indices.cedula >= 0 || indices.nombre >= 0;
  const datos = tieneCabecera ? noVacias.slice(1) : noVacias;
  const vistos = new Set<string>();
  const filas: FilaListado[] = [];
  const avisos: string[] = [];

  datos.forEach((fila, posicion) => {
    const celdas = fila.map(celda => celda.trim());
    const indiceCedula = indices.cedula >= 0
      ? indices.cedula
      : celdas.findIndex(celda => /^\d[\d\s.]{2,}$/.test(celda));
    const cedula = limpiarCodigo(celdas[indiceCedula] ?? '');
    const indiceNombre = indices.nombre >= 0
      ? indices.nombre
      : celdas.findIndex((celda, indice) => indice !== indiceCedula && /\p{L}/u.test(celda) && !celda.includes('@'));
    const nombre = (celdas[indiceNombre] ?? '').replace(/\s+/g, ' ').trim();
    const correo = indices.correo >= 0
      ? celdas[indices.correo] ?? ''
      : celdas.find(celda => celda.includes('@')) ?? '';
    const programa = indices.programa >= 0 ? celdas[indices.programa] ?? '' : '';
    const problemas: string[] = [];

    if (!/^\d{3,20}$/.test(cedula)) problemas.push('Código o documento inválido.');
    if (nombre.length < 3) problemas.push('Falta el nombre completo.');
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) problemas.push('Correo inválido.');
    if (cedula && vistos.has(cedula)) problemas.push('Código repetido en el archivo.');

    if (problemas.length === 0) vistos.add(cedula);
    filas.push({
      indice: posicion + (tieneCabecera ? 2 : 1),
      cedula,
      nombre,
      correo,
      programa,
      confianza: problemas.length === 0 ? 1 : 0.45,
      avisos: problemas,
    });
  });

  if (!tieneCabecera) avisos.push('No se detectó una cabecera; se infirieron código y nombre.');
  if (filas.some(fila => fila.avisos.length > 0)) avisos.push('Revisa las filas marcadas antes de confirmar.');
  return { filas, avisos };
}
