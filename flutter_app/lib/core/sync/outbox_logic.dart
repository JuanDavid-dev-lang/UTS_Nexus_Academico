import 'package:dio/dio.dart';

import '../data/models.dart';
import '../network/api_error.dart';
import './outbox_entry.dart';

/// Lógica pura de la bandeja de salida: claves naturales, fusión de cambios,
/// clasificación de fallos, esperas y superposición sobre lo cacheado. Sin
/// disco, sin red y sin reloj propio, para poder fijarla con pruebas.

// ── Claves naturales ─────────────────────────────────────────────────────

/// La misma que usa el backend para decidir si una nota es la misma:
/// (estudiante, materia, periodo, corte, componente, etiqueta).
String claveNota({
  required String studentId,
  required String subjectId,
  required String period,
  required int corte,
  required String componentType,
  required String label,
}) =>
    'grade|$studentId|$subjectId|$period|$corte|$componentType|${label.trim()}';

/// Una clase es (materia, grupo, día). El día va como `AAAA-MM-DD`: la hora no
/// forma parte de la identidad de una clase.
String claveAsistencia({
  required String subjectId,
  String? groupId,
  required DateTime date,
}) => 'att|$subjectId|${groupId ?? "-"}|${claveDia(date)}';

String claveDia(DateTime date) {
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${date.year}-${dos(date.month)}-${dos(date.day)}';
}

// ── Fusión al encolar ────────────────────────────────────────────────────

/// Añade [nueva] a [actual] fusionando lo que habla de lo mismo.
///
/// Reglas:
///  - Una nota nueva para la misma clave **sustituye** a la pendiente anterior,
///    en el sitio de la anterior.
///  - Borrar una nota quita la subida pendiente de esa misma nota. Si la nota
///    ya existe en el servidor (`meta['id']`), además queda el borrado; si solo
///    existía pendiente, no queda nada que enviar.
///  - Una lista de clase nueva sustituye a la pendiente de la misma clase.
///  - Nunca se toca una entrada `enviando`: está en vuelo y cambiarla bajo los
///    pies del envío perdería el cambio nuevo o duplicaría el viejo. La nueva
///    entra detrás y el servidor, que resuelve por clave natural, deja ganar a
///    la última.
List<OutboxEntry> encolar(List<OutboxEntry> actual, OutboxEntry nueva) {
  bool mismaCosa(OutboxEntry e, OutboxKind kind) =>
      e.userId == nueva.userId &&
      e.kind == kind &&
      e.clave == nueva.clave &&
      e.estado != OutboxEstado.enviando;

  switch (nueva.kind) {
    case OutboxKind.gradeUpsert:
    case OutboxKind.attendanceClass:
      final indice = actual.indexWhere((e) => mismaCosa(e, nueva.kind));
      if (indice < 0) return [...actual, nueva];
      final resultado = <OutboxEntry>[];
      for (var i = 0; i < actual.length; i++) {
        if (i == indice) {
          resultado.add(nueva);
        } else if (!mismaCosa(actual[i], nueva.kind)) {
          resultado.add(actual[i]);
        }
      }
      return resultado;

    case OutboxKind.gradeDelete:
      final sinSubida = actual
          .where((e) => !mismaCosa(e, OutboxKind.gradeUpsert))
          .toList();
      final id = nueva.meta['id']?.toString() ?? '';
      // Sin id la nota solo existía en el teléfono: ya no hay nada que enviar.
      if (id.isEmpty) return sinSubida;
      final repetido = sinSubida.any(
        (e) =>
            e.userId == nueva.userId &&
            e.kind == OutboxKind.gradeDelete &&
            e.path == nueva.path,
      );
      if (repetido) return sinSubida;
      return [...sinSubida, nueva];
  }
}

// ── Clasificación de fallos ──────────────────────────────────────────────

/// Un fallo ya reducido a lo que importa para decidir.
class OutboxFallo {
  final ApiErrorKind kind;
  final int? status;
  final String? codigo;
  final String mensaje;
  final Duration? retryAfter;

  const OutboxFallo({
    required this.kind,
    this.status,
    this.codigo,
    required this.mensaje,
    this.retryAfter,
  });

  OutboxError comoError() =>
      OutboxError(status: status, codigo: codigo, mensaje: mensaje);
}

/// Traduce cualquier excepción de una petición a un [OutboxFallo]. Lee del
/// error de Dio el `codigo` del cuerpo y la cabecera `Retry-After`, que
/// `ApiError` no conserva.
OutboxFallo falloDe(Object error) {
  final api = ApiError.from(error);
  String? codigo;
  Duration? retryAfter;
  final causa = api.cause;
  if (causa is DioException) {
    final cuerpo = causa.response?.data;
    if (cuerpo is Map && cuerpo['codigo'] is String) {
      codigo = cuerpo['codigo'] as String;
    }
    final cabecera = causa.response?.headers.value('retry-after');
    final segundos = int.tryParse(cabecera?.trim() ?? '');
    if (segundos != null && segundos > 0) {
      retryAfter = Duration(seconds: segundos);
    }
  }
  return OutboxFallo(
    kind: api.kind,
    status: api.statusCode,
    codigo: codigo,
    mensaje: api.message,
    retryAfter: retryAfter,
  );
}

/// Qué hacer con una entrada tras un fallo.
enum Veredicto {
  /// Cuenta como entregada (borrar algo que ya no existe).
  exito,

  /// Sigue pendiente; se vuelve a intentar más tarde con espera creciente.
  reintentar,

  /// La sesión no vale: se detiene todo sin tocar nada.
  pausarSesion,

  /// Corte bloqueado: pasa al final de la cola por si una anterior lo abre.
  diferir,

  /// El servidor la rechazó y repetirla no cambiará nada.
  fallar,
}

Veredicto decidir(OutboxEntry entrada, OutboxFallo fallo) {
  switch (fallo.kind) {
    case ApiErrorKind.network:
    case ApiErrorKind.timeout:
    case ApiErrorKind.server:
    case ApiErrorKind.rateLimited:
      return Veredicto.reintentar;
    case ApiErrorKind.unauthorized:
      return Veredicto.pausarSesion;
    case ApiErrorKind.notFound:
      return entrada.kind == OutboxKind.gradeDelete
          ? Veredicto.exito
          : Veredicto.fallar;
    case ApiErrorKind.conflict:
      if (fallo.codigo == 'CORTE_BLOQUEADO' && !entrada.diferida) {
        return Veredicto.diferir;
      }
      return Veredicto.fallar;
    case ApiErrorKind.forbidden:
    case ApiErrorKind.validation:
    case ApiErrorKind.unknown:
      return Veredicto.fallar;
  }
}

/// Espera antes del siguiente intento: 5 s, 10, 20… con tope de 5 min, o lo
/// que pida el servidor con `Retry-After` si es más.
Duration esperaTrasFallo(int fallosSeguidos, {Duration? retryAfter}) {
  final n = fallosSeguidos < 1 ? 1 : fallosSeguidos;
  final segundos = 5 * (1 << (n > 7 ? 6 : n - 1));
  final propia = Duration(seconds: segundos > 300 ? 300 : segundos);
  if (retryAfter != null && retryAfter > propia) return retryAfter;
  return propia;
}

// ── Superposición sobre lo cacheado ──────────────────────────────────────

/// Mezcla las notas que llegaron del servidor con los cambios pendientes de un
/// componente, **sin recalcular ningún promedio**: eso es del backend. Lo
/// pendiente se marca para que el docente vea que aún no salió.
List<GradeDetail> fusionarNotas({
  required List<GradeDetail> servidor,
  required Iterable<OutboxEntry> pendientes,
  required String studentId,
  required String subjectId,
  required String period,
  required int corte,
  required String componentType,
}) {
  bool delComponente(OutboxEntry e) =>
      e.estaPendiente &&
      e.meta['studentId']?.toString() == studentId &&
      e.meta['subjectId']?.toString() == subjectId &&
      e.meta['period']?.toString() == period &&
      e.meta['corte']?.toString() == '$corte' &&
      e.meta['componentType']?.toString() == componentType;

  final propias = pendientes.where(delComponente).toList();
  if (propias.isEmpty) return servidor;

  final borrados = {
    for (final e in propias)
      if (e.kind == OutboxKind.gradeDelete) e.meta['id']?.toString() ?? '',
  };
  final subidas = {
    for (final e in propias)
      if (e.kind == OutboxKind.gradeUpsert)
        e.meta['label']?.toString() ?? '': e,
  };

  final resultado = <GradeDetail>[];
  final yaVistas = <String>{};
  for (final nota in servidor) {
    final subida = subidas[nota.label];
    if (borrados.contains(nota.id)) {
      resultado.add(nota.conEstadoLocal(EstadoLocalNota.pendienteBorrado));
    } else if (subida != null) {
      yaVistas.add(nota.label);
      resultado.add(
        GradeDetail(
          id: nota.id,
          label: nota.label,
          score: _numero(subida.meta['score']) ?? nota.score,
          weight: nota.weight,
          local: EstadoLocalNota.pendienteEnvio,
        ),
      );
    } else {
      resultado.add(nota);
    }
  }
  for (final entrada in subidas.entries) {
    if (yaVistas.contains(entrada.key)) continue;
    resultado.add(
      GradeDetail(
        id: 'pendiente:${entrada.value.id}',
        label: entrada.key,
        score: _numero(entrada.value.meta['score']) ?? 0,
        local: EstadoLocalNota.pendienteEnvio,
      ),
    );
  }
  return resultado;
}

double? _numero(Object? valor) =>
    valor is num ? valor.toDouble() : double.tryParse('$valor');

/// Estudiantes de la materia con algún cambio de nota pendiente, para marcar
/// su fila en el consolidado.
Set<String> estudiantesConNotasPendientes(
  Iterable<OutboxEntry> entradas, {
  String? subjectId,
}) => {
  for (final e in entradas)
    if (e.estaPendiente &&
        (e.kind == OutboxKind.gradeUpsert ||
            e.kind == OutboxKind.gradeDelete) &&
        (subjectId == null || e.meta['subjectId']?.toString() == subjectId))
      e.meta['studentId']?.toString() ?? '',
}..remove('');

/// La lista de esa clase que espera salir, si la hay.
OutboxEntry? claseAsistenciaPendiente(
  Iterable<OutboxEntry> entradas, {
  required String subjectId,
  String? groupId,
  required DateTime date,
}) {
  final clave = claveAsistencia(
    subjectId: subjectId,
    groupId: groupId,
    date: date,
  );
  for (final e in entradas) {
    if (e.kind == OutboxKind.attendanceClass &&
        e.clave == clave &&
        e.estaPendiente) {
      return e;
    }
  }
  return null;
}

/// Pasa por encima de [filas] (asistencia cacheada: `studentId`, `present`,
/// `lateMinutes`, `date`…) lo que el docente marcó en la lista pendiente de
/// ese día. Devuelve filas nuevas; no toca las de entrada.
List<Map<String, dynamic>> superponerAsistencia(
  List<Map<String, dynamic>> filas,
  OutboxEntry? clase,
) {
  if (clase == null) return filas;
  final registros = clase.body?['registros'];
  if (registros is! List) return filas;
  final dia = clase.meta['date']?.toString() ?? '';
  final duracion = clase.body?['durationMinutes'];

  final porEstudiante = <String, Map<String, dynamic>>{
    for (final r in registros.whereType<Map>())
      r['studentId'].toString(): Map<String, dynamic>.from(r),
  };
  bool esDelDia(Map<String, dynamic> f) =>
      (f['date']?.toString() ?? '').startsWith(dia);

  final resultado = <Map<String, dynamic>>[];
  final cubiertos = <String>{};
  for (final fila in filas) {
    final id = fila['studentId']?.toString();
    final pendiente = id == null ? null : porEstudiante[id];
    if (pendiente != null && esDelDia(fila)) {
      cubiertos.add(id!);
      resultado.add({
        ...fila,
        'present': pendiente['present'],
        'lateMinutes': pendiente['lateMinutes'],
        'pendiente': true,
      });
    } else {
      resultado.add(fila);
    }
  }
  for (final e in porEstudiante.entries) {
    if (cubiertos.contains(e.key)) continue;
    resultado.add({
      'studentId': e.key,
      'present': e.value['present'],
      'lateMinutes': e.value['lateMinutes'],
      'date': dia,
      'durationMinutes': duracion,
      'pendiente': true,
    });
  }
  return resultado;
}
