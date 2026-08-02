import 'package:dio/dio.dart';

import 'api_client.dart';

/// Nivel de certeza con que una fila leída se atribuyó a un estudiante.
enum NivelCoincidencia { exacta, probable, dudosa, sinCoincidencia }

NivelCoincidencia _nivelDesde(String valor) => switch (valor) {
      'exacta' => NivelCoincidencia.exacta,
      'probable' => NivelCoincidencia.probable,
      'dudosa' => NivelCoincidencia.dudosa,
      _ => NivelCoincidencia.sinCoincidencia,
    };

/// Una casilla de asistencia leída de la foto.
class CeldaEscaneada {
  final int columna;
  bool presente;
  final bool dudosa;

  CeldaEscaneada({required this.columna, required this.presente, required this.dudosa});

  factory CeldaEscaneada.fromJson(Map<String, dynamic> json) => CeldaEscaneada(
        columna: (json['columna'] as num).toInt(),
        presente: json['presente'] as bool? ?? false,
        dudosa: json['dudosa'] as bool? ?? false,
      );
}

/// Persona matriculada, para poder reasignar una fila a mano.
class Matriculado {
  final String id;
  final String code;
  final String fullName;

  const Matriculado({required this.id, required this.code, required this.fullName});

  factory Matriculado.fromJson(Map<String, dynamic> json) => Matriculado(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        fullName: json['fullName'] as String? ?? '',
      );
}

/// Una fila de la planilla, ya cruzada contra la matrícula.
class FilaEscaneada {
  final int indice;
  final String cedulaLeida;
  final String nombreLeido;
  String? studentId;
  String? code;
  String? fullName;
  NivelCoincidencia nivel;
  final List<String> avisos;
  final List<CeldaEscaneada> celdas;

  FilaEscaneada({
    required this.indice,
    required this.cedulaLeida,
    required this.nombreLeido,
    required this.studentId,
    required this.code,
    required this.fullName,
    required this.nivel,
    required this.avisos,
    required this.celdas,
  });

  factory FilaEscaneada.fromJson(Map<String, dynamic> json) => FilaEscaneada(
        indice: (json['indice'] as num).toInt(),
        cedulaLeida: json['cedulaLeida'] as String? ?? '',
        nombreLeido: json['nombreLeido'] as String? ?? '',
        studentId: json['studentId'] as String?,
        code: json['code'] as String?,
        fullName: json['fullName'] as String?,
        nivel: _nivelDesde(json['nivel'] as String? ?? ''),
        avisos: ((json['avisos'] as List?) ?? const [])
            .map((a) => a.toString())
            .toList(),
        celdas: ((json['celdas'] as List?) ?? const [])
            .whereType<Map>()
            .map((c) => CeldaEscaneada.fromJson(Map<String, dynamic>.from(c)))
            .toList(),
      );

  /// Reasigna la fila a otra persona. Pasar `null` la deja sin asignar.
  void asignar(Matriculado? alumno) {
    studentId = alumno?.id;
    code = alumno?.code;
    fullName = alumno?.fullName;
    nivel = alumno == null ? NivelCoincidencia.sinCoincidencia : NivelCoincidencia.exacta;
  }
}

/// Propuesta de lectura completa. Nada de esto está guardado todavía.
class EscaneoPlanilla {
  final String groupId;
  final int columnasFecha;
  /// Una por columna, leída de la cabecera. `null` donde no se pudo.
  final List<DateTime?> fechasSugeridas;
  final List<String> avisos;
  final List<FilaEscaneada> filas;
  final List<Matriculado> matriculados;

  const EscaneoPlanilla({
    required this.groupId,
    required this.columnasFecha,
    required this.fechasSugeridas,
    required this.avisos,
    required this.filas,
    required this.matriculados,
  });

  factory EscaneoPlanilla.fromJson(Map<String, dynamic> json) => EscaneoPlanilla(
        groupId: json['groupId'] as String? ?? '',
        columnasFecha: (json['columnasFecha'] as num?)?.toInt() ?? 0,
        fechasSugeridas: ((json['fechasSugeridas'] as List?) ?? const [])
            .map((f) => f == null ? null : DateTime.tryParse(f.toString()))
            .toList(),
        avisos: ((json['avisos'] as List?) ?? const []).map((a) => a.toString()).toList(),
        filas: ((json['filas'] as List?) ?? const [])
            .whereType<Map>()
            .map((f) => FilaEscaneada.fromJson(Map<String, dynamic>.from(f)))
            .toList(),
        matriculados: ((json['matriculados'] as List?) ?? const [])
            .whereType<Map>()
            .map((m) => Matriculado.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
      );
}

/// Importación de asistencia desde la foto de una planilla.
///
/// Dos pasos separados a propósito: [escanear] solo propone y no guarda nada;
/// [confirmar] escribe lo que el docente ya revisó. Juntarlos convertiría un
/// reconocimiento que puede equivocarse en un dato que nadie comprobó, y una
/// asistencia mal guardada no se nota hasta que el porcentaje no cuadra semanas
/// después.
class AttendanceScanService {
  final ApiClient _api = ApiClient.instance;

  Future<EscaneoPlanilla> escanear({
    required String groupId,
    required String rutaImagen,
  }) async {
    final formulario = FormData.fromMap({
      'groupId': groupId,
      'file': await MultipartFile.fromFile(rutaImagen, filename: 'planilla.jpg'),
    });

    final respuesta = await _api.dio.post<dynamic>(
      '/attendance/scan',
      data: formulario,
      options: Options(
        // Interpretar una foto tarda mucho más que una consulta normal.
        receiveTimeout: const Duration(seconds: 90),
        sendTimeout: const Duration(seconds: 60),
      ),
    );

    final datos = respuesta.data;
    if (datos is! Map) {
      throw Exception('El servidor devolvió una respuesta que no se pudo interpretar.');
    }
    return EscaneoPlanilla.fromJson(Map<String, dynamic>.from(datos));
  }

  /// Guarda lo revisado. Devuelve cuántos registros se escribieron.
  Future<int> confirmar({
    required String groupId,
    required List<DateTime> fechas,
    required int durationMinutes,
    required List<FilaEscaneada> filas,
  }) async {
    final asignadas = filas.where((f) => f.studentId != null).toList();

    final respuesta = await _api.post('/attendance/scan/confirm', data: {
      'groupId': groupId,
      'fechas': fechas.map((f) => f.toIso8601String()).toList(),
      'durationMinutes': durationMinutes,
      'filas': asignadas
          .map((f) => {
                'studentId': f.studentId,
                'presentes': f.celdas.map((c) => c.presente).toList(),
              })
          .toList(),
    });

    final datos = respuesta.data;
    if (datos is Map && datos['guardados'] is num) {
      return (datos['guardados'] as num).toInt();
    }
    return 0;
  }
}
