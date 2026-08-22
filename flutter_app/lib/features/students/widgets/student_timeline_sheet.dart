import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/providers.dart';
import '../../../core/network/api_error.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/compact.dart';
import '../../../core/widgets/ui_kit.dart';
import '../../activities/data/activity_models.dart';

/// Historial cronológico de un estudiante.
///
/// La unión de matrículas, notas, ausencias, alertas, patrones, actividades y
/// cierres la hace el **backend**. Este panel pinta lo que llega en el orden en
/// que llega: no cruza colecciones ni reordena. Si lo hiciera, el teléfono y el
/// escritorio contarían dos historias distintas del mismo estudiante y no
/// habría forma de saber cuál es la buena.
Future<void> showStudentTimelineSheet(
  BuildContext context, {
  required String studentId,
  required String nombre,
}) {
  return showCompactSheet<void>(
    context: context,
    titulo: 'Historial de $nombre',
    subtitulo: 'Matrículas, notas, ausencias, alertas y cierres, en orden.',
    constructor: (_) => _Historial(studentId: studentId),
  );
}

class _Historial extends ConsumerStatefulWidget {
  final String studentId;
  const _Historial({required this.studentId});

  @override
  ConsumerState<_Historial> createState() => _HistorialState();
}

class _HistorialState extends ConsumerState<_Historial> {
  String? _tipo;

  @override
  Widget build(BuildContext context) {
    final historial = ref.watch(seguimientoEstudianteProvider(widget.studentId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Filtro por tipo. Es local a este panel y no un provider: al cerrarlo
        // el filtro debe desaparecer, no sobrevivir a la siguiente ficha.
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              FilterChipCompact(
                etiqueta: 'Todo',
                activo: _tipo == null,
                onTap: () => setState(() => _tipo = null),
              ),
              for (final entrada in etiquetaDeEvento.entries) ...[
                const SizedBox(width: AppSpacing.gapSm),
                FilterChipCompact(
                  etiqueta: entrada.value,
                  activo: _tipo == entrada.key,
                  onTap: () => setState(
                    () => _tipo = _tipo == entrada.key ? null : entrada.key,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.gap),

        historial.when(
          loading: () => const SkeletonRows(filas: 5),
          error: (error, _) => StateView.error(
            ApiError.from(error).message,
            action: FilledButton(
              onPressed: () => ref.invalidate(seguimientoEstudianteProvider(widget.studentId)),
              child: const Text('Reintentar'),
            ),
          ),
          data: (expediente) {
            final eventos = expediente.timeline;
            // El filtrado por tipo es presentación pura sobre una lista que ya
            // viene ordenada del servidor: no altera el orden.
            final visibles = _tipo == null
                ? eventos
                : eventos.where((e) => e.type == _tipo).toList();

            if (visibles.isEmpty) {
              return const CompactEmpty(
                icono: Icons.history_outlined,
                mensaje:
                    'Sin hechos registrados. Cuando haya matrículas, notas, '
                    'ausencias o alertas, aparecerán aquí en orden.',
              );
            }

            // Agrupación por día, también presentación.
            final porDia = <String, List<TimelineEvent>>{};
            for (final evento in visibles) {
              final clave = _dia(evento.occurredAt);
              porDia.putIfAbsent(clave, () => []).add(evento);
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (expediente.academic.isNotEmpty) ...[
                  CompactSectionHeader('Situación actual'),
                  for (final registro in expediente.academic)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.gapSm),
                      child: AcademicRow(
                        titulo: registro.subjectName,
                        metadatos: [
                          '${registro.period} · Promedio ${registro.currentGrade.toStringAsFixed(2)}',
                          'Asistencia ${registro.attendancePercentage.toStringAsFixed(0)}%',
                          ...registro.reasons,
                        ],
                        acento: registro.riskLevel == 'ALTO' ? SemanticKind.danger : registro.riskLevel == 'MEDIO' ? SemanticKind.warning : SemanticKind.success,
                        estado: StatusPill(registro.riskLevel, kind: registro.riskLevel == 'ALTO' ? SemanticKind.danger : registro.riskLevel == 'MEDIO' ? SemanticKind.warning : SemanticKind.success),
                      ),
                    ),
                  if (expediente.hasOpenFollowUp)
                    const Padding(
                      padding: EdgeInsets.only(bottom: AppSpacing.gap),
                      child: StatusPill('Seguimiento en curso', kind: SemanticKind.warning),
                    ),
                ],
                for (final entrada in porDia.entries) ...[
                  CompactSectionHeader(entrada.key),
                  for (final evento in entrada.value)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.gapSm),
                      child: AcademicRow(
                        titulo: evento.title,
                        metadatos: [
                          if (evento.subjectName != null) evento.subjectName!,
                          evento.summary,
                        ],
                        acento: _acentoDe(evento.type),
                        estado: StatusPill(
                          etiquetaDeEvento[evento.type] ?? evento.type,
                          kind: _acentoDe(evento.type) ?? SemanticKind.info,
                        ),
                      ),
                    ),
                  const SizedBox(height: AppSpacing.gapXs),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

/// Significado de cada tipo de hecho. Solo elige el par (texto, fondo); el
/// hecho en sí ya viene clasificado del servidor.
SemanticKind? _acentoDe(String tipo) => switch (tipo) {
      'ALERTA_RIESGO' || 'PATRON_ASISTENCIA' => SemanticKind.danger,
      'ASISTENCIA' => SemanticKind.warning,
      'INTERVENCION' => SemanticKind.success,
      'MATRICULA' || 'CIERRE_PERIODO' => SemanticKind.info,
      _ => null,
    };

String _dia(DateTime? fecha) {
  if (fecha == null) return 'Sin fecha';
  final dia = fecha.day.toString().padLeft(2, '0');
  final mes = fecha.month.toString().padLeft(2, '0');
  return '$dia/$mes/${fecha.year}';
}
