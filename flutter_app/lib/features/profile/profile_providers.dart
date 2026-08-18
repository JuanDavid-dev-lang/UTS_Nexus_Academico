import 'package:flutter_riverpod/flutter_riverpod.dart';

import './data/profile_service.dart';

/// Providers del perfil propio.

final profileServiceProvider = Provider((ref) => ProfileService());

/// Ficha propia. Es de donde sale el flag de director de trabajo de grado.
final miPerfilProvider = FutureProvider<Profile>((ref) {
  return ref.watch(profileServiceProvider).me();
});

/// ¿Este docente dirige trabajos de grado? Decide si la sección aparece en el
/// menú. `false` mientras carga o si falla: mejor un menú corto un instante
/// que una sección que responde 403 al tocarla.
final esDirectorProvider = Provider<bool>((ref) {
  return ref.watch(miPerfilProvider).maybeWhen(
        data: (perfil) => perfil.esDirectorTrabajoGrado,
        orElse: () => false,
      );
});
