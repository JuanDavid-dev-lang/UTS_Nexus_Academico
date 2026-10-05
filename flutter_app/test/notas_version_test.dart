import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/widgets/notas_version.dart';

const _notas = '''# 📱 UTS Nexus Académico 1.8.1 — «Widgets»

Tu horario y tus accesos favoritos, directo en la pantalla de inicio de
Android. Y la **versión web** ahora se lee completa.

---

## 🧩 Widgets en tu pantalla de inicio (Android)

- **Horario** — tus próximas clases con el día («Hoy», «Mañana»), la hora,
  la materia y el grupo.
- **Acceso rápido** — abre `Notas` y [Agenda](https://x.y).
''';

void main() {
  // Mismas salidas que desktop/tests/unit/notas-version.test.ts.
  test('convierte el Markdown de la release en bloques sin símbolos', () {
    expect(leerNotasVersion(_notas), const [
      BloqueNotas(
        TipoBloqueNotas.parrafo,
        'Tu horario y tus accesos favoritos, directo en la pantalla de inicio '
        'de Android. Y la versión web ahora se lee completa.',
      ),
      BloqueNotas(
        TipoBloqueNotas.titulo,
        '🧩 Widgets en tu pantalla de inicio (Android)',
      ),
      BloqueNotas(
        TipoBloqueNotas.vineta,
        'Horario — tus próximas clases con el día («Hoy», «Mañana»), la hora, '
        'la materia y el grupo.',
      ),
      BloqueNotas(
        TipoBloqueNotas.vineta,
        'Acceso rápido — abre Notas y Agenda.',
      ),
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

  test('no confunde un guion bajo dentro de una palabra con cursiva', () {
    expect(textoPlano('a_b y *c*'), 'a_b y c');
  });
}
