import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../auth/auth_controller.dart';

/// Controlador del Modo de Interfaz para administradores.
///
/// Permite a un usuario con rol ADMIN alternar entre el "Modo Normal"
/// (interfaz limpia y de docencia como un usuario estándar) y el "Modo Admin"
/// (supervisión completa de profesores, cuentas y herramientas institucionales).
class AdminModeController extends StateNotifier<bool> {
  AdminModeController() : super(true) {
    _cargarPreferencia();
  }

  static const _clave = 'uts.admin_mode_enabled';

  Future<void> _cargarPreferencia() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      state = prefs.getBool(_clave) ?? true;
    } catch (_) {}
  }

  Future<void> toggle() async {
    await set(!state);
  }

  Future<void> set(bool enabled) async {
    if (state == enabled) return;
    state = enabled;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_clave, enabled);
    } catch (_) {}
  }
}

final adminModeProvider =
    StateNotifierProvider<AdminModeController, bool>((ref) {
  return AdminModeController();
});

/// Devuelve `true` ÚNICAMENTE si el usuario actual tiene rol ADMIN Y tiene el
/// modo admin activado. Para cualquier otro rol, siempre devuelve `false`.
final isAdminModeActiveProvider = Provider<bool>((ref) {
  final user = ref.watch(authControllerProvider).user;
  if (user?.role != 'ADMIN') return false;
  return ref.watch(adminModeProvider);
});
