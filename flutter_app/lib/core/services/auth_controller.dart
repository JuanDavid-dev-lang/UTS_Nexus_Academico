import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/offline_cache.dart';
import '../models/auth_user.dart';
import 'connection_settings.dart';
import 'api_client.dart';
import 'auth_repository.dart';
import 'realtime_service.dart';
import 'session_storage.dart';

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
        state = AuthState(loading: false, user: AuthUser.fromJson(Map<String, dynamic>.from(me['user'] as Map)));
        return;
      } catch (_) {}
    }
    state = const AuthState(loading: false);
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
      // Si la renovación va bien, `onTokensRenewed` reconecta el socket.
      final renewed = await api.renewAccessToken();
      if (!renewed) await logout();
    };
  }

  Future<void> login(String email, String password) async {
    final data = await _repo.login(email, password);
    final access = data['accessToken'].toString();
    final refresh = data['refreshToken'].toString();
    await _storage.save(accessToken: access, refreshToken: refresh);
    ApiClient.instance.setTokens(accessToken: access, refreshToken: refresh);
    _realtime.connect(token: access);
    state = AuthState(loading: false, user: AuthUser.fromJson(Map<String, dynamic>.from(data['user'] as Map)));
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
      state = AuthState(
        loading: false,
        user: AuthUser.fromJson(Map<String, dynamic>.from(me['user'] as Map)),
      );
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
