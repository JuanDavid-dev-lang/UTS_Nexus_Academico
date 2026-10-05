/// Lógica pura de la bandeja de salida: fusión por clave natural, clasificación
/// de fallos, esperas y superposición sobre lo cacheado.
///
/// Un error aquí no lanza nada: duplica una nota, pierde una clase pasada sin
/// red o deja un cambio rechazado reintentándose para siempre.
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/data/models.dart';
import 'package:uts_academico/core/network/api_error.dart';
import 'package:uts_academico/core/sync/outbox_entry.dart';
import 'package:uts_academico/core/sync/outbox_logic.dart';

OutboxEntry nota({
  String id = 'n1',
  String user = 'u1',
  String estudiante = 'e1',
  String label = 'Taller 1',
  double score = 4,
  int corte = 1,
  String tipo = 'TRABAJOS',
  OutboxEstado estado = OutboxEstado.pendiente,
}) {
  return OutboxEntry(
    id: id,
    userId: user,
    createdAt: DateTime.utc(2026, 10, 5),
    kind: OutboxKind.gradeUpsert,
    clave: claveNota(
      studentId: estudiante,
      subjectId: 'm1',
      period: '2026-2',
      corte: corte,
      componentType: tipo,
      label: label,
    ),
    method: 'POST',
    path: '/grades',
    body: {'score': score},
    meta: {
      'studentId': estudiante,
      'subjectId': 'm1',
      'period': '2026-2',
      'corte': corte,
      'componentType': tipo,
      'label': label,
      'score': score,
    },
    estado: estado,
  );
}

OutboxEntry borrado({
  String id = 'd1',
  String? notaId = 'srv1',
  String estudiante = 'e1',
  String label = 'Taller 1',
}) {
  return OutboxEntry(
    id: id,
    userId: 'u1',
    createdAt: DateTime.utc(2026, 10, 5),
    kind: OutboxKind.gradeDelete,
    clave: claveNota(
      studentId: estudiante,
      subjectId: 'm1',
      period: '2026-2',
      corte: 1,
      componentType: 'TRABAJOS',
      label: label,
    ),
    method: 'DELETE',
    path: '/grades/${notaId ?? ''}',
    meta: {
      'id': notaId ?? '',
      'studentId': estudiante,
      'subjectId': 'm1',
      'period': '2026-2',
      'corte': 1,
      'componentType': 'TRABAJOS',
      'label': label,
    },
  );
}

OutboxEntry clase({
  String id = 'c1',
  String grupo = 'g1',
  String dia = '2026-10-05',
  List<Map<String, dynamic>> registros = const [],
  OutboxEstado estado = OutboxEstado.pendiente,
}) {
  final fecha = DateTime.parse(dia);
  return OutboxEntry(
    id: id,
    userId: 'u1',
    createdAt: DateTime.utc(2026, 10, 5),
    kind: OutboxKind.attendanceClass,
    clave: claveAsistencia(subjectId: 'm1', groupId: grupo, date: fecha),
    method: 'POST',
    path: '/attendance/bulk',
    body: {'registros': registros, 'durationMinutes': 90},
    meta: {'subjectId': 'm1', 'groupId': grupo, 'date': dia},
    estado: estado,
  );
}

OutboxFallo fallo(
  ApiErrorKind kind, {
  int? status,
  String? codigo,
  Duration? retryAfter,
}) => OutboxFallo(
  kind: kind,
  status: status,
  codigo: codigo,
  mensaje: 'x',
  retryAfter: retryAfter,
);

void main() {
  group('encolar: notas', () {
    test('una nota nueva de la misma clave sustituye a la pendiente', () {
      final lista = encolar([nota(id: 'a', score: 3)], nota(id: 'b', score: 5));
      expect(lista.map((e) => e.id), ['b']);
      expect(lista.single.meta['score'], 5);
    });

    test('la sustituta ocupa el sitio de la anterior, no el final', () {
      final lista = encolar([
        nota(id: 'a', label: 'T1'),
        nota(id: 'z', label: 'T2'),
      ], nota(id: 'b', label: 'T1', score: 2));
      expect(lista.map((e) => e.id), ['b', 'z']);
    });

    test('etiquetas distintas son notas distintas', () {
      final lista = encolar([
        nota(id: 'a', label: 'T1'),
      ], nota(id: 'b', label: 'T2'));
      expect(lista.length, 2);
    });

    test('otro estudiante, corte o componente no se fusiona', () {
      var lista = [nota(id: 'a')];
      lista = encolar(lista, nota(id: 'b', estudiante: 'e2'));
      lista = encolar(lista, nota(id: 'c', corte: 2));
      lista = encolar(lista, nota(id: 'd', tipo: 'PARCIALES'));
      expect(lista.length, 4);
    });

    test('lo que está en vuelo no se toca: la nueva entra detrás', () {
      final lista = encolar([
        nota(id: 'a', estado: OutboxEstado.enviando),
      ], nota(id: 'b', score: 1));
      expect(lista.map((e) => e.id), ['a', 'b']);
    });

    test(
      'una fallida sí se sustituye: es lo que el docente volvió a teclear',
      () {
        final lista = encolar([
          nota(id: 'a', estado: OutboxEstado.fallida),
        ], nota(id: 'b'));
        expect(lista.map((e) => e.id), ['b']);
      },
    );
  });

  group('encolar: borrados', () {
    test(
      'borrar una nota que solo existía pendiente quita su subida y no deja nada',
      () {
        final lista = encolar([nota(id: 'a')], borrado(notaId: null));
        expect(lista, isEmpty);
      },
    );

    test(
      'borrar una nota del servidor con subida pendiente deja solo el borrado',
      () {
        final lista = encolar([nota(id: 'a')], borrado(notaId: 'srv1'));
        expect(lista.map((e) => e.kind), [OutboxKind.gradeDelete]);
        expect(lista.single.path, '/grades/srv1');
      },
    );

    test('el mismo borrado dos veces no se apila', () {
      final primera = encolar([], borrado(id: 'd1'));
      final lista = encolar(primera, borrado(id: 'd2'));
      expect(lista.length, 1);
    });

    test('volver a subir una nota borrada va detrás del borrado', () {
      var lista = encolar([], borrado());
      lista = encolar(lista, nota(id: 'n'));
      expect(lista.map((e) => e.kind), [
        OutboxKind.gradeDelete,
        OutboxKind.gradeUpsert,
      ]);
    });

    test('el borrado de una nota no afecta a otras', () {
      final lista = encolar([nota(id: 'a', label: 'T2')], borrado(label: 'T1'));
      expect(lista.length, 2);
    });
  });

  group('encolar: asistencia', () {
    test('la lista nueva de la misma clase sustituye a la pendiente', () {
      final lista = encolar(
        [
          clase(
            id: 'a',
            registros: [
              {'studentId': 's1', 'present': true},
            ],
          ),
        ],
        clase(
          id: 'b',
          registros: [
            {'studentId': 's1', 'present': false},
          ],
        ),
      );
      expect(lista.length, 1);
      expect(lista.single.id, 'b');
    });

    test('otro grupo u otro día son otra clase', () {
      var lista = [clase(id: 'a')];
      lista = encolar(lista, clase(id: 'b', grupo: 'g2'));
      lista = encolar(lista, clase(id: 'c', dia: '2026-10-06'));
      expect(lista.length, 3);
    });

    test('la clave no depende de la hora del día', () {
      expect(
        claveAsistencia(
          subjectId: 'm',
          groupId: 'g',
          date: DateTime(2026, 10, 5, 7),
        ),
        claveAsistencia(
          subjectId: 'm',
          groupId: 'g',
          date: DateTime(2026, 10, 5, 22),
        ),
      );
    });
  });

  group('decidir', () {
    final subida = nota();
    final baja = borrado();

    test('sin red, tiempo agotado, 5xx y 429 se reintentan', () {
      for (final kind in [
        ApiErrorKind.network,
        ApiErrorKind.timeout,
        ApiErrorKind.server,
        ApiErrorKind.rateLimited,
      ]) {
        expect(
          decidir(subida, fallo(kind)),
          Veredicto.reintentar,
          reason: '$kind',
        );
      }
    });

    test('un 401 pausa sin descartar', () {
      expect(
        decidir(subida, fallo(ApiErrorKind.unauthorized, status: 401)),
        Veredicto.pausarSesion,
      );
    });

    test('un 404 al borrar cuenta como hecho; al subir, es un fallo', () {
      expect(
        decidir(baja, fallo(ApiErrorKind.notFound, status: 404)),
        Veredicto.exito,
      );
      expect(
        decidir(subida, fallo(ApiErrorKind.notFound, status: 404)),
        Veredicto.fallar,
      );
    });

    test('un corte bloqueado se aplaza una vez y luego falla', () {
      final bloqueo = fallo(
        ApiErrorKind.conflict,
        status: 409,
        codigo: 'CORTE_BLOQUEADO',
      );
      expect(decidir(subida, bloqueo), Veredicto.diferir);
      expect(
        decidir(subida.copyWith(diferida: true), bloqueo),
        Veredicto.fallar,
      );
    });

    test(
      'periodo bloqueado y el resto de 4xx fallan: repetirlos no cambia nada',
      () {
        expect(
          decidir(
            subida,
            fallo(
              ApiErrorKind.conflict,
              status: 409,
              codigo: 'PERIODO_BLOQUEADO',
            ),
          ),
          Veredicto.fallar,
        );
        expect(
          decidir(subida, fallo(ApiErrorKind.validation, status: 400)),
          Veredicto.fallar,
        );
        expect(
          decidir(subida, fallo(ApiErrorKind.forbidden, status: 403)),
          Veredicto.fallar,
        );
      },
    );

    test('falloDe lee el código del cuerpo y el Retry-After', () {
      final error = DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.badResponse,
        response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: 429,
          data: {'codigo': 'LIMITE', 'message': 'Demasiadas'},
          headers: Headers.fromMap({
            'retry-after': ['90'],
          }),
        ),
      );
      final f = falloDe(error);
      expect(f.kind, ApiErrorKind.rateLimited);
      expect(f.codigo, 'LIMITE');
      expect(f.retryAfter, const Duration(seconds: 90));
    });

    test('falloDe sin cabecera ni código los deja nulos', () {
      final f = falloDe(
        DioException(
          requestOptions: RequestOptions(path: '/x'),
          type: DioExceptionType.connectionError,
        ),
      );
      expect(f.kind, ApiErrorKind.network);
      expect(f.codigo, isNull);
      expect(f.retryAfter, isNull);
    });
  });

  group('esperaTrasFallo', () {
    test('crece al doble y se detiene en cinco minutos', () {
      expect(esperaTrasFallo(1), const Duration(seconds: 5));
      expect(esperaTrasFallo(2), const Duration(seconds: 10));
      expect(esperaTrasFallo(3), const Duration(seconds: 20));
      expect(esperaTrasFallo(20), const Duration(minutes: 5));
    });

    test('respeta un Retry-After mayor, pero no uno menor', () {
      expect(
        esperaTrasFallo(1, retryAfter: const Duration(seconds: 120)),
        const Duration(seconds: 120),
      );
      expect(
        esperaTrasFallo(3, retryAfter: const Duration(seconds: 2)),
        const Duration(seconds: 20),
      );
    });
  });

  group('entradas en JSON', () {
    test('ida y vuelta conserva todo', () {
      final original = nota(id: 'x').copyWith(
        intentos: 3,
        diferida: true,
        ultimoError: const OutboxError(status: 409, codigo: 'X', mensaje: 'm'),
      );
      final vuelta = OutboxEntry.tryFromJson(original.toJson())!;
      expect(vuelta.toJson(), original.toJson());
    });

    test('una entrada que estaba en vuelo vuelve como pendiente', () {
      final vuelta = OutboxEntry.tryFromJson(
        nota(estado: OutboxEstado.enviando).toJson(),
      )!;
      expect(vuelta.estado, OutboxEstado.pendiente);
    });

    test('una entrada ilegible se descarta sin tumbar a las demás', () {
      expect(OutboxEntry.tryFromJson({'kind': 'otra.cosa'}), isNull);
      expect(OutboxEntry.tryFromJson('basura'), isNull);
    });
  });

  group('superposición de notas', () {
    List<GradeDetail> servidor() => const [
      GradeDetail(id: 'srv1', label: 'Taller 1', score: 3),
      GradeDetail(id: 'srv2', label: 'Taller 2', score: 4),
    ];

    List<GradeDetail> fusion(List<OutboxEntry> pendientes) => fusionarNotas(
      servidor: servidor(),
      pendientes: pendientes,
      studentId: 'e1',
      subjectId: 'm1',
      period: '2026-2',
      corte: 1,
      componentType: 'TRABAJOS',
    );

    test('sin pendientes devuelve la misma lista', () {
      final base = servidor();
      final resultado = fusionarNotas(
        servidor: base,
        pendientes: const [],
        studentId: 'e1',
        subjectId: 'm1',
        period: '2026-2',
        corte: 1,
        componentType: 'TRABAJOS',
      );
      expect(identical(resultado, base), isTrue);
    });

    test('una nota nueva pendiente se añade marcada', () {
      final r = fusion([nota(label: 'Quiz', score: 5)]);
      expect(r.length, 3);
      expect(r.last.label, 'Quiz');
      expect(r.last.local, EstadoLocalNota.pendienteEnvio);
      expect(r.last.id, startsWith('pendiente:'));
    });

    test('corregir una nota existente muestra el valor nuevo marcado', () {
      final r = fusion([nota(label: 'Taller 1', score: 5)]);
      expect(r.length, 2);
      expect(r.first.score, 5);
      expect(r.first.id, 'srv1');
      expect(r.first.local, EstadoLocalNota.pendienteEnvio);
      expect(r.last.local, EstadoLocalNota.sincronizada);
    });

    test('un borrado pendiente deja la nota visible pero marcada', () {
      final r = fusion([borrado(notaId: 'srv2', label: 'Taller 2')]);
      expect(r.length, 2);
      expect(r.last.local, EstadoLocalNota.pendienteBorrado);
    });

    test('ignora lo de otro estudiante, otro corte y lo fallido', () {
      final r = fusion([
        nota(estudiante: 'otro'),
        nota(corte: 2),
        nota(label: 'Quiz', estado: OutboxEstado.fallida),
      ]);
      expect(r.length, 2);
      expect(r.every((n) => n.local == EstadoLocalNota.sincronizada), isTrue);
    });

    test('estudiantesConNotasPendientes filtra por materia', () {
      final entradas = [
        nota(estudiante: 'e1'),
        nota(id: 'x', estudiante: 'e2'),
      ];
      expect(estudiantesConNotasPendientes(entradas), {'e1', 'e2'});
      expect(
        estudiantesConNotasPendientes(entradas, subjectId: 'otra'),
        isEmpty,
      );
    });
  });

  group('superposición de asistencia', () {
    final registros = [
      {'studentId': 's1', 'present': false, 'lateMinutes': 0},
      {'studentId': 's2', 'present': true, 'lateMinutes': 10},
    ];

    test('lo pendiente manda sobre la fila cacheada del mismo día', () {
      final filas = [
        {
          'studentId': 's1',
          'present': true,
          'lateMinutes': 0,
          'date': '2026-10-05T17:00:00.000Z',
        },
        {
          'studentId': 's1',
          'present': true,
          'lateMinutes': 0,
          'date': '2026-10-04T17:00:00.000Z',
        },
      ];
      final r = superponerAsistencia(filas, clase(registros: registros));
      final hoy = r.firstWhere(
        (f) =>
            (f['date'] as String).startsWith('2026-10-05') &&
            f['studentId'] == 's1',
      );
      expect(hoy['present'], false);
      expect(hoy['pendiente'], true);
      // El día anterior no se toca.
      final ayer = r.firstWhere(
        (f) => (f['date'] as String).startsWith('2026-10-04'),
      );
      expect(ayer['present'], true);
      expect(ayer['pendiente'], isNull);
    });

    test('quien no tenía fila ese día se añade', () {
      final r = superponerAsistencia(const [], clase(registros: registros));
      expect(r.length, 2);
      expect(r.every((f) => f['pendiente'] == true), isTrue);
      expect(r.last['lateMinutes'], 10);
    });

    test('sin clase pendiente devuelve las filas tal cual', () {
      final filas = [
        <String, dynamic>{'studentId': 's1'},
      ];
      expect(identical(superponerAsistencia(filas, null), filas), isTrue);
    });

    test('claseAsistenciaPendiente encuentra solo la de ese día y grupo', () {
      final entradas = [clase(registros: registros)];
      expect(
        claseAsistenciaPendiente(
          entradas,
          subjectId: 'm1',
          groupId: 'g1',
          date: DateTime(2026, 10, 5),
        ),
        isNotNull,
      );
      expect(
        claseAsistenciaPendiente(
          entradas,
          subjectId: 'm1',
          groupId: 'g1',
          date: DateTime(2026, 10, 6),
        ),
        isNull,
      );
      expect(
        claseAsistenciaPendiente(
          entradas,
          subjectId: 'm1',
          groupId: 'g2',
          date: DateTime(2026, 10, 5),
        ),
        isNull,
      );
    });
  });
}
