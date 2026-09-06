import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';

/// Directorio de estudiantes traído **por páginas**.
///
/// El backend pagina desde hace tiempo, pero el móvil nunca se lo pedía: sin
/// `page` ni `limit` devuelve su tope por defecto, que en estudiantes son mil
/// documentos completos. Sobre el wifi de un aula y en un teléfono, era la
/// petición más pesada de la aplicación.
///
/// **La búsqueda va al servidor**, no a un filtro sobre lo descargado. Filtrar
/// en el cliente solo funciona mientras lo descargado sea *todo*: en cuanto hay
/// páginas, el estudiante de la quinta deja de existir para la búsqueda y nada
/// lo indica.
///
/// Es un `AsyncNotifier` y no un `FutureProvider.family` sobre el término: una
/// familia sin `autoDispose` deja una instancia viva por cada texto que alguien
/// llegue a escribir, y con `autoDispose` se perdería el acumulado al cambiar
/// de pestaña — que es justo lo que este proyecto evita a propósito.

/// Cuántos por página.
///
/// Treinta llena de sobra una pantalla de teléfono con filas compactas de 56 dp
/// (caben unas doce), así que la segunda página se pide con el dedo ya en
/// movimiento y nunca se ve el hueco.
const int kEstudiantesPorPagina = 30;

class EstadoDirectorio {
  const EstadoDirectorio({
    required this.items,
    required this.total,
    required this.hayMas,
    this.cargandoMas = false,
    this.errorAlCargarMas,
    this.pagina = 1,
  });

  final List<Student> items;

  /// Cuántos hay en el servidor. Contar `items` diría «30 estudiantes» sobre
  /// ochocientos, que es peor que no decir nada.
  final int total;

  final bool hayMas;
  final bool cargandoMas;
  final String? errorAlCargarMas;
  final int pagina;

  EstadoDirectorio copyWith({
    List<Student>? items,
    int? total,
    bool? hayMas,
    bool? cargandoMas,
    Object? errorAlCargarMas = _sinCambio,
    int? pagina,
  }) {
    return EstadoDirectorio(
      items: items ?? this.items,
      total: total ?? this.total,
      hayMas: hayMas ?? this.hayMas,
      cargandoMas: cargandoMas ?? this.cargandoMas,
      errorAlCargarMas: identical(errorAlCargarMas, _sinCambio)
          ? this.errorAlCargarMas
          : errorAlCargarMas as String?,
      pagina: pagina ?? this.pagina,
    );
  }

  static const Object _sinCambio = Object();
}

class DirectorioNotifier extends AsyncNotifier<EstadoDirectorio> {
  String _termino = '';
  String? _materia;

  @override
  Future<EstadoDirectorio> build() => _traerPrimeraPagina();

  Future<EstadoDirectorio> _traerPrimeraPagina() async {
    final pagina = await ref
        .read(academicRepositoryProvider)
        .studentsPagina(
          subjectId: _materia,
          q: _termino,
          page: 1,
          limit: kEstudiantesPorPagina,
        );
    return EstadoDirectorio(
      items: pagina.items,
      total: pagina.total,
      hayMas: pagina.hasMore,
    );
  }

  /// Cambia el término y vuelve a la primera página.
  ///
  /// **No pasa por `AsyncLoading`.** Con `AsyncLoading`, la pantalla pinta su
  /// esqueleto encima de todo el `Column` —incluido el propio buscador—, y al
  /// desmontarse el campo se lleva su `TextEditingController` con el texto
  /// escrito y el foco. Es el mismo motivo por el que el término vive en el
  /// estado de la pantalla; aquí se respeta manteniendo un `AsyncData` con la
  /// lista vacía mientras llega la nueva.
  Future<void> buscar(String termino) async {
    if (termino.trim() == _termino) return;
    _termino = termino.trim();
    await _reiniciar();
  }

  Future<void> filtrarPorMateria(String? subjectId) async {
    if (subjectId == _materia) return;
    _materia = subjectId;
    await _reiniciar();
  }

  Future<void> _reiniciar() async {
    state = AsyncData(
      const EstadoDirectorio(items: [], total: 0, hayMas: false, cargandoMas: true),
    );
    try {
      state = AsyncData(await _traerPrimeraPagina());
    } catch (error) {
      state = AsyncError(error, StackTrace.current);
    }
  }

  /// Trae la página siguiente y la añade a lo que ya hay.
  ///
  /// No hace nada si ya se está cargando o si no queda nada: sin esa guarda, un
  /// desplazamiento rápido dispara la misma página tres veces, se pisan entre
  /// ellas y duplican filas.
  Future<void> cargarMas() async {
    final actual = state.valueOrNull;
    if (actual == null || !actual.hayMas || actual.cargandoMas) return;

    state = AsyncData(actual.copyWith(cargandoMas: true, errorAlCargarMas: null));
    try {
      final siguiente = await ref
          .read(academicRepositoryProvider)
          .studentsPagina(
            subjectId: _materia,
            q: _termino,
            page: actual.pagina + 1,
            limit: kEstudiantesPorPagina,
          );
      state = AsyncData(
        actual.copyWith(
          items: [...actual.items, ...siguiente.items],
          total: siguiente.total,
          hayMas: siguiente.hasMore,
          cargandoMas: false,
          pagina: actual.pagina + 1,
          errorAlCargarMas: null,
        ),
      );
    } catch (error) {
      // La página siguiente falló, pero lo ya cargado sigue siendo válido:
      // mandarlo al estado de error vaciaría una lista que se estaba viendo.
      state = AsyncData(
        actual.copyWith(cargandoMas: false, errorAlCargarMas: error.toString()),
      );
    }
  }

  /// Vuelve a empezar conservando término y materia. Para el «tirar y refrescar».
  Future<void> refrescar() => _reiniciar();
}

final directorioEstudiantesProvider =
    AsyncNotifierProvider<DirectorioNotifier, EstadoDirectorio>(
  DirectorioNotifier.new,
);
