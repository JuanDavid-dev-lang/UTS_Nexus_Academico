import 'api_client.dart';

/// Una opción de un desplegable del catálogo (sede, facultad, nivel).
class Opcion {
  final String id;
  final String nombre;

  const Opcion({required this.id, required this.nombre});

  factory Opcion.fromJson(Map<String, dynamic> json) =>
      Opcion(id: (json['id'] ?? '').toString(), nombre: (json['nombre'] ?? '').toString());
}

/// Un programa académico, con la facultad y el nivel a los que pertenece.
class Programa {
  final String id;
  final String nombre;
  final String facultad;
  final String nivel;

  const Programa({
    required this.id,
    required this.nombre,
    required this.facultad,
    required this.nivel,
  });

  factory Programa.fromJson(Map<String, dynamic> json) => Programa(
        id: (json['id'] ?? '').toString(),
        nombre: (json['nombre'] ?? '').toString(),
        facultad: (json['facultad'] ?? '').toString(),
        nivel: (json['nivel'] ?? '').toString(),
      );
}

/// Catálogo institucional. Lo sirve el backend sin exigir sesión, porque el
/// formulario de registro lo necesita antes de que exista la cuenta.
class Catalogo {
  final bool abierto;
  final List<Opcion> sedes;
  final List<Opcion> facultades;
  final List<Opcion> niveles;
  final List<Programa> programas;

  const Catalogo({
    required this.abierto,
    required this.sedes,
    required this.facultades,
    required this.niveles,
    required this.programas,
  });

  factory Catalogo.fromJson(Map<String, dynamic> json) {
    List<T> lista<T>(String clave, T Function(Map<String, dynamic>) desde) =>
        ((json[clave] as List?) ?? const [])
            .whereType<Map>()
            .map((e) => desde(Map<String, dynamic>.from(e)))
            .toList();

    return Catalogo(
      abierto: json['abierto'] as bool? ?? false,
      sedes: lista('sedes', Opcion.fromJson),
      facultades: lista('facultades', Opcion.fromJson),
      niveles: lista('niveles', Opcion.fromJson),
      programas: lista('programas', Programa.fromJson),
    );
  }

  /// Programas de una facultad acotados a los niveles marcados.
  ///
  /// Es lo que permite que el formulario ofrezca solo lo posible en vez de las
  /// 32 carreras juntas, y que no se pueda enviar una combinación que el
  /// servidor va a rechazar.
  List<Programa> filtrar({required String facultad, required Set<String> niveles}) {
    return programas
        .where((p) => p.facultad == facultad && niveles.contains(p.nivel))
        .toList();
  }
}

/// Registro de docentes: catálogo y envío de la solicitud.
class RegistroService {
  final ApiClient _api = ApiClient.instance;

  Future<Catalogo> catalogo() async {
    final r = await _api.get('/registro/catalogo');
    final d = r.data;
    if (d is! Map) throw Exception('El servidor devolvió una respuesta inesperada.');
    return Catalogo.fromJson(Map<String, dynamic>.from(d));
  }

  /// Envía la solicitud. Devuelve el mensaje que hay que mostrarle a la persona.
  Future<String> solicitar({
    required String cedula,
    required String nombres,
    required String apellidos,
    required String sede,
    required String facultad,
    required List<String> niveles,
    required List<String> programas,
    required String email,
    required String password,
  }) async {
    final r = await _api.post('/registro', data: {
      'cedula': cedula,
      'nombres': nombres,
      'apellidos': apellidos,
      'sede': sede,
      'facultad': facultad,
      'niveles': niveles,
      'programas': programas,
      'email': email,
      'password': password,
    });
    final d = r.data;
    if (d is Map && d['message'] is String) return d['message'] as String;
    return 'Solicitud enviada. Un administrador tiene que aprobarla.';
  }
}
