/// Configuración de navegación.
///
/// `flutter analyze` no ve nada de esto: un índice de rama desalineado o una
/// ruta que ninguna rama atiende compila perfectamente y falla al primer toque,
/// mandando al docente a otra pantalla o dejando la pestaña muerta. Estas
/// pruebas fijan el contrato entre el router y el menú, que es lo único que
/// mantiene las dos listas en el mismo orden.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:uts_academico/app.dart';
import 'package:uts_academico/core/widgets/app_scaffold.dart';

/// La rama N del shell, según la configuración real del router.
List<StatefulShellBranch> ramasDelShell() {
  final shell = router.configuration.routes
      .whereType<StatefulShellRoute>()
      .single;
  return shell.branches;
}

/// Ruta raíz declarada por una rama.
String rutaRaizDe(StatefulShellBranch rama) =>
    (rama.routes.first as GoRoute).path;

void main() {
  group('ramas del shell', () {
    test('hay exactamente una rama por ruta declarada en el menú', () {
      expect(ramasDelShell(), hasLength(rutasDeRama.length));
    });

    test('la rama N atiende a rutasDeRama[N]', () {
      // Este es EL contrato. Si el orden se descuadra, tocar "Materias" abre
      // Asistencia y nada en el análisis estático lo delata.
      final ramas = ramasDelShell();
      for (var i = 0; i < rutasDeRama.length; i++) {
        expect(
          rutaRaizDe(ramas[i]),
          rutasDeRama[i],
          reason: 'La rama $i debería atender ${rutasDeRama[i]}',
        );
      }
    });

    test('cada rama tiene su propio navegador, que es lo que conserva el estado', () {
      final claves = ramasDelShell().map((r) => r.navigatorKey).toList();
      expect(claves.whereType<Object>(), hasLength(claves.length));
      expect(claves.toSet(), hasLength(claves.length));
    });

    test('no hay rutas de rama repetidas', () {
      expect(rutasDeRama.toSet(), hasLength(rutasDeRama.length));
    });
  });

  group('destinos del menú', () {
    test('todo destino visible tiene una rama que lo atienda', () {
      // Un destino sin rama deja una entrada de menú que no lleva a ninguna
      // parte: `goBranch` recibe -1 y el toque se ignora en silencio.
      final destinos = [
        ...primaryDestinations,
        ...secondaryDestinations,
        thesisDestination,
      ];
      for (final destino in destinos) {
        expect(
          indiceDeRama(destino.route),
          isNonNegative,
          reason: 'El destino "${destino.label}" (${destino.route}) no tiene rama',
        );
      }
    });

    test('el perfil tiene rama aunque no salga en la lista de destinos', () {
      // Se abre desde la hoja "Más" y desde el menú de sesión, no como destino.
      expect(indiceDeRama('/profile'), isNonNegative);
    });

    test('los destinos principales caben en una barra de Material', () {
      // Material especifica entre tres y cinco; con el botón "Más" son cinco.
      expect(primaryDestinations.length + 1, lessThanOrEqualTo(5));
      // Y exactamente cinco: con cuatro sobraba un hueco que obligaba a
      // esconder la agenda en la hoja, siendo la pantalla que un docente abre
      // a diario.
      expect(primaryDestinations.length + 1, 5);
    });

    test('los cuatro principales ocupan las cuatro primeras ramas', () {
      // El quinto botón de la barra es "Más", que no es una rama: ocupa la
      // posición `primaryDestinations.length`. Si los principales no fueran
      // las primeras ramas, ese cálculo señalaría a una pantalla real y
      // tocar "Más" abriría cualquier cosa.
      for (var i = 0; i < primaryDestinations.length; i++) {
        expect(
          indiceDeRama(primaryDestinations[i].route),
          i,
          reason: 'El destino principal $i debería ser la rama $i',
        );
      }
    });

    test('las capacidades nuevas tienen su destino y su rama', () {
      final rutas = secondaryDestinations.map((d) => d.route).toSet();
      expect(rutas, contains('/actividades'));
      expect(indiceDeRama('/actividades'), isNonNegative);
    });

    test('un destino acotado por rol declara los roles que lo ven', () {
      // Un estudiante no gestiona estudiantes ni pasa lista: el menú no debe
      // ofrecer entradas que el backend va a rechazar con un 403.
      final estudiantes =
          secondaryDestinations.firstWhere((d) => d.route == '/students');
      expect(estudiantes.visiblePara('STUDENT'), isFalse);
      expect(estudiantes.visiblePara('PROFESSOR'), isTrue);

      // Y uno sin roles declarados lo ve todo el mundo.
      final actividades =
          secondaryDestinations.firstWhere((d) => d.route == '/actividades');
      expect(actividades.visiblePara('STUDENT'), isTrue);
      expect(actividades.visiblePara(null), isTrue);
    });

    test('no hay rutas repetidas entre principales y secundarios', () {
      final rutas = [...primaryDestinations, ...secondaryDestinations]
          .map((d) => d.route)
          .toList();
      expect(rutas.toSet(), hasLength(rutas.length));
    });

    test('una ruta desconocida no devuelve una rama válida', () {
      expect(indiceDeRama('/no-existe'), -1);
    });
  });

  group('rutas fuera del shell', () {
    test('login, registro y tutorial viven fuera: no necesitan sesión', () {
      final raiz = router.configuration.routes
          .whereType<GoRoute>()
          .map((r) => r.path)
          .toSet();
      expect(raiz, containsAll(['/login', '/recovery', '/registro', '/tutorial']));
    });
  });

  group('rutas anidadas', () {
    test('el detalle de una materia cuelga de su pestaña', () {
      // Dentro de la rama y no suelto: así se apila sobre el listado y volver
      // atrás no saca al docente de "Materias".
      final materias = ramasDelShell()[indiceDeRama('/subjects')];
      final hijas = (materias.routes.first as GoRoute).routes;
      expect(hijas.whereType<GoRoute>().map((r) => r.path), contains(':subjectId'));
    });

    test('el escáner de planillas cuelga de Asistencia', () {
      final asistencia = ramasDelShell()[indiceDeRama('/attendance')];
      final hijas = (asistencia.routes.first as GoRoute).routes;
      expect(hijas.whereType<GoRoute>().map((r) => r.path), contains('scan'));
    });
  });
}
