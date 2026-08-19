/// Modo de tema.
///
/// Fija dos cosas que se rompieron una vez y no dan error al romperse:
/// que «seguir al sistema» siga siendo alcanzable, y que la preferencia
/// guardada se lea antes de dibujar en vez de después.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/theme/theme_controller.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('carga inicial', () {
    test('sin preferencia guardada sigue al sistema', () async {
      expect(await ThemeModeController.cargarInicial(), ThemeMode.system);
    });

    test('lee la preferencia del disco antes de dibujar', () async {
      // Esto es lo que evita el fogonazo: si se leyera después, el primer
      // fotograma saldría con el tema del sistema y cambiaría a continuación.
      SharedPreferences.setMockInitialValues({'theme_mode': 'light'});
      expect(await ThemeModeController.cargarInicial(), ThemeMode.light);

      SharedPreferences.setMockInitialValues({'theme_mode': 'dark'});
      expect(await ThemeModeController.cargarInicial(), ThemeMode.dark);
    });

    test('un valor corrupto cae al sistema, no revienta', () async {
      SharedPreferences.setMockInitialValues({'theme_mode': 'morado'});
      expect(await ThemeModeController.cargarInicial(), ThemeMode.system);
    });
  });

  group('cambio de modo', () {
    test('arranca con lo que le pasa main(), no con un valor fijo', () {
      expect(ThemeModeController(ThemeMode.dark).state, ThemeMode.dark);
    });

    test('«sistema» sigue siendo alcanzable desde claro u oscuro', () async {
      // El fallo que esto atrapa: con un interruptor de dos posiciones, tocar
      // el tema una vez dejaba la app clavada y el teléfono dejaba de cambiar
      // solo al anochecer, sin forma de volver atrás.
      final controlador = ThemeModeController(ThemeMode.light);
      await controlador.set(ThemeMode.dark);
      expect(controlador.state, ThemeMode.dark);
      await controlador.set(ThemeMode.system);
      expect(controlador.state, ThemeMode.system);
    });

    test('persiste la elección para el próximo arranque', () async {
      await ThemeModeController(ThemeMode.system).set(ThemeMode.dark);
      expect(await ThemeModeController.cargarInicial(), ThemeMode.dark);
    });

    test('los tres modos se guardan y se releen', () async {
      for (final modo in ThemeMode.values) {
        await ThemeModeController(ThemeMode.system).set(modo);
        expect(await ThemeModeController.cargarInicial(), modo);
      }
    });

    test('elegir el modo que ya estaba no escribe en disco de más', () async {
      final controlador = ThemeModeController(ThemeMode.dark);
      await controlador.set(ThemeMode.dark);
      // Nada guardado: el estado ya era ese, así que la lectura cae al defecto.
      expect(await ThemeModeController.cargarInicial(), ThemeMode.system);
    });
  });
}
