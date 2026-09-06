import 'package:flutter/material.dart';

/// Desplaza su hijo lo que ocupa el teclado, **sin reconstruirlo**.
///
/// El problema que resuelve no se ve en una captura: se ve en el perfilador.
/// `MediaQuery.viewInsetsOf(context)` suscribe al widget que lo llama, y
/// Android reporta la altura del teclado **fotograma a fotograma** mientras
/// sube. Leerlo dentro del `build` de un formulario reconstruye el formulario
/// entero sesenta veces por segundo: cada campo, cada validador, cada lista que
/// haya dentro.
///
/// Aquí el inset se lee en el `build` de este widget, que es diminuto, y el
/// contenido llega **ya construido** por el parámetro `child`. El framework
/// entonces se salta ese subárbol en vez de rehacerlo: solo cambia el
/// `padding`.
///
/// ```dart
/// // Mal: apunta la dependencia al formulario entero.
/// Padding(
///   padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
///   child: /* el formulario */,
/// )
///
/// // Bien.
/// KeyboardInset(child: /* el formulario */)
/// KeyboardInset(extra: 16, child: /* una barra de acciones fija abajo */)
/// ```
///
/// La regla vale igual para un pie fijo dentro de una pantalla más alta:
/// se envuelve **el pie**, no la pantalla, y el `build` del padre se queda sin
/// tocar el inset.
class KeyboardInset extends StatelessWidget {
  const KeyboardInset({super.key, required this.child, this.extra = 0});

  final Widget child;

  /// Separación añadida bajo el teclado. Para una barra de acciones que no
  /// debe quedar pegada al borde superior del teclado.
  final double extra;

  @override
  Widget build(BuildContext context) {
    // `viewInsetsOf` y no `MediaQuery.of`: `of` suscribiría al MediaQueryData
    // entero, así que un cambio de orientación o de escala de texto también
    // dispararía esto.
    final teclado = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: teclado + (teclado > 0 ? extra : 0)),
      child: child,
    );
  }
}
