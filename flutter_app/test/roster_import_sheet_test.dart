import 'package:flutter/material.dart';
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/network/api_error.dart';
import 'package:uts_academico/features/students/roster_import_sheet.dart';

Widget _host({
  required Future<int> Function(List<Map<String, dynamic>>) importRows,
  void Function(int)? onImported,
}) {
  return MaterialApp(
    home: Scaffold(
      body: RosterImportSheet(
        importRows: importRows,
        onImported: onImported ?? (_) {},
      ),
    ),
  );
}

const _valid = '1098765432;Ana Gómez;ana@uts.edu.co;Sistemas';

void main() {
  testWidgets('editar el texto invalida la propuesta revisada', (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      _host(
        importRows: (_) async {
          calls++;
          return 1;
        },
      ),
    );

    await tester.enterText(find.byKey(const Key('roster-input')), _valid);
    await tester.tap(find.byKey(const Key('roster-submit')));
    await tester.pump();
    expect(find.byKey(const Key('roster-summary')), findsOneWidget);
    expect(find.text('Confirmar importación'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('roster-input')),
      '$_valid\n1098765433;Juan Pérez;;Contaduría',
    );
    await tester.pump();

    expect(find.byKey(const Key('roster-summary')), findsNothing);
    expect(find.text('Revisar propuesta'), findsOneWidget);
    expect(calls, 0);
  });

  testWidgets('un timeout conserva propuesta y muestra resultado incierto', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        importRows: (_) async => throw const ApiError(
          ApiErrorKind.timeout,
          'El servidor tardó demasiado en responder.',
        ),
      ),
    );

    await tester.enterText(find.byKey(const Key('roster-input')), _valid);
    await tester.tap(find.byKey(const Key('roster-submit')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('roster-submit')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('roster-summary')), findsOneWidget);
    expect(find.byKey(const Key('roster-import-error')), findsOneWidget);
    expect(
      find.textContaining('No se pudo confirmar el resultado remoto'),
      findsOneWidget,
    );
    expect(find.text('Confirmar importación'), findsOneWidget);
    expect(find.textContaining('No se importó nada'), findsNothing);
  });

  testWidgets(
    'bloquea la edición durante la confirmación y conserva el payload revisado',
    (tester) async {
      final deferred = Completer<int>();
      List<Map<String, dynamic>>? payload;
      await tester.pumpWidget(
        _host(
          importRows: (rows) {
            payload = rows;
            return deferred.future;
          },
        ),
      );

      await tester.enterText(find.byKey(const Key('roster-input')), _valid);
      await tester.tap(find.byKey(const Key('roster-submit')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('roster-submit')));
      await tester.pump();

      final input = tester.widget<TextField>(
        find.byKey(const Key('roster-input')),
      );
      expect(input.enabled, isFalse);
      expect(payload, hasLength(1));

      await tester.enterText(
        find.byKey(const Key('roster-input')),
        '$_valid\n1098765433;Juan Pérez;;Contaduría',
      );
      await tester.pump();

      expect(input.controller!.text, _valid);
      expect(payload, hasLength(1));
      expect(find.byKey(const Key('roster-summary')), findsOneWidget);

      deferred.complete(1);
      await tester.pumpAndSettle();
    },
  );
}
