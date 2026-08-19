import '../../../core/network/api_client.dart';
import './activity_models.dart';

/// Acceso HTTP a actividades, periodos, casos de inasistencia e historial.
///
/// Delgado a propósito: traduce argumentos al contrato del endpoint y devuelve
/// modelos. Un cálculo aquí sería una segunda fuente de verdad compitiendo con
/// el backend, que es exactamente lo que la regla de oro del proyecto prohíbe.
class ActivityRepository {
  final ApiClient _api = ApiClient.instance;

  List<Map<String, dynamic>> _items(Object? data) {
    if (data is! Map) return const [];
    final items = data['items'];
    if (items is! List) return const [];
    return items.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  // ── Actividades ───────────────────────────────────────────────────────

  Future<List<Activity>> actividades({
    String? subjectId,
    String? period,
    String? estado,
  }) async {
    final response = await _api.get('/activities', query: {
      if (subjectId != null) 'subjectId': subjectId,
      if (period != null) 'period': period,
      if (estado != null) 'estado': estado,
    });
    return _items(response.data).map(Activity.fromJson).toList();
  }

  Future<Activity> crearActividad({
    required String title,
    required String subjectId,
    required DateTime dueAt,
    String description = '',
    String? groupId,
    String? period,
    double weight = 0,
    String? attachmentUrl,
  }) async {
    final response = await _api.post('/activities', data: {
      'title': title,
      'description': description,
      'subjectId': subjectId,
      'dueAt': dueAt.toUtc().toIso8601String(),
      'weight': weight,
      if (groupId != null) 'groupId': groupId,
      if (period != null && period.isNotEmpty) 'period': period,
      // Una cadena vacía no es una URL: el backend la rechazaría con un 400
      // sobre un campo que el docente ni siquiera rellenó.
      if (attachmentUrl != null && attachmentUrl.isNotEmpty)
        'attachmentUrl': attachmentUrl,
    });
    return Activity.fromJson(
      Map<String, dynamic>.from((response.data as Map)['item'] as Map),
    );
  }

  Future<Activity> editarActividad(
    String id, {
    String? title,
    String? description,
    DateTime? dueAt,
    double? weight,
  }) async {
    final response = await _api.patch('/activities/$id', data: {
      if (title != null) 'title': title,
      if (description != null) 'description': description,
      if (dueAt != null) 'dueAt': dueAt.toUtc().toIso8601String(),
      if (weight != null) 'weight': weight,
    });
    return Activity.fromJson(
      Map<String, dynamic>.from((response.data as Map)['item'] as Map),
    );
  }

  /// Cierra o reabre. La reapertura la niega el backend a un docente: deshacer
  /// un cierre pasada la fecha cambia lo que se le puede exigir a un estudiante.
  Future<Activity> cambiarEstado(String id, {required bool abrir}) async {
    final response = await _api.post(
      '/activities/$id/${abrir ? 'reapertura' : 'cierre'}',
    );
    return Activity.fromJson(
      Map<String, dynamic>.from((response.data as Map)['item'] as Map),
    );
  }

  Future<void> eliminarActividad(String id) async {
    await _api.delete('/activities/$id');
  }

  // ── Periodos ──────────────────────────────────────────────────────────

  Future<List<AcademicPeriod>> periodos() async {
    final response = await _api.get('/periods');
    return _items(response.data).map(AcademicPeriod.fromJson).toList();
  }

  // ── Casos de inasistencia ─────────────────────────────────────────────

  Future<List<AttendanceCase>> casos({
    String? studentId,
    String? subjectId,
    String? period,
    String? estado,
  }) async {
    final response = await _api.get('/attendance/casos', query: {
      if (studentId != null) 'studentId': studentId,
      if (subjectId != null) 'subjectId': subjectId,
      if (period != null) 'period': period,
      if (estado != null) 'status': estado,
    });
    return _items(response.data).map(AttendanceCase.fromJson).toList();
  }

  Future<void> intervenirCaso(
    String id, {
    required String nota,
    String estado = 'EN_SEGUIMIENTO',
  }) async {
    await _api.post(
      '/attendance/casos/$id/intervencion',
      data: {'nota': nota, 'estado': estado},
    );
  }

  // ── Historial del estudiante ──────────────────────────────────────────

  /// Línea de tiempo académica.
  ///
  /// La unión de las seis colecciones y su orden los hace el servidor. El
  /// teléfono no cruza nada: si lo hiciera, mostraría una historia distinta de
  /// la del escritorio para el mismo estudiante.
  Future<List<TimelineEvent>> historial(
    String studentId, {
    String? period,
    List<String>? tipos,
  }) async {
    final response = await _api.get('/students/$studentId/historial', query: {
      if (period != null) 'period': period,
      if (tipos != null && tipos.isNotEmpty) 'tipos': tipos.join(','),
    });
    return _items(response.data).map(TimelineEvent.fromJson).toList();
  }
}
