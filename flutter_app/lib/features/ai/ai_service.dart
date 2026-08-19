import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';

/// Un mensaje del chat del asistente académico.
class ChatMessage {
  final String role; // 'user' | 'assistant'
  final String content;
  final String? source; // 'ollama' | 'rules' | 'error'
  const ChatMessage({required this.role, required this.content, this.source});

  bool get isUser => role == 'user';

  Map<String, String> toApi() => {'role': role, 'content': content};
}

/// Estado del asistente de IA local (Ollama) reportado por /ai/status.
class AiStatus {
  final bool enabled;
  final bool available;
  final String? model;
  final bool modelReady;
  const AiStatus({
    required this.enabled,
    required this.available,
    this.model,
    this.modelReady = false,
  });

  factory AiStatus.fromJson(Map<String, dynamic> j) => AiStatus(
        enabled: j['enabled'] == true,
        available: j['available'] == true,
        model: j['model']?.toString(),
        modelReady: j['modelReady'] == true,
      );
}

/// Consulta si la IA local está activa y el modelo disponible.
final aiStatusProvider = FutureProvider.autoDispose<AiStatus>((ref) async {
  try {
    final res = await ApiClient.instance.get('/ai/status');
    return AiStatus.fromJson(Map<String, dynamic>.from(res.data as Map));
  } catch (_) {
    return const AiStatus(enabled: false, available: false);
  }
});

/// Estado del chat: lista de mensajes + si está esperando respuesta.
class ChatState {
  final List<ChatMessage> messages;
  final bool sending;
  const ChatState({this.messages = const [], this.sending = false});

  ChatState copyWith({List<ChatMessage>? messages, bool? sending}) => ChatState(
        messages: messages ?? this.messages,
        sending: sending ?? this.sending,
      );
}

class ChatController extends StateNotifier<ChatState> {
  ChatController() : super(const ChatState());

  void clear() => state = const ChatState();

  Future<void> send(String text, {String? subjectId, String? studentId}) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || state.sending) return;

    final userMsg = ChatMessage(role: 'user', content: trimmed);
    // Historial previo (sin el mensaje que acabamos de agregar) para el backend.
    final history = state.messages.map((m) => m.toApi()).toList();

    state = state.copyWith(
      messages: [...state.messages, userMsg],
      sending: true,
    );

    try {
      final res = await ApiClient.instance.post('/ai/chat', data: {
        'message': trimmed,
        if (subjectId != null) 'subjectId': subjectId,
        if (studentId != null) 'studentId': studentId,
        'history': history,
      });
      final data = Map<String, dynamic>.from(res.data as Map);
      final reply = ChatMessage(
        role: 'assistant',
        content: data['answer']?.toString() ?? '(sin respuesta)',
        source: data['source']?.toString(),
      );
      state = state.copyWith(messages: [...state.messages, reply], sending: false);
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      final msg = code == 403
          ? 'Este asistente es para docentes. Tu rol no tiene acceso.'
          : 'No se pudo obtener respuesta del asistente (${code ?? e.message}).';
      state = state.copyWith(
        messages: [
          ...state.messages,
          ChatMessage(role: 'assistant', content: '⚠️ $msg', source: 'error'),
        ],
        sending: false,
      );
    } catch (e) {
      state = state.copyWith(
        messages: [
          ...state.messages,
          ChatMessage(
              role: 'assistant', content: '⚠️ Error inesperado: $e', source: 'error'),
        ],
        sending: false,
      );
    }
  }
}

final chatControllerProvider =
    StateNotifierProvider.autoDispose<ChatController, ChatState>(
        (ref) => ChatController());
