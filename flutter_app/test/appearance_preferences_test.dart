/// Persistencia de las preferencias de apariencia (tono, color propio,
/// visión del color y estilo). El modo claro/oscuro/sistema sigue viviendo
/// en `theme_controller.dart` — ver `theme_test.dart` — y no se toca aquí.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/core/theme/appearance/palettes.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('carga inicial', () {
    test('sin nada guardado cae a los valores de fábrica', () async {
      final prefs = await AparienciaController.cargarInicial();
      expect(prefs, AparienciaPreferencias.defecto);
      expect(prefs.tono, Tono.institucional);
      expect(prefs.vision, VisionColor.normal);
      expect(prefs.esquinas, Esquinas.suaves);
      expect(prefs.tamanoTexto, TamanoTexto.normal);
      expect(prefs.reducirMovimiento, false);
    });

    test(
      'un valor corrupto en disco cae a su valor de fábrica, no revienta',
      () async {
        SharedPreferences.setMockInitialValues({
          'apariencia_tono': 'morado-imposible',
          'apariencia_vision': 'rayos-x',
          'apariencia_esquinas': 'puntiagudas',
          'apariencia_tamano_texto': 'gigante',
          'apariencia_color_propio': 'no-es-un-color',
        });
        final prefs = await AparienciaController.cargarInicial();
        expect(prefs, AparienciaPreferencias.defecto);
      },
    );
  });

  group('round trip', () {
    test('cada preferencia persiste y se relee tras reiniciar', () async {
      var controlador = AparienciaController(
        await AparienciaController.cargarInicial(),
      );

      await controlador.setTono(Tono.amatista);
      await controlador.setVision(VisionColor.deuteranopia);
      await controlador.setEsquinas(Esquinas.redondeadas);
      await controlador.setTamanoTexto(TamanoTexto.grande);
      await controlador.setReducirMovimiento(true);
      await controlador.setColorPropio('#1d4ed8');

      final releido = await AparienciaController.cargarInicial();
      expect(releido.tono, Tono.amatista);
      expect(releido.vision, VisionColor.deuteranopia);
      expect(releido.esquinas, Esquinas.redondeadas);
      expect(releido.tamanoTexto, TamanoTexto.grande);
      expect(releido.reducirMovimiento, true);
      // Se normaliza a mayúsculas al guardar.
      expect(releido.colorPropio, '#1D4ED8');
    });

    test('un hex inválido no se guarda: se ignora', () async {
      final controlador = AparienciaController(
        await AparienciaController.cargarInicial(),
      );
      await controlador.setColorPropio('no-es-un-hex');
      expect(controlador.state.colorPropio, colorPropioPorDefecto);

      final releido = await AparienciaController.cargarInicial();
      expect(releido.colorPropio, colorPropioPorDefecto);
    });

    test(
      'restablecer vuelve a los valores de fábrica y los borra de disco',
      () async {
        final controlador = AparienciaController(
          await AparienciaController.cargarInicial(),
        );
        await controlador.setTono(Tono.grafito);
        await controlador.setReducirMovimiento(true);

        await controlador.restablecer();
        expect(controlador.state, AparienciaPreferencias.defecto);

        final releido = await AparienciaController.cargarInicial();
        expect(releido, AparienciaPreferencias.defecto);
      },
    );

    test('elegir el tono que ya estaba no escribe en disco de más', () async {
      final controlador = AparienciaController(
        await AparienciaController.cargarInicial(),
      );
      await controlador.setTono(Tono.institucional);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('apariencia_tono'), isNull);
    });
  });

  group('clave legada', () {
    test('theme_mode no es una clave que esta controladora toque', () async {
      SharedPreferences.setMockInitialValues({'theme_mode': 'dark'});
      final prefs = await AparienciaController.cargarInicial();
      // La apariencia no depende de esa clave: el modo se resuelve aparte.
      expect(prefs, AparienciaPreferencias.defecto);

      final sinTocar = await SharedPreferences.getInstance();
      expect(sinTocar.getString('theme_mode'), 'dark');
    });
  });
}
