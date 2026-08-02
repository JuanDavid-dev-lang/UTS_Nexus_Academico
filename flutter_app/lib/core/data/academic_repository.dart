import 'package:dio/dio.dart';

import '../services/api_client.dart';
import 'models.dart';

/// Acceso a la API académica.
///
/// Un solo sitio donde vive el conocimiento de las rutas y las formas de
/// respuesta. Antes cada pantalla llamaba a `ApiClient` por su cuenta y repetía
/// el mismo `(response.data as Map)['items'] as List`.
class AcademicRepository {
  final ApiClient _api = ApiClient.instance;

  List<Map<String, dynamic>> _items(Object? data) {
    if (data is! Map) return const [];
    final items = data['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<List<Subject>> subjects() async {
    final response = await _api.get('/subjects');
    return _items(response.data).map(Subject.fromJson).toList();
  }

  /// Estudiantes visibles.
  ///
  /// Con [subjectId] devuelve solo los matriculados en esa asignatura. El
  /// recorte lo hace el backend contra la matrícula: filtrar aquí una lista ya
  /// mezclada daría el conjunto equivocado en cuanto alguien repita materia.

  Future<List<Group>> groups() async {
    final response = await _api.get('/groups');
    return _items(response.data).map(Group.fromJson).toList();
  }

  Future<List<Student>> students({String? subjectId, String? groupId}) async {
    final response = await _api.get('/students', query: {
      if (subjectId != null) 'subjectId': subjectId,
      if (groupId != null) 'groupId': groupId,
    });
    return _items(response.data).map(Student.fromJson).toList();
  }

  /// Directorio global por nombre o cédula. Devuelve solo identidad, sin notas.
  Future<List<Student>> searchStudents(String term) async {
    if (term.trim().length < 3) return const [];
    final response =
        await _api.get('/students/search', query: {'q': term.trim()});
    return _items(response.data).map(Student.fromJson).toList();
  }

  Future<List<Enrollment>> enrollments({String? subjectId, String? period}) async {
    final response = await _api.get('/enrollments', query: {
      if (subjectId != null) 'subjectId': subjectId,
      if (period != null) 'period': period,
    });
    return _items(response.data).map(Enrollment.fromJson).toList();
  }

  Future<List<ConsolidatedRow>> consolidated({
    required String period,
    String? subjectId,
  }) async {
    final response = await _api.get('/grades/consolidado', query: {
      'period': period,
      if (subjectId != null) 'subjectId': subjectId,
    });
    return _items(response.data).map(ConsolidatedRow.fromJson).toList();
  }

  Future<List<RiskItem>> risks() async {
    final response = await _api.get('/analytics/risks');
    return _items(response.data).map(RiskItem.fromJson).toList();
  }

  Future<List<AppNotification>> notifications() async {
    final response = await _api.get('/notifications');
    return _items(response.data).map(AppNotification.fromJson).toList();
  }

  Future<void> markNotificationRead(String id) async {
    await _api.patch('/notifications/$id/read');
  }

  Future<Map<String, dynamic>> scanRisks({String? period}) async {
    final response = await _api.post('/notifications/risks/scan',
        data: {if (period != null) 'period': period});
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<List<Map<String, dynamic>>> attendance({
    String? subjectId,
    String? period,
  }) async {
    final response = await _api.get('/attendance', query: {
      if (subjectId != null) 'subjectId': subjectId,
      if (period != null) 'period': period,
    });
    return _items(response.data);
  }

  Future<void> markAttendance({
    required String studentId,
    required String subjectId,
    required String teacherId,
    required String period,
    required DateTime date,
    required bool present,
  }) async {
    await _api.post('/attendance', data: {
      'studentId': studentId,
      'subjectId': subjectId,
      'teacherId': teacherId,
      'period': period,
      'date': date.toIso8601String(),
      'present': present,
    });
  }

  Future<void> saveGrade({
    required String studentId,
    required String subjectId,
    required String teacherId,
    required int cut,
    required String componentType,
    required String label,
    required double score,
    required String period,
  }) async {
    await _api.post('/grades', data: {
      'studentId': studentId,
      'subjectId': subjectId,
      'teacherId': teacherId,
      'corte': cut,
      'componentType': componentType,
      'label': label,
      'score': score,
      'period': period,
    });
  }

  /// Descarga un reporte como bytes.
  ///
  /// La versión anterior pedía el archivo y descartaba la respuesta, mostrando
  /// "Generado en backend". El reporte se generaba de verdad… y se perdía. Aquí
  /// se devuelven los bytes para que el llamador los guarde.
  Future<List<int>> downloadReport({
    required String format, // 'pdf' | 'excel'
    required String kind, // 'consolidado' | 'grades' | 'attendance' | 'combined'
    required String period,
    String? subjectId,
  }) async {
    final response = await _api.dio.get<List<int>>(
      '/reports/$format/$kind',
      queryParameters: {
        'period': period,
        if (subjectId != null) 'subjectId': subjectId,
      },
      options: Options(
        responseType: ResponseType.bytes,
        // Los reportes tardan más que una consulta normal.
        receiveTimeout: const Duration(seconds: 90),
      ),
    );
    return response.data ?? const [];
  }

  Future<int> importStudents(List<Map<String, dynamic>> rows) async {
    final response = await _api.post('/students/bulk', data: rows);
    return _items(response.data).length;
  }
}
