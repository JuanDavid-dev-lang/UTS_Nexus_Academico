import '../../../core/network/api_client.dart';

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

/// Una institución activa que un docente puede elegir al registrarse.
///
/// `institutionId` es el slug estable (uts, uis, udes...); `id` es el `_id`
/// de Mongo. El formulario envía el slug, no el `_id`.
class InstitucionOpcion {
  final String id;
  final String institutionId;
  final String nombre;
  final String sigla;

  const InstitucionOpcion({
    required this.id,
    required this.institutionId,
    required this.nombre,
    required this.sigla,
  });

  factory InstitucionOpcion.fromJson(Map<String, dynamic> json) => InstitucionOpcion(
        id: (json['id'] ?? '').toString(),
        institutionId: (json['institutionId'] ?? '').toString(),
        nombre: (json['nombre'] ?? '').toString(),
        sigla: (json['sigla'] ?? '').toString(),
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

  /// Instituciones activas. Lista vacía si el backend todavía no la manda
  /// (campo opcional, compatibilidad con versiones anteriores del servidor).
  final List<InstitucionOpcion> instituciones;

  const Catalogo({
    required this.abierto,
    required this.sedes,
    required this.facultades,
    required this.niveles,
    required this.programas,
    this.instituciones = const [],
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
      instituciones: lista('instituciones', InstitucionOpcion.fromJson),
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
  ///
  /// [institutionId] (slug de una institución activa) e [institucionSolicitada]
  /// (nombre escrito a mano) son mutuamente excluyentes: solo se manda al
  /// servidor el que no sea nulo ni esté vacío.
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
    String? institutionId,
    String? institucionSolicitada,
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
      if (institutionId != null && institutionId.trim().isNotEmpty)
        'institutionId': institutionId.trim()
      else if (institucionSolicitada != null && institucionSolicitada.trim().isNotEmpty)
        'institucionSolicitada': institucionSolicitada.trim(),
    });
    final d = r.data;
    if (d is Map && d['message'] is String) return d['message'] as String;
    return 'Solicitud enviada. Un administrador tiene que aprobarla.';
  }
}
