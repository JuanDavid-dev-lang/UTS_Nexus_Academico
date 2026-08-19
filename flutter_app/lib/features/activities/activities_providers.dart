import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/providers.dart';
import './data/activity_models.dart';
import './data/activity_repository.dart';

/// Providers de actividades, periodos, casos de inasistencia e historial.
///
/// **Ninguno es `autoDispose`**, igual que el resto de la aplicación: cambiar
/// de pestaña no debe rehacer la consulta. Los datos sobreviven al cambio de
/// rama a propósito, que es lo que hace que volver a una pantalla sea
/// mostrarla y no recargarla.
final activityRepositoryProvider = Provider((ref) => ActivityRepository());

/// Filtro activo del listado de actividades.
///
/// Vive en un provider y no en el `State` de la pantalla porque la pantalla
/// pertenece a una rama del shell que se conserva viva: al volver a ella el
/// filtro sigue puesto, que es lo que un docente espera después de mirar otra
/// cosa un momento.
class FiltroActividades {
  final String? subjectId;
  final String? period;
  final String? estado;

  const FiltroActividades({this.subjectId, this.period, this.estado});

  FiltroActividades copyWith({
    Object? subjectId = _sinCambio,
    Object? period = _sinCambio,
    Object? estado = _sinCambio,
  }) {
    return FiltroActividades(
      subjectId: subjectId == _sinCambio ? this.subjectId : subjectId as String?,
      period: period == _sinCambio ? this.period : period as String?,
      estado: estado == _sinCambio ? this.estado : estado as String?,
    );
  }

  /// Centinela para distinguir «no lo cambies» de «ponlo a null». Sin él no se
  /// puede quitar un filtro: pasar `null` significaría lo mismo que omitirlo.
  static const _sinCambio = Object();
}

final filtroActividadesProvider =
    StateProvider<FiltroActividades>((ref) => const FiltroActividades());

final actividadesProvider = FutureProvider<List<Activity>>((ref) {
  final filtro = ref.watch(filtroActividadesProvider);
  return ref.watch(activityRepositoryProvider).actividades(
        subjectId: filtro.subjectId,
        period: filtro.period,
        estado: filtro.estado,
      );
});

/// Periodos académicos con su estado.
///
/// Lo consultan las pantallas de captura para saber si el semestre admite
/// escrituras: ofrecer un botón de guardar que va a devolver un 409 es un
/// error de interfaz, no del servidor.
final periodosProvider = FutureProvider<List<AcademicPeriod>>((ref) {
  return ref.watch(activityRepositoryProvider).periodos();
});

/// ¿El periodo activo admite cambios académicos?
///
/// Un periodo que no está en la lista se considera abierto: la institución
/// lleva semestres funcionando sin ese registro, y tratar la ausencia como
/// «cerrado» dejaría la aplicación en solo lectura.
final periodoActivoAbiertoProvider = Provider<bool>((ref) {
  final periodo = ref.watch(selectedPeriodProvider);
  final periodos = ref.watch(periodosProvider).valueOrNull;
  if (periodos == null) return true;
  final encontrado = periodos.where((p) => p.period == periodo);
  return encontrado.isEmpty || encontrado.first.admiteEscrituras;
});

/// Casos abiertos por patrón de inasistencia, del docente en sesión.
final casosAsistenciaProvider = FutureProvider<List<AttendanceCase>>((ref) {
  return ref.watch(activityRepositoryProvider).casos(estado: 'ABIERTO');
});

/// Historial de un estudiante. `family` porque cada ficha es otra consulta.
final historialProvider =
    FutureProvider.family<List<TimelineEvent>, String>((ref, studentId) {
  return ref.watch(activityRepositoryProvider).historial(studentId);
});
