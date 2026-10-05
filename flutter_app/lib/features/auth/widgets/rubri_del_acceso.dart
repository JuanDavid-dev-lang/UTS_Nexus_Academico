import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/rubri.dart';
import '../rubri_desmayo.dart';

/// Rubri del acceso, con el easter egg del desmayo. No está señalado y tocarlo
/// no hace nada con el formulario. Las reglas viven en `rubri_desmayo.dart`.
class RubriDelAcceso extends StatefulWidget {
  const RubriDelAcceso({super.key, required this.emocion, required this.size});

  final RubriEmotion emocion;
  final double size;

  @override
  State<RubriDelAcceso> createState() => _RubriDelAccesoState();
}

class _RubriDelAccesoState extends State<RubriDelAcceso>
    with SingleTickerProviderStateMixin {
  late final AnimationController _tambaleo = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 380),
  );
  ConteoDeToques _conteo = ConteoDeToques.vacio;
  Timer? _recuperacion;

  FaseRubri get _fase => faseDe(_conteo.toques);

  @override
  void dispose() {
    _recuperacion?.cancel();
    _tambaleo.dispose();
    super.dispose();
  }

  void _tocar() {
    if (_fase == FaseRubri.desmayado) return;
    final siguiente = registrarToque(_conteo, DateTime.now());
    setState(() => _conteo = siguiente);
    if (faseDe(siguiente.toques) == FaseRubri.desmayado) {
      _recuperacion = Timer(duracionDesmayo, () {
        if (mounted) setState(() => _conteo = ConteoDeToques.vacio);
      });
      return;
    }
    if (!MediaQuery.disableAnimationsOf(context)) _tambaleo.forward(from: 0);
  }

  RubriEmotion get _cara => switch (_fase) {
    FaseRubri.desmayado => RubriEmotion.offline,
    FaseRubri.mareado => RubriEmotion.sad,
    FaseRubri.molesto => RubriEmotion.neutral,
    FaseRubri.normal => widget.emocion,
  };

  /// Cuánto se tambalea con cada toque, en radianes: más cuanto más lo marean.
  double get _giro => switch (_fase) {
    FaseRubri.mareado => 0.28,
    FaseRubri.molesto => 0.16,
    _ => 0.07,
  };

  @override
  Widget build(BuildContext context) {
    final sinMovimiento = MediaQuery.disableAnimationsOf(context);
    final desmayado = _fase == FaseRubri.desmayado;
    final caida = desmayado && !sinMovimiento;

    final rubri = AnimatedBuilder(
      animation: _tambaleo,
      builder: (context, child) {
        // Una oscilación amortiguada: encoge, se pasa y vuelve.
        final t = _tambaleo.value;
        final onda = math.sin(t * math.pi * 2) * (1 - t);
        return Transform.rotate(
          angle: -_giro * onda,
          child: Transform.scale(scale: 1 - 0.1 * onda.abs(), child: child),
        );
      },
      child: Rubri(emotion: _cara, size: widget.size, animated: !desmayado),
    );

    return Semantics(
      liveRegion: desmayado,
      label: desmayado ? 'Rubri se desmayó' : null,
      child: GestureDetector(
        onTap: _tocar,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            AnimatedSlide(
              offset: caida ? const Offset(-0.05, 0.25) : Offset.zero,
              duration: Duration(milliseconds: desmayado ? 550 : 450),
              curve: desmayado ? Curves.easeInCubic : Curves.easeOut,
              child: AnimatedRotation(
                turns: caida ? -0.25 : 0,
                duration: Duration(milliseconds: desmayado ? 550 : 450),
                curve: desmayado ? Curves.easeInCubic : Curves.easeOut,
                child: rubri,
              ),
            ),
            // Arriba y pegado a la derecha: debajo está el título y a la
            // derecha se acaba la pantalla.
            Positioned(
              top: -AppSpacing.gapSm,
              right: 0,
              child: AnimatedOpacity(
                opacity: desmayado ? 1 : 0,
                duration: const Duration(milliseconds: 200),
                child: _Globo(visible: desmayado),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Globo extends StatelessWidget {
  const _Globo({required this.visible});

  final bool visible;

  @override
  Widget build(BuildContext context) {
    if (!visible) return const SizedBox.shrink();
    final palette = context.palette;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
        border: Border.all(color: palette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        child: Text(
          'Uff… dame un momento',
          style: AppType.caption.copyWith(color: palette.muted),
          maxLines: 1,
          softWrap: false,
        ),
      ),
    );
  }
}
