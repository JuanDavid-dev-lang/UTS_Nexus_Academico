import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/admin/admin_mode_provider.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('AdminModeController', () {
    test('inicia activado por defecto para administradores', () {
      final controller = AdminModeController();
      expect(controller.state, isTrue);
    });

    test('permite alternar el modo y guarda en SharedPreferences', () async {
      final controller = AdminModeController();
      await controller.set(false);
      expect(controller.state, isFalse);

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool('uts.admin_mode_enabled'), isFalse);

      await controller.toggle();
      expect(controller.state, isTrue);
      expect(prefs.getBool('uts.admin_mode_enabled'), isTrue);
    });
  });
}
