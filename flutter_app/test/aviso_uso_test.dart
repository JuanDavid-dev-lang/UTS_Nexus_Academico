import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/auth/auth_user.dart';
import 'package:uts_academico/features/usage/aviso_uso.dart';

void main() {
  group('aviso de uso y privacidad', () {
    test('se enseña solo si falta, hay conexión y no se mostró ya', () {
      expect(debeMostrarAvisoUso(pendiente: true, sinConexion: false, yaMostrado: false), isTrue);
      expect(debeMostrarAvisoUso(pendiente: true, sinConexion: true, yaMostrado: false), isFalse);
      expect(debeMostrarAvisoUso(pendiente: true, sinConexion: false, yaMostrado: true), isFalse);
      expect(debeMostrarAvisoUso(pendiente: false, sinConexion: false, yaMostrado: false), isFalse);
    });

    test('un servidor anterior sin el campo no pide el aviso', () {
      final u = AuthUser.fromJson({'id': 'a', 'email': 'a@b.co', 'role': 'ADMIN', 'fullName': 'A'});
      expect(u.avisoUsoPendiente, isFalse);
      final p = AuthUser.fromJson({
        'id': 'a',
        'email': 'a@b.co',
        'role': 'ADMIN',
        'fullName': 'A',
        'avisoUsoPendiente': true,
      });
      expect(p.avisoUsoPendiente, isTrue);
    });

    test('lleva la misma versión que el backend y el escritorio', () {
      expect(avisoUsoVersion, 1);
    });
  });
}
