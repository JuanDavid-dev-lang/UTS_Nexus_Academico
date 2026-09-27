/// Meter estudiantes en un grupo desde el móvil.
///
/// Lo que se fija: que la matrícula va al grupo elegido, que quien ya está en
/// el grupo no se ofrece otra vez, que la lista pegada no exige programa (sí lo
/// exige el alta en el directorio) y que un grupo con el código de la materia
/// se rechaza antes de llegar al servidor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/data/academic_repository.dart';
import 'package:uts_academico/core/data/models.dart';
import 'package:uts_academico/core/data/providers.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/features/subjects/agregar_estudiantes_sheet.dart';

class _RepositorioFalso extends AcademicRepository {
  _RepositorioFalso({this.grupos = const []});

  List<Group> grupos;
  final matriculados = <({String studentId, String groupId})>[];
  final listas = <({String groupId, List<Map<String, dynamic>> students})>[];
  final gruposCreados = <String>[];

  @override
  Future<List<Group>> groups() async => grupos;

  @override
  Future<List<Enrollment>> enrollments({
    String? subjectId,
    String? period,
  }) async => const [
    Enrollment(
      id: 'e1',
      studentId: 's-en-grupo',
      subjectId: 'm1',
      groupId: 'g1',
      period: '2026-2',
    ),
    Enrollment(
      id: 'e2',
      studentId: 's-otro-grupo',
      subjectId: 'm1',
      groupId: 'g2',
      period: '2026-2',
    ),
  ];

  @override
  Future<List<Student>> searchStudents(String term) async => const [
    Student(
      id: 's-nuevo',
      code: '1098765432',
      fullName: 'ANA RUIZ',
      email: '',
      program: 'Sistemas',
    ),
    Student(
      id: 's-en-grupo',
      code: '1098765433',
      fullName: 'ANA PEREZ',
      email: '',
      program: '',
    ),
    Student(
      id: 's-otro-grupo',
      code: '1098765434',
      fullName: 'ANA GOMEZ',
      email: '',
      program: '',
    ),
  ];

  @override
  Future<void> enrollStudent({
    required String studentId,
    required String groupId,
  }) async {
    matriculados.add((studentId: studentId, groupId: groupId));
  }

  @override
  Future<ResultadoMatricula> enrollRoster({
    required String groupId,
    required List<Map<String, dynamic>> students,
  }) async {
    listas.add((groupId: groupId, students: students));
    return ResultadoMatricula(
      matriculados: students.length,
      creados: students.length,
      reutilizados: 0,
    );
  }

  @override
  Future<void> createGroup({
    required String name,
    required String subjectId,
    required String period,
  }) async {
    gruposCreados.add(name);
    grupos = [
      ...grupos,
      Group(id: 'g-$name', name: name, subjectId: subjectId, period: period),
    ];
  }
}

const _a194 = Group(id: 'g1', name: 'A194', subjectId: 'm1', period: '2026-2');
const _a193 = Group(id: 'g2', name: 'A193', subjectId: 'm1', period: '2026-2');

Widget _app(_RepositorioFalso repositorio) => ProviderScope(
  overrides: [academicRepositoryProvider.overrideWithValue(repositorio)],
  child: MaterialApp(
    theme: AppTheme.light,
    home: const Scaffold(
      body: SingleChildScrollView(
        padding: EdgeInsets.all(16),
        child: AgregarEstudiantesSheet(
          subjectId: 'm1',
          period: '2026-2',
          codigoMateria: 'PIS701',
        ),
      ),
    ),
  ),
);

/// El buscador espera a que se deje de escribir; sin esto la consulta no sale.
Future<void> _buscar(WidgetTester tester, String texto) async {
  await tester.enterText(find.byType(TextField).first, texto);
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump();
}

void main() {
  testWidgets('matricula al estudiante buscado en el grupo elegido', (
    tester,
  ) async {
    final repositorio = _RepositorioFalso(grupos: const [_a193, _a194]);
    await tester.pumpWidget(_app(repositorio));
    await tester.pump();

    await _buscar(tester, 'ana');
    await tester.tap(find.byKey(const Key('agregar-s-nuevo')));
    await tester.pump();
    await tester.pump();

    // Los grupos van por nombre: el primero es A193.
    expect(repositorio.matriculados, [(studentId: 's-nuevo', groupId: 'g2')]);
    expect(find.byKey(const Key('agregar-s-nuevo')), findsNothing);
  });

  testWidgets(
    'quien ya está en el grupo no se ofrece otra vez; el de otro grupo sí, marcado',
    (tester) async {
      final repositorio = _RepositorioFalso(grupos: const [_a194]);
      await tester.pumpWidget(_app(repositorio));
      await tester.pump();

      await _buscar(tester, 'ana');

      expect(find.byKey(const Key('agregar-s-en-grupo')), findsNothing);
      expect(find.text('En el grupo'), findsOneWidget);
      expect(find.byKey(const Key('agregar-s-otro-grupo')), findsOneWidget);
    },
  );

  testWidgets('la lista pegada se revisa, no exige programa y va al grupo', (
    tester,
  ) async {
    final repositorio = _RepositorioFalso(grupos: const [_a194]);
    await tester.pumpWidget(_app(repositorio));
    await tester.pump();

    await tester.tap(find.text('Pegar lista'));
    await tester.pump();
    await tester.enterText(
      find.byKey(const Key('matricula-lista')),
      '1098765432;ANA RUIZ\nsin documento;PEDRO',
    );
    await tester.tap(find.byKey(const Key('matricula-enviar')));
    await tester.pump();

    expect(find.text('1 listos · 1 con errores · 0 repetidos'), findsOneWidget);
    expect(repositorio.listas, isEmpty);

    await tester.tap(find.byKey(const Key('matricula-enviar')));
    await tester.pump();
    await tester.pump();

    expect(repositorio.listas.single.groupId, 'g1');
    expect(repositorio.listas.single.students.single, {
      'code': '1098765432',
      'fullName': 'ANA RUIZ',
    });
    expect(find.byKey(const Key('matricula-exito')), findsOneWidget);
  });

  testWidgets('sin grupos ofrece crearlo y rechaza el código de la materia', (
    tester,
  ) async {
    final repositorio = _RepositorioFalso();
    await tester.pumpWidget(_app(repositorio));
    await tester.pump();

    await tester.enterText(find.byKey(const Key('grupo-nuevo')), 'pis701');
    await tester.tap(find.text('Crear'));
    await tester.pump();
    expect(repositorio.gruposCreados, isEmpty);
    expect(
      find.textContaining('no es el código de la materia'),
      findsOneWidget,
    );

    await tester.enterText(find.byKey(const Key('grupo-nuevo')), 'a194');
    await tester.tap(find.text('Crear'));
    await tester.pump();
    await tester.pump();

    expect(repositorio.gruposCreados, ['A194']);
  });
}
