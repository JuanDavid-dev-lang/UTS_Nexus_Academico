import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_error.dart';
import '../notifications/push_service.dart';
import '../storage/offline_cache.dart';
import '../sync/outbox_service.dart';
import '../sync/precarga_service.dart';
import '../storage/offline_status.dart';
import './auth_user.dart';
import '../network/connection_settings.dart';
import '../network/api_client.dart';
import './auth_repository.dart';
import '../network/realtime_service.dart';
import './session_storage.dart';
import './device_id.dart';
import './keep_alive.dart';

class AuthState {
  final bool loading;
  final AuthUser? user;

  const AuthState({required this.loading, this.user});

  bool get isAuthenticated => user != null;

  AuthState copyWith({bool? loading, AuthUser? user}) =>
      AuthState(loading: loading ?? this.loading, user: user ?? this.user);
}

final authRepositoryProvider = Provider((ref) => AuthRepository());
final sessionStorageProvider = Provider((ref) => SessionStorage());

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repo, this._storage, this._realtime)
    : super(const AuthState(loading: true));

  final AuthRepository _repo;
  final SessionStorage _storage;
  final RealtimeService _realtime;

  /// «Mantener la sesión iniciada». Desmarcada, los tokens viven solo en
  /// memoria (`ApiClient`) y las renovaciones tampoco los escriben: cerrar la
  /// app termina la sesión, como en el escritorio con la casilla desmarcada.
  bool _persistir = true;

  /// Cierre de sesión en curso: un segundo `logout` (un 401 mientras se cierra,
  /// el botón pulsado dos veces) espera a este en vez de repetirlo.
  Future<void>? _cerrando;

  /// Mientras se cierra, una renovación provocada por la baja del push no
  /// puede volver a escribir los tokens en disco ni reconectar el socket.
  bool _cerrandoSesion = false;

  /// Cada inicio y cada cierre de sesión la suben. Lo que el cierre hace en
  /// segundo plano (avisar al servidor, hasta 3 s) solo suelta los tokens de
  /// memoria si nadie inició otra sesión mientras tanto.
  int _generacion = 0;

  /// Para que la casilla del acceso salga como la dejó la última persona.
  Future<bool> leerMantenerSesion() => _storage.leerMantenerSesion();

  Future<void> bootstrap() async {
    final settings = await ConnectionSettings.load();
    ApiClient.instance.setBaseUrl(settings.apiBaseUrl);
    RealtimeService.instance.setBaseUrl(settings.wsBaseUrl);
    // Antes de cualquier petición: la primera renovación ya tiene que llevarlo.
    ApiClient.instance.deviceId = await IdDeEquipo.instance.obtener();
    _wireSessionCallbacks();

    final session = await _storage.load();
    final access = session['accessToken'];
    final refresh = session['refreshToken'];
    if (access != null) {
      // Solo una sesión mantenida llega aquí: la otra no se guardó.
      _persistir = true;
      ApiClient.instance.setTokens(accessToken: access, refreshToken: refresh);
      _realtime.connect(token: access);
      try {
        final me = await _repo.me();
        final usuario = Map<String, dynamic>.from(me['user'] as Map);
        await _storage.saveUser(usuario);
        await _entrar(usuario);
        return;
      } catch (error) {
        // Sin servidor la sesión sigue siendo válida: solo un rechazo del
        // refresh token la termina (y eso ya lo hizo `onSessionExpired`, que
        // borró los tokens). Mandar al login por un wifi caído dejaba al
        // docente sin poder abrir la app justo cuando más la necesita.
        if (_esFalloDeServidor(error) &&
            ApiClient.instance.refreshToken != null) {
          final guardado = await _storage.loadUser();
          if (guardado != null) {
            await _entrar(guardado);
            return;
          }
        }
      }
    }
    state = const AuthState(loading: false);
  }

  /// Sin respuesta del servidor (red, tiempo de espera, 5xx, 429): no dice nada
  /// sobre si la sesión vale.
  bool _esFalloDeServidor(Object error) {
    final kind = ApiError.from(error).kind;
    return kind == ApiErrorKind.network ||
        kind == ApiErrorKind.timeout ||
        kind == ApiErrorKind.server ||
        kind == ApiErrorKind.rateLimited;
  }

  /// Deja la sesión puesta y le dice a la bandeja de salida de quién es, lo que
  /// además reanuda el envío de lo que ese usuario dejó pendiente.
  Future<void> _entrar(Map<String, dynamic> usuario) async {
    final user = AuthUser.fromJson(usuario);
    await OutboxService.instance.usarUsuario(user.id);
    // Caliente la caché de lectura en segundo plano para poder trabajar sin red.
    PrecargaService.instance.usarUsuario(user.role);
    unawaited(PrecargaService.instance.solicitar());
    state = AuthState(loading: false, user: user);
    mantenerSesion();
  }

  /// Renueva la sesión si el refresh token tiene más de un día
  /// (`debeRenovarSesion`). Se llama al entrar y al volver a primer plano.
  ///
  /// Va por el **mismo vuelo único** que el 401 (`renewAccessToken`): una
  /// renovación en paralelo con otra presentaría un token ya rotado, y el
  /// servidor lo trata como robo y revoca todas las sesiones del usuario. Un
  /// fallo de red aquí no hace nada: la sesión sigue igual de viva.
  void mantenerSesion() {
    if (!state.isAuthenticated || _cerrandoSesion) return;
    final api = ApiClient.instance;
    if (!debeRenovarSesion(cargaDeJwt(api.refreshToken), DateTime.now())) {
      return;
    }
    unawaited(
      api.renewAccessToken().then((resultado) async {
        if (resultado == RefreshOutcome.rejected) await logout();
      }),
    );
  }

  /// Conecta los tres enganches que [ApiClient] y [RealtimeService] exponen y
  /// que hasta ahora nadie asignaba.
  ///
  /// El más dañino era `onTokensRenewed`: el backend rota el refresh token en
  /// cada uso, así que tras la primera renovación el que seguía guardado en
  /// disco ya estaba quemado y el siguiente arranque en frío caía al login con
  /// la sesión todavía viva en el servidor.
  void _wireSessionCallbacks() {
    final api = ApiClient.instance;

    api.onTokensRenewed = (accessToken, refreshToken) async {
      if (_cerrandoSesion) return;
      // Sin «mantener la sesión» el par nuevo se queda en memoria, igual que
      // el primero: escribirlo aquí la haría persistente por la puerta de atrás.
      if (_persistir) {
        await _storage.save(accessToken: accessToken, refreshToken: refreshToken);
      }
      // El socket lleva el token en el handshake: sin reconectar seguiría
      // autenticado con el anterior hasta la primera caída, y ahí ya no volvería.
      _realtime.updateToken(accessToken);
    };

    // Sin esto, un refresh token muerto dejaba la app en un limbo: `ApiClient`
    // borraba los tokens pero el estado seguía diciendo "autenticado", así que
    // el docente veía pantallas vacías en vez del login.
    api.onSessionExpired = () {
      unawaited(logout());
    };

    _realtime.onUnauthorized = () async {
      // Si la renovación va bien, `onTokensRenewed` reconecta el socket. Si el
      // servidor no contestó, el socket ya reintenta solo con su propio
      // retroceso: cerrar la sesión por eso sería castigar un wifi caído.
      final outcome = await api.renewAccessToken();
      if (outcome == RefreshOutcome.rejected) await logout();
    };
  }

  /// Con [mantener] desmarcado (la sala común, el teléfono prestado) no se
  /// guarda nada de la sesión en el teléfono y se borra lo que hubiera: los
  /// tokens quedan en memoria y cerrar la app la termina. La bandeja de salida
  /// sí va siempre a disco: son notas aún no subidas.
  Future<void> login(
    String email,
    String password, {
    bool mantener = true,
  }) async {
    ApiClient.instance.deviceId ??= await IdDeEquipo.instance.obtener();
    final data = await _repo.login(email, password);
    _generacion++;
    // Un cierre anterior puede seguir avisando al servidor (hasta 3 s): esta
    // sesión ya es otra, y sus renovaciones tienen que guardarse.
    _cerrandoSesion = false;
    _persistir = mantener;
    final access = data['accessToken'].toString();
    final refresh = data['refreshToken'].toString();
    final usuario = Map<String, dynamic>.from(data['user'] as Map);
    if (mantener) {
      await Future.wait([
        _storage.save(accessToken: access, refreshToken: refresh),
        _storage.saveUser(usuario),
        _storage.guardarMantenerSesion(true),
      ]);
    } else {
      await Future.wait([
        _storage.clear(),
        _storage.guardarMantenerSesion(false),
      ]);
    }
    ApiClient.instance.setTokens(accessToken: access, refreshToken: refresh);
    _realtime.connect(token: access);
    await _entrar(usuario);
  }

  /// Cambia la contraseña y se queda dentro.
  ///
  /// El servidor revoca todas las sesiones, incluida esta, y devuelve un par
  /// nuevo: guardarlo y volver a apuntar el socket es lo que evita que la app
  /// se caiga a la pantalla de acceso justo después de un cambio correcto.
  ///
  /// Devuelve el mensaje del servidor porque lo que hay que contar no es
  /// «hecho», sino que las demás sesiones se cerraron.
  Future<String> cambiarPassword({
    required String actual,
    required String nueva,
  }) async {
    final data = await _repo.cambiarPassword(actual: actual, nueva: nueva);
    final access = data['accessToken'].toString();
    final refresh = data['refreshToken'].toString();
    if (_persistir) {
      await _storage.save(accessToken: access, refreshToken: refresh);
    }
    ApiClient.instance.setTokens(accessToken: access, refreshToken: refresh);
    _realtime.updateToken(access);
    return (data['message'] ?? 'Contraseña actualizada.').toString();
  }

  /// Recarga los datos del usuario desde el servidor.
  ///
  /// Lo necesita la edición de perfil: el nombre y la foto que ve el resto de
  /// la aplicación —la barra superior, el menú de sesión— salen de aquí, no de
  /// la consulta del perfil. Sin esto el cambio se veía en Perfil y en ningún
  /// otro sitio hasta reiniciar.
  Future<void> refreshUser() async {
    try {
      final me = await _repo.me();
      final usuario = Map<String, dynamic>.from(me['user'] as Map);
      if (_persistir) await _storage.saveUser(usuario);
      state = AuthState(loading: false, user: AuthUser.fromJson(usuario));
    } catch (_) {
      // Un fallo aquí no debe tumbar la sesión: los datos viejos siguen siendo
      // utilizables y la próxima carga los corrige.
    }
  }

  /// Cierra la sesión.
  ///
  /// Rápido: lo local (tokens guardados, caché de lectura, socket, precarga,
  /// estado de sincronización) se suelta en paralelo y la pantalla vuelve al
  /// acceso en cuanto termina, que son milisegundos. Lo que necesita al
  /// servidor —dar de baja el push y revocar el refresh token— sigue en
  /// segundo plano con un tope de 3 s en total: sin red se sale igual, porque
  /// no se puede atrapar a nadie en una sesión que quiere dejar.
  ///
  /// La bandeja de salida NO se borra: lo que el docente dejó sin enviar es la
  /// única copia de algo que hizo. Queda guardada a su nombre, oculta para
  /// cualquier otro usuario, y sale cuando vuelva a entrar con la misma
  /// cuenta. `confirmLogout` avisa de ello antes de llegar aquí.
  Future<void> logout() {
    final enCurso = _cerrando;
    if (enCurso != null) return enCurso;
    // Ya cerrada (un 401 tardío tras el cierre): no hay nada que soltar, y
    // volver a emitir el estado reharía la navegación al acceso.
    if (!state.loading &&
        state.user == null &&
        ApiClient.instance.refreshToken == null) {
      return Future.value();
    }
    final cierre = _cerrarSesion();
    _cerrando = cierre;
    return cierre.whenComplete(() => _cerrando = null);
  }

  Future<void> _cerrarSesion() async {
    final generacion = ++_generacion;
    final api = ApiClient.instance;
    final refreshInicial = api.refreshToken;
    _cerrandoSesion = true;
    _persistir = true;

    // Tras una sesión caducada (`onSessionExpired`) ya no hay token y no hay a
    // quién avisar.
    final servidor = refreshInicial == null
        ? Future<void>.value()
        : _avisarAlServidor(generacion, refreshInicial);

    try {
      await Future.wait([
        _storage.clear(),
        // Los datos cacheados de un docente no pueden quedar legibles para el
        // siguiente que entre en el mismo teléfono: en una sala de profesores
        // eso sería filtrar notas y cédulas.
        OfflineCache.clear(),
        OutboxService.instance.usarUsuario(null),
        // La hora a la que sincronizó el docente anterior no le dice nada al
        // siguiente, y verla le haría creer que sus datos ya están al día.
        OfflineStatus.instance.limpiar(),
      ]);
    } on Object {
      // Un almacén que falla al borrar no puede dejar a nadie dentro.
    }
    PrecargaService.instance.usarUsuario(null);
    _realtime.dispose();
    state = const AuthState(loading: false);

    await servidor;
    _cerrandoSesion = false;
    // Si alguien inició sesión mientras se avisaba al servidor, los tokens que
    // hay en memoria ya son los suyos.
    if (generacion == _generacion) {
      api.setTokens(accessToken: null, refreshToken: null);
    }
  }

  /// Baja del push y revocación, de mejor esfuerzo y con 3 s en total.
  ///
  /// El push va primero porque necesita el token de acceso: antes se daba de
  /// baja desde `app.dart` **después** de borrar los tokens, la petición
  /// salía sin sesión y el teléfono seguía recibiendo las alertas del docente
  /// anterior. Si esa baja renovó el token, se revoca el par vigente y no el
  /// que ya rotó.
  Future<void> _avisarAlServidor(int generacion, String refreshInicial) async {
    Future<void> avisar() async {
      try {
        await PushService.instance.darDeBaja();
      } on Object {
        // Sin push que dar de baja, o sin red: se revoca igual.
      }
      final vigente = generacion == _generacion
          ? (ApiClient.instance.refreshToken ?? refreshInicial)
          : refreshInicial;
      await _repo.cerrarSesionEnServidor(vigente);
    }

    try {
      await avisar().timeout(const Duration(seconds: 3));
    } on TimeoutException {
      // El token caduca solo; lo local ya se borró.
    }
  }
}

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) {
    final controller = AuthController(
      ref.read(authRepositoryProvider),
      ref.read(sessionStorageProvider),
      RealtimeService.instance,
    );
    controller.bootstrap();
    return controller;
  },
);
