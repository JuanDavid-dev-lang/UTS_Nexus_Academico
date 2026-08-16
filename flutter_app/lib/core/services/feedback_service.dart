import 'api_client.dart';

/// Sugerencia o reporte de error sobre la plataforma, tal como lo ve su autor.
class FeedbackApp {
  final String id;
  final String tipo; // SUGERENCIA | ERROR
  final String mensaje;
  final String estado; // NUEVO | EN_REVISION | RESUELTO | DESCARTADO
  final DateTime? creadoEn;

  const FeedbackApp({
    required this.id,
    required this.tipo,
    required this.mensaje,
    required this.estado,
    required this.creadoEn,
  });

  factory FeedbackApp.fromJson(Map<String, dynamic> json) => FeedbackApp(
        id: (json['_id'] ?? '').toString(),
        tipo: (json['tipo'] ?? 'SUGERENCIA').toString(),
        mensaje: (json['mensaje'] ?? '').toString(),
        estado: (json['estado'] ?? 'NUEVO').toString(),
        creadoEn: DateTime.tryParse((json['createdAt'] ?? '').toString()),
      );
}

/// Buzón de sugerencias. Desde el teléfono solo se envía y se consulta lo
/// propio; la revisión es tarea del escritorio de la administración.
class FeedbackService {
  final ApiClient _api = ApiClient.instance;

  Future<List<FeedbackApp>> listar() async {
    final r = await _api.get('/feedback');
    final d = r.data;
    if (d is! Map) return const [];
    return ((d['items'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => FeedbackApp.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<void> enviar({required String tipo, required String mensaje}) async {
    await _api.post('/feedback', data: {
      'tipo': tipo,
      'mensaje': mensaje,
      'origen': 'MOBILE',
    });
  }
}
