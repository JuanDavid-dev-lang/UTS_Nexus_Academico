import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/auth/password_policy.dart';

/// La política de una contraseña nueva vivía escrita dos veces —el
/// autorregistro y la recuperación— y no decían lo mismo: la recuperación
/// pedía ocho caracteres sin más, así que quien se registraba con la política
/// larga podía dejarla en «12345678» a los cinco minutos. La puerta más débil
/// es la que manda.
void main() {
  group('revisarPassword', () {
    test('acepta una contraseña que cumple todo', () {
      expect(revisarPassword('Segura12345'), isNull);
    });

    test('rechaza la que se queda corta aunque tenga de todo', () {
      expect(revisarPassword('Corta123'), contains('10'));
    });

    test('exige minúscula, mayúscula y número', () {
      expect(revisarPassword('TODOMAYUSCULA1'), contains('minúscula'));
      expect(revisarPassword('todominuscula1'), contains('mayúscula'));
      expect(revisarPassword('SinNumerosAqui'), contains('número'));
    });

    test('rechaza la que pasa del tope de bcrypt', () {
      // bcrypt solo mira 72 bytes: más allá no gana seguridad, solo ocupa el
      // único hilo del servidor.
      expect(revisarPassword('Aa1${'x' * maxPassword}'), contains('$maxPassword'));
    });

    test('el mínimo exacto vale', () {
      expect(minPassword, 10);
      expect(revisarPassword('Abcdefgh12'), isNull);
    });
  });
}
