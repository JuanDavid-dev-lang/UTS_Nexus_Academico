/// La precarga en segundo plano: qué pide, cuándo y que sus fallos no se vean.
///
/// Si se rompe no falla nada a la vista: el docente simplemente abre una
/// pantalla sin red y no tiene datos, o, peor, un fallo de la precarga enciende
/// la franja de «sin conexión» sin que nadie haya pedido nada.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/data/models.dart';
import 'package:uts_academico/core/storage/offline_cache.dart';
import 'package:uts_academico/core/storage/offline_status.dart';
import 'package:uts_academico/core/sync/precarga_plan.dart';
import 'package:uts_academico/core/sync/precarga_service.dart';

Subject materia(String id, String code, {String period = '2026-2'}) =>
    Subject(id: id, name: 'M$id', code: code, period: period, credits: 3);

Group grupo(
  String id,
  String subjectId,
  String name, {
  String period = '2026-2',
}) => Group(id: id, name: name, subjectId: subjectId, period: period);

void main() {
  group('debePrecargar', () {
    final ahora = DateTime(2026, 10, 5, 12);

    test('solo para docentes', () {
      for (final rol in [
        'ADMIN',
        'COORDINATOR',
        'SECRETARY',
        'STUDENT',
        null,
      ]) {
        expect(
          debePrecargar(
            rol: rol,
            corriendo: false,
            ultimaCompleta: null,
            ahora: ahora,
          ),
          isFalse,
          reason: '$rol',
        );
      }
      expect(
        debePrecargar(
          rol: 'PROFESSOR',
          corriendo: false,
          ultimaCompleta: null,
          ahora: ahora,
        ),
        isTrue,
      );
    });

    test('nunca mientras hay una en marcha', () {
      expect(
        debePrecargar(
          rol: 'PROFESSOR',
          corriendo: true,
          ultimaCompleta: null,
          ahora: ahora,
        ),
        isFalse,
      );
    });

    test('como mucho una cada 30 minutos', () {
      bool toca(Duration desde) => debePrecargar(
        rol: 'PROFESSOR',
        corriendo: false,
        ultimaCompleta: ahora.subtract(desde),
        ahora: ahora,
      );
      expect(toca(const Duration(minutes: 29)), isFalse);
      expect(toca(const Duration(minutes: 30)), isTrue);
      expect(toca(const Duration(hours: 3)), isTrue);
    });
  });

  group('tareasDeMaterias', () {
    test('solo materias del periodo, en orden de código', () {
      final t = tareasDeMaterias(
        subjects: [
          materia('b', 'ZZZ'),
          materia('a', 'AAA'),
          materia('v', 'OLD', period: '2025-1'),
        ],
        groups: const [],
        period: '2026-2',
      );
      final ids = t.map((e) => e.subjectId).toSet().toList();
      expect(ids, ['a', 'b']);
    });

    test('una materia sin grupos pide su lista sin grupo', () {
      final t = tareasDeMaterias(
        subjects: [materia('a', 'AAA')],
        groups: const [],
        period: '2026-2',
      );
      expect(
        t,
        contains(const TareaPrecarga(TipoPrecarga.estudiantesDeGrupo, 'a')),
      );
    });

    test(
      'una lista por grupo del periodo, y no los de otra materia ni otro periodo',
      () {
        final t = tareasDeMaterias(
          subjects: [materia('a', 'AAA')],
          groups: [
            grupo('g2', 'a', 'B'),
            grupo('g1', 'a', 'A'),
            grupo('gx', 'otra', 'A'),
            grupo('gv', 'a', 'A', period: '2025-1'),
          ],
          period: '2026-2',
        );
        final porGrupo = t
            .where((e) => e.tipo == TipoPrecarga.estudiantesDeGrupo)
            .map((e) => e.groupId)
            .toList();
        expect(porGrupo, ['g1', 'g2']);
      },
    );

    test('cada materia trae las seis lecturas que las pantallas piden', () {
      final t = tareasDeMaterias(
        subjects: [materia('a', 'AAA')],
        groups: [grupo('g1', 'a', 'A')],
        period: '2026-2',
      );
      expect(t.map((e) => e.tipo).toSet(), TipoPrecarga.values.toSet());
    });

    test('el tope de materias acota la pasada', () {
      final t = tareasDeMaterias(
        subjects: [
          for (var i = 0; i < 50; i++)
            materia('m$i', 'C${i.toString().padLeft(2, '0')}'),
        ],
        groups: const [],
        period: '2026-2',
        tope: 5,
      );
      expect(t.map((e) => e.subjectId).toSet().length, 5);
    });
  });

  group('PrecargaService', () {
    late List<TareaPrecarga> pedidas;
    var hayRed = true;
    var reloj = DateTime(2026, 10, 5, 12);

    PrecargaService crear({Future<void> Function(TareaPrecarga)? ejecutor}) {
      return PrecargaService(
        ahora: () => reloj,
        periodo: () => '2026-2',
        base: () async {
          if (!hayRed) throw Exception('sin red');
          return (
            materias: [materia('a', 'AAA')],
            grupos: [grupo('g1', 'a', 'A')],
          );
        },
        ejecutor: ejecutor ?? (t) async => pedidas.add(t),
      );
    }

    setUp(() {
      pedidas = [];
      hayRed = true;
      reloj = DateTime(2026, 10, 5, 12);
    });

    test(
      'un docente con red precarga todo y no repite dentro de 30 minutos',
      () async {
        final s = crear()..usarUsuario('PROFESSOR');
        await s.solicitar();
        final primera = pedidas.length;
        expect(primera, greaterThan(0));

        reloj = reloj.add(const Duration(minutes: 10));
        await s.solicitar();
        expect(pedidas.length, primera);

        reloj = reloj.add(const Duration(minutes: 25));
        await s.solicitar();
        expect(pedidas.length, primera * 2);
      },
    );

    test('para otros roles no hace nada', () async {
      final s = crear()..usarUsuario('ADMIN');
      await s.solicitar();
      expect(pedidas, isEmpty);
    });

    test(
      'sin red no cuenta como hecha: la siguiente señal reintenta',
      () async {
        final s = crear()..usarUsuario('PROFESSOR');
        hayRed = false;
        await s.solicitar();
        expect(pedidas, isEmpty);

        hayRed = true;
        await s.solicitar();
        expect(pedidas, isNotEmpty);
      },
    );

    test('un fallo en una lectura se ignora y la pasada sigue', () async {
      var llamadas = 0;
      final s = crear(
        ejecutor: (t) async {
          llamadas++;
          if (llamadas == 1) throw Exception('boom');
        },
      )..usarUsuario('PROFESSOR');
      await s.solicitar();
      expect(llamadas, greaterThan(1));
    });

    test('nunca hay dos pasadas a la vez', () async {
      var enVuelo = 0;
      var maximo = 0;
      final s = crear(
        ejecutor: (t) async {
          enVuelo++;
          if (enVuelo > maximo) maximo = enVuelo;
          await Future<void>.delayed(const Duration(milliseconds: 1));
          enVuelo--;
        },
      )..usarUsuario('PROFESSOR');
      await Future.wait([s.solicitar(), s.solicitar(), s.solicitar()]);
      expect(maximo, 1);
    });

    test('cambiar de usuario corta la pasada del anterior', () async {
      late PrecargaService s;
      var llamadas = 0;
      s = crear(
        ejecutor: (t) async {
          llamadas++;
          if (llamadas == 1) s.usarUsuario(null);
        },
      )..usarUsuario('PROFESSOR');
      await s.solicitar();
      expect(llamadas, 1);
    });
  });

  group('lecturas como precarga', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('un fallo no cae a la caché ni marca «datos guardados»', () async {
      await OfflineCache.save('clave', [
        {'a': 1},
      ]);
      await expectLater(
        comoPrecarga(
          () => listaConCache('clave', () async => throw Exception('sin red')),
        ),
        throwsException,
      );
      expect(OfflineStatus.instance.desde, isNull);
    });

    test('un éxito guarda en la caché sin marcar la app en línea', () async {
      final antes = OfflineStatus.instance.ultimaSincronizacion;
      final items = await comoPrecarga(
        () => listaConCache(
          'nueva',
          () async => [
            {'x': 1},
          ],
        ),
      );
      expect(items.single['x'], 1);
      expect((await OfflineCache.read('nueva'))?.dato, isNotNull);
      expect(OfflineStatus.instance.ultimaSincronizacion, antes);
    });

    test(
      'fuera de la precarga un fallo sí sirve lo guardado y lo marca',
      () async {
        await OfflineCache.save('clave2', [
          {'a': 1},
        ]);
        final items = await listaConCache(
          'clave2',
          () async => throw Exception('x'),
        );
        expect(items.single['a'], 1);
        expect(OfflineStatus.instance.desde, isNotNull);
        await OfflineStatus.instance.limpiar();
      },
    );
  });
}
