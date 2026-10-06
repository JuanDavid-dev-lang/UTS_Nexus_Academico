import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/core/widgets/notas_version.dart';

const _notas = '''# 📱 UTS Nexus Académico 1.8.1 — «Widgets»

Tu horario y tus accesos favoritos, directo en la pantalla de inicio de
Android. Y la **versión web** ahora se lee completa.

---

## 🧩 Widgets en tu pantalla de inicio (Android)

- **Horario** — tus próximas clases con el día («Hoy», «Mañana»), la hora,
  la materia y el grupo.
  - Se actualiza al abrir la app.
- **Acceso rápido** — abre `Notas` y [Agenda](https://x.y).

### Cómo agregarlos

1. Deja presionado un espacio vacío.
2. Toca *Widgets*.

> Si no aparece, reinicia el
> teléfono.
''';

void main() {
  // Mismas salidas que desktop/tests/unit/notas-version.test.ts.
  group('leerNotasVersion', () {
    test('convierte el Markdown de la release en bloques sin símbolos', () {
      expect(leerNotasVersion(_notas), const [
        BloqueNotas(
          TipoBloqueNotas.parrafo,
          'Tu horario y tus accesos favoritos, directo en la pantalla de '
          'inicio de Android. Y la versión web ahora se lee completa.',
        ),
        BloqueNotas(
          TipoBloqueNotas.titulo,
          '🧩 Widgets en tu pantalla de inicio (Android)',
          nivel: 2,
        ),
        BloqueNotas(
          TipoBloqueNotas.vineta,
          'Horario — tus próximas clases con el día («Hoy», «Mañana»), la '
          'hora, la materia y el grupo.',
        ),
        BloqueNotas(
          TipoBloqueNotas.vineta,
          'Se actualiza al abrir la app.',
          nivel: 1,
        ),
        BloqueNotas(
          TipoBloqueNotas.vineta,
          'Acceso rápido — abre Notas y Agenda.',
        ),
        BloqueNotas(TipoBloqueNotas.titulo, 'Cómo agregarlos', nivel: 3),
        BloqueNotas(
          TipoBloqueNotas.numerada,
          'Deja presionado un espacio vacío.',
          numero: 1,
        ),
        BloqueNotas(TipoBloqueNotas.numerada, 'Toca Widgets.', numero: 2),
        BloqueNotas(
          TipoBloqueNotas.cita,
          'Si no aparece, reinicia el teléfono.',
        ),
      ]);
    });

    test('conserva el formato en línea como tramos', () {
      final bloque = leerNotasVersion(
        'Y la **versión web** ahora `abre` *rápido*.',
      ).single;
      expect(bloque.tramos, const [
        Tramo('Y la '),
        Tramo('versión web', negrita: true),
        Tramo(' ahora '),
        Tramo('abre', codigo: true),
        Tramo(' '),
        Tramo('rápido', cursiva: true),
        Tramo('.'),
      ]);
    });

    test('deja intacto un texto sin marcado', () {
      expect(leerNotasVersion('Correcciones menores.'), const [
        BloqueNotas(TipoBloqueNotas.parrafo, 'Correcciones menores.'),
      ]);
    });

    test('no devuelve nada para notas vacías', () {
      expect(leerNotasVersion('  \n\n'), isEmpty);
    });

    test('lee un bloque de código como texto, sin las vallas', () {
      expect(leerNotasVersion('```\nnpm run dev\n```'), const [
        BloqueNotas(TipoBloqueNotas.parrafo, 'npm run dev'),
      ]);
    });
  });

  group('tramosEnLinea', () {
    test('no confunde un guion bajo dentro de una palabra con cursiva', () {
      expect(textoPlano('a_b y *c*'), 'a_b y c');
      expect(tramosEnLinea('archivo_de_notas.md'), const [
        Tramo('archivo_de_notas.md'),
      ]);
    });

    test('un asterisco suelto no abre cursiva', () {
      expect(tramosEnLinea('5 * 3 = 15'), const [Tramo('5 * 3 = 15')]);
    });
  });

  testWidgets('pinta las notas sin símbolos de Markdown', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.construir(
          const AparienciaPreferencias(),
          Brightness.light,
        ),
        home: const Scaffold(
          body: SingleChildScrollView(child: NotasVersion(notas: _notas)),
        ),
      ),
    );
    expect(find.textContaining('**'), findsNothing);
    expect(find.textContaining('##'), findsNothing);
    expect(find.textContaining('Cómo agregarlos'), findsOneWidget);
    expect(find.text('2.'), findsOneWidget);
  });
}
