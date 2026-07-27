import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  Future<void> login(String email, String password) async {
    final data = await _repo.login(email, password);
    final access = data['accessToken'].toString();
    final refresh = data['refreshToken'].toString();
    await _storage.save(accessToken: access, refreshToken: refresh);
    ApiClient.instance.setTokens(accessToken: access, refreshToken: refresh);
    _realtime.connect(token: access);
    state = AuthState(loading: false, user: AuthUser.fromJson(Map<String, dynamic>.from(data['user'] as Map)));
  }

  Future<void> logout() async {
    await _storage.clear();
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
