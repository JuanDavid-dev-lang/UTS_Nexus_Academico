import 'package:dio/dio.dart';

import 'api_client.dart';

/// Formato oficial de trabajo de grado, tal como lo ve un director.
class FormatoTrabajoGrado {
  final String id;
  final String nombre;
  final String descripcion;
  final String etapa;
  final List<String> camposALlenar;
  final String version;
  final String nombreArchivo;

  const FormatoTrabajoGrado({
    required this.id,
    required this.nombre,
    required this.descripcion,
    required this.etapa,
    required this.camposALlenar,
    required this.version,
    required this.nombreArchivo,
  });

  factory FormatoTrabajoGrado.fromJson(Map<String, dynamic> json) {
    final archivo = json['archivo'];
    return FormatoTrabajoGrado(
      id: (json['_id'] ?? '').toString(),
      nombre: (json['nombre'] ?? '').toString(),
      descripcion: (json['descripcion'] ?? '').toString(),
      etapa: (json['etapa'] ?? 'PROPUESTA').toString(),
      camposALlenar: ((json['camposALlenar'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      version: (json['version'] ?? '1').toString(),
      nombreArchivo: archivo is Map
          ? (archivo['originalName'] ?? 'formato').toString()
          : 'formato',
    );
  }
}

/// Etiquetas de etapa. El orden es el orden de un trabajo de grado.
const etapasTrabajoGrado = <String, String>{
  'PROPUESTA': 'Propuesta',
  'DESARROLLO': 'Desarrollo',
  'INFORME_FINAL': 'Informe final',
  'EVALUACION': 'Evaluación',
  'GRADO': 'Solicitud de grado',
};

/// Repositorio de formatos. Solo lectura desde el teléfono: subirlos y
/// retirarlos es tarea del escritorio de la administración.
class ThesisService {
  final ApiClient _api = ApiClient.instance;

  Future<List<FormatoTrabajoGrado>> listar({String? etapa}) async {
    final r = await _api.get('/trabajos-grado/formatos', query: {
      if (etapa != null && etapa.isNotEmpty) 'etapa': etapa,
    });
    final d = r.data;
    if (d is! Map) return const [];
    return ((d['items'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => FormatoTrabajoGrado.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Descarga autenticada del archivo (los formatos no están en el estático).
  Future<List<int>> descargar(String id) async {
    final response = await _api.dio.get<List<int>>(
      '/trabajos-grado/formatos/$id/archivo',
      options: Options(
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(seconds: 90),
      ),
    );
    return response.data ?? const [];
  }
}
