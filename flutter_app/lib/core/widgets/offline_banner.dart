import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/offline_status.dart';
import '../theme/app_theme.dart';

/// Aviso de que lo que se ve no es de ahora.
///
/// Mostrar datos guardados sin decirlo es peor que no mostrarlos: el docente
/// puede pasar lista o mirar una nota creyendo que está viendo el presente. La
/// franja dice de cuándo son, que es la única información que le permite
/// decidir si le sirven.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final desde = ref.watch(offlineStatusProvider).valueOrNull;
    if (desde == null) return const SizedBox.shrink();

    final tone = SemanticTone.of(context, SemanticKind.warning);

    return Material(
      color: tone.bg,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(Icons.cloud_off_outlined, size: 16, color: tone.fg),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Sin conexión — datos guardados ${_hace(desde)}',
                  style: AppType.caption.copyWith(color: tone.fg),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// «hace 5 minutos» dice más que una marca de tiempo: lo que el docente
  /// necesita saber es cuánto puede haber cambiado, no cuándo fue exactamente.
  static String _hace(DateTime momento) {
    final diferencia = DateTime.now().difference(momento);
    if (diferencia.inMinutes < 1) return 'hace unos segundos';
    if (diferencia.inMinutes < 60) return 'hace ${diferencia.inMinutes} min';
    if (diferencia.inHours < 24) return 'hace ${diferencia.inHours} h';
    if (diferencia.inDays == 1) return 'ayer';
    return 'hace ${diferencia.inDays} días';
  }
}

/// Estado para lo que no puede funcionar sin servidor.
///
/// El asistente, los reportes y el escaneo de planillas necesitan al backend
/// para existir: no hay nada guardado que enseñar. Decirlo de frente es mejor
/// que un error de red que el docente tiene que interpretar.
class RequiereConexion extends StatelessWidget {
  final String que;
  final String? detalle;
  final VoidCallback? onReintentar;

  const RequiereConexion({
    super.key,
    required this.que,
    this.detalle,
    this.onReintentar,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, size: 44, color: muted),
            const SizedBox(height: 14),
            Text(
              '$que no funciona sin conexión',
              textAlign: TextAlign.center,
              style: AppType.bodyStrong,
            ),
            const SizedBox(height: 6),
            Text(
              detalle ??
                  'Necesita hablar con el servidor cada vez, así que no hay '
                      'nada guardado que mostrar. Vuelve cuando tengas red.',
              textAlign: TextAlign.center,
              style: AppType.caption.copyWith(color: muted, height: 1.4),
            ),
            if (onReintentar != null) ...[
              const SizedBox(height: 18),
              FilledButton.tonal(
                onPressed: onReintentar,
                child: const Text('Reintentar'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
