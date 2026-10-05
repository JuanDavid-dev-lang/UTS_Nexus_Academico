import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../storage/offline_status.dart';
import './outbox_entry.dart';
import './outbox_logic.dart';
import './outbox_storage.dart';

/// Cómo terminó una escritura que pasó por la bandeja.
enum ResultadoEscritura {
  /// El servidor la aceptó ahora mismo.
  enviada,

  /// Quedó guardada en el teléfono y saldrá sola cuando haya servidor.
  encolada,
}

/// Lo que ve la interfaz de la bandeja del usuario con sesión.
@immutable
class OutboxSnapshot {
  final List<OutboxEntry> entradas;
  final bool drenando;
  final bool sesionPausada;

  const OutboxSnapshot({
    this.entradas = const [],
    this.drenando = false,
    this.sesionPausada = false,
  });

  /// Esperando turno o en vuelo.
  int get pendientes => entradas.where((e) => e.estaPendiente).length;
  int get fallidas =>
      entradas.where((e) => e.estado == OutboxEstado.fallida).length;
  bool get vacia => entradas.isEmpty;
}

typedef OutboxEnvio = Future<void> Function(OutboxEntry entrada);

/// Bandeja de salida: lo que el docente hizo y todavía no llegó al servidor.
///
/// **Garantías**
///  - Un cambio aceptado por la bandeja está en disco antes de intentar enviarlo
///    y no caduca ni se borra al cerrar sesión.
///  - Se envía de uno en uno, en orden, y solo con la sesión de su dueño.
///  - Repetir una petición es seguro: el servidor resuelve por clave natural
///    (nota: estudiante/materia/periodo/corte/componente/etiqueta; asistencia:
///    estudiante/materia/fecha), así que un envío cuya respuesta se perdió no
///    duplica nada.
///  - Nada se descarta en silencio: lo que el servidor rechaza queda `fallida`
///    a la vista, con su motivo, hasta que alguien la reintenta o la descarta.
class OutboxService {
  OutboxService({
    OutboxStorage? storage,
    OutboxEnvio? enviar,
    Future<void> Function()? sondear,
    DateTime Function()? ahora,
    bool Function()? sinConexion,
    bool escucharLecturas = false,
  }) : _storage = storage ?? ArchivoOutboxStorage(),
       _enviar = enviar ?? _enviarPorApi,
       _sondear = sondear ?? _sondearApi,
       _ahora = ahora ?? DateTime.now,
       _sinConexion = sinConexion ?? _sinConexionPorDefecto,
       _escucharLecturas = escucharLecturas;

  static final OutboxService instance = OutboxService(escucharLecturas: true);

  final OutboxStorage _storage;
  final OutboxEnvio _enviar;
  final Future<void> Function() _sondear;
  final DateTime Function() _ahora;
  final bool Function() _sinConexion;
  final bool _escucharLecturas;

  static Future<void> _enviarPorApi(OutboxEntry entrada) async {
    final api = ApiClient.instance;
    switch (entrada.method) {
      case 'DELETE':
        await api.delete(entrada.path);
      case 'PATCH':
        await api.patch(entrada.path, data: entrada.body);
      case 'PUT':
        await api.put(entrada.path, data: entrada.body);
      default:
        await api.post(entrada.path, data: entrada.body);
    }
  }

  /// Antes de vaciar la bandeja se pregunta por la sesión una vez: si el token
  /// de acceso caducó, el 401 dispara la renovación de un solo vuelo del
  /// `ApiClient`, y de paso se sabe si hay servidor antes de gastar un intento
  /// de cada cambio.
  static Future<void> _sondearApi() async {
    await ApiClient.instance.get('/auth/me');
  }

  static bool _sinConexionPorDefecto() => OfflineStatus.instance.desde != null;

  List<OutboxEntry> _todas = [];
  bool _cargada = false;
  String? _usuario;
  bool _drenando = false;
  bool _sesionPausada = false;
  int _fallosSeguidos = 0;
  DateTime? _proximoIntento;
  Timer? _reloj;
  StreamSubscription<EstadoDatos>? _lecturas;
  DateTime? _ultimaLectura;
  Future<void> _escritura = Future.value();
  int _contador = 0;

  final StreamController<OutboxSnapshot> _cambios =
      StreamController.broadcast();
  final StreamController<void> _sincronizado = StreamController.broadcast();

  /// Se emite cuando algo salió hacia el servidor: es la señal para recargar
  /// lo que dependa de ello.
  Stream<void> get alSincronizar => _sincronizado.stream;
  Stream<OutboxSnapshot> get cambios => _cambios.stream;

  String? get usuario => _usuario;

  OutboxSnapshot get snapshot => OutboxSnapshot(
    entradas: List.unmodifiable(_todas.where((e) => e.userId == _usuario)),
    drenando: _drenando,
    sesionPausada: _sesionPausada,
  );

  void _emitir() {
    if (!_cambios.isClosed) _cambios.add(snapshot);
  }

  // ── Sesión ─────────────────────────────────────────────────────────────

  /// Dice de quién es la sesión (o `null` al cerrarla). Carga la bandeja del
  /// disco la primera vez. Las entradas de otros usuarios se conservan, ocultas
  /// y sin enviar, hasta que ese usuario vuelva a entrar.
  Future<void> usarUsuario(String? userId) async {
    if (!_cargada) {
      _todas = await _storage.cargar();
      _cargada = true;
    }
    _usuario = userId;
    _sesionPausada = false;
    _fallosSeguidos = 0;
    _proximoIntento = null;
    _reloj?.cancel();
    if (userId == null) {
      await _lecturas?.cancel();
      _lecturas = null;
      _emitir();
      return;
    }
    if (_escucharLecturas) {
      _lecturas ??= OfflineStatus.instance.cambios.listen(_alLeerDelServidor);
    }
    _emitir();
    if (snapshot.pendientes > 0) unawaited(drenar(ignorarEspera: true));
  }

  /// Cualquier lectura que llegó del servidor prueba que hay red: si quedan
  /// cambios por salir, es buen momento. Respeta la espera tras un fallo.
  void _alLeerDelServidor(EstadoDatos estado) {
    if (!estado.esFresco || _drenando) return;
    final lectura = estado.ultimaSincronizacion;
    if (lectura == null || lectura == _ultimaLectura) return;
    _ultimaLectura = lectura;
    if (snapshot.pendientes > 0) unawaited(drenar());
  }

  // ── Escribir ───────────────────────────────────────────────────────────

  /// Registra un cambio y lo envía.
  ///
  /// Con red y la bandeja vacía se envía en el acto y, si el servidor lo
  /// rechaza (periodo cerrado, dato inválido), el error sube para que la
  /// pantalla lo diga: el docente está mirando. Si no hay forma de enviarlo
  /// ahora —sin red, error del servidor, bandeja con turnos por delante— queda
  /// en disco y se devuelve [ResultadoEscritura.encolada].
  Future<ResultadoEscritura> escribir({
    required OutboxKind kind,
    required String clave,
    required String method,
    required String path,
    Map<String, dynamic>? body,
    Map<String, dynamic> meta = const {},
    String resumen = '',
    String detalle = '',
  }) async {
    final usuario = _usuario;
    final ahora = _ahora();
    final entrada = OutboxEntry(
      id: '${ahora.microsecondsSinceEpoch.toRadixString(36)}-${_contador++}',
      userId: usuario ?? '',
      createdAt: ahora.toUtc(),
      kind: kind,
      clave: clave,
      method: method,
      path: path,
      body: body,
      meta: meta,
      resumen: resumen,
      detalle: detalle,
    );

    // Sin sesión no hay a quién atribuir el cambio: se comporta como antes.
    if (usuario == null) {
      await _enviar(entrada);
      return ResultadoEscritura.enviada;
    }

    _todas = encolar(_todas, entrada);
    final quedo = _todas.any((e) => e.id == entrada.id);
    _persistir();
    _emitir();
    if (!quedo) return ResultadoEscritura.encolada;

    final hayTurnosPorDelante = _todas.any(
      (e) => e.userId == usuario && e.id != entrada.id && e.estaPendiente,
    );
    final enEspera =
        _proximoIntento != null && _ahora().isBefore(_proximoIntento!);
    if (_drenando || hayTurnosPorDelante || enEspera || _sinConexion()) {
      // Intentar ahora costaría hasta el tiempo de espera de la conexión por
      // cada nota tecleada. Se deja a la bandeja.
      if (!_drenando) unawaited(drenar());
      return ResultadoEscritura.encolada;
    }

    _actualizar(entrada.id, (e) => e.copyWith(estado: OutboxEstado.enviando));
    _emitir();
    try {
      await _enviar(entrada);
    } catch (error) {
      final fallo = falloDe(error);
      switch (decidir(entrada, fallo)) {
        case Veredicto.exito:
          break;
        case Veredicto.reintentar:
          _registrarFalloDeRed(fallo);
          _actualizar(entrada.id, (e) => _aPendiente(e, fallo));
          _persistir();
          _emitir();
          _programar();
          return ResultadoEscritura.encolada;
        case Veredicto.pausarSesion:
          _sesionPausada = true;
          _actualizar(entrada.id, (e) => _aPendiente(e, fallo));
          _persistir();
          _emitir();
          return ResultadoEscritura.encolada;
        case Veredicto.diferir:
        case Veredicto.fallar:
          // El docente lo está mirando: se le dice ya y no queda en la bandeja.
          _quitar(entrada.id);
          _persistir();
          _emitir();
          rethrow;
      }
    }
    _fallosSeguidos = 0;
    _proximoIntento = null;
    _quitar(entrada.id);
    _persistir();
    _emitir();
    _sincronizado.add(null);
    return ResultadoEscritura.enviada;
  }

  // ── Vaciar ─────────────────────────────────────────────────────────────

  /// Envía lo pendiente del usuario con sesión, de uno en uno y en orden.
  Future<void> drenar({bool ignorarEspera = false}) async {
    final usuario = _usuario;
    if (_drenando || usuario == null || snapshot.pendientes == 0) return;
    if (!ignorarEspera &&
        _proximoIntento != null &&
        _ahora().isBefore(_proximoIntento!)) {
      _programar();
      return;
    }

    _drenando = true;
    _sesionPausada = false;
    var salioAlgo = false;
    _emitir();
    try {
      try {
        await _sondear();
      } catch (error) {
        final fallo = falloDe(error);
        if (decidir(_sonda, fallo) == Veredicto.pausarSesion) {
          _sesionPausada = true;
        } else {
          _registrarFalloDeRed(fallo);
        }
        return;
      }

      while (_usuario == usuario) {
        final entrada = _siguiente(usuario);
        if (entrada == null) break;
        _actualizar(
          entrada.id,
          (e) => e.copyWith(estado: OutboxEstado.enviando),
        );
        _emitir();

        try {
          await _enviar(entrada);
          _quitar(entrada.id);
          _fallosSeguidos = 0;
          _proximoIntento = null;
          salioAlgo = true;
        } catch (error) {
          final fallo = falloDe(error);
          final seguir = _aplicarVeredicto(entrada, fallo);
          if (!seguir) break;
          if (decidir(entrada, fallo) == Veredicto.exito) salioAlgo = true;
        }
        _persistir();
        _emitir();
      }
    } finally {
      _drenando = false;
      _persistir();
      _emitir();
      _programar();
      if (salioAlgo) _sincronizado.add(null);
    }
  }

  /// Entrada de mentira para clasificar el fallo de la sonda de sesión.
  static final OutboxEntry _sonda = OutboxEntry(
    id: 'sonda',
    userId: '',
    createdAt: DateTime.utc(2000),
    kind: OutboxKind.attendanceClass,
    clave: 'sonda',
    method: 'GET',
    path: '/auth/me',
  );

  /// Aplica la decisión sobre una entrada fallida. Devuelve si el vaciado
  /// puede seguir con la siguiente.
  bool _aplicarVeredicto(OutboxEntry entrada, OutboxFallo fallo) {
    switch (decidir(entrada, fallo)) {
      case Veredicto.exito:
        _quitar(entrada.id);
        return true;
      case Veredicto.reintentar:
        _registrarFalloDeRed(fallo);
        _actualizar(entrada.id, (e) => _aPendiente(e, fallo));
        return false;
      case Veredicto.pausarSesion:
        _sesionPausada = true;
        _actualizar(entrada.id, (e) => _aPendiente(e, fallo));
        return false;
      case Veredicto.diferir:
        // Al final de la cola: una nota anterior puede completar el corte que
        // ésta necesita abierto.
        _todas = [
          ..._todas.where((e) => e.id != entrada.id),
          entrada.copyWith(
            estado: OutboxEstado.pendiente,
            diferida: true,
            intentos: entrada.intentos + 1,
            ultimoError: fallo.comoError(),
          ),
        ];
        return true;
      case Veredicto.fallar:
        _actualizar(
          entrada.id,
          (e) => e.copyWith(
            estado: OutboxEstado.fallida,
            intentos: e.intentos + 1,
            ultimoError: fallo.comoError(),
          ),
        );
        return true;
    }
  }

  OutboxEntry _aPendiente(OutboxEntry e, OutboxFallo fallo) => e.copyWith(
    estado: OutboxEstado.pendiente,
    intentos: e.intentos + 1,
    ultimoError: fallo.comoError(),
  );

  void _registrarFalloDeRed(OutboxFallo fallo) {
    _fallosSeguidos++;
    _proximoIntento = _ahora().add(
      esperaTrasFallo(_fallosSeguidos, retryAfter: fallo.retryAfter),
    );
  }

  OutboxEntry? _siguiente(String usuario) {
    for (final e in _todas) {
      if (e.userId == usuario && e.estado == OutboxEstado.pendiente) return e;
    }
    return null;
  }

  // ── Gestión desde la interfaz ──────────────────────────────────────────

  /// Devuelve una fallida a la cola para otro intento.
  Future<void> reintentar(String id) async {
    _actualizar(
      id,
      (e) => e.copyWith(
        estado: OutboxEstado.pendiente,
        intentos: 0,
        diferida: false,
        borrarError: true,
      ),
    );
    _proximoIntento = null;
    _persistir();
    _emitir();
    unawaited(drenar(ignorarEspera: true));
  }

  Future<void> reintentarTodo() async {
    for (final e in snapshot.entradas) {
      if (e.estado == OutboxEstado.fallida) {
        _actualizar(
          e.id,
          (x) => x.copyWith(
            estado: OutboxEstado.pendiente,
            intentos: 0,
            diferida: false,
            borrarError: true,
          ),
        );
      }
    }
    _proximoIntento = null;
    _persistir();
    _emitir();
    unawaited(drenar(ignorarEspera: true));
  }

  /// Tira un cambio. Es una decisión del docente y no se puede deshacer.
  Future<void> descartar(String id) async {
    _quitar(id);
    _persistir();
    _emitir();
    _programar();
  }

  /// Pide un intento ya (volver a primer plano, socket conectado, sesión
  /// iniciada): ignora la espera creciente porque el motivo de esperar pudo
  /// haber desaparecido.
  void solicitarDrenaje() => unawaited(drenar(ignorarEspera: true));

  // ── Interno ────────────────────────────────────────────────────────────

  void _actualizar(String id, OutboxEntry Function(OutboxEntry) cambio) {
    _todas = [for (final e in _todas) e.id == id ? cambio(e) : e];
  }

  void _quitar(String id) {
    _todas = _todas.where((e) => e.id != id).toList();
  }

  /// Escribe a disco en orden: dos escrituras solapadas pisarían el archivo
  /// temporal una a la otra.
  void _persistir() {
    final copia = List<OutboxEntry>.of(_todas);
    _escritura = _escritura.then((_) => _storage.guardar(copia)).catchError((
      Object error,
    ) {
      debugPrint('Bandeja de salida: no se pudo guardar ($error)');
    });
  }

  /// Espera a que lo escrito hasta ahora esté en disco. Para pruebas y para el
  /// cierre de sesión.
  Future<void> volcado() => _escritura;

  void _programar() {
    _reloj?.cancel();
    _reloj = null;
    if (_usuario == null || _sesionPausada || _drenando) return;
    if (snapshot.pendientes == 0) return;
    final espera = _proximoIntento == null
        ? const Duration(seconds: 30)
        : _proximoIntento!.difference(_ahora());
    _reloj = Timer(
      espera < const Duration(seconds: 1) ? const Duration(seconds: 1) : espera,
      () => unawaited(drenar()),
    );
  }

  @visibleForTesting
  Future<void> cerrar() async {
    _reloj?.cancel();
    await _lecturas?.cancel();
    await _escritura;
  }
}

/// La bandeja del usuario con sesión, como flujo para la interfaz.
final outboxProvider = StreamProvider<OutboxSnapshot>((ref) async* {
  yield OutboxService.instance.snapshot;
  yield* OutboxService.instance.cambios;
});
