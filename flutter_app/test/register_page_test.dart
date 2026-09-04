import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:uts_academico/features/auth/data/registro_service.dart';
import 'package:uts_academico/features/auth/register_page.dart';

class MockRegistroService extends Fake implements RegistroService {
  final Catalogo catalogoMock;
  final Future<String> Function({
    required String cedula,
    required String nombres,
    required String apellidos,
    required String sede,
    required String facultad,
    required List<String> niveles,
    required List<String> programas,
    required String email,
    required String password,
    String? institutionId,
    String? institucionSolicitada,
  })? onSolicitar;

  MockRegistroService({
    required this.catalogoMock,
    this.onSolicitar,
  });

  @override
  Future<Catalogo> catalogo() async => catalogoMock;

  @override
  Future<String> solicitar({
    required String cedula,
    required String nombres,
    required String apellidos,
    required String sede,
    required String facultad,
    required List<String> niveles,
    required List<String> programas,
    required String email,
    required String password,
    String? institutionId,
    String? institucionSolicitada,
  }) async {
    if (onSolicitar != null) {
      return onSolicitar!(
        cedula: cedula,
        nombres: nombres,
        apellidos: apellidos,
        sede: sede,
        facultad: facultad,
        niveles: niveles,
        programas: programas,
        email: email,
        password: password,
        institutionId: institutionId,
        institucionSolicitada: institucionSolicitada,
      );
    }
    return 'Solicitud radicada con éxito';
  }
}

Widget appCon({required RegistroService servicio}) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/registro', builder: (_, __) => RegisterPage(servicio: servicio)),
      GoRoute(path: '/login', builder: (_, __) => const Scaffold(body: Text('Pantalla de Acceso'))),
    ],
    initialLocation: '/registro',
  );
  return MaterialApp.router(routerConfig: router);
}

void main() {
  final catalogoPrueba = Catalogo(
    abierto: true,
    sedes: [const Opcion(id: 'BUCARAMANGA', nombre: 'Bucaramanga')],
    facultades: [const Opcion(id: 'FAC_ING', nombre: 'Facultad de Ingenierías')],
    niveles: [
      const Opcion(id: 'TECNOLOGICO', nombre: 'Tecnológico'),
      const Opcion(id: 'PROFESIONAL', nombre: 'Profesional'),
    ],
    programas: [
      const Programa(
        id: 'SIS_TEC',
        nombre: 'Tecnología en Sistemas',
        facultad: 'FAC_ING',
        nivel: 'TECNOLOGICO',
      ),
      const Programa(
        id: 'SIS_ING',
        nombre: 'Ingeniería de Sistemas',
        facultad: 'FAC_ING',
        nivel: 'PROFESIONAL',
      ),
    ],
  );

  testWidgets('muestra interfaz rediseñada y valida campos vacíos', (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final mockService = MockRegistroService(catalogoMock: catalogoPrueba);
    await tester.pumpWidget(appCon(servicio: mockService));
    await tester.pumpAndSettle();

    expect(find.text('Únete a la docencia UTS'), findsOneWidget);
    expect(find.text('Datos personales'), findsOneWidget);
    expect(find.text('Dónde enseñas'), findsOneWidget);
    expect(find.text('Tu cuenta'), findsOneWidget);

    // Intentar enviar sin datos
    await tester.tap(find.text('Enviar solicitud'));
    await tester.pumpAndSettle();

    expect(find.text('Entre 6 y 10 dígitos'), findsOneWidget);
    expect(find.text('Escribe tus nombres'), findsOneWidget);
    expect(find.text('Escribe tus apellidos'), findsOneWidget);
  });

  testWidgets('completa formulario, alterna contraseña y envía solicitud con éxito', (tester) async {
    Map<String, dynamic>? payloadEnviado;

    final mockService = MockRegistroService(
      catalogoMock: catalogoPrueba,
      onSolicitar: ({
        required String cedula,
        required String nombres,
        required String apellidos,
        required String sede,
        required String facultad,
        required List<String> niveles,
        required List<String> programas,
        required String email,
        required String password,
        String? institutionId,
        String? institucionSolicitada,
      }) async {
        payloadEnviado = {
          'cedula': cedula,
          'nombres': nombres,
          'apellidos': apellidos,
          'sede': sede,
          'facultad': facultad,
          'niveles': niveles,
          'programas': programas,
          'email': email,
          'password': password,
          'institutionId': institutionId,
          'institucionSolicitada': institucionSolicitada,
        };
        return 'Solicitud radicada con éxito';
      },
    );

    await tester.pumpWidget(appCon(servicio: mockService));
    await tester.pumpAndSettle();

    // Llenar datos personales
    await tester.enterText(find.widgetWithText(TextFormField, 'Cédula de ciudadanía'), '1098765432');
    await tester.enterText(find.widgetWithText(TextFormField, 'Nombres completos'), 'María Fernanda');
    await tester.enterText(find.widgetWithText(TextFormField, 'Apellidos completos'), 'Ortiz Gómez');

    // El catálogo de prueba no trae instituciones: solo aparece el campo de
    // texto libre.
    await tester.ensureVisible(find.widgetWithText(TextFormField, 'Nombre de tu institución'));
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Nombre de tu institución'),
      'Universidad Industrial de Santander',
    );

    // Seleccionar sede y facultad
    await tester.ensureVisible(find.widgetWithText(DropdownButtonFormField<String>, 'Sede institucional'));
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Sede institucional'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bucaramanga').last);
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.widgetWithText(DropdownButtonFormField<String>, 'Facultad'));
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Facultad'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Facultad de Ingenierías').last);
    await tester.pumpAndSettle();

    // Seleccionar nivel Tecnológico
    await tester.ensureVisible(find.text('Tecnológico'));
    await tester.tap(find.text('Tecnológico'));
    await tester.pumpAndSettle();

    // Seleccionar programa disponible
    await tester.ensureVisible(find.text('Tecnología en Sistemas'));
    await tester.tap(find.text('Tecnología en Sistemas'));
    await tester.pumpAndSettle();

    // Credenciales
    await tester.ensureVisible(find.widgetWithText(TextFormField, 'Correo institucional'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Correo institucional'), 'docente@uts.edu.co');

    await tester.ensureVisible(find.widgetWithText(TextFormField, 'Contraseña'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Contraseña'), 'ClaveSegura2026');
    await tester.pumpAndSettle();

    // Probar alternador de contraseña
    expect(find.byIcon(Icons.visibility_outlined), findsOneWidget);
    await tester.tap(find.byIcon(Icons.visibility_outlined));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.visibility_off_outlined), findsOneWidget);

    // Enviar solicitud
    await tester.ensureVisible(find.text('Enviar solicitud'));
    await tester.tap(find.text('Enviar solicitud'));
    await tester.pumpAndSettle();

    expect(payloadEnviado, isNotNull);
    expect(payloadEnviado!['cedula'], '1098765432');
    expect(payloadEnviado!['nombres'], 'María Fernanda');
    expect(payloadEnviado!['apellidos'], 'Ortiz Gómez');
    expect(payloadEnviado!['sede'], 'BUCARAMANGA');
    expect(payloadEnviado!['facultad'], 'FAC_ING');
    expect(payloadEnviado!['niveles'], ['TECNOLOGICO']);
    expect(payloadEnviado!['programas'], ['SIS_TEC']);
    expect(payloadEnviado!['email'], 'docente@uts.edu.co');
    expect(payloadEnviado!['password'], 'ClaveSegura2026');
    expect(payloadEnviado!['institucionSolicitada'], 'Universidad Industrial de Santander');
    expect(payloadEnviado!['institutionId'], isNull);

    // Pantalla de confirmación
    expect(find.text('¡Solicitud enviada!'), findsOneWidget);
    expect(find.text('Volver al inicio de sesión'), findsOneWidget);

    await tester.tap(find.text('Volver al inicio de sesión'));
    await tester.pumpAndSettle();
    expect(find.text('Pantalla de Acceso'), findsOneWidget);
  });

  testWidgets(
    'con instituciones en el catálogo ofrece el desplegable y la opción "otra"',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final catalogoConInstituciones = Catalogo(
        abierto: true,
        sedes: catalogoPrueba.sedes,
        facultades: catalogoPrueba.facultades,
        niveles: catalogoPrueba.niveles,
        programas: catalogoPrueba.programas,
        instituciones: const [
          InstitucionOpcion(
            id: '1',
            institutionId: 'uts',
            nombre: 'Unidades Tecnológicas de Santander',
            sigla: 'UTS',
          ),
          InstitucionOpcion(
            id: '2',
            institutionId: 'uis',
            nombre: 'Universidad Industrial de Santander',
            sigla: 'UIS',
          ),
        ],
      );

      final mockService = MockRegistroService(catalogoMock: catalogoConInstituciones);
      await tester.pumpWidget(appCon(servicio: mockService));
      await tester.pumpAndSettle();

      // Con instituciones en el catálogo aparece el desplegable, no el campo
      // de texto libre.
      expect(find.widgetWithText(DropdownButtonFormField<String>, 'Institución'), findsOneWidget);
      expect(find.widgetWithText(TextFormField, 'Nombre de tu institución'), findsNothing);

      await tester.ensureVisible(find.widgetWithText(DropdownButtonFormField<String>, 'Institución'));
      await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Institución'));
      await tester.pumpAndSettle();
      expect(find.text('Unidades Tecnológicas de Santander (UTS)'), findsWidgets);
      expect(find.text('Universidad Industrial de Santander (UIS)'), findsWidgets);
      expect(find.text('Otra institución (no está en la lista)'), findsWidgets);

      // Elegir "otra" revela el campo de texto libre.
      await tester.tap(find.text('Otra institución (no está en la lista)').last);
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextFormField, 'Nombre de tu institución'), findsOneWidget);
    },
  );
}
