import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/realtime_service.dart';
import '../storage/offline_status.dart';
import '../sync/outbox_service.dart';
import '../theme/app_theme.dart';
import 'compact.dart';
import 'outbox_sheet.dart';

/// Qué cuenta el indicador. Lo normal —conectado y sin nada pendiente— es
/// [oculto]: un icono que confirma lo normal todo el rato es ruido.
enum EstadoIndicador {
  oculto,

  /// Acaba de volver la conexión: un instante en verde y se va solo.
  restablecido,
  reconectando,
  sinConexion,

  /// Hay red y la bandeja está saliendo.
  enviando,

  /// Hay red y quedan cambios en la bandeja (esperando su turno o su espera).
  pendientes,
  fallidas,
}

/// Lo que el indicador decide, sin Flutter de por medio para poder probarlo.
///
/// La conexión manda sobre la bandeja: sin red, el icono dice «sin conexión» y
/// el número de la burbuja dice cuánto espera. Un cambio rechazado manda sobre
/// todo, porque es lo único que necesita que el docente haga algo.
({EstadoIndicador estado, int cuenta, bool cuentaEsError}) decidirIndicador({
  required bool problemaVisible,
  required RealtimeStatus? tiempoReal,
  required bool desdeCache,
  required OutboxSnapshot? bandeja,
  required bool recienRestablecido,
}) {
  final fallidas = bandeja?.fallidas ?? 0;
  final pendientes = bandeja?.pendientes ?? 0;
  final cuenta = fallidas > 0 ? fallidas : pendientes;
  final cuentaEsError = fallidas > 0;

  if (fallidas > 0) {
    return (
      estado: EstadoIndicador.fallidas,
      cuenta: cuenta,
      cuentaEsError: true,
    );
  }
  final sinRed =
      desdeCache ||
      (problemaVisible &&
          (tiempoReal == RealtimeStatus.error ||
              tiempoReal == RealtimeStatus.unauthorized));
  if (sinRed) {
    return (
      estado: EstadoIndicador.sinConexion,
      cuenta: cuenta,
      cuentaEsError: false,
    );
  }
  if (problemaVisible) {
    return (
      estado: EstadoIndicador.reconectando,
      cuenta: cuenta,
      cuentaEsError: false,
    );
  }
  if (pendientes > 0) {
    return (
      estado: bandeja!.drenando
          ? EstadoIndicador.enviando
          : EstadoIndicador.pendientes,
      cuenta: cuenta,
      cuentaEsError: cuentaEsError,
    );
  }
  if (recienRestablecido) {
    return (
      estado: EstadoIndicador.restablecido,
      cuenta: 0,
      cuentaEsError: false,
    );
  }
  return (estado: EstadoIndicador.oculto, cuenta: 0, cuentaEsError: false);
}

/// Icono de conexión en la esquina de la barra superior, junto al avatar.
///
/// Sustituye a la franja que ocupaba todo el ancho encima de cada pantalla: un
/// «Reconectando…» de lado a lado empujaba el contenido hacia abajo cada vez
/// que el teléfono volvía de segundo plano. Aquí solo aparece cuando hay algo
/// que contar —reconectando, sin conexión, cambios por enviar— y al tocarlo
/// abre el detalle. La lógica de cuándo avisar es la de la franja: tres
/// segundos de gracia para lo que es solo el handshake de siempre.
class IndicadorConexion extends ConsumerStatefulWidget {
  const IndicadorConexion({super.key});

  @override
  ConsumerState<IndicadorConexion> createState() => _IndicadorConexionState();
}

class _IndicadorConexionState extends ConsumerState<IndicadorConexion>
    with SingleTickerProviderStateMixin {
  late final AnimationController _giro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  /// Gracia antes de avisar de un problema del tiempo real. Volver de segundo
  /// plano, arrancar o renovar el token pasa siempre por «desconectado» y
  /// «conectando» durante el handshake (medio segundo a tres por el túnel).
  Timer? _gracia;
  bool _graciaVencida = false;

  /// El verde de «conexión restablecida» solo se enseña si antes se enseñó un
  /// problema, y dura un momento.
  bool _seMostroProblema = false;
  bool _recienRestablecido = false;
  Timer? _cierreRestablecido;

  @override
  void dispose() {
    _giro.dispose();
    _gracia?.cancel();
    _cierreRestablecido?.cancel();
    super.dispose();
  }

  void _vigilarGracia(bool hayProblema) {
    if (!hayProblema) {
      _gracia?.cancel();
      _gracia = null;
      _graciaVencida = false;
      return;
    }
    if (_gracia != null || _graciaVencida) return;
    _gracia = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _graciaVencida = true);
    });
  }

  void _vigilarRestablecido(bool problemaVisible) {
    if (problemaVisible) {
      _seMostroProblema = true;
      _recienRestablecido = false;
      _cierreRestablecido?.cancel();
      return;
    }
    if (!_seMostroProblema) return;
    _seMostroProblema = false;
    _recienRestablecido = true;
    _cierreRestablecido?.cancel();
    _cierreRestablecido = Timer(const Duration(milliseconds: 2500), () {
      if (mounted) setState(() => _recienRestablecido = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final datos = ref.watch(offlineStatusProvider).valueOrNull;
    final tiempoReal = ref.watch(realtimeStatusProvider).valueOrNull;
    final bandeja = ref.watch(outboxProvider).valueOrNull;

    final desdeCache = datos?.desdeCache != null;
    final problemaTiempoReal =
        tiempoReal != null && tiempoReal != RealtimeStatus.connected;
    _vigilarGracia(problemaTiempoReal);
    final problemaVisible =
        (problemaTiempoReal && _graciaVencida) || desdeCache;
    _vigilarRestablecido(problemaVisible);

    final decision = decidirIndicador(
      problemaVisible: problemaTiempoReal && _graciaVencida,
      tiempoReal: tiempoReal,
      desdeCache: desdeCache,
      bandeja: bandeja,
      recienRestablecido: _recienRestablecido,
    );

    final gira =
        (decision.estado == EstadoIndicador.reconectando ||
            decision.estado == EstadoIndicador.enviando) &&
        !MediaQuery.disableAnimationsOf(context);
    if (gira && !_giro.isAnimating) {
      _giro.repeat();
    } else if (!gira && _giro.isAnimating) {
      _giro
        ..stop()
        ..value = 0;
    }

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOutBack,
      switchOutCurve: Curves.easeIn,
      transitionBuilder: (child, animacion) => FadeTransition(
        opacity: animacion,
        child: ScaleTransition(scale: animacion, child: child),
      ),
      child: decision.estado == EstadoIndicador.oculto
          ? const SizedBox.shrink(key: ValueKey('oculto'))
          : _Burbuja(
              key: ValueKey(decision.estado),
              estado: decision.estado,
              cuenta: decision.cuenta,
              cuentaEsError: decision.cuentaEsError,
              giro: _giro,
              onTap: () =>
                  _mostrarDetalle(context, decision.estado, datos, bandeja),
            ),
    );
  }

  Future<void> _mostrarDetalle(
    BuildContext context,
    EstadoIndicador estado,
    EstadoDatos? datos,
    OutboxSnapshot? bandeja,
  ) {
    final aspecto = _aspectoDe(estado);
    final pendientesTotales = bandeja?.entradas.length ?? 0;
    final hayProblema =
        estado == EstadoIndicador.reconectando ||
        estado == EstadoIndicador.sinConexion;

    return showCompactSheet<void>(
      context: context,
      titulo: aspecto.titulo,
      constructor: (hoja) {
        final palette = hoja.palette;
        final ultima = datos?.ultimaSincronizacion;
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _explicacion(estado, datos),
                style: AppType.body.copyWith(color: palette.muted, height: 1.4),
              ),
              if (ultima != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Última sincronización: ${haceCuanto(ultima)}',
                  style: AppType.caption.copyWith(color: palette.muted),
                ),
              ],
              const SizedBox(height: 16),
              if (hayProblema)
                FilledButton.tonalIcon(
                  onPressed: () {
                    RealtimeService.instance.reconectarAhora();
                    OutboxService.instance.solicitarDrenaje();
                    Navigator.of(hoja).pop();
                  },
                  icon: const Icon(Icons.refresh),
                  label: const Text('Reintentar ahora'),
                ),
              if (pendientesTotales > 0) ...[
                if (hayProblema) const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(hoja).pop();
                    unawaited(mostrarBandejaDeSalida(context));
                  },
                  icon: const Icon(Icons.cloud_upload_outlined),
                  label: Text(
                    pendientesTotales == 1
                        ? 'Ver el cambio sin enviar'
                        : 'Ver los $pendientesTotales cambios sin enviar',
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  String _explicacion(
    EstadoIndicador estado,
    EstadoDatos? datos,
  ) => switch (estado) {
    EstadoIndicador.reconectando =>
      'Se perdió la conexión con el servidor y se está recuperando sola. '
          'Puedes seguir trabajando: lo que anotes se guarda en el teléfono.',
    EstadoIndicador.sinConexion =>
      datos?.desdeCache != null
          ? 'Estás viendo datos guardados ${haceCuanto(datos?.desdeCache)}. '
                'Las notas y la asistencia que anotes se envían solas '
                'cuando vuelva la conexión.'
          : 'No se encuentra el servidor. Las notas y la asistencia que '
                'anotes se envían solas cuando vuelva la conexión.',
    EstadoIndicador.enviando => 'Subiendo lo que anotaste sin conexión.',
    EstadoIndicador.pendientes =>
      'Hay cambios esperando su turno para enviarse.',
    EstadoIndicador.fallidas =>
      'El servidor rechazó algún cambio. Ábrelo para ver el motivo y '
          'reintentarlo o descartarlo.',
    EstadoIndicador.restablecido => 'La conexión volvió. Todo al día.',
    EstadoIndicador.oculto => '',
  };
}

typedef _Aspecto = ({SemanticKind kind, IconData icono, String titulo});

_Aspecto _aspectoDe(EstadoIndicador estado) => switch (estado) {
  EstadoIndicador.reconectando => (
    kind: SemanticKind.warning,
    icono: Icons.sync_rounded,
    titulo: 'Reconectando',
  ),
  EstadoIndicador.sinConexion => (
    kind: SemanticKind.warning,
    icono: Icons.cloud_off_rounded,
    titulo: 'Sin conexión',
  ),
  EstadoIndicador.enviando => (
    kind: SemanticKind.info,
    icono: Icons.sync_rounded,
    titulo: 'Enviando cambios',
  ),
  EstadoIndicador.pendientes => (
    kind: SemanticKind.info,
    icono: Icons.cloud_upload_rounded,
    titulo: 'Cambios sin enviar',
  ),
  EstadoIndicador.fallidas => (
    kind: SemanticKind.danger,
    icono: Icons.cloud_sync_rounded,
    titulo: 'Cambios no enviados',
  ),
  EstadoIndicador.restablecido => (
    kind: SemanticKind.success,
    icono: Icons.cloud_done_rounded,
    titulo: 'Conectado',
  ),
  EstadoIndicador.oculto => (
    kind: SemanticKind.info,
    icono: Icons.cloud_rounded,
    titulo: '',
  ),
};

class _Burbuja extends StatelessWidget {
  const _Burbuja({
    super.key,
    required this.estado,
    required this.cuenta,
    required this.cuentaEsError,
    required this.giro,
    required this.onTap,
  });

  final EstadoIndicador estado;
  final int cuenta;
  final bool cuentaEsError;
  final AnimationController giro;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final aspecto = _aspectoDe(estado);
    final tono = SemanticTone.of(context, aspecto.kind);
    final tonoCuenta = SemanticTone.of(
      context,
      cuentaEsError ? SemanticKind.danger : SemanticKind.warning,
    );
    final palette = context.palette;

    Widget icono = Icon(aspecto.icono, size: 18, color: tono.fg);
    if (estado == EstadoIndicador.reconectando ||
        estado == EstadoIndicador.enviando) {
      icono = RotationTransition(turns: giro, child: icono);
    }

    final etiqueta = [
      aspecto.titulo,
      if (cuenta > 0)
        cuentaEsError
            ? '$cuenta sin poder enviar'
            : '$cuenta ${cuenta == 1 ? 'cambio' : 'cambios'} sin enviar',
    ].join(', ');

    return Semantics(
      button: true,
      label: etiqueta,
      child: Tooltip(
        message: etiqueta,
        child: InkResponse(
          onTap: onTap,
          radius: 24,
          child: SizedBox(
            width: AppSpacing.tapTargetMin,
            height: AppSpacing.tapTargetMin,
            child: Center(
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: tono.bg,
                      shape: BoxShape.circle,
                      border: Border.all(color: tono.border),
                    ),
                    alignment: Alignment.center,
                    child: icono,
                  ),
                  if (cuenta > 0)
                    Positioned(
                      top: -6,
                      right: -8,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 20),
                        height: 20,
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        decoration: BoxDecoration(
                          color: tonoCuenta.fg,
                          borderRadius: BorderRadius.circular(10),
                          // El filo del color de la página separa la burbuja
                          // del círculo sin otra sombra.
                          border: Border.all(color: palette.surface, width: 2),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          cuenta > 99 ? '99+' : '$cuenta',
                          style: AppType.caption.copyWith(
                            color: palette.surface,
                            height: 1,
                            fontWeight: FontWeight.w700,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
