import '../../../core/network/api_client.dart';
import '../aviso_uso.dart';

/// Una fila del ranking de uso (`GET /uso/resumen`).
class FilaUso {
  final String userId;
  final int posicion;
  final String nombre;
  final String rol;
  final String? institucion;
  final int diasActivos;
  final int minutos;
  final DateTime? ultimaActividad;

  const FilaUso({
    required this.userId,
    required this.posicion,
    required this.nombre,
    required this.rol,
    required this.institucion,
    required this.diasActivos,
    required this.minutos,
    required this.ultimaActividad,
  });

  factory FilaUso.fromJson(Map<String, dynamic> json) => FilaUso(
        userId: (json['userId'] ?? '').toString(),
        posicion: (json['posicion'] as num?)?.toInt() ?? 0,
        nombre: (json['nombre'] ?? '').toString(),
        rol: (json['rol'] ?? '').toString(),
        institucion: json['institucion']?.toString(),
        diasActivos: (json['diasActivos'] as num?)?.toInt() ?? 0,
        minutos: (json['minutos'] as num?)?.toInt() ?? 0,
        ultimaActividad:
            DateTime.tryParse((json['ultimaActividad'] ?? '').toString())?.toLocal(),
      );
}

/// Resumen de uso: cifras y la primera página del ranking. Lo calcula el
/// servidor; aquí solo se lee.
class ResumenUso {
  final String desde;
  final String hasta;
  final int activosHoy;
  final int activosSemana;
  final int activosMes;
  final int usuarios;
  final int minutos;
  final Map<String, int> usuariosPorCliente;
  final List<FilaUso> ranking;
  final int totalRanking;

  const ResumenUso({
    required this.desde,
    required this.hasta,
    required this.activosHoy,
    required this.activosSemana,
    required this.activosMes,
    required this.usuarios,
    required this.minutos,
    required this.usuariosPorCliente,
    required this.ranking,
    required this.totalRanking,
  });

  factory ResumenUso.fromJson(Map<String, dynamic> json) {
    final recientes = Map<String, dynamic>.from((json['recientes'] as Map?) ?? const {});
    final totales = Map<String, dynamic>.from((json['totales'] as Map?) ?? const {});
    final ranking = Map<String, dynamic>.from((json['ranking'] as Map?) ?? const {});
    int n(Object? v) => (v as num?)?.toInt() ?? 0;
    return ResumenUso(
      desde: (json['desde'] ?? '').toString(),
      hasta: (json['hasta'] ?? '').toString(),
      activosHoy: n(recientes['hoy']),
      activosSemana: n(recientes['semana']),
      activosMes: n(recientes['mes']),
      usuarios: n(totales['usuarios']),
      minutos: n(totales['minutos']),
      usuariosPorCliente: {
        for (final c in ((json['porCliente'] as List?) ?? const []).whereType<Map>())
          c['cliente'].toString(): n(c['usuarios']),
      },
      ranking: ((ranking['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((e) => FilaUso.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      totalRanking: n(ranking['total']),
    );
  }
}

/// Uso de la aplicación (solo ADMIN) y el aviso de privacidad de la propia
/// cuenta.
class UsageRepository {
  final ApiClient _api = ApiClient.instance;

  /// Los 30 días que terminan hoy, con las 50 personas que más la usan.
  Future<ResumenUso> resumen() async {
    final r = await _api.get('/uso/resumen', query: {'limit': 50});
    return ResumenUso.fromJson(Map<String, dynamic>.from(r.data as Map));
  }

  Future<void> marcarAvisoVisto() async {
    await _api.post('/auth/aviso-uso', data: {'version': avisoUsoVersion});
  }
}
