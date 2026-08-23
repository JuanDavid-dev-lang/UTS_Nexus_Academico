import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/settings/data/update_service.dart';
import '../notifications/local_notifications_service.dart';
import '../theme/app_theme.dart';

/// Versión que el usuario ya pospuso. Se recuerda entre arranques.
const _clavePospuesta = 'uts.actualizacion.pospuesta';

/// Versión de la que ya se dejó una notificación en el cajón.
///
/// Separada de [_clavePospuesta] a propósito: posponer el diálogo no debe
/// borrar el aviso del cajón, y haber visto el aviso no debe contar como
/// haber pospuesto nada. Son dos hechos distintos sobre la misma versión.
const _claveNotificada = 'uts.actualizacion.notificada';

/// Deja que la primera pantalla se dibuje antes de taparla con un diálogo.
const _retrasoInicial = Duration(seconds: 4);

/// Envuelve la app y avisa de una versión nueva al arrancar.
///
/// Antes la comprobación vivía solo en Ajustes, así que quien no entraba ahí se
/// quedaba en una versión vieja indefinidamente — y una versión vieja puede ser
/// justo la que tiene el fallo que se acaba de corregir.
///
/// Interrumpe una vez y no insiste: «Más tarde» calla el aviso para esa versión
/// concreta, no para siempre. La siguiente que se publique vuelve a preguntar.
class UpdateGate extends StatefulWidget {
  final Widget child;

  /// Navigator raíz. El diálogo no puede colgar del contexto de este widget:
  /// el `builder` de `MaterialApp` queda por encima del Navigator del router.
  final GlobalKey<NavigatorState> navigatorKey;
  final UpdateService? service;

  const UpdateGate({
    super.key,
    required this.child,
    required this.navigatorKey,
    this.service,
  });

  @override
  State<UpdateGate> createState() => _UpdateGateState();
}

class _UpdateGateState extends State<UpdateGate> {
  late final UpdateService _service = widget.service ?? UpdateService();
  bool _preguntado = false;

  @override
  void initState() {
    super.initState();
    if (_service.isSupported) {
      Future<void>.delayed(_retrasoInicial, _buscar);
    }
  }

  Future<void> _buscar() async {
    if (!mounted || _preguntado) return;

    final AppRelease? disponible;
    try {
      disponible = await _service.check();
    } on ApiUpdateException {
      // Un fallo al comprobar no se le enseña a nadie: la app funciona igual y
      // la tarjeta de Ajustes sí explica el motivo a quien lo busque.
      return;
    }
    if (disponible == null || !mounted) return;

    final preferencias = await SharedPreferences.getInstance();

    // El aviso del sistema va ANTES de mirar si la versión está pospuesta y
    // antes del diálogo, y es deliberado.
    //
    // El diálogo solo existe mientras la aplicación está abierta y en primer
    // plano: quien la cierra durante los cuatro segundos de espera no ve nada,
    // y quien pulsó «Más tarde» no vuelve a enterarse de esa versión aunque
    // corrija el fallo que le está afectando. La notificación queda en el cajón
    // hasta que se lea.
    //
    // No insiste: la clave lleva la versión, así que cada versión avisa una
    // sola vez y Android reemplaza en vez de apilar.
    await _notificarVersion(disponible.version, preferencias);

    if (preferencias.getString(_clavePospuesta) == disponible.version) return;
    if (!mounted) return;

    final navegador = widget.navigatorKey.currentContext;
    if (navegador == null || !navegador.mounted) return;

    _preguntado = true;
    final actualizar = await showDialog<bool>(
      context: navegador,
      // La descarga en curso no debe cancelarse tocando fuera del diálogo.
      barrierDismissible: false,
      builder: (_) => _UpdateDialog(release: disponible!, service: _service),
    );

    if (actualizar == false) {
      await preferencias.setString(_clavePospuesta, disponible.version);
    }
  }

  /// Deja la versión disponible en el cajón de notificaciones, una sola vez.
  ///
  /// Va al canal «Sistema», que es de importancia baja: aparece en el cajón sin
  /// sonido ni interrupción. Una versión nueva no es urgente, y tratarla como
  /// si lo fuera enseña a la gente a ignorar el canal que sí lo es.
  Future<void> _notificarVersion(String version, SharedPreferences preferencias) async {
    if (preferencias.getString(_claveNotificada) == version) return;

    // Sin permiso no se muestra nada, y este no es momento de pedirlo: la
    // petición pertenece a Ajustes, donde la persona sabe qué está aceptando.
    if (!await LocalNotificationsService.instance.permisosConcedidos) return;

    await LocalNotificationsService.instance.mostrarAhora(
      clave: 'update:$version',
      titulo: 'Actualización disponible',
      mensaje: 'La versión $version está lista para instalarse desde Ajustes.',
      canalId: 'uts_sistema',
      ruta: '/settings',
    );
    await preferencias.setString(_claveNotificada, version);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Diálogo de una versión concreta: qué trae, cuánto pesa y la descarga.
class _UpdateDialog extends StatefulWidget {
  final AppRelease release;
  final UpdateService service;

  const _UpdateDialog({required this.release, required this.service});

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  bool _descargando = false;
  int _recibidos = 0;
  int _total = 0;
  String? _error;

  String _mb(int bytes) => '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';

  Future<void> _descargar() async {
    setState(() {
      _descargando = true;
      _recibidos = 0;
      _total = widget.release.sizeBytes;
      _error = null;
    });
    try {
      await widget.service.download(widget.release, onProgress: (recibidos, total) {
        if (!mounted) return;
        setState(() {
          _recibidos = recibidos;
          if (total > 0) _total = total;
        });
      });
      // El instalador de Android toma el relevo; el diálogo ya no pinta nada.
      if (mounted) Navigator.of(context).pop(true);
    } on ApiUpdateException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _descargando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final ratio = _total > 0 ? _recibidos / _total : null;

    return AlertDialog(
      title: Text('Versión ${widget.release.version} disponible', style: AppType.h3),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tienes instalada la ${widget.release.currentVersion}.',
            style: AppType.caption.copyWith(color: muted),
          ),
          if (widget.release.notes.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 160),
              child: SingleChildScrollView(
                child: Text(widget.release.notes.trim(), style: AppType.caption),
              ),
            ),
          ],
          if (widget.release.sizeBytes > 0 && !_descargando) ...[
            const SizedBox(height: 10),
            Text('Descarga de ${_mb(widget.release.sizeBytes)}',
                style: AppType.caption.copyWith(color: muted)),
          ],
          if (_descargando) ...[
            const SizedBox(height: 14),
            Text(
              'Descargando ${_mb(_recibidos)}'
              '${_total > 0 ? ' de ${_mb(_total)}' : ''}',
              style: AppType.caption.copyWith(color: muted),
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(value: ratio, minHeight: 6),
            ),
            const SizedBox(height: 6),
            Text('No cierres la aplicación.',
                style: AppType.caption.copyWith(color: muted)),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!,
                style: AppType.caption.copyWith(
                  color: SemanticTone.of(context, SemanticKind.danger).fg,
                )),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _descargando ? null : () => Navigator.of(context).pop(false),
          child: const Text('Más tarde'),
        ),
        FilledButton.icon(
          onPressed: _descargando ? null : _descargar,
          icon: const Icon(Icons.download_outlined, size: 18),
          label: const Text('Actualizar ahora'),
        ),
      ],
    );
  }
}
