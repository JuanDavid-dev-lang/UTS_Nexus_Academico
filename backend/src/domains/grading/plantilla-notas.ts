/**
 * Plantillas de corte: cómo un docente reparte las notas de cada componente.
 *
 * Un docente que siempre pone dos parciales —teórico al 60 % y práctico al
 * 40 %— y tres talleres no debería teclearlo estudiante por estudiante. La
 * plantilla lo dice una vez; al aplicarla a una materia (y a un grupo, si se
 * quiere) queda una **estructura** por corte que la captura usa para proponer
 * las notas que faltan y para poner el peso sin pedirlo.
 *
 * Lo que aquí se decide es puro y con pruebas: qué plantilla es válida, qué
 * peso le toca a una nota y qué notas de la estructura faltan todavía. Los
 * pesos son relativos dentro del componente (ver `pesoDeNota`): 60/40 y 3/2
 * son la misma plantilla.
 */
import { pesoDeNota, type ComponenteTipo, type CorteNumero, type NotaComponente } from './grading.service.js';

export type NotaPlantilla = {
  label: string;
  weight: number;
};

export type ComponentePlantilla = {
  tipo: ComponenteTipo;
  notas: NotaPlantilla[];
};

/** La estructura de un corte: qué notas lleva cada componente y con qué peso. */
export type EstructuraCorte = ComponentePlantilla[];

export const LIMITES_PLANTILLA = {
  /** Notas por componente. Más que esto es una planilla, no una plantilla. */
  NOTAS_POR_COMPONENTE: 20,
  ETIQUETA_MAX: 60,
  PESO_MIN: 0.01,
  PESO_MAX: 1000,
} as const;

export const COMPONENTES: readonly ComponenteTipo[] = ['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION'];

function etiquetaNormalizada(label: string): string {
  return label.trim().toLocaleLowerCase('es');
}

/**
 * Valida una estructura de corte. Devuelve la lista de problemas legibles;
 * vacía si es válida. Un componente puede ir sin notas —el docente lo deja
 * libre— pero no puede repetirse ni tener etiquetas repetidas: la etiqueta es
 * parte de la clave única de Nota, así que dos iguales serían la misma nota.
 */
export function validarEstructura(estructura: EstructuraCorte): string[] {
  const problemas: string[] = [];
  const vistos = new Set<ComponenteTipo>();

  for (const componente of estructura) {
    if (!COMPONENTES.includes(componente.tipo)) {
      problemas.push(`Componente desconocido: ${String(componente.tipo)}.`);
      continue;
    }
    if (vistos.has(componente.tipo)) {
      problemas.push(`El componente ${componente.tipo} aparece dos veces.`);
      continue;
    }
    vistos.add(componente.tipo);

    if (componente.notas.length > LIMITES_PLANTILLA.NOTAS_POR_COMPONENTE) {
      problemas.push(
        `${componente.tipo}: máximo ${LIMITES_PLANTILLA.NOTAS_POR_COMPONENTE} notas por componente.`
      );
    }

    const etiquetas = new Set<string>();
    for (const nota of componente.notas) {
      const etiqueta = nota.label.trim();
      if (!etiqueta) {
        problemas.push(`${componente.tipo}: hay una nota sin nombre.`);
        continue;
      }
      if (etiqueta.length > LIMITES_PLANTILLA.ETIQUETA_MAX) {
        problemas.push(`${componente.tipo}: «${etiqueta.slice(0, 20)}…» es demasiado largo.`);
      }
      const clave = etiquetaNormalizada(etiqueta);
      if (etiquetas.has(clave)) {
        problemas.push(`${componente.tipo}: «${etiqueta}» está repetida.`);
      }
      etiquetas.add(clave);
      if (
        !Number.isFinite(nota.weight) ||
        nota.weight < LIMITES_PLANTILLA.PESO_MIN ||
        nota.weight > LIMITES_PLANTILLA.PESO_MAX
      ) {
        problemas.push(`${componente.tipo}: el peso de «${etiqueta}» debe estar entre 0.01 y 1000.`);
      }
    }
  }

  return problemas;
}

/** Deja la estructura con etiquetas recortadas y en el orden canónico de componentes. */
export function normalizarEstructura(estructura: EstructuraCorte): EstructuraCorte {
  return COMPONENTES.map(tipo => {
    const componente = estructura.find(c => c.tipo === tipo);
    return {
      tipo,
      notas: (componente?.notas ?? []).map(n => ({ label: n.label.trim(), weight: n.weight })),
    };
  });
}

/**
 * Peso que le corresponde a una nota según la estructura, o null si la
 * estructura no la nombra. La comparación de etiqueta no distingue mayúsculas:
 * «Parcial teórico» y «parcial teórico» son la misma casilla de la plantilla,
 * pero la nota se guarda con la etiqueta tal como la escribió el docente.
 */
export function pesoSegunEstructura(
  estructura: EstructuraCorte | null | undefined,
  tipo: ComponenteTipo,
  label: string
): number | null {
  if (!estructura) return null;
  const componente = estructura.find(c => c.tipo === tipo);
  if (!componente) return null;
  const clave = etiquetaNormalizada(label);
  const nota = componente.notas.find(n => etiquetaNormalizada(n.label) === clave);
  return nota ? nota.weight : null;
}

/**
 * Notas de la estructura que un estudiante todavía no tiene en ese corte, por
 * componente. Es lo que la captura ofrece como «siguiente»: la plantilla dice
 * qué falta, no obliga a nada —una nota fuera de la plantilla sigue valiendo—.
 */
export function notasPendientes(
  estructura: EstructuraCorte,
  corte: CorteNumero,
  notas: NotaComponente[]
): Record<ComponenteTipo, NotaPlantilla[]> {
  const delCorte = notas.filter(n => n.corte === corte);
  const resultado = {} as Record<ComponenteTipo, NotaPlantilla[]>;
  for (const tipo of COMPONENTES) {
    const componente = estructura.find(c => c.tipo === tipo);
    const existentes = new Set(
      delCorte.filter(n => n.tipo === tipo).map(n => etiquetaNormalizada(n.label ?? ''))
    );
    resultado[tipo] = (componente?.notas ?? []).filter(
      n => !existentes.has(etiquetaNormalizada(n.label))
    );
  }
  return resultado;
}

/**
 * Peso final con el que se guarda una nota: el que mandó el cliente si lo
 * mandó, el de la estructura si la etiqueta está en ella, y 1 en otro caso.
 * El orden importa: el docente que escribe un peso a mano sabe algo que la
 * plantilla no —esta vez el quiz pesó el doble—, y la plantilla no debería
 * corregirle.
 */
export function resolverPeso(
  explicito: number | undefined,
  estructura: EstructuraCorte | null | undefined,
  tipo: ComponenteTipo,
  label: string
): number {
  if (explicito !== undefined) return pesoDeNota({ weight: explicito });
  return pesoSegunEstructura(estructura, tipo, label) ?? 1;
}
