import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/campus_time.dart';
import './data/agenda_models.dart';
import './data/agenda_repository.dart';

/// Providers de la agenda académica.

final agendaRepositoryProvider = Provider((ref) => AgendaRepository());

/// Día ancla de la agenda. Lo mueven las flechas y el botón "Hoy".
final agendaAnclaProvider = StateProvider<DateTime>((ref) => DateTime.now().toUtc());

/// Clase en curso y próxima. Es lo que alimenta la tarjeta destacada del panel
/// y de la agenda; el contador de minutos lo lleva el reloj local del widget,
/// no una petición por minuto.
final agendaResumenProvider = FutureProvider<AgendaResumen>((ref) {
  return ref.watch(agendaRepositoryProvider).resumen();
});

/// Agenda de la semana del día ancla. La semana empieza en lunes.
final agendaSemanaProvider = FutureProvider<AgendaRango>((ref) {
  final ancla = ref.watch(agendaAnclaProvider);
  final desde = inicioSemanaCampus(ancla, offsetCampusPorDefecto);
  return ref.watch(agendaRepositoryProvider).rango(
        desde: desde,
        hasta: desde.add(const Duration(days: 7)),
      );
});

/// Agenda de los próximos siete días. Es la que se usa para programar los
/// recordatorios locales del teléfono.
final agendaProximaProvider = FutureProvider<AgendaRango>((ref) {
  final ahora = DateTime.now().toUtc();
  return ref.watch(agendaRepositoryProvider).rango(
        desde: inicioDiaCampus(ahora, offsetCampusPorDefecto),
        hasta: ahora.add(const Duration(days: 8)),
      );
});
