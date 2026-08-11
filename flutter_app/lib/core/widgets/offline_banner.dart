import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/offline_status.dart';
import '../services/realtime_service.dart';
import '../theme/app_theme.dart';

/// Barra de estado de la sincronización.
///
/// Responde tres preguntas que el docente no puede deducir de la pantalla:
/// si hay conexión con el servidor, si lo que ve es de ahora, y de cuándo es si
/// no lo es. Mostrar datos guardados sin decirlo es peor que no mostrarlos: se
/// puede pasar lista o mirar una nota creyendo que se está viendo el presente.
///
/// Los tres estados son los que pidió el sistema:
///
///   🟢 Conectado      · sincronizado hace X
///   🟡 Reconectando   · reintentando en segundo plano
///   🔴 Sin conexión   · datos guardados hace X
///
/// El verde va en tono apagado y en una franja fina: es la situación normal y
/// no debe competir con el contenido. Los otros dos sí destacan, porque cambian
/// lo que se puede hacer con lo que hay en pantalla.
class OfflineBanner extends ConsumerStatefulWidget {
  const OfflineBanner({super.key});

  @override
  ConsumerState<OfflineBanner> createState() => _OfflineBannerState();
}

class _OfflineBannerState extends ConsumerState<OfflineBanner> {
  Timer? _reloj;

  @override
  void initState() {
    super.initState();
    // "hace 4 min" tiene que envejecer solo. Cada 30 s es suficiente y no
    // despierta la pantalla sin motivo.
    _reloj = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _reloj?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final datos = ref.watch(offlineStatusProvider).valueOrNull;
    final realtime = ref.watch(realtimeStatusProvider).valueOrNull;

    final sinDatos = datos?.desdeCache != null;
    final reconectando = realtime == RealtimeStatus.connecting ||
        realtime == RealtimeStatus.disconnected;
    final error = realtime == RealtimeStatus.error ||
        realtime == RealtimeStatus.unauthorized ||
        sinDatos;

    // Antes de la primera lectura no se afirma nada: decir "sin conexión"
    // mientras todavía se está pidiendo sería mentir en el arranque.
    if (datos == null && realtime == null) return const SizedBox.shrink();

    final (kind, icono, texto) = switch (true) {
      _ when error => (
          SemanticKind.warning,
          Icons.cloud_off_outlined,
          sinDatos
              ? 'Sin conexión — datos guardados ${haceCuanto(datos?.desdeCache)}'
              : 'Sin conexión con el servidor',
        ),
      _ when reconectando => (
          SemanticKind.warning,
          Icons.sync_outlined,
          'Reconectando…',
        ),
      _ => (
          SemanticKind.success,
          Icons.cloud_done_outlined,
          'Sincronizado · ${haceCuanto(datos?.ultimaSincronizacion)}',
        ),
    };

    final tono = SemanticTone.of(context, kind);
    final normal = kind == SemanticKind.success;

    return Material(
      color: tono.bg,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: normal ? 4 : 8),
          child: Row(
            children: [
              Icon(icono, size: normal ? 13 : 16, color: tono.fg),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  texto,
                  style: AppType.caption.copyWith(color: tono.fg),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
