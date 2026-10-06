import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

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
    final muted = context.palette.muted;

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
