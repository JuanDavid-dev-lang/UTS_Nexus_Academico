/// Qué clase de cambio espera en la bandeja de salida.
enum OutboxKind {
  gradeUpsert('grade.upsert'),
  gradeDelete('grade.delete'),
  attendanceClass('attendance.class');

  final String valor;
  const OutboxKind(this.valor);

  static OutboxKind? desde(Object? valor) {
    for (final tipo in values) {
      if (tipo.valor == valor) return tipo;
    }
    return null;
  }
}

/// Dónde va un cambio: `pendiente` espera turno, `enviando` está en vuelo y
/// `fallida` el servidor la rechazó y solo una persona puede decidir qué hacer.
enum OutboxEstado { pendiente, enviando, fallida }

/// Por qué no salió el último intento.
class OutboxError {
  final int? status;
  final String? codigo;
  final String mensaje;

  const OutboxError({this.status, this.codigo, required this.mensaje});

  Map<String, dynamic> toJson() => {
    'status': status,
    'codigo': codigo,
    'mensaje': mensaje,
  };

  factory OutboxError.fromJson(Map<String, dynamic> json) => OutboxError(
    status: json['status'] is num ? (json['status'] as num).toInt() : null,
    codigo: json['codigo']?.toString(),
    mensaje: json['mensaje']?.toString() ?? '',
  );
}

/// Un cambio hecho sin conexión (o cuya petición no llegó) que espera salir.
///
/// Es inmutable: cada transición devuelve otra entrada con [copyWith].
class OutboxEntry {
  final String id;

  /// Dueño del cambio. Solo se envía con la sesión de este usuario: un cambio
  /// del docente A nunca sale con las credenciales del docente B.
  final String userId;
  final DateTime createdAt;
  final OutboxKind kind;

  /// Clave natural del cambio (ver `outbox_logic.dart`). Dos entradas con la
  /// misma clave hablan de la misma nota o de la misma clase.
  final String clave;
  final String method;
  final String path;
  final Map<String, dynamic>? body;

  /// Datos para mostrar y para superponer la entrada a lo cacheado (estudiante,
  /// materia, corte…). Distinto de [body]: un DELETE no lleva cuerpo.
  final Map<String, dynamic> meta;

  /// Línea principal y secundaria con las que la lista de pendientes la nombra.
  final String resumen;
  final String detalle;

  final OutboxEstado estado;
  final int intentos;

  /// Ya se aplazó una vez por un corte bloqueado. Solo se aplaza una vez: si
  /// tras dejar pasar a las demás sigue bloqueado, pasa a `fallida`.
  final bool diferida;
  final OutboxError? ultimoError;

  const OutboxEntry({
    required this.id,
    required this.userId,
    required this.createdAt,
    required this.kind,
    required this.clave,
    required this.method,
    required this.path,
    this.body,
    this.meta = const {},
    this.resumen = '',
    this.detalle = '',
    this.estado = OutboxEstado.pendiente,
    this.intentos = 0,
    this.diferida = false,
    this.ultimoError,
  });

  bool get estaPendiente => estado != OutboxEstado.fallida;

  OutboxEntry copyWith({
    String? path,
    OutboxEstado? estado,
    int? intentos,
    bool? diferida,
    OutboxError? ultimoError,
    bool borrarError = false,
  }) {
    return OutboxEntry(
      id: id,
      userId: userId,
      createdAt: createdAt,
      kind: kind,
      clave: clave,
      method: method,
      path: path ?? this.path,
      body: body,
      meta: meta,
      resumen: resumen,
      detalle: detalle,
      estado: estado ?? this.estado,
      intentos: intentos ?? this.intentos,
      diferida: diferida ?? this.diferida,
      ultimoError: borrarError ? null : (ultimoError ?? this.ultimoError),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'userId': userId,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'kind': kind.valor,
    'clave': clave,
    'method': method,
    'path': path,
    'body': body,
    'meta': meta,
    'resumen': resumen,
    'detalle': detalle,
    'estado': estado.name,
    'intentos': intentos,
    'diferida': diferida,
    'ultimoError': ultimoError?.toJson(),
  };

  /// Null si el registro no se puede leer: una entrada ilegible no debe tumbar
  /// el resto de la bandeja.
  static OutboxEntry? tryFromJson(Object? crudo) {
    if (crudo is! Map) return null;
    final json = Map<String, dynamic>.from(crudo);
    final kind = OutboxKind.desde(json['kind']);
    final id = json['id']?.toString();
    final userId = json['userId']?.toString();
    final creada = DateTime.tryParse(json['createdAt']?.toString() ?? '');
    final path = json['path']?.toString();
    if (kind == null ||
        id == null ||
        userId == null ||
        creada == null ||
        path == null) {
      return null;
    }
    final estado = OutboxEstado.values.firstWhere(
      (e) => e.name == json['estado'],
      orElse: () => OutboxEstado.pendiente,
    );
    return OutboxEntry(
      id: id,
      userId: userId,
      createdAt: creada,
      kind: kind,
      clave: json['clave']?.toString() ?? id,
      method: json['method']?.toString() ?? 'POST',
      path: path,
      body: json['body'] is Map
          ? Map<String, dynamic>.from(json['body'] as Map)
          : null,
      meta: json['meta'] is Map
          ? Map<String, dynamic>.from(json['meta'] as Map)
          : const {},
      resumen: json['resumen']?.toString() ?? '',
      detalle: json['detalle']?.toString() ?? '',
      // Lo que quedó «enviando» cuando se cerró la app no sabemos si llegó:
      // vuelve a pendiente. Es seguro porque las claves naturales del servidor
      // hacen que repetir la petición sea un no-op.
      estado: estado == OutboxEstado.enviando ? OutboxEstado.pendiente : estado,
      intentos: json['intentos'] is num ? (json['intentos'] as num).toInt() : 0,
      diferida: json['diferida'] == true,
      ultimoError: json['ultimoError'] is Map
          ? OutboxError.fromJson(
              Map<String, dynamic>.from(json['ultimoError'] as Map),
            )
          : null,
    );
  }
}
