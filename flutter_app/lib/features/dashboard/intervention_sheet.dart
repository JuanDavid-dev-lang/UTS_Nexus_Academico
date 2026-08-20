import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

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

const _accionesSeguimiento = <String, String>{
  'LLAMADA': 'Llamar al estudiante',
  'TUTORIA': 'Recomendar tutoría',
  'CHARLA': 'Charla personal',
  'OTRA': 'Otra acción',
};

class _InterventionSheetState extends ConsumerState<_InterventionSheet> {
  late String _estado = widget.risk.interventionStatus;
  late final _nota = TextEditingController(text: widget.risk.interventionNote);
  bool _guardando = false;

  /// Acompañamiento: episodios con apertura, recordatorio a las 24 h y cierre
  /// (BIEN o NEGADO). Lo trae el servidor con `huboNegado` y `progreso`.
  Map<String, dynamic>? _seg;
  bool _cargandoSeg = true;
  bool _accionando = false;
  String _accion = 'LLAMADA';
  final _notaSeg = TextEditingController();

  @override
  void initState() {
    super.initState();
    _cargarSeguimientos();
  }

  @override
  void dispose() {
    _nota.dispose();
    _notaSeg.dispose();
    super.dispose();
  }

  Future<void> _cargarSeguimientos() async {
    try {
      final datos = await ref.read(academicRepositoryProvider).seguimientos(
            studentId: widget.risk.studentId,
            subjectId: widget.risk.subjectId,
            period: ref.read(selectedPeriodProvider),
          );
      if (mounted) {
        setState(() {
          _seg = datos;
          _cargandoSeg = false;
        });
      }
    } catch (_) {
      // Sin el bloque de acompañamiento la hoja sigue sirviendo para anotar.
      if (mounted) setState(() => _cargandoSeg = false);
    }
  }

  Future<void> _abrirSeguimiento() async {
    // La advertencia del NEGADO anterior: reabrir es legítimo, pero tiene que
    // ser una decisión informada.
    if (_seg?['huboNegado'] == true) {
      final confirmado = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('¿Abrir de todas formas?'),
          content: const Text(
              'Este estudiante ya estuvo en acompañamiento pero fue negado. '
              '¿Deseas realizarlo de todas formas?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Sí, abrir'),
            ),
          ],
        ),
      );
      if (confirmado != true || !mounted) return;
    }

    setState(() => _accionando = true);
    try {
      await ref.read(academicRepositoryProvider).crearSeguimiento(
            studentId: widget.risk.studentId,
            subjectId: widget.risk.subjectId,
            period: ref.read(selectedPeriodProvider),
            accion: _accion,
            nota: _notaSeg.text.trim(),
          );
      _notaSeg.clear();
      await _cargarSeguimientos();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ApiError.from(error).message)),
      );
    } finally {
      if (mounted) setState(() => _accionando = false);
    }
  }

  Future<void> _cerrarSeguimiento(String id, String resultado) async {
    setState(() => _accionando = true);
    try {
      await ref.read(academicRepositoryProvider).cerrarSeguimiento(
            id,
            resultado: resultado,
            nota: _notaSeg.text.trim(),
          );
      _notaSeg.clear();
      await _cargarSeguimientos();
      ref.invalidate(risksProvider);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ApiError.from(error).message)),
      );
    } finally {
      if (mounted) setState(() => _accionando = false);
    }
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
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
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

            _bloqueAcompanamiento(muted),
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

  /// Episodios de acompañamiento: el abierto se actualiza (BIEN / NEGADO, con
  /// el progreso medido por el servidor); sin abierto, se ofrece abrir uno.
  Widget _bloqueAcompanamiento(Color muted) {
    if (_cargandoSeg) {
      return Text('Cargando acompañamiento…',
          style: AppType.caption.copyWith(color: muted));
    }
    final datos = _seg;
    if (datos == null) return const SizedBox.shrink();

    final episodios = ((datos['items'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final abiertos = episodios.where((e) => e['estado'] == 'EN_CURSO').toList();
    final abierto = abiertos.isEmpty ? null : abiertos.first;
    final progreso = datos['progreso']?.toString();
    final nivelActual = datos['nivelActual']?.toString() ?? '';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Acompañamiento', style: AppType.bodyStrong),
          const SizedBox(height: 6),

          for (final episodio in episodios.take(3))
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _accionesSeguimiento[episodio['accion']] ??
                          episodio['accion'].toString(),
                      style: AppType.caption,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  StatusPill(
                    episodio['estado'] == 'EN_CURSO'
                        ? 'En curso'
                        : episodio['estado'] == 'BIEN'
                            ? 'Fue bien'
                            : 'Negado',
                    kind: episodio['estado'] == 'BIEN'
                        ? SemanticKind.success
                        : episodio['estado'] == 'NEGADO'
                            ? SemanticKind.danger
                            : SemanticKind.info,
                  ),
                ],
              ),
            ),

          if (abierto != null) ...[
            if (progreso != null)
              Padding(
                padding: const EdgeInsets.only(top: 2, bottom: 6),
                child: Text(
                  progreso == 'MEJORA'
                      ? 'El riesgo va disminuyendo · hoy $nivelActual'
                      : progreso == 'EMPEORA'
                          ? 'El riesgo va aumentando · hoy $nivelActual'
                          : 'El riesgo sigue igual · hoy $nivelActual',
                  style: AppType.caption.copyWith(color: muted),
                ),
              ),
            TextField(
              controller: _notaSeg,
              decoration: const InputDecoration(
                labelText: '¿Cómo fue?',
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _accionando
                        ? null
                        : () => _cerrarSeguimiento(
                            abierto['_id'].toString(), 'NEGADO'),
                    child: const Text('Fue mal'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: _accionando
                        ? null
                        : () => _cerrarSeguimiento(
                            abierto['_id'].toString(), 'BIEN'),
                    child: const Text('Fue bien'),
                  ),
                ),
              ],
            ),
          ] else ...[
            DropdownButtonFormField<String>(
              initialValue: _accion,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Qué se va a hacer',
                isDense: true,
              ),
              items: [
                for (final entrada in _accionesSeguimiento.entries)
                  DropdownMenuItem(
                    value: entrada.key,
                    child:
                        Text(entrada.value, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (valor) => setState(() => _accion = valor ?? _accion),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _notaSeg,
              decoration: const InputDecoration(
                labelText: 'Contexto (opcional)',
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.tonal(
              onPressed: _accionando ? null : _abrirSeguimiento,
              child: _accionando
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Abrir seguimiento'),
            ),
            const SizedBox(height: 2),
            Text(
              'Mañana te llegará un recordatorio para registrar cómo fue.',
              style: AppType.caption.copyWith(color: muted),
            ),
          ],
        ],
      ),
    );
  }
}
