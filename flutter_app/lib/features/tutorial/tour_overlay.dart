import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/rubri.dart';
import 'tutorial_page.dart';

/// Se incrementa desde Ajustes para pedir que el recorrido arranque otra vez.
/// Es un contador y no un booleano para que dos peticiones seguidas cuenten
/// las dos aunque nadie lo haya puesto a cero.
final tourSolicitadoProvider = StateProvider<int>((ref) => 0);

/// Rectángulo en pantalla de un widget con `GlobalKey`, o null si no está
/// montado todavía (o no tiene tamaño).
Rect? rectDeClave(GlobalKey clave) {
  final contexto = clave.currentContext;
  if (contexto == null || !contexto.mounted) return null;
  final render = contexto.findRenderObject();
  if (render is! RenderBox || !render.hasSize || render.size.isEmpty) {
    return null;
  }
  return render.localToGlobal(Offset.zero) & render.size;
}

/// El recorrido señalado sobre la pantalla real del teléfono.
///
/// Es la contraparte del de escritorio: un velo con un hueco sobre la pestaña
/// o la celda de «Más» de la que se habla, una tarjeta que se coloca encima o
/// debajo según dónde esté el hueco, y ambos se mueven de un paso al siguiente
/// con la misma curva. Solo pinta: **quién es el objetivo lo decide
/// `AppScaffold`**, que es quien conoce la barra, las celdas y cómo abrir la
/// hoja de «Más»; aquí llega ya como un `Rect`.
///
/// El velo es un único `CustomPaint` con `Path.combine` (difference): una capa,
/// sin desenfoque, y el tween de `Rect` mueve hueco y anillo juntos. Con
/// «reducir movimiento» las duraciones son cero.
class TourOverlay extends StatelessWidget {
  final PasoTutorial paso;
  final int indice;
  final int total;

  /// Dónde está lo que se explica. Null: tarjeta centrada, velo entero.
  final Rect? objetivo;
  final VoidCallback onSiguiente;
  final VoidCallback onAtras;
  final VoidCallback onSaltar;

  const TourOverlay({
    super.key,
    required this.paso,
    required this.indice,
    required this.total,
    required this.objetivo,
    required this.onSiguiente,
    required this.onAtras,
    required this.onSaltar,
  });

  static const _holgura = 6.0;
  static const _margen = 16.0;

  @override
  Widget build(BuildContext context) {
    final sinMovimiento = MediaQuery.disableAnimationsOf(context);
    final duracion = sinMovimiento ? Duration.zero : AppMotion.slow;
    final tamano = MediaQuery.sizeOf(context);
    final centro = tamano.center(Offset.zero);
    // Sin objetivo, el hueco se encoge al centro: el velo lo cubre todo y el
    // anillo desaparece sin un salto.
    final hueco =
        objetivo?.inflate(_holgura) ??
        Rect.fromCenter(center: centro, width: 0, height: 0);
    final ultimo = indice == total - 1;
    final esExtremo = indice == 0 || ultimo;
    final palette = context.palette;
    final primario = Theme.of(context).colorScheme.primary;

    return Semantics(
      label: 'Tutorial',
      child: Material(
        type: MaterialType.transparency,
        child: TweenAnimationBuilder<Rect?>(
          tween: RectTween(end: hueco),
          duration: duracion,
          curve: AppMotion.curve,
          builder: (context, rect, _) {
            final r = rect ?? hueco;
            return Stack(
              fit: StackFit.expand,
              children: [
                // Velo con el hueco. Tocarlo cierra, como en el escritorio.
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: onSaltar,
                  child: CustomPaint(
                    painter: _VeloConHueco(
                      hueco: r,
                      color: Colors.black.withValues(alpha: 0.58),
                      anillo: primario,
                      pintarAnillo: objetivo != null,
                    ),
                  ),
                ),
                if (objetivo != null && !sinMovimiento)
                  Positioned.fromRect(
                    rect: r,
                    child: IgnorePointer(
                      child: _AnilloQueRespira(color: primario),
                    ),
                  ),
                _tarjeta(context, r, palette, ultimo, esExtremo, sinMovimiento),
              ],
            );
          },
        ),
      ),
    );
  }

  /// La tarjeta va encima del hueco si este está en la mitad inferior (la
  /// barra) y debajo si está en la superior; centrada cuando no hay hueco.
  Widget _tarjeta(
    BuildContext context,
    Rect hueco,
    AppPalette palette,
    bool ultimo,
    bool esExtremo,
    bool sinMovimiento,
  ) {
    final tamano = MediaQuery.sizeOf(context);
    final relleno = MediaQuery.paddingOf(context);
    final contenido = _ContenidoTarjeta(
      paso: paso,
      indice: indice,
      total: total,
      ultimo: ultimo,
      esExtremo: esExtremo,
      sinMovimiento: sinMovimiento,
      onSiguiente: onSiguiente,
      onAtras: onAtras,
      onSaltar: onSaltar,
    );

    if (objetivo == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: _margen),
          child: contenido,
        ),
      );
    }

    final arriba = hueco.center.dy > tamano.height / 2;
    return AnimatedPositioned(
      duration: sinMovimiento ? Duration.zero : AppMotion.slow,
      curve: AppMotion.curve,
      left: _margen,
      right: _margen,
      top: arriba ? null : hueco.bottom + 12,
      bottom: arriba ? tamano.height - hueco.top + 12 : null,
      child: Padding(
        padding: EdgeInsets.only(
          top: arriba ? 0 : relleno.top,
          bottom: arriba ? relleno.bottom : 0,
        ),
        child: contenido,
      ),
    );
  }
}

class _ContenidoTarjeta extends StatelessWidget {
  final PasoTutorial paso;
  final int indice;
  final int total;
  final bool ultimo;
  final bool esExtremo;
  final bool sinMovimiento;
  final VoidCallback onSiguiente;
  final VoidCallback onAtras;
  final VoidCallback onSaltar;

  const _ContenidoTarjeta({
    required this.paso,
    required this.indice,
    required this.total,
    required this.ultimo,
    required this.esExtremo,
    required this.sinMovimiento,
    required this.onSiguiente,
    required this.onAtras,
    required this.onSaltar,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final primario = Theme.of(context).colorScheme.primary;
    final tono = SemanticTone.of(context, SemanticKind.info);

    final icono = esExtremo
        ? const Rubri(emotion: RubriEmotion.happy, size: 56)
        : Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: tono.bg,
              borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
            ),
            child: Icon(paso.icono, size: 22, color: tono.fg),
          );

    return Container(
      padding: const EdgeInsets.all(AppSpacing.gap),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: palette.border),
        boxShadow: AppShadows.lg(palette.isDark),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Paso ${indice + 1} de $total',
                style: AppType.captionStrong.copyWith(color: primario),
              ),
              const Spacer(),
              // Saltar va arriba, donde iría la equis: abajo no cabe junto a
              // Atrás y Siguiente en 360 dp.
              TextButton(
                onPressed: onSaltar,
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                child: const Text('Saltar'),
              ),
            ],
          ),
          // El texto entra por el lado hacia el que se avanza. `key` por
          // paso: el switcher lo toma como otro hijo y anima el cambio.
          AnimatedSwitcher(
            duration: sinMovimiento ? Duration.zero : AppMotion.normal,
            switchInCurve: AppMotion.curve,
            switchOutCurve: AppMotion.curve,
            transitionBuilder: (hijo, animacion) => FadeTransition(
              opacity: animacion,
              child: SlideTransition(
                position: Tween(
                  begin: const Offset(0.06, 0),
                  end: Offset.zero,
                ).animate(animacion),
                child: hijo,
              ),
            ),
            layoutBuilder: (actual, anteriores) => Stack(
              alignment: Alignment.topLeft,
              children: [...anteriores, if (actual != null) actual],
            ),
            child: Row(
              key: ValueKey(indice),
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                icono,
                const SizedBox(width: AppSpacing.gapSm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(paso.titulo, style: AppType.bodyStrong),
                      const SizedBox(height: 4),
                      Text(
                        paso.texto,
                        style: AppType.body.copyWith(
                          color: palette.muted,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.gap),
          Row(
            children: [
              if (indice > 0)
                OutlinedButton(onPressed: onAtras, child: const Text('Atrás')),
              const Spacer(),
              FilledButton(
                onPressed: onSiguiente,
                child: Text(ultimo ? 'Terminar' : 'Siguiente'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.gapSm),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: (indice + 1) / total),
              duration: sinMovimiento ? Duration.zero : AppMotion.slow,
              curve: AppMotion.curve,
              builder: (context, valor, _) => LinearProgressIndicator(
                value: valor,
                minHeight: 3,
                backgroundColor: palette.border,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Velo oscuro con un hueco redondeado y un anillo del color primario.
class _VeloConHueco extends CustomPainter {
  final Rect hueco;
  final Color color;
  final Color anillo;
  final bool pintarAnillo;

  const _VeloConHueco({
    required this.hueco,
    required this.color,
    required this.anillo,
    required this.pintarAnillo,
  });

  static const _radio = Radius.circular(12);

  @override
  void paint(Canvas canvas, Size size) {
    final todo = Path()..addRect(Offset.zero & size);
    final agujero = Path()..addRRect(RRect.fromRectAndRadius(hueco, _radio));
    canvas.drawPath(
      Path.combine(PathOperation.difference, todo, agujero),
      Paint()..color = color,
    );
    if (pintarAnillo && !hueco.isEmpty) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(hueco, _radio),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = anillo,
      );
    }
  }

  @override
  bool shouldRepaint(_VeloConHueco anterior) =>
      anterior.hueco != hueco ||
      anterior.color != color ||
      anterior.anillo != anillo ||
      anterior.pintarAnillo != pintarAnillo;
}

/// Un segundo anillo que se expande y se desvanece: dice «mira aquí» cuando
/// el hueco ya está quieto. Solo existe con el movimiento activo.
class _AnilloQueRespira extends StatefulWidget {
  final Color color;

  const _AnilloQueRespira({required this.color});

  @override
  State<_AnilloQueRespira> createState() => _AnilloQueRespiraState();
}

class _AnilloQueRespiraState extends State<_AnilloQueRespira>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controlador = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  )..repeat();

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controlador,
      builder: (context, _) {
        final t = Curves.easeOut.transform(_controlador.value);
        return Transform.scale(
          scale: 1 + 0.08 * t,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: widget.color.withValues(alpha: 0.5 * (1 - t)),
                width: 3,
              ),
            ),
          ),
        );
      },
    );
  }
}
