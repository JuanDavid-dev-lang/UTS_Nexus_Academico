import 'package:dio/dio.dart';

import '../network/api_client.dart';
import './models.dart';
import '../storage/offline_cache.dart';
import '../storage/offline_status.dart';
import '../sync/outbox_logic.dart';
import '../sync/outbox_entry.dart';
import '../sync/outbox_service.dart';

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
  /// Solo cubre LECTURAS. Las escrituras sin red no se resuelven con lo
  /// cacheado: pasan por la bandeja de salida (`core/sync/`), que las guarda en
  /// disco y las envía sola cuando hay servidor. Lo que el docente ve entretanto
  /// es lo cacheado con sus cambios pendientes superpuestos y marcados.
  Future<List<T>> _leerConCache<T>(
    String clave,
    Future<Response<dynamic>> Function() peticion,
    T Function(Map<String, dynamic>) parsear,
  ) async {
    try {
      final response = await peticion();
      final items = _items(response.data);
      await OfflineCache.save(clave, items);
      if (!enPrecarga) OfflineStatus.instance.marcarEnLinea();
      return items.map(parsear).toList();
    } catch (error) {
      if (enPrecarga) rethrow;
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

  /// Crea una materia. El backend exige el docente dueño en el cuerpo.
  Future<Subject> createSubject({
    required String name,
    required String code,
    required String period,
    required String professorId,
    int credits = 0,
  }) async {
    final response = await _api.post('/subjects', data: {
      'name': name,
      'code': code,
      'period': period,
      'professorId': professorId,
      'credits': credits,
    });
    return Subject.fromJson(
      Map<String, dynamic>.from((response.data as Map)['item'] as Map),
    );
  }

  /// Crea un grupo de una materia. Sin grupo, la materia no puede matricular
  /// a nadie; el docente lo hereda el backend (quien llama, o el dueño de la
  /// materia).
  Future<void> createGroup({
    required String name,
    required String subjectId,
    required String period,
  }) async {
    await _api.post('/groups', data: {
      'name': name,
      'subjectId': subjectId,
      'period': period,
    });
  }

  /// Estudiantes visibles.
  ///
  /// Con [subjectId] devuelve solo los matriculados en esa asignatura. El
  /// recorte lo hace el backend contra la matrícula: filtrar aquí una lista ya
  /// mezclada daría el conjunto equivocado en cuanto alguien repita materia.

  Future<List<Group>> groups() {
    return _leerConCache('groups', () => _api.get('/groups'), Group.fromJson);
  }

  Future<List<Student>> students({
    String? subjectId,
    String? groupId,
    String? period,
  }) {
    return _leerConCache(
      'students.${subjectId ?? "todas"}.${groupId ?? "todos"}'
      '${period == null ? "" : ".$period"}',
      () => _api.get('/students', query: {
        if (subjectId != null) 'subjectId': subjectId,
        if (groupId != null) 'groupId': groupId,
        if (period != null) 'period': period,
      }),
      Student.fromJson,
    );
  }

  // ── Lecturas crudas para pantallas que trabajan con mapas ──────────────
  //
  // Comparten clave de caché con las tipadas de arriba: lo que una guardó lo
  // lee la otra, y la toma de asistencia abre sin red igual que las demás.

  Future<List<Map<String, dynamic>>> subjectsRaw() =>
      _leerConCache('subjects', () => _api.get('/subjects'), (m) => m);

  Future<List<Map<String, dynamic>>> groupsRaw() =>
      _leerConCache('groups', () => _api.get('/groups'), (m) => m);

  Future<List<Map<String, dynamic>>> studentsRaw({
    String? subjectId,
    String? groupId,
    String? period,
  }) {
    return _leerConCache(
      'students.${subjectId ?? "todas"}.${groupId ?? "todos"}'
      '${period == null ? "" : ".$period"}',
      () => _api.get('/students', query: {
        if (subjectId != null) 'subjectId': subjectId,
        if (groupId != null) 'groupId': groupId,
        if (period != null) 'period': period,
      }),
      (m) => m,
    );
  }

  /// Una página del listado de estudiantes.
  ///
  /// El backend pagina desde hace tiempo, pero el móvil nunca se lo pedía: sin
  /// `page` ni `limit` devuelve su tope por defecto, que en estudiantes son mil
  /// documentos completos. Sobre el wifi de un aula y en un teléfono, esa es la
  /// petición más pesada de la aplicación.
  ///
  /// **La búsqueda va en `q`, al servidor.** Filtrar en el teléfono sobre lo ya
  /// descargado solo funciona mientras lo descargado sea todo: en cuanto hay
  /// páginas, el estudiante de la quinta deja de existir para la búsqueda sin
  /// que nada lo indique.
  ///
  /// Las páginas no se cachean una a una: mezclarlas daría una caché que a
  /// veces tiene la página tres y a veces no. Sin servidor se responde con la
  /// lista completa de `students()`, si el docente ya la había abierto.
  Future<PaginaDe<Student>> studentsPagina({
    String? subjectId,
    String? groupId,
    String? q,
    int page = 1,
    int limit = 30,
  }) async {
    try {
      final response = await _api.get('/students', query: {
        if (subjectId != null) 'subjectId': subjectId,
        if (groupId != null) 'groupId': groupId,
        if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
        'page': page,
        'limit': limit,
      });
      OfflineStatus.instance.marcarEnLinea();
      return PaginaDe.desdeRespuesta(response.data, _items, Student.fromJson);
    } catch (error) {
      // Sin servidor, el directorio se sirve de la lista completa que ya se
      // había descargado para ese alcance (la de `students()`), filtrada aquí.
      // Es una sola página sin «cargar más»: lo que hay en el teléfono es todo
      // lo que hay, y la franja de arriba ya dice que son datos guardados.
      if (page > 1) rethrow;
      final guardado = await OfflineCache.read(
        'students.${subjectId ?? "todas"}.${groupId ?? "todos"}',
      );
      if (guardado == null || guardado.dato is! List) rethrow;
      OfflineStatus.instance.marcarDesdeCache(guardado.guardadoEn);
      final termino = (q ?? '').trim().toLowerCase();
      final todos = (guardado.dato as List)
          .whereType<Map>()
          .map((e) => Student.fromJson(Map<String, dynamic>.from(e)))
          .where(
            (e) =>
                termino.isEmpty ||
                e.fullName.toLowerCase().contains(termino) ||
                e.code.toLowerCase().contains(termino),
          )
          .toList();
      return PaginaDe(items: todos, total: todos.length, hasMore: false);
    }
  }

  /// Directorio global por nombre o cédula. Devuelve solo identidad, sin notas.
  Future<List<Student>> searchStudents(String term) async {
    if (term.trim().length < 3) return const [];
    final response =
        await _api.get('/students/search', query: {'q': term.trim()});
    return _items(response.data).map(Student.fromJson).toList();
  }

  Future<List<Enrollment>> enrollments({String? subjectId, String? period}) {
    return _leerConCache(
      'matriculas.${subjectId ?? "todas"}.${period ?? "todos"}',
      () => _api.get('/enrollments', query: {
        if (subjectId != null) 'subjectId': subjectId,
        if (period != null) 'period': period,
      }),
      Enrollment.fromJson,
    );
  }

  /// Matricula en un grupo a un estudiante que ya existe (del directorio).
  ///
  /// El periodo, la materia y el docente los pone el servidor desde el grupo:
  /// el cliente dice a quién y dónde, no con qué datos.
  Future<void> enrollStudent({
    required String studentId,
    required String groupId,
  }) async {
    await _api.post('/enrollments', data: {
      'studentId': studentId,
      'groupId': groupId,
    });
  }

  /// Matricula una lista en un grupo: crea a quien no existe (por documento) y
  /// matricula a todos.
  ///
  /// A quien ya existía **no** se le cambia el nombre: el servidor solo escribe
  /// la identidad al crear, así que [ResultadoMatricula.reutilizados] dice
  /// cuántos conservaron el suyo.
  Future<ResultadoMatricula> enrollRoster({
    required String groupId,
    required List<Map<String, dynamic>> students,
  }) async {
    final response = await _api.post('/enrollments/bulk', data: {
      'groupId': groupId,
      'students': students,
    });
    return ResultadoMatricula.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
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
  }) {
    return _leerConCache(
      'pendientes.$period.${subjectId ?? "todas"}',
      () => _api.get('/grades/pendientes', query: {
        'period': period,
        if (subjectId != null) 'subjectId': subjectId,
      }),
      PendingSubject.fromJson,
    );
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

  // ── Seguimiento: episodios de acompañamiento ──────────────────────────

  /// Episodios del caso, con `huboNegado`, `nivelActual` y `progreso` que
  /// calcula el servidor.
  Future<Map<String, dynamic>> seguimientos({
    required String studentId,
    required String subjectId,
    required String period,
  }) async {
    final response = await _api.get('/analytics/risks/seguimientos', query: {
      'studentId': studentId,
      'subjectId': subjectId,
      'period': period,
    });
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<void> crearSeguimiento({
    required String studentId,
    required String subjectId,
    required String period,
    required String accion,
    String nota = '',
  }) async {
    await _api.post('/analytics/risks/seguimientos', data: {
      'studentId': studentId,
      'subjectId': subjectId,
      'period': period,
      'accion': accion,
      'nota': nota,
    });
  }

  Future<void> cerrarSeguimiento(
    String id, {
    required String resultado, // 'BIEN' | 'NEGADO'
    String nota = '',
  }) async {
    await _api.patch('/analytics/risks/seguimientos/$id', data: {
      'resultado': resultado,
      'nota': nota,
    });
  }

  Future<List<AppNotification>> notifications() {
    return _leerConCache(
      'notificaciones',
      () => _api.get('/notifications'),
      AppNotification.fromJson,
    );
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
  }) {
    return _leerConCache(
      'asistencia.${subjectId ?? "todas"}.${period ?? "todos"}',
      () => _api.get('/attendance', query: {
        if (subjectId != null) 'subjectId': subjectId,
        if (period != null) 'period': period,
      }),
      (registro) => registro,
    );
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

  /// Guarda una nota por la bandeja de salida.
  ///
  /// Con servidor se envía en el acto y un rechazo (periodo cerrado, corte
  /// bloqueado) sube como error. Sin servidor, o si la petición se pierde por el
  /// camino, queda en el teléfono y sale sola: devuelve
  /// [ResultadoEscritura.encolada] y la pantalla lo dice.
  Future<ResultadoEscritura> saveGrade({
    required String studentId,
    required String subjectId,
    required String teacherId,
    required int cut,
    required String componentType,
    required String label,
    required double score,
    required String period,
    String? groupId,
    double? weight,
    String? studentName,
  }) {
    final etiqueta = label.trim();
    return OutboxService.instance.escribir(
      kind: OutboxKind.gradeUpsert,
      clave: claveNota(
        studentId: studentId,
        subjectId: subjectId,
        period: period,
        corte: cut,
        componentType: componentType,
        label: etiqueta,
      ),
      method: 'POST',
      path: '/grades',
      body: {
        'studentId': studentId,
        'subjectId': subjectId,
        if (groupId != null) 'groupId': groupId,
        'teacherId': teacherId,
        'corte': cut,
        'componentType': componentType,
        'label': etiqueta,
        'score': score,
        'period': period,
        if (weight != null) 'weight': weight,
        'capturadoEn': DateTime.now().toUtc().toIso8601String(),
      },
      meta: {
        'studentId': studentId,
        'subjectId': subjectId,
        'period': period,
        'corte': cut,
        'componentType': componentType,
        'label': etiqueta,
        'score': score,
      },
      resumen: 'Nota ${score.toStringAsFixed(1)} · $etiqueta',
      detalle: '${studentName ?? 'Estudiante'} · corte $cut · $period',
    );
  }

  /// Elimina una nota concreta.
  ///
  /// Quitar una nota recalcula el promedio de su componente y, con él, la nota
  /// del corte y la final: es una corrección, no un borrado cosmético.
  ///
  /// [id] es el de la nota en el servidor; `null` si solo existe pendiente en el
  /// teléfono, en cuyo caso borrarla es quitar su subida de la bandeja. Los
  /// demás datos son la clave natural de la nota, para poder fusionarla con lo
  /// pendiente.
  Future<ResultadoEscritura> deleteGrade({
    String? id,
    required String studentId,
    required String subjectId,
    required String period,
    required int cut,
    required String componentType,
    required String label,
    String? studentName,
    double? score,
  }) {
    final etiqueta = label.trim();
    return OutboxService.instance.escribir(
      kind: OutboxKind.gradeDelete,
      clave: claveNota(
        studentId: studentId,
        subjectId: subjectId,
        period: period,
        corte: cut,
        componentType: componentType,
        label: etiqueta,
      ),
      method: 'DELETE',
      path: '/grades/${id ?? ''}',
      meta: {
        'id': id ?? '',
        'studentId': studentId,
        'subjectId': subjectId,
        'period': period,
        'corte': cut,
        'componentType': componentType,
        'label': etiqueta,
      },
      resumen: 'Eliminar nota $etiqueta',
      detalle: '${studentName ?? 'Estudiante'} · corte $cut · $period',
    );
  }

  /// Guarda la lista de una clase entera por la bandeja de salida.
  ///
  /// Una clase es (materia, grupo, día): guardar otra vez la misma sustituye a
  /// la pendiente en vez de apilarse. [registros] lleva `studentId`, `present`,
  /// `lateMinutes` y `notes` por estudiante.
  Future<ResultadoEscritura> saveAttendanceClass({
    required String subjectId,
    String? groupId,
    required String teacherId,
    required String period,
    required DateTime date,
    required int durationMinutes,
    required List<Map<String, dynamic>> registros,
    String? subjectLabel,
    String? groupLabel,
  }) {
    final ausentes = registros.where((r) => r['present'] == false).length;
    return OutboxService.instance.escribir(
      kind: OutboxKind.attendanceClass,
      clave:
          claveAsistencia(subjectId: subjectId, groupId: groupId, date: date),
      method: 'POST',
      path: '/attendance/bulk',
      body: {
        'subjectId': subjectId,
        if (groupId != null) 'groupId': groupId,
        'teacherId': teacherId,
        'period': period,
        'date': DateTime(date.year, date.month, date.day).toIso8601String(),
        'durationMinutes': durationMinutes,
        'registros': registros,
        'capturadoEn': DateTime.now().toUtc().toIso8601String(),
      },
      meta: {
        'subjectId': subjectId,
        'groupId': groupId ?? '',
        'period': period,
        'date': claveDia(date),
      },
      resumen: 'Asistencia del ${claveDia(date)}',
      detalle: [
        if (subjectLabel != null) subjectLabel,
        if (groupLabel != null) groupLabel,
        '${registros.length} estudiantes, $ausentes ausentes',
      ].join(' · '),
    );
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

  /// Listado administrativo de docentes (solo ADMIN o COORDINATOR).
  Future<List<Map<String, dynamic>>> listProfessors({String? query, String? programa}) async {
    final response = await _api.get('/professors', query: {
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      if (programa != null && programa.trim().isNotEmpty) 'programa': programa.trim(),
    });
    return _items(response.data);
  }

  /// Una página del listado administrativo de docentes.
  ///
  /// La pantalla de supervisión traía la lista entera y filtraba en memoria.
  /// Con varias universidades en la misma instalación eso deja de caber, y el
  /// filtro en memoria además esconde a quien esté más allá del tope sin
  /// decirlo. La búsqueda va ahora en `q`, al servidor.
  Future<PaginaDe<Map<String, dynamic>>> listProfessorsPagina({
    String? query,
    String? programa,
    String? institutionId,
    int page = 1,
    int limit = 30,
  }) async {
    final response = await _api.get('/professors', query: {
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      if (programa != null && programa.trim().isNotEmpty) 'programa': programa.trim(),
      if (institutionId != null && institutionId.isNotEmpty) 'institutionId': institutionId,
      'page': page,
      'limit': limit,
    });
    return PaginaDe.desdeRespuesta(response.data, _items, (m) => m);
  }

  /// Listado administrativo de cuentas/usuarios (solo ADMIN).
  Future<List<Map<String, dynamic>>> listUsers({String? role, String? query}) async {
    final response = await _api.get('/usuarios', query: {
      if (role != null && role.isNotEmpty) 'role': role,
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
    });
    return _items(response.data);
  }

  /// Una página del listado administrativo de cuentas. Ver `listProfessorsPagina`.
  Future<PaginaDe<Map<String, dynamic>>> listUsersPagina({
    String? role,
    String? query,
    String? institutionId,
    int page = 1,
    int limit = 30,
  }) async {
    final response = await _api.get('/usuarios', query: {
      if (role != null && role.isNotEmpty) 'role': role,
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      if (institutionId != null && institutionId.isNotEmpty) 'institutionId': institutionId,
      'page': page,
      'limit': limit,
    });
    return PaginaDe.desdeRespuesta(response.data, _items, (m) => m);
  }
}
