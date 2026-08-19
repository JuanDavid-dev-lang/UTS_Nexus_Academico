import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';

/// Providers de notas.

final consolidatedProvider =
    FutureProvider.family<List<ConsolidatedRow>, String?>((ref, subjectId) {
  final period = ref.watch(selectedPeriodProvider);
  return ref
      .watch(academicRepositoryProvider)
      .consolidated(period: period, subjectId: subjectId);
});

/// Lo que queda por calificar en el periodo seleccionado.
final pendingGradesProvider =
    FutureProvider.family<List<PendingSubject>, String?>((ref, subjectId) {
  final period = ref.watch(selectedPeriodProvider);
  return ref
      .watch(academicRepositoryProvider)
      .pendingGrades(period: period, subjectId: subjectId);
});
