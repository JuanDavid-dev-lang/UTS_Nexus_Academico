/**
 * Formato de instalación y almacén de credenciales.
 *
 * Lo que se fija aquí son dos avisos que, si se rompen, no rompen nada visible:
 * la pantalla sigue pintando, el botón sigue funcionando, y lo único que cambia
 * es que la aplicación cuenta algo que no es verdad.
 *
 * El primero es el diálogo de administrador de Linux. Instalar una actualización
 * sobre un `.deb` o un `.rpm` escribe en `/usr`, así que el sistema pide la
 * contraseña. Sin el aviso previo, ese diálogo aparece sin explicación y se
 * cancela — y quien lo cancela se queda sin actualizar creyendo que la
 * actualización está rota.
 *
 * El segundo es la tarjeta de Seguridad, que existe para explicar cómo se
 * protegen las credenciales. Es el peor sitio posible donde afirmar algo que no
 * se ha comprobado.
 */
import { describe, expect, it } from 'vitest';
import {
  avisoDeInstalacion,
  etiquetaDeFormato,
  explicarAlmacen,
  normalizarFormato,
  pideAdministrador,
  type FormatoDePaquete,
} from '@/core/platform/paquete';

describe('normalizarFormato', () => {
  it('acepta los formatos que el actualizador distingue', () => {
    for (const formato of ['appimage', 'deb', 'rpm', 'nsis', 'msi', 'app'] as const) {
      expect(normalizarFormato(formato)).toBe(formato);
    }
  });

  it('normaliza mayúsculas y espacios, porque el valor viene de formatear un enum de Rust', () => {
    expect(normalizarFormato(' AppImage ')).toBe('appimage');
    expect(normalizarFormato('DEB')).toBe('deb');
  });

  /**
   * Un nombre que no conocemos —una versión futura de Tauri, un formato nuevo—
   * cae a `desconocido` en vez de colarse como formato válido. No saber el
   * formato cuesta un aviso más flojo; dar por bueno uno inventado costaría un
   * aviso equivocado, que es peor que ninguno.
   */
  it('trata lo desconocido como desconocido, sin romper', () => {
    expect(normalizarFormato('flatpak')).toBe('desconocido');
    expect(normalizarFormato('')).toBe('desconocido');
    expect(normalizarFormato(null)).toBe('desconocido');
    expect(normalizarFormato(undefined)).toBe('desconocido');
  });
});

describe('pideAdministrador', () => {
  it('solo .deb y .rpm: son los que escriben en /usr', () => {
    expect(pideAdministrador('deb')).toBe(true);
    expect(pideAdministrador('rpm')).toBe(true);
  });

  it('la AppImage y los instaladores de Windows no piden nada', () => {
    for (const formato of ['appimage', 'nsis', 'msi', 'app', 'desconocido'] as const) {
      expect(pideAdministrador(formato)).toBe(false);
    }
  });
});

describe('avisoDeInstalacion', () => {
  it('avisa de la contraseña de administrador en deb y rpm', () => {
    for (const formato of ['deb', 'rpm'] as const) {
      expect(avisoDeInstalacion(formato)).toMatch(/administrador/i);
    }
  });

  /**
   * Callar cuando no hay nada que decir es parte del diseño: la tarjeta ya
   * explica que la app se reinicia sola, y añadir una segunda línea que no
   * aporta es cómo se consigue que nadie lea la que sí aporta.
   */
  it('calla cuando no hay nada especial que contar', () => {
    expect(avisoDeInstalacion('appimage')).toBeNull();
    expect(avisoDeInstalacion('nsis')).toBeNull();
    expect(avisoDeInstalacion('msi')).toBeNull();
  });

  it('con formato desconocido ofrece la salida manual en vez de callar', () => {
    expect(avisoDeInstalacion('desconocido')).toMatch(/página de descargas/i);
  });
});

describe('etiquetaDeFormato', () => {
  it('cubre todos los formatos, para que ninguno se quede sin nombre', () => {
    const todos: FormatoDePaquete[] = ['appimage', 'deb', 'rpm', 'nsis', 'msi', 'app', 'desconocido'];
    for (const formato of todos) {
      expect(etiquetaDeFormato(formato)).toBeTruthy();
    }
  });
});

describe('explicarAlmacen', () => {
  it('con llavero afirma la protección del sistema', () => {
    expect(explicarAlmacen('llavero')).toMatch(/llavero del sistema/i);
  });

  /**
   * Sin llavero hay que decir tres cosas y ninguna sobra: que este equipo no
   * tiene llavero, que aun así está cifrado —no en texto plano— y qué se puede
   * hacer para mejorarlo. Prometer la misma protección que el llavero sería
   * vender una garantía que en esa máquina no se está dando.
   */
  it('sin llavero lo dice, sin fingir que protege igual', () => {
    const texto = explicarAlmacen('archivo');
    expect(texto).toMatch(/no tiene llavero/i);
    expect(texto).toMatch(/cifrada/i);
    expect(texto).toMatch(/gnome-keyring/i);
  });
});
