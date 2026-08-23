import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/navigation/menu_preferences.dart';

void main() {
  const canonical = [
    '/',
    '/subjects',
    '/agenda',
    '/ai',
    '/students',
    '/settings',
  ];

  group('reconciliación del menú', () {
    test('conserva rutas estables y agrega destinos nuevos al final', () {
      expect(
        reconcileMenuRoutes(
          savedRoutes: const ['/agenda', '/', '/subjects', '/ai'],
          authorizedRoutes: canonical,
        ),
        ['/agenda', '/', '/subjects', '/ai', '/students', '/settings'],
      );
    });

    test('elimina desconocidos, duplicados y rutas revocadas por rol', () {
      expect(
        reconcileMenuRoutes(
          savedRoutes: const ['/students', '/agenda', '/agenda', '/vieja'],
          authorizedRoutes: const [
            '/',
            '/subjects',
            '/agenda',
            '/ai',
            '/settings',
          ],
        ),
        ['/agenda', '/', '/subjects', '/ai', '/settings'],
      );
    });

    test('el gate de director se reconcilia al activarse y revocarse', () {
      final enabled = reconcileMenuRoutes(
        savedRoutes: const ['/agenda'],
        authorizedRoutes: const ['/', '/agenda', '/trabajos-grado'],
      );
      expect(enabled, ['/agenda', '/', '/trabajos-grado']);
      expect(
        reconcileMenuRoutes(
          savedRoutes: enabled,
          authorizedRoutes: const ['/', '/agenda'],
        ),
        ['/agenda', '/'],
      );
    });

    test('Más no forma parte del payload persistible', () {
      final result = reconcileMenuRoutes(
        savedRoutes: const ['/more', '/agenda'],
        authorizedRoutes: canonical,
      );
      expect(result, isNot(contains('/more')));
      expect(result.take(menuPrimaryCount), hasLength(4));
    });
  });

  group('persistencia por usuario', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('cada usuario conserva su propio orden', () async {
      final repository = MenuPreferencesRepository();
      await repository.save(
        userId: 'uno',
        orderedRoutes: const ['/agenda', '/', '/subjects', '/ai'],
        authorizedRoutes: canonical,
      );
      await repository.save(
        userId: 'dos',
        orderedRoutes: const ['/subjects', '/ai', '/', '/agenda'],
        authorizedRoutes: canonical,
      );
      expect(
        (await repository.load(
          userId: 'uno',
          authorizedRoutes: canonical,
        )).first,
        '/agenda',
      );
      expect(
        (await repository.load(
          userId: 'dos',
          authorizedRoutes: canonical,
        )).first,
        '/subjects',
      );
    });

    test('JSON inválido o versión futura vuelve al orden canónico', () async {
      SharedPreferences.setMockInitialValues({
        'menu_order.v1.roto': '{',
        'menu_order.v1.futuro': jsonEncode({
          'version': menuPreferenceVersion + 1,
          'orderedRoutes': ['/agenda'],
        }),
      });
      final repository = MenuPreferencesRepository();
      expect(
        await repository.load(userId: 'roto', authorizedRoutes: canonical),
        canonical,
      );
      expect(
        await repository.load(userId: 'futuro', authorizedRoutes: canonical),
        canonical,
      );
    });
  });
}
