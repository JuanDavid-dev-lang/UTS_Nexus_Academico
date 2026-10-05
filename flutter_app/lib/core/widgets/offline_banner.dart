import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/offline_status.dart';
import '../network/realtime_service.dart';
import '../sync/outbox_service.dart';
import '../theme/app_theme.dart';
import './outbox_sheet.dart';

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
/// El verde va en tono apagado y en una franja fina, y además **se retira
/// solo**: es la situación normal, y una franja que confirma lo normal de
/// forma permanente es ruido. Aparece unos segundos al conectar (o reconectar)
/// y se pliega. Los otros dos estados sí se quedan, porque cambian lo que se
/// puede hacer con lo que hay en pantalla.
class OfflineBanner extends ConsumerStatefulWidget {
  const OfflineBanner({super.key});

  @override
  ConsumerState<OfflineBanner> createState() => _OfflineBannerState();
}

class _OfflineBannerState extends ConsumerState<OfflineBanner> {
  Timer? _reloj;

  /// Cierre programado de la franja verde. Solo del verde: los estados de
  /// aviso no se cierran solos, porque el docente tiene que saberlos mientras
  /// duren.
  Timer? _cierreVerde;
  bool _verdeVisible = true;
  SemanticKind? _ultimoKind;

  /// Gracia antes de avisar de un problema del tiempo real. Volver de segundo
  /// plano, arrancar o renovar el token pasa siempre por «desconectado» y
  /// «conectando» durante el handshake (medio segundo a tres por el túnel):
  /// avisarlo cada vez enseñaba a ignorar la franja.
  Timer? _gracia;
  bool _graciaVencida = false;
  DateTime? _ultimaSyncProcesada;

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
    _cierreVerde?.cancel();
    _gracia?.cancel();
    super.dispose();
  }

  /// Arranca la gracia al aparecer el problema y la anula al resolverse. Se
  /// decide en el build, como el cierre del verde: el estado ya llegó.
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

  @override
  Widget build(BuildContext context) {
    final bandeja = ref.watch(outboxProvider).valueOrNull;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _franjaDeConexion(context),
        // La bandeja de salida va aparte de la conexión: se puede tener red y
        // cambios sin enviar (un envío rechazado), o no tener red y no tener
        // nada pendiente. Son dos hechos y cada uno tiene su franja.
        if (bandeja != null && !bandeja.vacia) _FranjaBandeja(datos: bandeja),
      ],
    );
  }

  Widget _franjaDeConexion(BuildContext context) {
    final datos = ref.watch(offlineStatusProvider).valueOrNull;
    final realtime = ref.watch(realtimeStatusProvider).valueOrNull;

    final sinDatos = datos?.desdeCache != null;
    final problemaTiempoReal =
        realtime != null && realtime != RealtimeStatus.connected;
    _vigilarGracia(problemaTiempoReal);
    final avisar = problemaTiempoReal && _graciaVencida;
    final reconectando =
        avisar &&
        (realtime == RealtimeStatus.connecting ||
            realtime == RealtimeStatus.disconnected);
    final error =
        (avisar &&
            (realtime == RealtimeStatus.error ||
                realtime == RealtimeStatus.unauthorized)) ||
        sinDatos;

    // Antes de la primera lectura no se afirma nada: decir "sin conexión"
    // mientras todavía se está pidiendo sería mentir en el arranque.
    if (datos == null && realtime == null) return const SizedBox.shrink();

    final ahora = DateTime.now();
    final sincReciente =
        datos?.ultimaSincronizacion != null &&
        ahora.difference(datos!.ultimaSincronizacion!).inSeconds < 5;

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
        sincReciente
            ? 'Datos actualizados en tiempo real'
            : 'Sincronizado · ${haceCuanto(datos?.ultimaSincronizacion)}',
      ),
    };

    // Si la sincronización cambia (se recibe una nueva fecha), forzamos
    // mostrar el banner de éxito verde y reiniciamos el temporizador de cierre.
    if (datos?.ultimaSincronizacion != null &&
        datos?.ultimaSincronizacion != _ultimaSyncProcesada) {
      final eraPrimeraCarga = _ultimaSyncProcesada == null;
      _ultimaSyncProcesada = datos?.ultimaSincronizacion;

      // Solo mostramos el banner en la primera carga si es extremadamente reciente.
      // En las siguientes cargas dinámicas, siempre se despliega para dar feedback.
      if (kind == SemanticKind.success && (!eraPrimeraCarga || sincReciente)) {
        _verdeVisible = true;
        _cierreVerde?.cancel();
        _cierreVerde = Timer(const Duration(seconds: 4), () {
          if (mounted) setState(() => _verdeVisible = false);
        });
      }
    }

    // El verde se programa para cerrarse; cualquier otro estado lo reabre.
    // Se decide aquí y no con setState: si el estado acaba de cambiar, este
    // build ya está pintando lo correcto.
    if (kind != _ultimoKind) {
      _ultimoKind = kind;
      _cierreVerde?.cancel();
      if (kind == SemanticKind.success) {
        _verdeVisible = true;
        _cierreVerde = Timer(const Duration(seconds: 4), () {
          if (mounted) setState(() => _verdeVisible = false);
        });
      }
    }

    final tono = SemanticTone.of(context, kind);
    final normal = kind == SemanticKind.success;
    final oculto = normal && !_verdeVisible;

    // Sin SafeArea: el alto de la barra de estado lo descuenta el AppScaffold
    // una sola vez para toda la columna. Ponerlo aquí lo cobraba dos veces.
    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      alignment: Alignment.topCenter,
      child: oculto
          ? const SizedBox(width: double.infinity)
          : Material(
              color: tono.bg,
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: normal ? 4 : 8,
                ),
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

/// Franja de lo que espera salir del teléfono. Tocarla abre la lista.
class _FranjaBandeja extends StatelessWidget {
  final OutboxSnapshot datos;
  const _FranjaBandeja({required this.datos});

  @override
  Widget build(BuildContext context) {
    final fallidas = datos.fallidas;
    final pendientes = datos.pendientes;
    final (kind, icono, texto) = fallidas > 0
        ? (
            SemanticKind.danger,
            Icons.error_outline,
            fallidas == 1
                ? '1 cambio no se pudo enviar'
                : '$fallidas cambios no se pudieron enviar',
          )
        : datos.drenando
        ? (SemanticKind.info, Icons.sync_outlined, 'Enviando $pendientes…')
        : (
            SemanticKind.warning,
            Icons.cloud_upload_outlined,
            pendientes == 1
                ? '1 cambio sin enviar'
                : '$pendientes cambios sin enviar',
          );
    final tono = SemanticTone.of(context, kind);

    return Material(
      color: tono.bg,
      child: InkWell(
        onTap: () => mostrarBandejaDeSalida(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Icon(icono, size: 16, color: tono.fg),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  texto,
                  style: AppType.caption.copyWith(color: tono.fg),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Icon(Icons.chevron_right, size: 16, color: tono.fg),
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
