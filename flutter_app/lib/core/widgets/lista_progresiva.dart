import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Entrada escalonada de un elemento de lista.
///
/// La animación cumple una función y no solo decora: distingue «acaban de
/// llegar filas» de «la lista siempre estuvo así». Sin ella, una tanda nueva
/// aparece de golpe bajo el dedo y no hay forma de saber si el desplazamiento
/// saltó o si el contenido cambió.
///
/// El escalonado tiene tope a propósito. Con treinta elementos nuevos,
/// escalonarlos todos dejaría el último entrando casi un segundo después del
/// primero: para entonces ya nadie lo está mirando y lo único que queda es una
/// lista que tarda en asentarse.
class ElementoQueEntra extends StatefulWidget {
  const ElementoQueEntra({
    super.key,
    required this.child,
    this.posicionEnLaTanda = 0,
    this.duracion = const Duration(milliseconds: 280),
  });

  final Widget child;

  /// Posición dentro de la tanda recién llegada, para el escalonado.
  final int posicionEnLaTanda;

  final Duration duracion;

  /// Tope del escalonado: a partir de aquí todos entran a la vez.
  static const int _maxEscalonado = 8;
  static const Duration _pasoEscalonado = Duration(milliseconds: 30);

  @override
  State<ElementoQueEntra> createState() => _ElementoQueEntraState();
}

class _ElementoQueEntraState extends State<ElementoQueEntra>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controlador;
  late final Animation<double> _opacidad;
  late final Animation<Offset> _desplazamiento;

  @override
  void initState() {
    super.initState();
    _controlador = AnimationController(vsync: this, duration: widget.duracion);
    _opacidad = CurvedAnimation(parent: _controlador, curve: Curves.easeOutCubic);
    _desplazamiento = Tween<Offset>(
      begin: const Offset(0, 0.08),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controlador, curve: Curves.easeOutCubic));

    final pasos = widget.posicionEnLaTanda.clamp(0, ElementoQueEntra._maxEscalonado);
    final retraso = ElementoQueEntra._pasoEscalonado * pasos;

    // `Future.delayed` y no un `Timer` guardado: si el widget se desmonta antes
    // —el usuario sigue desplazándose y esto sale de pantalla— el `mounted`
    // corta, y `forward()` sobre un controlador ya liberado sería un error.
    if (retraso == Duration.zero) {
      _controlador.forward();
    } else {
      Future<void>.delayed(retraso, () {
        if (mounted) _controlador.forward();
      });
    }
  }

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Con «reducir movimiento» activado no hay animación: para algunas personas
    // no es un adorno, es un obstáculo.
    if (MediaQuery.disableAnimationsOf(context)) return widget.child;

    return FadeTransition(
      opacity: _opacidad,
      child: SlideTransition(position: _desplazamiento, child: widget.child),
    );
  }
}

/// Lista que pide más datos al acercarse al final.
///
/// El backend pagina todos sus listados —devuelve `items`, `total` y
/// `hasMore`— pero el móvil nunca se lo pedía: sin `page` ni `limit` recibía el
/// tope por defecto entero, que en estudiantes son mil documentos completos.
/// Sobre el wifi de un aula y en un teléfono, esa era la petición más pesada de
/// la aplicación.
///
/// Tres decisiones que no son de estilo:
///
/// **Se pide antes de llegar al final**, no al llegar. `_margenDeCarga` son
/// 400 px, algo más de una pantalla de elementos compactos: da tiempo a que la
/// petición vuelva antes de que el dedo alcance el vacío. Con el umbral en el
/// final exacto, la lista se para en seco y **se siente** como un fallo aunque
/// no lo sea.
///
/// **La guarda contra peticiones solapadas es obligatoria.** Sin ella, un
/// desplazamiento rápido dispara la misma página tres veces: se pisan entre
/// ellas y duplican filas.
///
/// **Un fallo al traer la página siguiente no vacía lo que ya se veía.** Se
/// muestra un reintento al pie y la lista se queda donde estaba; tirar el
/// contenido al estado de error por un fallo de red al final es perder lo que
/// ya funcionaba.
class ListaProgresiva<T> extends StatefulWidget {
  const ListaProgresiva({
    super.key,
    required this.items,
    required this.constructor,
    required this.hayMas,
    required this.cargandoMas,
    required this.onCargarMas,
    this.errorAlCargarMas,
    this.separador,
    this.padding,
    this.controller,
    this.encabezado,
  });

  final List<T> items;
  final Widget Function(BuildContext, T, int) constructor;
  final bool hayMas;
  final bool cargandoMas;
  final VoidCallback onCargarMas;

  /// Mensaje del último intento fallido, si lo hubo. La lista sigue visible.
  final String? errorAlCargarMas;

  final Widget Function(BuildContext, int)? separador;
  final EdgeInsetsGeometry? padding;

  /// Controlador propio cuando la lista vive dentro de otra cosa desplazable.
  final ScrollController? controller;

  final Widget? encabezado;

  static const double _margenDeCarga = 400;

  @override
  State<ListaProgresiva<T>> createState() => _ListaProgresivaState<T>();
}

class _ListaProgresivaState<T> extends State<ListaProgresiva<T>> {
  late final ScrollController _controlador =
      widget.controller ?? ScrollController();
  bool _controladorPropio = false;

  /// Cuántos elementos había antes de la última tanda. Lo que esté por encima
  /// entra con animación; lo demás ya estaba.
  int _antesDeLaTanda = 0;

  @override
  void initState() {
    super.initState();
    _controladorPropio = widget.controller == null;
    _controlador.addListener(_alDesplazar);
    _antesDeLaTanda = widget.items.length;
  }

  @override
  void didUpdateWidget(covariant ListaProgresiva<T> anterior) {
    super.didUpdateWidget(anterior);
    if (widget.items.length > anterior.items.length) {
      _antesDeLaTanda = anterior.items.length;
    } else if (widget.items.length < anterior.items.length) {
      // La lista encogió —otro filtro, otra búsqueda—: lo que queda no es
      // nuevo, así que no debe animarse como si acabara de llegar.
      _antesDeLaTanda = widget.items.length;
    }
  }

  @override
  void dispose() {
    _controlador.removeListener(_alDesplazar);
    if (_controladorPropio) _controlador.dispose();
    super.dispose();
  }

  void _alDesplazar() {
    if (!_controlador.hasClients) return;
    if (!widget.hayMas || widget.cargandoMas || widget.errorAlCargarMas != null) {
      return;
    }
    final posicion = _controlador.position;
    if (posicion.pixels >= posicion.maxScrollExtent - ListaProgresiva._margenDeCarga) {
      widget.onCargarMas();
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final hayEncabezado = widget.encabezado != null;
    final desplazamiento = hayEncabezado ? 1 : 0;
    // Un elemento extra al final: el pie de carga, el reintento o el total.
    final total = widget.items.length + desplazamiento + 1;

    return ListView.separated(
      controller: _controlador,
      padding: widget.padding,
      // `.builder`, nunca `ListView(children: [...])`: con children se
      // construyen TODOS los hijos aunque se vean ocho.
      itemCount: total,
      separatorBuilder: (context, index) {
        if (index < desplazamiento || index >= widget.items.length + desplazamiento) {
          return const SizedBox.shrink();
        }
        return widget.separador?.call(context, index - desplazamiento) ??
            const SizedBox(height: 8);
      },
      itemBuilder: (context, index) {
        if (hayEncabezado && index == 0) return widget.encabezado!;

        final i = index - desplazamiento;
        if (i < widget.items.length) {
          final hijo = widget.constructor(context, widget.items[i], i);
          // Solo la tanda nueva entra con animación. Las anteriores se
          // construyen tal cual: animarlas otra vez cada vez que vuelven a
          // entrar en pantalla es el tic que hace que la gente odie esto.
          if (i < _antesDeLaTanda) return hijo;
          return ElementoQueEntra(
            posicionEnLaTanda: i - _antesDeLaTanda,
            child: hijo,
          );
        }

        return _Pie(
          hayMas: widget.hayMas,
          cargando: widget.cargandoMas,
          error: widget.errorAlCargarMas,
          mostrados: widget.items.length,
          onReintentar: widget.onCargarMas,
          palette: palette,
        );
      },
    );
  }
}

/// Pie de la lista: cargando, reintento, o cuántos hay cuando ya están todos.
class _Pie extends StatelessWidget {
  const _Pie({
    required this.hayMas,
    required this.cargando,
    required this.error,
    required this.mostrados,
    required this.onReintentar,
    required this.palette,
  });

  final bool hayMas;
  final bool cargando;
  final String? error;
  final int mostrados;
  final VoidCallback onReintentar;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    if (error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            Text(
              'No se pudieron cargar más.',
              style: AppType.caption.copyWith(color: palette.muted),
            ),
            const SizedBox(height: 4),
            TextButton.icon(
              onPressed: onReintentar,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Reintentar'),
            ),
          ],
        ),
      );
    }

    if (cargando) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(
          child: SizedBox(
            height: 18,
            width: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    if (hayMas) {
      // Estado breve entre que el umbral dispara y llega la respuesta. Ocupa el
      // mismo alto que el indicador para que la lista no dé un salto al
      // cambiar de uno a otro.
      return const SizedBox(height: 58);
    }

    if (mostrados == 0) return const SizedBox.shrink();

    // Con todo cargado, decir cuántos hay evita la duda de si la lista terminó
    // o se quedó a medias.
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Center(
        child: Text(
          mostrados == 1 ? '1 resultado' : '$mostrados resultados',
          style: AppType.caption.copyWith(color: palette.muted),
        ),
      ),
    );
  }
}
