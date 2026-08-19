import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Modo de tema (claro / oscuro / seguir al sistema), persistido.
///
/// Dos cosas que estaban mal y se notaban:
///
///  - **`system` no se podía recuperar.** La pantalla de ajustes solo ofrecía
///    un interruptor de "modo oscuro", así que en cuanto el docente lo tocaba
///    una vez, la app quedaba clavada en claro u oscuro para siempre. El
///    teléfono que cambia solo al anochecer dejaba de hacerlo y no había forma
///    de volver atrás salvo reinstalando.
///  - **Parpadeo al abrir.** El estado inicial era `system` y la preferencia
///    se leía después, de forma asíncrona: quien había elegido claro con el
///    teléfono en oscuro veía un fogonazo oscuro en el primer fotograma.
///    Ahora se lee antes de dibujar, con [ThemeModeController.cargarInicial].
class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController(super.inicial);

  static const _clave = 'theme_mode';

  static ThemeMode _desdeTexto(String? valor) => switch (valor) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };

  /// Lee la preferencia guardada. Se llama desde `main()` **antes** de
  /// `runApp`, para que el primer fotograma ya salga con el tema correcto.
  static Future<ThemeMode> cargarInicial() async {
    final prefs = await SharedPreferences.getInstance();
    return _desdeTexto(prefs.getString(_clave));
  }

  Future<void> set(ThemeMode mode) async {
    if (mode == state) return;
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_clave, mode.name);
  }
}

/// Modo de tema activo. Lo inicializa `main()` con lo que había en disco.
final themeModeProvider =
    StateNotifierProvider<ThemeModeController, ThemeMode>((ref) {
  throw UnimplementedError('themeModeProvider se sobrescribe en main()');
});
