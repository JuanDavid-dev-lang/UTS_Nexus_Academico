import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../features/activities/data/activity_repository.dart';
import '../../features/agenda/data/agenda_repository.dart';
import '../auth/auth_repository.dart';
import '../data/academic_repository.dart';
import '../data/campus_time.dart';
import '../data/models.dart';
import '../data/providers.dart' show currentPeriod;
import '../storage/offline_cache.dart';
import './precarga_plan.dart';

/// Precarga en segundo plano: calienta la caché de lectura para que el docente
/// pueda abrir cualquier pantalla de su día sin haberla visitado antes con red.
///
/// De mejor esfuerzo: un fallo se ignora, nunca enciende la franja de sin
/// conexión (ver `enPrecarga`) y nunca bloquea nada. Va de uno en uno: son
/// muchas lecturas pequeñas sobre el wifi del aula y no hay prisa.
class PrecargaService {
  PrecargaService({
    DateTime Function()? ahora,
    String Function()? periodo,
    Future<void> Function(TareaPrecarga)? ejecutor,
    Future<({List<Subject> materias, List<Group> grupos})> Function()? base,
  }) : _ahora = ahora ?? DateTime.now,
       _periodo = periodo ?? currentPeriod,
       _ejecutorPrueba = ejecutor,
       _basePrueba = base;

  static final PrecargaService instance = PrecargaService();

  final DateTime Function() _ahora;
  final String Function() _periodo;
  final Future<void> Function(TareaPrecarga)? _ejecutorPrueba;
  final Future<({List<Subject> materias, List<Group> grupos})> Function()?
  _basePrueba;

  final _academico = AcademicRepository();
  final _actividades = ActivityRepository();
  final _auth = AuthRepository();
  final _agenda = AgendaRepository();

  String? _rol;
  DateTime? _ultimaCompleta;
  bool _corriendo = false;

  /// Cambia con cada sesión: una pasada en curso de otro usuario se corta.
  int _generacion = 0;

  bool get corriendo => _corriendo;

  /// Dice quién tiene la sesión (o `null` al cerrarla). Reinicia el intervalo:
  /// otra cuenta necesita su propia caché.
  void usarUsuario(String? rol) {
    _generacion++;
    _rol = rol;
    _ultimaCompleta = null;
  }

  /// Pide una pasada. Si no toca (otro rol, ya hay una, hace menos de 30 min) no
  /// hace nada.
  Future<void> solicitar() async {
    if (!debePrecargar(
      rol: _rol,
      corriendo: _corriendo,
      ultimaCompleta: _ultimaCompleta,
      ahora: _ahora(),
    )) {
      return;
    }
    _corriendo = true;
    final generacion = _generacion;
    try {
      final completa = await comoPrecarga(() => _pasada(generacion));
      if (completa && generacion == _generacion) _ultimaCompleta = _ahora();
    } catch (error) {
      debugPrint('Precarga interrumpida: $error');
    } finally {
      _corriendo = false;
    }
  }

  /// Devuelve si llegó al servidor (las lecturas base respondieron). Si no hay
  /// red no marca la pasada como hecha: la próxima señal de conexión reintenta.
  Future<bool> _pasada(int generacion) async {
    final ({List<Subject> materias, List<Group> grupos}) base;
    try {
      base = await (_basePrueba?.call() ?? _lecturaBase());
    } catch (_) {
      return false;
    }
    final periodo = _periodo();
    final tareas = tareasDeMaterias(
      subjects: base.materias,
      groups: base.grupos,
      period: periodo,
    );

    for (final tarea in tareas) {
      if (generacion != _generacion) return false;
      await _silencioso(() => _ejecutar(tarea, periodo));
    }
    if (generacion != _generacion) return false;
    if (_ejecutorPrueba != null) return true;

    // Lo global, al final: lo de las materias es lo que hace falta para pasar
    // lista y anotar; el resto es consulta.
    await _silencioso(() => _academico.students());
    await _silencioso(_actividades.periodos);
    await _silencioso(_auth.dashboard);
    await _silencioso(_academico.risks);
    await _silencioso(_agenda.resumen);
    await _silencioso(() {
      final ahora = DateTime.now().toUtc();
      return _agenda.rango(
        desde: inicioDiaCampus(ahora, offsetCampusPorDefecto),
        // Redondeado al día del campus: con `ahora + 8 días` la clave de
        // caché cambiaba en cada llamada y la agenda nunca se servía sin red.
        hasta: inicioDiaCampus(ahora, offsetCampusPorDefecto)
            .add(const Duration(days: 9)),
      );
    });
    return true;
  }

  Future<({List<Subject> materias, List<Group> grupos})> _lecturaBase() async {
    // Secuencial a propósito: máximo una petición en vuelo.
    final materias = await _academico.subjects();
    final grupos = await _academico.groups();
    return (materias: materias, grupos: grupos);
  }

  Future<void> _ejecutar(TareaPrecarga t, String periodo) {
    final prueba = _ejecutorPrueba;
    if (prueba != null) return prueba(t);
    switch (t.tipo) {
      case TipoPrecarga.estudiantesDeMateria:
        return _academico.students(subjectId: t.subjectId);
      case TipoPrecarga.estudiantesDeGrupo:
        return _academico.studentsRaw(
          subjectId: t.subjectId,
          groupId: t.groupId,
          period: periodo,
        );
      case TipoPrecarga.matriculas:
        return _academico.enrollments(subjectId: t.subjectId, period: periodo);
      case TipoPrecarga.consolidado:
        return _academico.consolidated(period: periodo, subjectId: t.subjectId);
      case TipoPrecarga.pendientes:
        return _academico.pendingGrades(
          period: periodo,
          subjectId: t.subjectId,
        );
      case TipoPrecarga.asistencia:
        return _academico.attendance(subjectId: t.subjectId, period: periodo);
    }
  }

  Future<void> _silencioso(Future<Object?> Function() lectura) async {
    try {
      await lectura();
    } catch (_) {
      // Mejor esfuerzo: lo que no se pudo precargar se cargará cuando se abra.
    }
  }
}
