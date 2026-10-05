import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_error.dart';
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

class AuthState {
  final bool loading;
  final AuthUser? user;

  const AuthState({required this.loading, this.user});

  bool get isAuthenticated => user != null;

  AuthState copyWith({bool? loading, AuthUser? user}) => AuthState(loading: loading ?? this.loading, user: user ?? this.user);
}

final authRepositoryProvider = Provider((ref) => AuthRepository());
final sessionStorageProvider = Provider((ref) => SessionStorage());

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repo, this._storage, this._realtime) : super(const AuthState(loading: true));

  final AuthRepository _repo;
  final SessionStorage _storage;
  final RealtimeService _realtime;

  Future<void> bootstrap() async {
    final settings = await ConnectionSettings.load();
    ApiClient.instance.setBaseUrl(settings.apiBaseUrl);
    RealtimeService.instance.setBaseUrl(settings.wsBaseUrl);
    _wireSessionCallbacks();

    final session = await _storage.load();
    final access = session['accessToken'];
    final refresh = session['refreshToken'];
    if (access != null) {
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
        if (_esFalloDeServidor(error) && ApiClient.instance.refreshToken != null) {
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
      await _storage.save(accessToken: accessToken, refreshToken: refreshToken);
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

  Future<void> login(String email, String password) async {
    final data = await _repo.login(email, password);
    final access = data['accessToken'].toString();
    final refresh = data['refreshToken'].toString();
    await _storage.save(accessToken: access, refreshToken: refresh);
    ApiClient.instance.setTokens(accessToken: access, refreshToken: refresh);
    _realtime.connect(token: access);
    final usuario = Map<String, dynamic>.from(data['user'] as Map);
    await _storage.saveUser(usuario);
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
    await _storage.save(accessToken: access, refreshToken: refresh);
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
      await _storage.saveUser(usuario);
      state = AuthState(loading: false, user: AuthUser.fromJson(usuario));
    } catch (_) {
      // Un fallo aquí no debe tumbar la sesión: los datos viejos siguen siendo
      // utilizables y la próxima carga los corrige.
    }
  }

  Future<void> logout() async {
    await _storage.clear();
    // Los datos cacheados de un docente no pueden quedar legibles para el
    // siguiente que entre en el mismo teléfono. En un equipo compartido —que es
    // lo normal en una sala de profesores— eso sería filtrar notas y cédulas.
    await OfflineCache.clear();
    // La bandeja de salida NO se borra: lo que el docente dejó sin enviar es la
    // única copia de algo que hizo. Queda guardada a su nombre, oculta para
    // cualquier otro usuario, y sale cuando vuelva a entrar con la misma cuenta.
    // `confirmLogout` avisa de ello antes de llegar aquí.
    await OutboxService.instance.usarUsuario(null);
    PrecargaService.instance.usarUsuario(null);
    // La hora a la que sincronizó el docente anterior no le dice nada al
    // siguiente, y verla le haría creer que sus datos ya están al día.
    await OfflineStatus.instance.limpiar();
    ApiClient.instance.setTokens(accessToken: null, refreshToken: null);
    _realtime.dispose();
    state = const AuthState(loading: false);
  }
}

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  final controller = AuthController(ref.read(authRepositoryProvider), ref.read(sessionStorageProvider), RealtimeService.instance);
  controller.bootstrap();
  return controller;
});
