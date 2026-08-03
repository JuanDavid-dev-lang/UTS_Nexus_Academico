import 'api_client.dart';

/// Aviso institucional tal como lo ve un docente.
class Aviso {
  final String id;
  final String titulo;
  final String cuerpo;
  final String tipo;
  final DateTime? publicadoEn;
  final DateTime? expiraEn;
  final bool fijado;
  bool leido;
  final String autor;

  Aviso({
    required this.id,
    required this.titulo,
    required this.cuerpo,
    required this.tipo,
    required this.publicadoEn,
    required this.expiraEn,
    required this.fijado,
    required this.leido,
    required this.autor,
  });

  factory Aviso.fromJson(Map<String, dynamic> json) {
    final autor = json['autorId'];
    return Aviso(
      id: (json['_id'] ?? '').toString(),
      titulo: (json['titulo'] ?? '').toString(),
      cuerpo: (json['cuerpo'] ?? '').toString(),
      tipo: (json['tipo'] ?? 'INFORMATIVO').toString(),
      publicadoEn: DateTime.tryParse((json['publicadoEn'] ?? '').toString()),
      expiraEn: DateTime.tryParse((json['expiraEn'] ?? '').toString()),
      fijado: json['fijado'] as bool? ?? false,
      leido: json['leido'] as bool? ?? false,
      autor: autor is Map ? (autor['fullName'] ?? '').toString() : '',
    );
  }
}

class ListadoAvisos {
  final List<Aviso> items;
  final int sinLeer;

  const ListadoAvisos({required this.items, required this.sinLeer});
}

class AvisosService {
  final ApiClient _api = ApiClient.instance;

  Future<ListadoAvisos> listar() async {
    final r = await _api.get('/avisos');
    final d = r.data;
    if (d is! Map) return const ListadoAvisos(items: [], sinLeer: 0);

    return ListadoAvisos(
      items: ((d['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((e) => Aviso.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      sinLeer: (d['sinLeer'] as num?)?.toInt() ?? 0,
    );
  }

  /// Marcar como leído es idempotente: abrirlo dos veces no cuenta dos.
  Future<void> marcarLeido(String id) async {
    await _api.post('/avisos/$id/leido');
  }
}
