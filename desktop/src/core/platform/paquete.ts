/**
 * En qué formato está instalada la aplicación, y qué implica al actualizar.
 *
 * Existe porque en Linux **actualizar no es una sola cosa**. Una AppImage se
 * reemplaza a sí misma sin pedir nada; un `.deb` o un `.rpm` instalan en `/usr`
 * y el sistema pide autorización de administrador. Quien no lo espera lee ese
 * diálogo de contraseña como un fallo de la aplicación y cancela — y se queda
 * sin actualizar, convencido de que la actualización está rota.
 *
 * Todo lo de aquí son funciones puras sobre una cadena. El formato lo dice el
 * proceso nativo (`installed_package_format`), que lo saca de la misma función
 * de Tauri que usa el actualizador para decidir qué descargar: así lo que se
 * avisa y lo que ocurre no pueden discrepar.
 */

/**
 * Los formatos que el actualizador distingue, más `desconocido`.
 *
 * `desconocido` es el caso real de ejecutar el binario suelto —sin instalar— y
 * el del navegador durante el desarrollo. No es un error: es que no hay ningún
 * paquete del que hablar.
 */
export type FormatoDePaquete = 'appimage' | 'deb' | 'rpm' | 'nsis' | 'msi' | 'app' | 'desconocido';

const FORMATOS: readonly FormatoDePaquete[] = ['appimage', 'deb', 'rpm', 'nsis', 'msi', 'app'];

/**
 * Normaliza lo que devuelve el proceso nativo.
 *
 * El lado Rust formatea el enum de Tauri, así que un nombre nuevo en una versión
 * futura llegaría aquí como una cadena que no reconocemos. Se trata como
 * `desconocido` en vez de romper la pantalla: no saber el formato solo cuesta un
 * aviso, y quedarse sin tarjeta de actualizaciones cuesta la actualización.
 */
export function normalizarFormato(valor: string | null | undefined): FormatoDePaquete {
  const limpio = (valor ?? '').trim().toLowerCase();
  return (FORMATOS as readonly string[]).includes(limpio) ? (limpio as FormatoDePaquete) : 'desconocido';
}

/** Cómo se llama el formato para quien lo lee. */
export function etiquetaDeFormato(formato: FormatoDePaquete): string {
  switch (formato) {
    case 'appimage':
      return 'AppImage';
    case 'deb':
      return 'paquete .deb';
    case 'rpm':
      return 'paquete .rpm';
    case 'nsis':
      return 'instalador de Windows';
    case 'msi':
      return 'instalador MSI';
    case 'app':
      return 'aplicación de macOS';
    case 'desconocido':
      return 'sin instalar';
  }
}

/**
 * ¿Instalar la actualización va a pedir autorización de administrador?
 *
 * Solo `.deb` y `.rpm`: escriben en `/usr`, así que el sistema levanta un
 * diálogo de polkit. Los demás formatos reemplazan archivos que ya son del
 * usuario.
 */
export function pideAdministrador(formato: FormatoDePaquete): boolean {
  return formato === 'deb' || formato === 'rpm';
}

/**
 * La frase que se enseña **antes** de pulsar «Instalar y reiniciar».
 *
 * Avisar después no sirve de nada: para entonces el diálogo del sistema ya está
 * en pantalla y la pregunta es si esto es de fiar.
 *
 * Devuelve `null` cuando no hay nada especial que contar — que es el caso de
 * Windows y de la AppImage, donde la frase genérica de la tarjeta («la app se
 * reiniciará sola») ya lo dice todo. Añadir texto que no aporta es cómo se
 * consigue que nadie lea el que sí aporta.
 */
export function avisoDeInstalacion(formato: FormatoDePaquete): string | null {
  if (pideAdministrador(formato)) {
    return `Está instalada como ${etiquetaDeFormato(formato)}, así que el sistema pedirá la contraseña de administrador para instalar la actualización.`;
  }
  if (formato === 'desconocido') {
    return 'No se pudo determinar cómo está instalada la aplicación. Si la actualización no se aplica, descarga la última versión desde la página de descargas.';
  }
  return null;
}

/**
 * Dónde guarda este equipo los tokens de sesión.
 *
 * Solo tiene dos valores porque solo hay dos sitios. En Windows y macOS siempre
 * es `llavero`; en Linux depende de si hay Secret Service instalado, y por eso
 * se pregunta en vez de deducirlo del sistema operativo.
 */
export type AlmacenDeCredenciales = 'llavero' | 'archivo';

/**
 * Qué decirle a quien está mirando Configuración.
 *
 * El respaldo protege menos que el llavero y eso hay que decirlo: cifra con una
 * clave derivada de la máquina, así que su defensa real frente a alguien con
 * acceso local son los permisos del archivo. Es más que texto plano y es menos
 * que el llavero, y presentarlo como equivalente sería vender una garantía que
 * en ese equipo no se está dando.
 */
export function explicarAlmacen(almacen: AlmacenDeCredenciales): string {
  return almacen === 'llavero'
    ? 'La sesión se guarda en el llavero del sistema, protegido por tu contraseña de usuario.'
    : 'Este equipo no tiene llavero del sistema (gnome-keyring o KWallet), así que la sesión se guarda cifrada en un archivo privado de tu carpeta personal. Instalar gnome-keyring mejora la protección.';
}
