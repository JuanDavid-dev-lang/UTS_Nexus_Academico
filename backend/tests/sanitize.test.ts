import { describe, expect, it } from 'vitest';
import {
  LIMITES,
  OCULTO,
  calcularDiff,
  esClaveProhibida,
  resumirError,
  sanearParaAuditoria,
  sanearTexto,
  sanearValor,
} from '../src/shared/sanitize.js';

/**
 * Lo que estas pruebas protegen es una regla negativa —«esto NO puede quedar
 * guardado»—, y una regla negativa se rompe sin que nada falle: el registro se
 * escribe, la pantalla lo muestra, y la contraseña queda en la colección
 * esperando a que alguien la lea.
 */

describe('claves prohibidas', () => {
  it('reconoce el mismo campo escrito de cualquier manera', () => {
    for (const clave of ['password', 'passwordHash', 'PASSWORD', 'refresh_token', 'refreshToken', 'REFRESH-TOKEN']) {
      expect(esClaveProhibida(clave)).toBe(true);
    }
  });

  it('cubre lo que de hecho viaja en los cuerpos de este sistema', () => {
    // La contraseña de /auth/register, el código de /recovery/confirm, el
    // token de refresco y la cabecera Authorization de un error del cliente.
    for (const clave of ['recoveryCode', 'devCode', 'authorization', 'FCM_PRIVATE_KEY', 'MONGODB_URI']) {
      expect(esClaveProhibida(clave)).toBe(true);
    }
  });

  it('no oculta campos legítimos', () => {
    for (const clave of ['fullName', 'score', 'period', 'subjectId']) {
      expect(esClaveProhibida(clave)).toBe(false);
    }
  });
});

describe('saneado de texto', () => {
  it('enmascara correos, tokens y cadenas de conexión', () => {
    expect(sanearTexto('escribe a juan@uts.edu.co')).toContain('[correo]');
    expect(sanearTexto('Bearer aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc')).toContain('[token]');
    expect(sanearTexto('mongodb+srv://u:p@cluster0.net/db')).toContain('[conexion]');
  });

  it('enmascara cédulas dentro de un mensaje libre', () => {
    // «Error al guardar 1098765432» es exactamente como se cuelan.
    expect(sanearTexto('Error al guardar 1098765432')).toBe('Error al guardar [id]');
  });

  it('recorta y lo dice', () => {
    const largo = 'a'.repeat(LIMITES.TEXTO + 200);
    const salida = sanearTexto(largo);
    expect(salida.length).toBeLessThan(largo.length);
    expect(salida).toContain('[recortado]');
  });
});

describe('saneado de un objeto', () => {
  it('oculta el valor de una clave prohibida y marca que había algo', () => {
    // Borrarlo en silencio dejaría a quien investiga sin saber que existía.
    const salida = sanearValor({ email: 'a@b.co', password: 'secreta' }) as Record<string, unknown>;
    expect(salida.password).toBe(OCULTO);
  });

  it('llega a las claves anidadas', () => {
    const salida = sanearValor({ usuario: { token: 'abc', nombre: 'Ana' } }) as any;
    expect(salida.usuario.token).toBe(OCULTO);
    expect(salida.usuario.nombre).toBe('Ana');
  });

  it('nunca registra un cuerpo binario', () => {
    expect(sanearValor(Buffer.from('archivo'))).toBe('[binario]');
  });

  it('acota arreglos y dice cuántos faltan', () => {
    const salida = sanearValor(Array.from({ length: LIMITES.ARREGLO + 10 }, (_, i) => i)) as unknown[];
    expect(salida.length).toBe(LIMITES.ARREGLO + 1);
    expect(String(salida[salida.length - 1])).toContain('más');
  });

  it('corta la recursión en vez de desbordar la pila', () => {
    let anidado: Record<string, unknown> = { fin: true };
    for (let i = 0; i < 20; i += 1) anidado = { dentro: anidado };
    expect(() => sanearValor(anidado)).not.toThrow();
  });
});

describe('saneado para auditoría', () => {
  it('resume en vez de guardar un documento enorme', () => {
    // Cien campos cortos pasan cada tope individual y aun así ocupan más de lo
    // que un registro de auditoría debería.
    const gordo: Record<string, string> = {};
    for (let i = 0; i < 200; i += 1) gordo[`campo${i}`] = 'x'.repeat(200);

    const salida = sanearParaAuditoria(gordo) as Record<string, unknown>;
    expect(salida.__resumen).toBeDefined();
    // Quien investigue sigue sabiendo QUÉ cambió, aunque no vea el contenido.
    expect(Array.isArray(salida.__claves)).toBe(true);
  });

  it('deja pasar un documento normal', () => {
    const salida = sanearParaAuditoria({ score: 4.2, label: 'Taller 1' }) as Record<string, unknown>;
    expect(salida.score).toBe(4.2);
  });
});

describe('diff', () => {
  it('registra solo lo que cambió', () => {
    // Guardar el documento entero dos veces por un número que pasó de 3.0 a
    // 3.5 llena la colección de copias casi idénticas.
    const diff = calcularDiff({ score: 3, label: 'Taller' }, { score: 3.5, label: 'Taller' });
    expect(diff).not.toBeNull();
    expect(Object.keys(diff!.after)).toEqual(['score']);
  });

  it('devuelve null cuando no hay cambios: no hay nada que auditar', () => {
    expect(calcularDiff({ a: 1 }, { a: 1 })).toBeNull();
  });

  it('ignora las marcas de tiempo, que cambian en cada escritura', () => {
    expect(calcularDiff({ a: 1, updatedAt: 'x' }, { a: 1, updatedAt: 'y' })).toBeNull();
  });

  it('oculta el valor aunque el campo prohibido sea el que cambió', () => {
    const diff = calcularDiff({ password: 'vieja' }, { password: 'nueva' });
    expect(diff!.before.password).toBe(OCULTO);
    expect(diff!.after.password).toBe(OCULTO);
  });
});

describe('resumen de error', () => {
  it('se queda con la primera línea y la sanea', () => {
    // El centro de salud es la pantalla que apetece pegar en un chat de
    // soporte; el error de Mongoose lleva la URI con usuario y contraseña.
    const error = new Error('fallo con mongodb+srv://u:p@host/db\n  en la línea 4\n  y en la 5');
    const salida = resumirError(error);
    expect(salida).not.toContain('mongodb');
    expect(salida).not.toContain('línea 4');
  });

  it('aguanta cualquier cosa que le pasen', () => {
    expect(resumirError(null)).toBeTypeOf('string');
    expect(resumirError({ raro: true })).toBeTypeOf('string');
  });
});
