import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:uts_academico/core/network/api_error.dart';
import 'package:uts_academico/features/auth/recovery_page.dart';

Widget appWith({
  required Future<Map<String, dynamic>> Function(String) request,
  required Future<void> Function(String, String, String) reset,
}) {
  final router = GoRouter(routes: [
    GoRoute(path: '/recovery', builder: (_, __) => RecoveryPage(requestCode: request, resetPassword: reset)),
    GoRoute(path: '/login', builder: (_, __) => const Scaffold(body: Text('Acceso'))),
  ], initialLocation: '/recovery');
  return MaterialApp.router(routerConfig: router);
}

void main() {
  testWidgets('completa solicitud, devCode, validación, cambio y navegación', (tester) async {
    String? requestedEmail;
    List<String>? resetPayload;
    await tester.pumpWidget(appWith(
      request: (email) async { requestedEmail = email; return {'devCode': '123456'}; },
      reset: (email, code, password) async { resetPayload = [email, code, password]; },
    ));

    await tester.enterText(find.widgetWithText(TextField, 'Correo institucional'), 'persona@uts.edu.co');
    await tester.tap(find.text('Enviar código'));
    await tester.pump();
    expect(requestedEmail, 'persona@uts.edu.co');
    expect(find.text('Código local de desarrollo: 123456'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Código recibido'), '123456');
    // La contraseña cumple la política compartida con el autorregistro (diez
    // caracteres, mayúscula, minúscula y número): una más floja se rechaza
    // antes de llegar a comprobar si las dos coinciden.
    await tester.enterText(find.widgetWithText(TextField, 'Nueva contraseña'), 'Segura12345');
    await tester.enterText(find.widgetWithText(TextField, 'Confirmar contraseña'), 'Distinta12345');
    // El formulario completo no cabe en el viewport de 600 px del test y la
    // pantalla es un SingleChildScrollView, así que el botón hay que traerlo a
    // la vista antes de tocarlo. Sin esto, `tap` cae sobre el fondo, no valida
    // nada y el fallo aparece como «no se encontró el mensaje de error».
    await tester.ensureVisible(find.text('Restablecer contraseña'));
    await tester.pump();
    await tester.tap(find.text('Restablecer contraseña'));
    await tester.pump();
    expect(find.text('Las contraseñas no coinciden.'), findsOneWidget);
    expect(resetPayload, isNull);

    await tester.enterText(find.widgetWithText(TextField, 'Confirmar contraseña'), 'Segura12345');
    // El formulario completo no cabe en el viewport de 600 px del test y la
    // pantalla es un SingleChildScrollView, así que el botón hay que traerlo a
    // la vista antes de tocarlo. Sin esto, `tap` cae sobre el fondo, no valida
    // nada y el fallo aparece como «no se encontró el mensaje de error».
    await tester.ensureVisible(find.text('Restablecer contraseña'));
    await tester.pump();
    await tester.tap(find.text('Restablecer contraseña'));
    await tester.pump();
    expect(resetPayload, ['persona@uts.edu.co', '123456', 'Segura12345']);
    expect(find.text('Contraseña actualizada'), findsOneWidget);
    await tester.tap(find.text('Ir al acceso'));
    await tester.pumpAndSettle();
    expect(find.text('Acceso'), findsOneWidget);
  });

  testWidgets('muestra error seguro al solicitar el código', (tester) async {
    await tester.pumpWidget(appWith(
      request: (_) async => throw const ApiError(ApiErrorKind.rateLimited, 'Espera antes de intentarlo otra vez.'),
      reset: (_, __, ___) async {},
    ));
    await tester.enterText(find.widgetWithText(TextField, 'Correo institucional'), 'persona@uts.edu.co');
    await tester.tap(find.text('Enviar código'));
    await tester.pump();
    expect(find.text('Espera antes de intentarlo otra vez.'), findsOneWidget);
  });
}
