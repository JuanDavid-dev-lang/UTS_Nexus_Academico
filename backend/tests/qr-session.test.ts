import { describe, expect, it } from 'vitest';
import {
  componerQr,
  confirmacionValida,
  enmascararDocumento,
  evaluarLote,
  esReintentoValido,
  agotoIntentos,
  evaluarMarca,
  firmaValida,
  MAX_INTENTOS,
  finDeVentana,
  leerQr,
  limpiarVisible,
  SEGUNDOS_POR_VENTANA,
  ventanaDe,
  type ContextoSesion,
  type MarcaEntrante,
} from '../src/domains/attendance/qr-session.js';

/**
 * Asistencia por QR: lo que decide si una marca de UniPlanner vale.
 *
 * Todo lo que se prueba aquí falla en silencio si se rompe: una marca falsa
 * aceptada es un 200 y una asistencia que nadie observó, y una buena rechazada
 * es una falta que el estudiante descubre semanas después.
 */
const SESION = 'a'.repeat(24);
const SECRETO = 'secreto-de-prueba';
const ABIERTA = new Date('2026-09-13T15:00:00.000Z');
const CIERRA = new Date('2026-09-13T15:15:00.000Z');

function qrEn(instante: Date, datos: Partial<{ sesionId: string; secreto: string }> = {}) {
  return componerQr(
    {
      sesionId: datos.sesionId ?? SESION,
      ventana: ventanaDe(instante),
      materia: 'MAT101',
      grupo: 'A194',
      hora: '10:00',
    },
    datos.secreto ?? SECRETO,
  );
}

function contexto(parcial: Partial<ContextoSesion> = {}): ContextoSesion {
  return {
    sesionId: SESION,
    secreto: SECRETO,
    abiertaEn: ABIERTA,
    cierraEn: CIERRA,
    estudiantesPorUid: new Map([
      ['uid-ana', ['est-ana']],
      ['uid-beto', ['est-beto']],
    ]),
    aceptadas: new Set(),
    dispositivos: new Map(),
    yaPresentes: new Set(),
    ...parcial,
  };
}

function marca(parcial: Partial<MarcaEntrante> = {}): MarcaEntrante {
  const creadaEn = parcial.creadaEn ?? new Date('2026-09-13T15:05:00.000Z');
  return { uid: 'uid-ana', qr: qrEn(creadaEn), deviceId: 'tel-ana', creadaEn, ...parcial };
}

describe('formato del QR', () => {
  it('se lee de vuelta con los mismos datos', () => {
    const texto = qrEn(ABIERTA);
    const leido = leerQr(texto);
    expect(leido).toMatchObject({
      sesionId: SESION,
      ventana: ventanaDe(ABIERTA),
      materia: 'MAT101',
      grupo: 'A194',
      hora: '10:00',
    });
    expect(leido && firmaValida(leido, SECRETO)).toBe(true);
  });

  it('cabe en un QR que se lee desde el fondo del salón', () => {
    // ~80 caracteres es un QR de versión 5-6: módulos grandes en un proyector.
    expect(qrEn(ABIERTA).length).toBeLessThanOrEqual(100);
  });

  it('cambiar un dato visible invalida la firma', () => {
    const [cuerpo, firma] = [qrEn(ABIERTA).split('|').slice(0, 6), qrEn(ABIERTA).split('|')[6]];
    cuerpo[4] = 'B201';
    const alterado = leerQr([...cuerpo, firma].join('|'));
    expect(alterado).not.toBeNull();
    expect(firmaValida(alterado!, SECRETO)).toBe(false);
  });

  it('un QR compuesto con otro secreto no pasa', () => {
    const falso = leerQr(qrEn(ABIERTA, { secreto: 'adivinado' }));
    expect(falso && firmaValida(falso, SECRETO)).toBe(false);
  });

  it('rechaza lo que no es de este formato', () => {
    for (const malo of ['', 'https://ejemplo.com', `UNX2|${SESION}|1|a|b|c|${'x'.repeat(22)}`, null, 7]) {
      expect(leerQr(malo), String(malo)).toBeNull();
    }
  });

  it('un separador dentro de un dato no parte el QR en campos de más', () => {
    expect(limpiarVisible('A|194')).toBe('A 194');
    // Solo ASCII: sin declarar la codificación, un lector puede leer mal una tilde.
    expect(limpiarVisible('Grupo Ñ — Cálculo')).toBe('Grupo N Calculo');
    const texto = componerQr(
      { sesionId: SESION, ventana: 1, materia: 'MAT|101', grupo: 'A|1', hora: '10:00' },
      SECRETO,
    );
    expect(leerQr(texto)).not.toBeNull();
  });

  it('cambia cada ventana y cada ventana dura lo declarado', () => {
    const v = ventanaDe(ABIERTA);
    expect(finDeVentana(v).getTime() - finDeVentana(v - 1).getTime()).toBe(SEGUNDOS_POR_VENTANA * 1000);
    const despues = new Date(ABIERTA.getTime() + SEGUNDOS_POR_VENTANA * 1000);
    expect(qrEn(despues)).not.toBe(qrEn(ABIERTA));
  });
});

describe('contrato con UniPlanner', () => {
  it('el QR de referencia sale exactamente así', () => {
    // UniPlanner lee este mismo texto en
    // `test/institucional/attendance_checkin_test.dart`. Si el formato cambia
    // aquí y no allí, la app descarta el QR como «no es de asistencia» y nadie
    // puede marcar — sin ningún error en este lado. La duplicación es a
    // propósito, como la del id de enlace.
    expect(
      componerQr(
        { sesionId: '6aa70641ebbcc95ee9cad168', ventana: 119288733, materia: 'MAT101', grupo: 'A194', hora: '15:23' },
        'secreto-de-contrato',
      ),
    ).toBe('UNX1|6aa70641ebbcc95ee9cad168|119288733|MAT101|A194|15:23|Lk1WvrBv7uvYcNGtrqHWGQ');
  });
});

describe('evaluar una marca', () => {
  it('acepta el QR vigente de un estudiante matriculado', () => {
    expect(evaluarMarca(marca(), contexto())).toEqual({
      aceptada: true,
      studentId: 'est-ana',
      yaRegistrada: false,
    });
  });

  it('acepta el QR de la ventana anterior: quien escaneó en el último segundo', () => {
    const creadaEn = new Date('2026-09-13T15:05:00.000Z');
    const anterior = new Date(creadaEn.getTime() - SEGUNDOS_POR_VENTANA * 1000);
    expect(evaluarMarca(marca({ creadaEn, qr: qrEn(anterior) }), contexto()).aceptada).toBe(true);
  });

  it('rechaza una foto del QR usada más tarde', () => {
    const creadaEn = new Date('2026-09-13T15:05:00.000Z');
    const vieja = new Date(creadaEn.getTime() - 3 * SEGUNDOS_POR_VENTANA * 1000);
    expect(evaluarMarca(marca({ creadaEn, qr: qrEn(vieja) }), contexto())).toMatchObject({
      aceptada: false,
      motivo: 'QR_VENCIDO',
    });
  });

  it('rechaza una marca fuera del horario de la sesión', () => {
    const tarde = new Date(CIERRA.getTime() + 1000);
    expect(evaluarMarca(marca({ creadaEn: tarde, qr: qrEn(tarde) }), contexto())).toMatchObject({
      motivo: 'SESION_CERRADA',
    });
  });

  it('rechaza el QR de otra clase aunque la firma sea buena', () => {
    const otra = 'b'.repeat(24);
    const m = marca();
    expect(evaluarMarca({ ...m, qr: qrEn(m.creadaEn, { sesionId: otra }) }, contexto())).toMatchObject({
      motivo: 'QR_DE_OTRA_CLASE',
    });
  });

  it('un QR falso se rechaza como falso aunque la cuenta no sea de nadie del grupo', () => {
    const m = marca({ uid: 'uid-desconocido' });
    expect(
      evaluarMarca({ ...m, qr: qrEn(m.creadaEn, { secreto: 'otro' }) }, contexto()),
    ).toMatchObject({ motivo: 'QR_INVALIDO' });
  });

  it('rechaza una cuenta que no es de ningún matriculado', () => {
    expect(evaluarMarca(marca({ uid: 'uid-intruso' }), contexto())).toMatchObject({
      motivo: 'NO_MATRICULADO',
      studentId: null,
    });
  });

  it('una cuenta enlazada a dos estudiantes del grupo no marca por ninguno', () => {
    const ctx = contexto({ estudiantesPorUid: new Map([['uid-ana', ['est-ana', 'est-amigo']]]) });
    expect(evaluarMarca(marca(), ctx)).toMatchObject({ motivo: 'CUENTA_CON_VARIOS_ENLACES' });
  });

  it('un teléfono no marca por dos cuentas', () => {
    const ctx = contexto({ dispositivos: new Map([['tel-ana', 'uid-ana']]) });
    expect(evaluarMarca(marca({ uid: 'uid-beto' }), ctx)).toMatchObject({
      motivo: 'DISPOSITIVO_REPETIDO',
      studentId: 'est-beto',
    });
  });

  it('quien ya tenía asistencia hoy queda como «ya registrada», sin escribir nada', () => {
    // Otra lista de la misma materia ese día, o la marca a mano del docente.
    const decision = evaluarMarca(marca(), contexto({ yaPresentes: new Set(['est-ana']) }));
    expect(decision).toEqual({ aceptada: true, studentId: 'est-ana', yaRegistrada: true });
  });

  it('«ya registrada» no pasa por encima de un QR vencido', () => {
    const creadaEn = new Date('2026-09-13T15:05:00.000Z');
    const vieja = new Date(creadaEn.getTime() - 3 * SEGUNDOS_POR_VENTANA * 1000);
    const ctx = contexto({ yaPresentes: new Set(['est-ana']) });
    expect(evaluarMarca(marca({ creadaEn, qr: qrEn(vieja) }), ctx)).toMatchObject({ motivo: 'QR_VENCIDO' });
  });

  it('sin identificador de teléfono no se aplica esa comprobación', () => {
    const ctx = contexto({ dispositivos: new Map([['', 'uid-ana']]) });
    expect(evaluarMarca(marca({ uid: 'uid-beto', deviceId: '' }), ctx).aceptada).toBe(true);
  });
});

describe('vínculo del semestre', () => {
  // Borrar el perfil en UniPlanner y volver a crearlo deja una cuenta libre de
  // enlazarse al código de un compañero, aunque el enlace estuviera fijo. El
  // vínculo lo guarda Nexus, así que eso no sirve para marcar por otro.
  const vinculos = (porUid: [string, string][], porEstudiante: [string, string][]) => ({
    porUid: new Map(porUid),
    porEstudiante: new Map(porEstudiante),
  });

  it('la cuenta que marcó por Ana no marca por Beto aunque ahora esté enlazada a él', () => {
    const ctx = contexto({
      estudiantesPorUid: new Map([['uid-ana', ['est-beto']]]),
      vinculos: vinculos([['uid-ana', 'est-ana']], [['est-ana', 'uid-ana']]),
    });
    expect(evaluarMarca(marca(), ctx)).toMatchObject({ motivo: 'CUENTA_CAMBIADA', studentId: 'est-beto' });
  });

  it('el estudiante que marca desde una cuenta no marca desde otra', () => {
    const ctx = contexto({
      estudiantesPorUid: new Map([['uid-nueva', ['est-ana']]]),
      vinculos: vinculos([['uid-ana', 'est-ana']], [['est-ana', 'uid-ana']]),
    });
    expect(evaluarMarca(marca({ uid: 'uid-nueva' }), ctx)).toMatchObject({ motivo: 'CUENTA_CAMBIADA' });
  });

  it('no confirma «ya registrada» sobre la asistencia de otra persona', () => {
    const ctx = contexto({
      estudiantesPorUid: new Map([['uid-ana', ['est-beto']]]),
      yaPresentes: new Set(['est-beto']),
      vinculos: vinculos([['uid-ana', 'est-ana']], [['est-ana', 'uid-ana']]),
    });
    expect(evaluarMarca(marca(), ctx)).toMatchObject({ motivo: 'CUENTA_CAMBIADA' });
  });

  it('la misma cuenta por el mismo estudiante pasa, y sin vínculo previo también', () => {
    const ctx = contexto({ vinculos: vinculos([['uid-ana', 'est-ana']], [['est-ana', 'uid-ana']]) });
    expect(evaluarMarca(marca(), ctx).aceptada).toBe(true);
    expect(evaluarMarca(marca({ uid: 'uid-beto' }), ctx).aceptada).toBe(true);
  });
});

describe('evaluar una tanda', () => {
  it('dos cuentas desde el mismo teléfono en la misma lectura: pasa solo la primera', () => {
    const t = new Date('2026-09-13T15:05:00.000Z');
    const t2 = new Date(t.getTime() + 2000);
    const resultado = evaluarLote(
      [
        marca({ uid: 'uid-beto', deviceId: 'tel-compartido', creadaEn: t2, qr: qrEn(t2) }),
        marca({ uid: 'uid-ana', deviceId: 'tel-compartido', creadaEn: t, qr: qrEn(t) }),
      ],
      contexto(),
    );
    expect(resultado.map((r) => [r.marca.uid, r.decision.aceptada])).toEqual([
      ['uid-ana', true],
      ['uid-beto', false],
    ]);
  });
});

describe('confirmar', () => {
  it('vale mientras la lista siga abierta, aunque el QR ya haya cambiado', () => {
    // La vigencia del QR se midió al escanear; leer la pantalla con calma no
    // lo hace vencer.
    const mucho = new Date(ABIERTA.getTime() + 10 * 60_000);
    expect(confirmacionValida(mucho, { abiertaEn: ABIERTA, cierraEn: CIERRA })).toBe(true);
  });

  it('después del cierre ya no', () => {
    const tarde = new Date(CIERRA.getTime() + 1000);
    expect(confirmacionValida(tarde, { abiertaEn: ABIERTA, cierraEn: CIERRA })).toBe(false);
  });
});

describe('documento en la confirmación', () => {
  it('se ven solo los cuatro últimos caracteres', () => {
    expect(enmascararDocumento('1098765432')).toBe('••••••5432');
    expect(enmascararDocumento('1234')).toBe('1234');
  });
});

describe('reintentar tras un rechazo', () => {
  const antes = new Date('2026-09-13T15:05:00.000Z');
  const despues = new Date('2026-09-13T15:05:30.000Z');

  it('un QR vencido por la señal lenta se puede volver a mandar', () => {
    expect(esReintentoValido({ estado: 'RECHAZADA', creadaEn: antes }, { creadaEn: despues })).toBe(true);
  });

  it('una pendiente de confirmar se sustituye: «no es mi clase» y escanear otra', () => {
    expect(esReintentoValido({ estado: 'PENDIENTE', creadaEn: antes }, { creadaEn: despues })).toBe(true);
  });

  it('una marca aceptada no se reevalúa nunca', () => {
    expect(esReintentoValido({ estado: 'ACEPTADA', creadaEn: antes }, { creadaEn: despues })).toBe(false);
  });

  it('solo cuenta un intento posterior al anterior', () => {
    expect(esReintentoValido({ estado: 'RECHAZADA', creadaEn: despues }, { creadaEn: antes })).toBe(false);
  });

  it('con tope: probar QR a ciegas no sale gratis', () => {
    const agotada = { estado: 'RECHAZADA' as const, creadaEn: antes, intentos: MAX_INTENTOS };
    expect(esReintentoValido(agotada, { creadaEn: despues })).toBe(false);
  });

  it('pasado el tope se contesta una vez, no se deja esperando', () => {
    const agotada = { estado: 'RECHAZADA' as const, creadaEn: antes, intentos: MAX_INTENTOS, motivo: 'QR_VENCIDO' };
    expect(agotoIntentos(agotada, { creadaEn: despues })).toBe(true);
    // Ya contestada con ese motivo: no se vuelve a escribir en cada marca.
    expect(agotoIntentos({ ...agotada, motivo: 'DEMASIADOS_INTENTOS' }, { creadaEn: despues })).toBe(false);
    // Dentro del tope es un reintento normal, no esto.
    expect(agotoIntentos({ ...agotada, intentos: 1 }, { creadaEn: despues })).toBe(false);
  });
});
