import 'package:flutter_riverpod/flutter_riverpod.dart';

import './data/usage_repository.dart';

final usageRepositoryProvider = Provider((ref) => UsageRepository());

/// Uso de la aplicación (solo ADMIN). Sin `autoDispose`, como el resto: cambiar
/// de pestaña no vuelve a consultar; se refresca tirando hacia abajo.
final resumenUsoProvider = FutureProvider<ResumenUso>((ref) {
  return ref.watch(usageRepositoryProvider).resumen();
});
