import 'package:flutter/material.dart';

import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import 'roster_parser.dart';

class RosterImportSheet extends StatefulWidget {
  final Future<int> Function(List<Map<String, dynamic>> rows) importRows;
  final void Function(int count) onImported;

  const RosterImportSheet({
    super.key,
    required this.importRows,
    required this.onImported,
  });

  @override
  State<RosterImportSheet> createState() => _RosterImportSheetState();
}

class _RosterImportSheetState extends State<RosterImportSheet> {
  final _controller = TextEditingController();
  RosterParseResult? _proposal;
  String? _importError;
  var _importing = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _textChanged(String _) {
    if (_proposal == null && _importError == null) return;
    setState(() {
      _proposal = null;
      _importError = null;
    });
  }

  Future<void> _submit() async {
    if (_proposal == null) {
      setState(() {
        _proposal = parseRoster(_controller.text);
        _importError = null;
      });
      return;
    }
    if (_proposal!.rows.isEmpty) return;

    setState(() {
      _importing = true;
      _importError = null;
    });
    final rowsToImport = List<Map<String, dynamic>>.unmodifiable(
      _proposal!.rows.map(Map<String, dynamic>.unmodifiable),
    );
    try {
      final count = await widget.importRows(rowsToImport);
      if (!mounted) return;
      if (count <= 0) {
        setState(() {
          _importing = false;
          _importError =
              'El servidor no confirmó registros importados. La propuesta se conserva para revisar o reintentar.';
        });
        return;
      }
      widget.onImported(count);
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      final apiError = ApiError.from(error);
      setState(() {
        _importing = false;
        _importError = apiError.isRetryable
            ? '${apiError.message} No se pudo confirmar el resultado remoto; revisa la lista antes de reintentar.'
            : apiError.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.page + 4,
        right: AppSpacing.page + 4,
        bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpacing.page + 4,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Importar estudiantes',
            style: AppType.h3.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          const Text(
            'Pega una tabla CSV, separada por coma, punto y coma o tabulación. '
            'El correo es opcional. Primero revisarás la propuesta; nada se guarda automáticamente.',
            style: AppType.caption,
          ),
          const SizedBox(height: 14),
          TextField(
            key: const Key('roster-input'),
            controller: _controller,
            enabled: !_importing,
            onChanged: _textChanged,
            minLines: 6,
            maxLines: 10,
            style: AppType.caption.copyWith(fontFamily: 'monospace'),
            decoration: const InputDecoration(
              hintText:
                  'cedula,nombres,correo,programa\n1098765432,Ana Rodríguez,ana@uts.edu.co,Sistemas',
            ),
          ),
          if (_proposal != null) ...[
            const SizedBox(height: 12),
            Text(
              '${_proposal!.rows.length} filas listas · ${_proposal!.errors.length} con errores · ${_proposal!.duplicates} duplicadas',
              key: const Key('roster-summary'),
              style: AppType.captionStrong,
            ),
            if (_proposal!.errors.isNotEmpty)
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 120),
                child: ListView(
                  shrinkWrap: true,
                  children: _proposal!.errors
                      .map(
                        (error) => Text(
                          'Línea ${error.line}: ${error.reason}',
                          style: AppType.caption,
                        ),
                      )
                      .toList(),
                ),
              ),
          ],
          if (_importError != null) ...[
            const SizedBox(height: 10),
            Text(
              _importError!,
              key: const Key('roster-import-error'),
              style: AppType.caption,
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('roster-submit'),
            onPressed: _importing ? null : _submit,
            child: _importing
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.4),
                  )
                : Text(
                    _proposal == null
                        ? 'Revisar propuesta'
                        : 'Confirmar importación',
                  ),
          ),
        ],
      ),
    );
  }
}
