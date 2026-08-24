/// Política de una contraseña **nueva**, en un solo sitio.
///
/// Hay dos puertas por las que se fija una contraseña desde el teléfono —el
/// autorregistro y la recuperación— y cada una llevaba la suya: la recuperación
/// pedía ocho caracteres sin más, así que quien se registraba con la política
/// larga podía dejarla en «12345678» a los cinco minutos. La puerta más débil
/// es la que manda, y tenerla escrita en dos sitios garantiza que una se quede
/// atrás.
///
/// El equivalente en el backend es `passwordNueva` en `shared/validation.ts`,
/// que es quien decide de verdad: esto solo evita el viaje de ida y vuelta.
library;

/// Mínimo de caracteres. Por debajo de esto no se acepta.
const int minPassword = 10;

/// bcrypt solo mira 72 bytes; el tope evita ocupar el servidor sin ganar nada.
const int maxPassword = 128;

/// Texto de ayuda para el campo. Se dice antes de escribir, no después.
const String ayudaPassword = 'Mínimo 10, con mayúscula, minúscula y número';

/// Devuelve el motivo por el que la contraseña no vale, o `null` si vale.
String? revisarPassword(String valor) {
  if (valor.length < minPassword) {
    return 'La contraseña necesita al menos $minPassword caracteres.';
  }
  if (valor.length > maxPassword) {
    return 'La contraseña no puede superar $maxPassword caracteres.';
  }
  if (!RegExp(r'[a-z]').hasMatch(valor)) return 'Incluye alguna letra minúscula.';
  if (!RegExp(r'[A-Z]').hasMatch(valor)) return 'Incluye alguna letra mayúscula.';
  if (!RegExp(r'[0-9]').hasMatch(valor)) return 'Incluye algún número.';
  return null;
}
