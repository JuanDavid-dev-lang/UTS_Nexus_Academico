/**
 * Fechas de un aviso en el formulario de la administración. Lógica pura.
 *
 * Un aviso se publica ahora o se programa para una fecha, y puede caducar. El
 * servidor guarda instantes; el formulario trabaja con `<input
 * type="datetime-local">`, que no lleva zona: se interpreta en la hora del
 * equipo de quien escribe, que es la que tiene delante al elegirla.
 *
 * Que un aviso guardado esté programado o caducado **no** se decide aquí: lo
 * dice el servidor en `estado`. Aquí solo se valida lo que se va a enviar.
 */

export type ModoPublicacion = 'ahora' | 'programar';

export type FormularioFechas = {
  modo: ModoPublicacion;
  /** `AAAA-MM-DDTHH:mm` local, solo con `modo: 'programar'`. */
  publicarEn: string;
  /** `AAAA-MM-DDTHH:mm` local, o vacío si no caduca. */
  caducaEn: string;
};

export type FechasDeAviso =
  | { ok: true; publicadoEn: string | undefined; expiraEn: string | null }
  | { ok: false; error: string };

/** Valor para un `<input type="datetime-local">` a partir de un instante ISO. */
export function aInputLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return '';
  const desfase = instante.getTimezoneOffset() * 60_000;
  return new Date(instante.getTime() - desfase).toISOString().slice(0, 16);
}

function desdeInputLocal(valor: string): Date | null {
  if (!valor) return null;
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

/**
 * Lo que se envía al servidor, o por qué todavía no se puede.
 *
 * Con «Publicar ahora» no se manda `publicadoEn` y el servidor pone su hora;
 * la caducidad se compara entonces con `ahora`. Una fecha programada en el
 * pasado se rechaza aquí: el servidor la aceptaría y publicaría al instante,
 * que no es lo que quiso quien eligió «Programar».
 */
export function fechasDeAviso(formulario: FormularioFechas, ahora: Date): FechasDeAviso {
  let publicacion = ahora;
  let publicadoEn: string | undefined;

  if (formulario.modo === 'programar') {
    const elegida = desdeInputLocal(formulario.publicarEn);
    if (!elegida) return { ok: false, error: 'Elige la fecha y la hora de publicación.' };
    if (elegida.getTime() <= ahora.getTime()) {
      return { ok: false, error: 'La fecha de publicación ya pasó: elige una futura o publica ahora.' };
    }
    publicacion = elegida;
    publicadoEn = elegida.toISOString();
  }

  if (!formulario.caducaEn) return { ok: true, publicadoEn, expiraEn: null };
  const caduca = desdeInputLocal(formulario.caducaEn);
  if (!caduca) return { ok: false, error: 'La fecha de caducidad no es válida.' };
  if (caduca.getTime() <= publicacion.getTime()) {
    return { ok: false, error: 'La caducidad tiene que ser posterior a la publicación.' };
  }
  return { ok: true, publicadoEn, expiraEn: caduca.toISOString() };
}
