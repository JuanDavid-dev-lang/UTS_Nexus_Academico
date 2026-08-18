import 'package:flutter_riverpod/flutter_riverpod.dart';

import './data/thesis_service.dart';

/// Providers de trabajos de grado.

final thesisServiceProvider = Provider((ref) => ThesisService());

/// Formatos oficiales, opcionalmente filtrados por etapa (null = todas).
final thesisFormatsProvider =
    FutureProvider.family<List<FormatoTrabajoGrado>, String?>((ref, etapa) {
  return ref.watch(thesisServiceProvider).listar(etapa: etapa);
});
