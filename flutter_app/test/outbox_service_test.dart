/// El servicio de la bandeja de salida: qué se envía, en qué orden, con qué
/// sesión y qué pasa cuando el servidor falla o rechaza.
///
/// Se prueba con un servidor falso: lo que importa aquí es la decisión, no la
/// red.
library;

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/sync/outbox_entry.dart';
import 'package:uts_academico/core/sync/outbox_logic.dart';
import 'package:uts_academico/core/sync/outbox_service.dart';
import 'package:uts_academico/core/sync/outbox_storage.dart';

DioException respuesta(int status, {Map<String, dynamic>? cuerpo}) =>
    DioException(
      requestOptions: RequestOptions(path: '/x'),
      type: DioExceptionType.badResponse,
      response: Response(
        requestOptions: RequestOptions(path: '/x'),
        statusCode: status,
        data: cuerpo,
      ),
    );

DioException sinRed() => DioException(
  requestOptions: RequestOptions(path: '/x'),
  type: DioExceptionType.connectionError,
);

/// Servidor falso: cada petición consume la siguiente respuesta programada
/// para su ruta, o sale bien.
class Servidor {
  bool hayRed = true;
  final enviadas = <String>[];
  final Map<String, List<Object>> guion = {};

  Future<void> enviar(OutboxEntry e) async {
    if (!hayRed) throw sinRed();
    final clave = '${e.method} ${e.path}';
    enviadas.add(e.resumen.isEmpty ? clave : e.resumen);
    final cola = guion[clave];
    if (cola != null && cola.isNotEmpty) {
      final siguiente = cola.removeAt(0);
      if (siguiente is! String) throw siguiente;
    }
  }

  Future<void> sondear() async {
    if (!hayRed) throw sinRed();
  }
}

Future<void> reposo(OutboxService s) async {
  do {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  } while (s.snapshot.drenando);
}

Future<ResultadoEscritura> subirNota(
  OutboxService s, {
  String estudiante = 'e1',
  String label = 'Taller 1',
  double score = 4,
}) {
  return s.escribir(
    kind: OutboxKind.gradeUpsert,
    clave: claveNota(
      studentId: estudiante,
      subjectId: 'm1',
      period: '2026-2',
      corte: 1,
      componentType: 'TRABAJOS',
      label: label,
    ),
    method: 'POST',
    path: '/grades',
    body: {'score': score},
    meta: {
      'studentId': estudiante,
      'subjectId': 'm1',
      'period': '2026-2',
      'corte': 1,
      'componentType': 'TRABAJOS',
      'label': label,
      'score': score,
    },
    resumen: '$estudiante:$label=$score',
  );
}

void main() {
  late Servidor servidor;
  late MemoriaOutboxStorage disco;
  late DateTime reloj;
  late OutboxService servicio;

  OutboxService crear({List<OutboxEntry>? inicial, bool sinConexion = false}) {
    disco = MemoriaOutboxStorage(inicial);
    return OutboxService(
      storage: disco,
      enviar: servidor.enviar,
      sondear: servidor.sondear,
      ahora: () => reloj,
      sinConexion: () => sinConexion,
    );
  }

  setUp(() {
    servidor = Servidor();
    reloj = DateTime.utc(2026, 10, 5, 12);
    servicio = crear();
  });

  tearDown(() => servicio.cerrar());

  group('escribir', () {
    test(
      'con red y la bandeja vacía se envía en el acto y no queda nada',
      () async {
        await servicio.usarUsuario('u1');
        final r = await subirNota(servicio);
        expect(r, ResultadoEscritura.enviada);
        expect(servidor.enviadas, ['e1:Taller 1=4.0']);
        expect(servicio.snapshot.vacia, isTrue);
      },
    );

    test('un rechazo del servidor sube como error y no se encola', () async {
      await servicio.usarUsuario('u1');
      servidor.guion['POST /grades'] = [
        respuesta(
          409,
          cuerpo: {'codigo': 'PERIODO_BLOQUEADO', 'message': 'Periodo cerrado'},
        ),
      ];
      await expectLater(subirNota(servicio), throwsA(anything));
      expect(servicio.snapshot.vacia, isTrue);
    });

    test('un 500 deja el cambio en la bandeja en vez de perderlo', () async {
      await servicio.usarUsuario('u1');
      servidor.guion['POST /grades'] = [respuesta(500)];
      final r = await subirNota(servicio);
      expect(r, ResultadoEscritura.encolada);
      expect(servicio.snapshot.pendientes, 1);
      expect(servicio.snapshot.entradas.single.intentos, 1);
    });

    test('sin red se encola sin intentar el envío directo', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      final r = await subirNota(servicio);
      await reposo(servicio);
      expect(r, ResultadoEscritura.encolada);
      expect(servidor.enviadas, isEmpty);
      expect(servicio.snapshot.pendientes, 1);
    });

    test('el cambio está en disco antes de salir', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await subirNota(servicio);
      await reposo(servicio);
      await servicio.volcado();
      expect(disco.contenido.length, 1);
      expect(disco.contenido.single.userId, 'u1');
    });

    test(
      'una nota repetida mientras no hay red deja una sola en la cola',
      () async {
        servicio = crear(sinConexion: true);
        servidor.hayRed = false;
        await servicio.usarUsuario('u1');
        await subirNota(servicio, score: 3);
        await reposo(servicio);
        await subirNota(servicio, score: 5);
        await reposo(servicio);
        expect(servicio.snapshot.entradas.length, 1);
        expect(servicio.snapshot.entradas.single.meta['score'], 5);
      },
    );
  });

  group('drenar', () {
    test('al volver la red envía todo en orden y vacía la bandeja', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await subirNota(servicio, label: 'A');
      await subirNota(servicio, label: 'B');
      await subirNota(servicio, label: 'C');
      await reposo(servicio);
      expect(servicio.snapshot.pendientes, 3);

      servidor.hayRed = true;
      await servicio.drenar(ignorarEspera: true);

      expect(servidor.enviadas, ['e1:A=4.0', 'e1:B=4.0', 'e1:C=4.0']);
      expect(servicio.snapshot.vacia, isTrue);
    });

    test(
      'avisa cuando algo salió, para recargar lo que dependa de ello',
      () async {
        servicio = crear(sinConexion: true);
        servidor.hayRed = false;
        await servicio.usarUsuario('u1');
        await subirNota(servicio);
        await reposo(servicio);
        servidor.hayRed = true;

        var avisos = 0;
        final sub = servicio.alSincronizar.listen((_) => avisos++);
        await servicio.drenar(ignorarEspera: true);
        await Future<void>.delayed(Duration.zero);
        await sub.cancel();
        expect(avisos, 1);
      },
    );

    test(
      'tras un fallo de red espera antes de insistir, y la espera crece',
      () async {
        servicio = crear(sinConexion: true);
        servidor.hayRed = false;
        await servicio.usarUsuario('u1');
        await subirNota(servicio);
        await reposo(servicio);
        servidor.hayRed = true;

        // Aún dentro de la espera: no hace nada.
        reloj = reloj.add(const Duration(seconds: 1));
        await servicio.drenar();
        expect(servidor.enviadas, isEmpty);

        // Pasada la espera, sale.
        reloj = reloj.add(const Duration(minutes: 1));
        await servicio.drenar();
        expect(servidor.enviadas.length, 1);
      },
    );

    test(
      'un rechazo definitivo la deja fallida y sigue con las demás',
      () async {
        servicio = crear(sinConexion: true);
        servidor.hayRed = false;
        await servicio.usarUsuario('u1');
        await subirNota(servicio, label: 'A');
        await subirNota(servicio, label: 'B');
        await reposo(servicio);

        servidor.hayRed = true;
        servidor.guion['POST /grades'] = [
          respuesta(
            409,
            cuerpo: {
              'codigo': 'PERIODO_BLOQUEADO',
              'message': 'Periodo cerrado',
            },
          ),
        ];
        await servicio.drenar(ignorarEspera: true);

        expect(servidor.enviadas.length, 2);
        final s = servicio.snapshot;
        expect(s.fallidas, 1);
        expect(s.pendientes, 0);
        expect(s.entradas.single.resumen, 'e1:A=4.0');
        expect(s.entradas.single.ultimoError?.codigo, 'PERIODO_BLOQUEADO');
      },
    );

    test('reintentar una fallida la devuelve a la cola y sale', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await subirNota(servicio);
      await reposo(servicio);
      servidor.hayRed = true;
      servidor.guion['POST /grades'] = [respuesta(400)];
      await servicio.drenar(ignorarEspera: true);
      expect(servicio.snapshot.fallidas, 1);

      await servicio.reintentar(servicio.snapshot.entradas.single.id);
      await reposo(servicio);
      expect(servicio.snapshot.vacia, isTrue);
    });

    test('descartar quita la entrada y nada más', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await subirNota(servicio, label: 'A');
      await subirNota(servicio, label: 'B');
      await reposo(servicio);
      await servicio.descartar(servicio.snapshot.entradas.first.id);
      expect(servicio.snapshot.entradas.map((e) => e.resumen), ['e1:B=4.0']);
    });

    test('un corte bloqueado pasa al final y se reintenta una vez', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await subirNota(servicio, label: 'A');
      await subirNota(servicio, label: 'B');
      await reposo(servicio);

      servidor.hayRed = true;
      servidor.guion['POST /grades'] = [
        respuesta(
          409,
          cuerpo: {'codigo': 'CORTE_BLOQUEADO', 'message': 'Corte bloqueado'},
        ),
      ];
      await servicio.drenar(ignorarEspera: true);

      // A falló primero, B salió, A volvió a salir al final.
      expect(servidor.enviadas, ['e1:A=4.0', 'e1:B=4.0', 'e1:A=4.0']);
      expect(servicio.snapshot.vacia, isTrue);
    });

    test('si tras aplazarla sigue bloqueada, queda fallida', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await subirNota(servicio);
      await reposo(servicio);

      servidor.hayRed = true;
      final bloqueo = respuesta(
        409,
        cuerpo: {'codigo': 'CORTE_BLOQUEADO', 'message': 'Corte bloqueado'},
      );
      servidor.guion['POST /grades'] = [bloqueo, bloqueo];
      await servicio.drenar(ignorarEspera: true);

      expect(servidor.enviadas.length, 2);
      expect(servicio.snapshot.fallidas, 1);
    });

    test('borrar algo que ya no existe cuenta como entregado', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await servicio.escribir(
        kind: OutboxKind.gradeDelete,
        clave: 'k',
        method: 'DELETE',
        path: '/grades/srv1',
        meta: {'id': 'srv1', 'studentId': 'e1', 'subjectId': 'm1'},
        resumen: 'borrar',
      );
      await reposo(servicio);
      servidor.hayRed = true;
      servidor.guion['DELETE /grades/srv1'] = [respuesta(404)];
      await servicio.drenar(ignorarEspera: true);
      expect(servicio.snapshot.vacia, isTrue);
    });

    test('un 401 pausa y conserva todo', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await subirNota(servicio);
      await reposo(servicio);

      servidor.hayRed = true;
      servidor.guion['POST /grades'] = [respuesta(401)];
      await servicio.drenar(ignorarEspera: true);

      expect(servicio.snapshot.sesionPausada, isTrue);
      expect(servicio.snapshot.pendientes, 1);
      expect(servicio.snapshot.fallidas, 0);
    });

    test(
      'sin red en la sonda no se gasta ningún intento de los cambios',
      () async {
        servicio = crear(sinConexion: true);
        servidor.hayRed = false;
        await servicio.usarUsuario('u1');
        await subirNota(servicio);
        await reposo(servicio);
        await servicio.drenar(ignorarEspera: true);
        expect(servidor.enviadas, isEmpty);
        expect(servicio.snapshot.entradas.single.intentos, 0);
      },
    );
  });

  group('usuarios', () {
    test('solo se envía lo del usuario con sesión', () async {
      final ajeno = OutboxEntry(
        id: 'otro',
        userId: 'u2',
        createdAt: DateTime.utc(2026, 10, 1),
        kind: OutboxKind.gradeUpsert,
        clave: 'k',
        method: 'POST',
        path: '/grades',
        resumen: 'del-otro',
      );
      servicio = crear(inicial: [ajeno]);
      await servicio.usarUsuario('u1');
      await servicio.drenar(ignorarEspera: true);
      expect(servidor.enviadas, isEmpty);
      expect(servicio.snapshot.vacia, isTrue);

      // Cuando el dueño vuelve, lo suyo sigue ahí y sale.
      await servicio.usarUsuario('u2');
      await reposo(servicio);
      expect(servidor.enviadas, ['del-otro']);
    });

    test('cerrar sesión conserva la bandeja en disco', () async {
      servicio = crear(sinConexion: true);
      servidor.hayRed = false;
      await servicio.usarUsuario('u1');
      await subirNota(servicio);
      await reposo(servicio);
      await servicio.usarUsuario(null);
      await servicio.volcado();
      expect(servicio.snapshot.entradas, isEmpty);
      expect(disco.contenido.length, 1);

      await servicio.usarUsuario('u1');
      expect(servicio.snapshot.pendientes, 1);
    });
  });

  group('ArchivoOutboxStorage', () {
    late Directory carpeta;

    setUp(() async {
      carpeta = await Directory.systemTemp.createTemp('outbox_test');
    });
    tearDown(() async {
      if (await carpeta.exists()) await carpeta.delete(recursive: true);
    });

    ArchivoOutboxStorage nuevo() =>
        ArchivoOutboxStorage(carpeta: () async => carpeta);

    OutboxEntry entrada(
      String id, {
      OutboxEstado estado = OutboxEstado.pendiente,
    }) => OutboxEntry(
      id: id,
      userId: 'u1',
      createdAt: DateTime.utc(2026, 10, 5),
      kind: OutboxKind.attendanceClass,
      clave: 'c$id',
      method: 'POST',
      path: '/attendance/bulk',
      body: {
        'registros': [
          {'studentId': 's1', 'present': true},
        ],
      },
      meta: {'date': '2026-10-05'},
      resumen: 'Asistencia',
      estado: estado,
      intentos: 2,
      ultimoError: const OutboxError(status: 500, mensaje: 'caído'),
    );

    test('lo guardado se lee igual en otra instancia', () async {
      await nuevo().guardar([entrada('a'), entrada('b')]);
      final leidas = await nuevo().cargar();
      expect(leidas.map((e) => e.id), ['a', 'b']);
      expect(leidas.first.toJson(), entrada('a').toJson());
    });

    test('lo que estaba en vuelo vuelve como pendiente', () async {
      await nuevo().guardar([entrada('a', estado: OutboxEstado.enviando)]);
      expect((await nuevo().cargar()).single.estado, OutboxEstado.pendiente);
    });

    test('no deja archivo temporal tras escribir', () async {
      await nuevo().guardar([entrada('a')]);
      final nombres = carpeta
          .listSync()
          .map((f) => f.uri.pathSegments.last)
          .toList();
      expect(nombres, ['outbox.json']);
    });

    test('un archivo corrupto se aparta y la bandeja arranca vacía', () async {
      await File(
        '${carpeta.path}${Platform.pathSeparator}outbox.json',
      ).writeAsString('{ esto no es json');
      expect(await nuevo().cargar(), isEmpty);
      expect(
        File(
          '${carpeta.path}${Platform.pathSeparator}outbox.corrupto.json',
        ).existsSync(),
        isTrue,
      );
    });

    test('sin archivo no hay nada que cargar', () async {
      expect(await nuevo().cargar(), isEmpty);
    });

    test(
      'el servicio reanuda tras reiniciar con lo que había en disco',
      () async {
        final almacen = nuevo();
        final primero = OutboxService(
          storage: almacen,
          enviar: servidor.enviar,
          sondear: servidor.sondear,
          ahora: () => reloj,
          sinConexion: () => true,
        );
        servidor.hayRed = false;
        await primero.usarUsuario('u1');
        await subirNota(primero);
        await reposo(primero);
        await primero.volcado();
        await primero.cerrar();

        servidor.hayRed = true;
        final segundo = OutboxService(
          storage: nuevo(),
          enviar: servidor.enviar,
          sondear: servidor.sondear,
          ahora: () => reloj,
        );
        await segundo.usarUsuario('u1');
        await reposo(segundo);
        await segundo.cerrar();

        expect(servidor.enviadas, ['e1:Taller 1=4.0']);
        expect(segundo.snapshot.vacia, isTrue);
      },
    );
  });
}
