import 'package:flutter_riverpod/flutter_riverpod.dart';

import './data/feedback_service.dart';

/// Providers del buzón de sugerencias.

final feedbackServiceProvider = Provider((ref) => FeedbackService());

/// Lo que este docente ha enviado al buzón (el servidor filtra por autor).
final feedbackProvider = FutureProvider<List<FeedbackApp>>((ref) {
  return ref.watch(feedbackServiceProvider).listar();
});
