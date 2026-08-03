import 'package:flutter/material.dart';

import '../../../core/services/update_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/version.dart';
import '../../../core/widgets/ui_kit.dart';

enum _Phase { checking, upToDate, available, downloading, unsupported, failed }

/// Tarjeta de actualización de la app.
///
/// Comprueba al abrir Ajustes y no interrumpe: si la consulta falla, la pantalla
/// lo dice y sigue siendo usable. La descarga entrega el APK al instalador del
/// sistema, que es quien pide la confirmación final al usuario.
class UpdateSection extends StatefulWidget {
  final UpdateService? service;
  const UpdateSection({super.key, this.service});

  @override
  State<UpdateSection> createState() => _UpdateSectionState();
}

class _UpdateSectionState extends State<UpdateSection> {
  late final UpdateService _service = widget.service ?? UpdateService();

  _Phase _phase = _Phase.checking;
  AppRelease? _release;
  String _installed = '';
  String? _error;
  int _received = 0;
  int _total = 0;

  @override
  void initState() {
    super.initState();
    _service.currentVersion().then((version) {
      if (mounted) setState(() => _installed = version);
    }).catchError((_) {
      if (mounted) setState(() => _installed = 'desconocida');
    });
    _check();
  }

  Future<void> _check() async {
    if (!_service.isSupported) {
      setState(() => _phase = _Phase.unsupported);
      return;
    }
    setState(() {
      _phase = _Phase.checking;
      _error = null;
    });
    try {
      final found = await _service.check();
      if (!mounted) return;
      setState(() {
        _release = found;
        _phase = found == null ? _Phase.upToDate : _Phase.available;
      });
    } on ApiUpdateException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _phase = _Phase.failed;
      });
    }
  }

  Future<void> _download() async {
    final release = _release;
    if (release == null) return;
    setState(() {
      _phase = _Phase.downloading;
      _received = 0;
      _total = release.sizeBytes;
      _error = null;
    });
    try {
      await _service.download(release, onProgress: (received, total) {
        if (!mounted) return;
        setState(() {
          _received = received;
          if (total > 0) _total = total;
        });
      });
      if (mounted) setState(() => _phase = _Phase.available);
    } on ApiUpdateException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _phase = _Phase.failed;
      });
    }
  }

  String _mb(int bytes) => '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.system_update_outlined, size: 20, color: muted),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Versión instalada ${nombreVersion(_installed)}',
                  style: AppType.body,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ..._statusContent(muted),
          const SizedBox(height: 14),
          if (_phase == _Phase.available && _release != null)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _download,
                icon: const Icon(Icons.download_outlined, size: 18),
                label: Text('Descargar ${_release!.version}'),
              ),
            )
          else
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _phase == _Phase.checking ||
                        _phase == _Phase.downloading ||
                        _phase == _Phase.unsupported
                    ? null
                    : _check,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Buscar actualizaciones'),
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _statusContent(Color muted) {
    switch (_phase) {
      case _Phase.unsupported:
        return [
          Text(
            'Las actualizaciones automáticas solo están disponibles en Android.',
            style: AppType.caption.copyWith(color: muted),
          ),
        ];

      case _Phase.checking:
        return [
          Row(
            children: [
              const SizedBox(
                height: 14,
                width: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 10),
              Text('Buscando una versión nueva…',
                  style: AppType.caption.copyWith(color: muted)),
            ],
          ),
        ];

      case _Phase.upToDate:
        return [
          Row(
            children: [
              Icon(Icons.check_circle_outline,
                  size: 18,
                  color: SemanticTone.of(context, SemanticKind.success).fg),
              const SizedBox(width: 8),
              Text('Ya tienes la última versión.', style: AppType.caption),
            ],
          ),
        ];

      case _Phase.available:
        return [
          StatusPill(
            '${nombreVersion(_release!.version)} disponible',
            kind: SemanticKind.info,
          ),
          if (_release!.notes.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(_release!.notes,
                style: AppType.caption.copyWith(color: muted)),
          ],
          if (_release!.sizeBytes > 0) ...[
            const SizedBox(height: 6),
            Text('Descarga de ${_mb(_release!.sizeBytes)}',
                style: AppType.caption.copyWith(color: muted)),
          ],
        ];

      case _Phase.downloading:
        final ratio = _total > 0 ? _received / _total : null;
        return [
          Text(
            'Descargando ${_mb(_received)}'
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
        ];

      case _Phase.failed:
        return [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline,
                  size: 18,
                  color: SemanticTone.of(context, SemanticKind.danger).fg),
              const SizedBox(width: 8),
              Expanded(
                child: Text(_error ?? 'No se pudo actualizar.',
                    style: AppType.caption),
              ),
            ],
          ),
        ];
    }
  }
}
