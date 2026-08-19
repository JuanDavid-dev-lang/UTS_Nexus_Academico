import 'package:dio/dio.dart';

import '../network/api_client.dart';
import './models.dart';
import '../storage/offline_cache.dart';
import '../storage/offline_status.dart';

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

  /// Lee del servidor y, si no hay red, de lo último que sí llegó.
  ///
  /// Solo cubre LECTURAS. Una escritura no puede resolverse con lo cacheado: si
  /// una nota no llegó al servidor, no está puesta, y fingir que sí es peor que
  /// fallar. Que las escrituras esperen a tener red es una limitación conocida
  /// y declarada, no un descuido.
  Future<List<T>> _leerConCache<T>(
    String clave,
    Future<Response<dynamic>> Function() peticion,
    T Function(Map<String, dynamic>) parsear,
  ) async {
    try {
      final response = await peticion();
      final items = _items(response.data);
      await OfflineCache.save(clave, items);
      OfflineStatus.instance.marcarEnLinea();
      return items.map(parsear).toList();
    } catch (error) {
      final guardado = await OfflineCache.read(clave);
      // Sin nada guardado no se puede disimular: el error sube y la pantalla
      // muestra su estado de error, que es la verdad.
      if (guardado == null) rethrow;

      OfflineStatus.instance.marcarDesdeCache(guardado.guardadoEn);
      return (guardado.dato as List)
          .whereType<Map>()
          .map((e) => parsear(Map<String, dynamic>.from(e)))
          .toList();
    }
  }

  Future<List<Subject>> subjects() {
    return _leerConCache('subjects', () => _api.get('/subjects'), Subject.fromJson);
  }

  /// Estudiantes visibles.
  ///
  /// Con [subjectId] devuelve solo los matriculados en esa asignatura. El
  /// recorte lo hace el backend contra la matrícula: filtrar aquí una lista ya
  /// mezclada daría el conjunto equivocado en cuanto alguien repita materia.

  Future<List<Group>> groups() {
    return _leerConCache('groups', () => _api.get('/groups'), Group.fromJson);
  }

  Future<List<Student>> students({String? subjectId, String? groupId}) {
    return _leerConCache(
      'students.${subjectId ?? "todas"}.${groupId ?? "todos"}',
      () => _api.get('/students', query: {
        if (subjectId != null) 'subjectId': subjectId,
        if (groupId != null) 'groupId': groupId,
      }),
      Student.fromJson,
    );
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
  }) {
    return _leerConCache(
      'consolidado.$period.${subjectId ?? "todas"}',
      () => _api.get('/grades/consolidado', query: {
        'period': period,
        if (subjectId != null) 'subjectId': subjectId,
      }),
      ConsolidatedRow.fromJson,
    );
  }

  /// Lo que queda por calificar en el periodo, por materia y corte.
  ///
  /// Se cuenta sobre los matriculados: el estudiante sin ninguna nota es justo
  /// el que no puede quedar fuera de la cuenta.
  Future<List<PendingSubject>> pendingGrades({
    required String period,
    String? subjectId,
  }) async {
    final response = await _api.get('/grades/pendientes', query: {
      'period': period,
      if (subjectId != null) 'subjectId': subjectId,
    });
    return _items(response.data).map(PendingSubject.fromJson).toList();
  }

  Future<List<RiskItem>> risks() {
    return _leerConCache('risks', () => _api.get('/analytics/risks'), RiskItem.fromJson);
  }

  /// Anota qué se hizo con un estudiante en riesgo.
  ///
  /// Escribe sobre el mismo caso que usa la realimentación del modelo: qué
  /// predijo el sistema, qué hizo el docente y cómo terminó son tres partes de
  /// la misma historia.
  Future<void> saveIntervention({
    required String studentId,
    required String subjectId,
    required String period,
    required String estado,
    String nota = '',
  }) async {
    await _api.patch('/analytics/risks/intervencion', data: {
      'studentId': studentId,
      'subjectId': subjectId,
      'period': period,
      'estado': estado,
      'nota': nota,
    });
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

  /// Elimina una nota concreta.
  ///
  /// Quitar una nota recalcula el promedio de su componente y, con él, la nota
  /// del corte y la final: es una corrección, no un borrado cosmético.
  Future<void> deleteGrade(String id) async {
    await _api.delete('/grades/$id');
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

  /// Vista previa del reporte de asistencia: mismas filas que el PDF/Excel.
  Future<ReportPreview> previewAttendanceReport({
    required String period,
    String? subjectId,
  }) async {
    final response = await _api.get(
      '/reports/preview/attendance',
      query: {
        'period': period,
        if (subjectId != null) 'subjectId': subjectId,
      },
    );
    return ReportPreview.fromJson(response.data as Map<String, dynamic>);
  }

  Future<int> importStudents(List<Map<String, dynamic>> rows) async {
    final response = await _api.post('/students/bulk', data: rows);
    return _items(response.data).length;
  }
}
