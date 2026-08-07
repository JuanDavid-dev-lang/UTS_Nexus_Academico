import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';

/// Qué se hizo con un estudiante en riesgo.
///
/// El motor ya decía quién estaba en riesgo y por qué; lo que faltaba era dónde
/// anotar la respuesta. Sin eso la lista repetía los mismos nombres cada semana
/// y no distinguía el caso recién detectado del que llevas un mes siguiendo.

const interventionLabels = <String, String>{
  'PENDIENTE': 'Pendiente',
  'CONTACTADO': 'Contactado',
  'CITA_ACORDADA': 'Cita acordada',
  'NO_RESPONDE': 'No responde',
  'RESUELTO': 'Resuelto',
};

/// `NO_RESPONDE` va en peligro y no en advertencia: es el único estado que
/// significa que el camino habitual ya falló.
SemanticKind interventionKind(String estado) => switch (estado) {
      'RESUELTO' => SemanticKind.success,
      'NO_RESPONDE' => SemanticKind.danger,
      'CONTACTADO' || 'CITA_ACORDADA' => SemanticKind.info,
      _ => SemanticKind.warning,
    };

Future<void> showInterventionSheet(BuildContext context, RiskItem risk) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _InterventionSheet(risk: risk),
  );
}

class _InterventionSheet extends ConsumerStatefulWidget {
  final RiskItem risk;
  const _InterventionSheet({required this.risk});

  @override
  ConsumerState<_InterventionSheet> createState() => _InterventionSheetState();
}

class _InterventionSheetState extends ConsumerState<_InterventionSheet> {
  late String _estado = widget.risk.interventionStatus;
  late final _nota = TextEditingController(text: widget.risk.interventionNote);
  bool _guardando = false;

  @override
  void dispose() {
    _nota.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    setState(() => _guardando = true);
    try {
      await ref.read(academicRepositoryProvider).saveIntervention(
            studentId: widget.risk.studentId,
            subjectId: widget.risk.subjectId,
            period: ref.read(selectedPeriodProvider),
            estado: _estado,
            nota: _nota.text.trim(),
          );
      ref.invalidate(risksProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      setState(() => _guardando = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ApiError.from(error).message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Seguimiento', style: AppType.h3),
            const SizedBox(height: 2),
            Text(widget.risk.fullName,
                style: AppType.caption.copyWith(color: muted)),
            const SizedBox(height: 14),

            for (final motivo in widget.risk.reasons)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('· $motivo',
                    style: AppType.caption.copyWith(color: muted)),
              ),
            const SizedBox(height: 14),

            // `RadioGroup` en vez de `groupValue` en cada tile: es la forma
            // vigente desde Flutter 3.32 y la anterior está en retirada.
            RadioGroup<String>(
              groupValue: _estado,
              onChanged: (valor) => setState(() => _estado = valor ?? _estado),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final entrada in interventionLabels.entries)
                    RadioListTile<String>(
                      value: entrada.key,
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(entrada.value, style: AppType.body),
                    ),
                ],
              ),
            ),

            const SizedBox(height: 10),
            TextField(
              controller: _nota,
              minLines: 2,
              maxLines: 4,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Nota',
                hintText:
                    'Qué se acordó, cuándo, con quién. Lo lee tu yo de dentro de un mes.',
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _guardando ? null : _guardar,
              child: _guardando
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Guardar seguimiento'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
