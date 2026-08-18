import 'dart:async';

import 'package:flutter/material.dart';

/// Campo de búsqueda que espera a que dejes de escribir.
///
/// Los buscadores llamaban a `setState` de la pantalla en cada pulsación. Eso
/// significaba, por cada letra, reconstruir la pantalla entera **y** volver a
/// filtrar la lista completa: escribir "Rodríguez" disparaba nueve pasadas
/// sobre los mil estudiantes del alcance, ocho de las cuales nadie llegaba a
/// ver. En un teléfono modesto se nota como un retraso entre la tecla y la
/// letra, que es el peor sitio donde tener retraso.
///
/// El texto se escribe siempre al instante —el controlador es del campo, no de
/// la pantalla—; lo que se reposa es el filtrado. Un cuarto de segundo es más
/// que la separación entre teclas de quien escribe rápido y menos de lo que
/// alguien percibe como espera.
class DebouncedSearchField extends StatefulWidget {
  /// Se llama con el texto ya reposado, no con cada pulsación.
  final ValueChanged<String> onChanged;
  final String hintText;
  final String? labelText;
  final TextEditingController? controller;
  final Duration espera;

  const DebouncedSearchField({
    super.key,
    required this.onChanged,
    this.hintText = 'Buscar…',
    this.labelText,
    this.controller,
    this.espera = const Duration(milliseconds: 250),
  });

  @override
  State<DebouncedSearchField> createState() => _DebouncedSearchFieldState();
}

class _DebouncedSearchFieldState extends State<DebouncedSearchField> {
  late final TextEditingController _controller =
      widget.controller ?? TextEditingController();
  Timer? _debounce;
  String _ultimoEmitido = '';

  @override
  void dispose() {
    _debounce?.cancel();
    // Solo se libera el que se creó aquí: el que llega de fuera es de quien lo
    // pasó, y liberarlo dejaría al dueño con un controlador muerto.
    if (widget.controller == null) _controller.dispose();
    super.dispose();
  }

  void _alEscribir(String valor) {
    _debounce?.cancel();
    _debounce = Timer(widget.espera, () {
      // No se avisa de un valor que ya se avisó: borrar y reescribir la misma
      // letra no tiene por qué costar un filtrado.
      if (!mounted || valor == _ultimoEmitido) return;
      _ultimoEmitido = valor;
      widget.onChanged(valor);
    });
  }

  /// Vacía el campo y avisa de inmediato: al pulsar la equis, la lista
  /// completa tiene que volver ya, sin cuarto de segundo de por medio.
  void _limpiar() {
    _debounce?.cancel();
    _controller.clear();
    if (_ultimoEmitido.isEmpty) return;
    _ultimoEmitido = '';
    widget.onChanged('');
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      onChanged: _alEscribir,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: widget.hintText,
        labelText: widget.labelText,
        prefixIcon: const Icon(Icons.search),
        isDense: true,
        // El botón de limpiar se suscribe solo al controlador: sin este
        // `ValueListenableBuilder` haría falta un `setState` por pulsación
        // para decidir si se enseña, que es justo lo que se está evitando.
        suffixIcon: ValueListenableBuilder<TextEditingValue>(
          valueListenable: _controller,
          builder: (_, valor, __) => valor.text.isEmpty
              ? const SizedBox.shrink()
              : IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: 'Limpiar búsqueda',
                  onPressed: _limpiar,
                ),
        ),
      ),
    );
  }
}
