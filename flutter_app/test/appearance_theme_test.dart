/// Que elegir un tono cambie de verdad el `ThemeData` activo: `AppPalette` es
/// una `ThemeExtension`, así que `Theme.of(context).extension<AppPalette>()`
/// tiene que devolver los colores del tono recién elegido en el siguiente
/// fotograma, sin reiniciar la aplicación.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/core/theme/appearance/palettes.dart';

class _Sonda extends ConsumerWidget {
  const _Sonda();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final apariencia = ref.watch(aparienciaProvider);
    return MaterialApp(
      theme: AppTheme.construir(apariencia, Brightness.light),
      home: Scaffold(
        body: Center(
          child: ElevatedButton(
            onPressed: () =>
                ref.read(aparienciaProvider.notifier).setTono(Tono.amatista),
            child: const Text('elegir amatista'),
          ),
        ),
      ),
    );
  }
}

void main() {
  testWidgets('elegir un tono cambia AppPalette.primary en vivo', (
    tester,
  ) async {
    final controlador = AparienciaController(AparienciaPreferencias.defecto);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [aparienciaProvider.overrideWith((ref) => controlador)],
        child: const _Sonda(),
      ),
    );

    final contextoInicial = tester.element(find.byType(Scaffold));
    final primarioInstitucional = contextoInicial.palette.primary;
    expect(primarioInstitucional, AppColors.primary);

    await tester.tap(find.text('elegir amatista'));
    await tester.pumpAndSettle();

    final contextoTrasElegir = tester.element(find.byType(Scaffold));
    final primarioAmatista = contextoTrasElegir.palette.primary;

    expect(primarioAmatista, isNot(primarioInstitucional));
    final esperado = colorDeHex(
      tokensDeTono(Tono.amatista, ModoResuelto.light).primary,
    );
    expect(primarioAmatista, esperado);
  });

  test('reducir movimiento quita las transiciones de página, nada más', () {
    const quieto = AparienciaPreferencias.defecto;
    final conMovimiento = AppTheme.construir(quieto, Brightness.light);
    final sinMovimiento = AppTheme.construir(
      quieto.copyWith(reducirMovimiento: true),
      Brightness.light,
    );

    final builder =
        sinMovimiento.pageTransitionsTheme.builders[TargetPlatform.android];
    final hijo = Container();
    final route = MaterialPageRoute<void>(builder: (_) => hijo);
    expect(
      builder!.buildTransitions(
        route,
        _ContextoFalso(),
        kAlwaysCompleteAnimation,
        kAlwaysDismissedAnimation,
        hijo,
      ),
      same(hijo),
    );
    expect(
      conMovimiento.pageTransitionsTheme.builders[TargetPlatform.android],
      isNot(same(builder)),
    );
    expect(
      sinMovimiento.extension<AppPalette>()!.primary,
      conMovimiento.extension<AppPalette>()!.primary,
    );
  });
}

class _ContextoFalso extends Fake implements BuildContext {}
