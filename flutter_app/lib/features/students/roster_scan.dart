/// Lectura de un listado desde un archivo o una foto, sin Flutter de por medio.
///
/// Mismo contrato de dos pasos que el escritorio
/// (`desktop/src/features/subjects/components/roster-import-dialog.tsx`):
///
///  1. Un CSV/TSV/TXT se lee en el teléfono y cae tal cual en el cuadro de la
///     lista pegada.
///  2. Un XLSX, XLS, PDF o una foto van a `POST /enrollments/import/scan`, que
///     **propone** filas con su confianza y no escribe nada. La propuesta se
///     vuelca como texto en el mismo cuadro, así que pasa por la misma revisión
///     (`parseRoster`) antes de `POST /enrollments/bulk`, que es lo único que
///     escribe.
///
/// Separar proponer de escribir no es ceremonia: una cédula mal reconocida no
/// da error, crea un estudiante que no existe y lo matricula.
library;

/// Por debajo de esto una fila leída se señala como dudosa. Es el mismo umbral
/// del escritorio.
const umbralConfianzaDudosa = 0.7;

/// Tope del archivo: el mismo `fileSize` del multer de la ruta (12 MB). Por
/// encima el servidor lo rechaza después de haberlo subido entero por el wifi
/// del aula; aquí se dice antes.
const tamanoMaximoListado = 12 * 1024 * 1024;

/// Qué se hace con un archivo según su nombre.
enum DestinoArchivoListado {
  /// Texto delimitado: se lee en el teléfono.
  local,

  /// Hoja de cálculo, PDF o imagen: lo interpreta el servidor.
  servidor,

  /// Nada de lo anterior: se rechaza sin subirlo.
  noAdmitido,
}

const _extensionesLocales = {'csv', 'tsv', 'txt'};

/// Tipo declarado de cada extensión que acepta el escáner del servidor
/// (`ENTRADA_DE_ESCANER` en `backend/src/shared/uploads.ts`). El multer de la
/// ruta descarta por `mimetype` **antes** de leer el cuerpo, así que un
/// `application/octet-stream` sería un 400 aunque el archivo fuera bueno. Lo
/// que decide de verdad sigue siendo la firma del contenido, en el servidor.
const tiposDelEscaner = <String, String>{
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'pdf': 'application/pdf',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/// Extensiones que ofrece el selector de archivos (las fotos van por la
/// cámara o la galería, no por aquí).
const extensionesDelSelector = ['csv', 'tsv', 'txt', 'xlsx', 'xls', 'pdf'];

String extensionDe(String nombre) {
  final punto = nombre.lastIndexOf('.');
  if (punto < 0 || punto == nombre.length - 1) return '';
  return nombre.substring(punto + 1).toLowerCase();
}

DestinoArchivoListado destinoDeArchivo(String nombre) {
  final extension = extensionDe(nombre);
  if (_extensionesLocales.contains(extension)) {
    return DestinoArchivoListado.local;
  }
  if (tiposDelEscaner.containsKey(extension)) {
    return DestinoArchivoListado.servidor;
  }
  return DestinoArchivoListado.noAdmitido;
}

/// El `mimetype` con el que se sube, o null si el servidor no lo aceptaría.
String? tipoParaSubir(String nombre) => tiposDelEscaner[extensionDe(nombre)];

/// Una fila que el servidor creyó leer.
class FilaPropuesta {
  final String code;
  final String fullName;
  final String? email;
  final String? program;
  final double confianza;
  final List<String> avisos;

  const FilaPropuesta({
    required this.code,
    required this.fullName,
    this.email,
    this.program,
    required this.confianza,
    this.avisos = const [],
  });

  bool get dudosa => confianza < umbralConfianzaDudosa;

  /// Cómo se nombra en el aviso de dudosas.
  String get etiqueta {
    if (fullName.trim().isNotEmpty) return fullName.trim();
    if (code.trim().isNotEmpty) return code.trim();
    return 'fila sin datos';
  }

  factory FilaPropuesta.fromJson(Map<String, dynamic> json) {
    String? opcional(Object? valor) {
      final texto = valor?.toString().trim() ?? '';
      return texto.isEmpty ? null : texto;
    }

    final confianza = json['confianza'];
    return FilaPropuesta(
      code: json['code']?.toString().trim() ?? '',
      fullName: json['fullName']?.toString().trim() ?? '',
      email: opcional(json['email']),
      program: opcional(json['program']),
      // Sin confianza se trata como dudosa: no hay nada que la avale.
      confianza: confianza is num ? confianza.toDouble() : 0,
      avisos: json['avisos'] is List
          ? (json['avisos'] as List).map((a) => a.toString()).toList()
          : const [],
    );
  }
}

/// La respuesta de `POST /enrollments/import/scan`.
class PropuestaDeListado {
  /// `excel`, `pdf-texto`, `imagen`…: lo dice el servidor.
  final String origen;
  final List<String> avisos;
  final List<FilaPropuesta> filas;

  const PropuestaDeListado({
    required this.origen,
    required this.avisos,
    required this.filas,
  });

  factory PropuestaDeListado.fromJson(Map<String, dynamic> json) {
    final filas = json['filas'];
    final avisos = json['avisos'];
    return PropuestaDeListado(
      origen: json['origen']?.toString() ?? '',
      avisos: avisos is List
          ? avisos.map((a) => a.toString()).toList()
          : const [],
      filas: filas is List
          ? filas
                .whereType<Map>()
                .map((f) => FilaPropuesta.fromJson(Map<String, dynamic>.from(f)))
                .toList()
          : const [],
    );
  }

  List<FilaPropuesta> get dudosas => filas.where((f) => f.dudosa).toList();

  /// La propuesta como lista pegada: `documento;nombre;correo;programa` por
  /// línea. Sin marcas dentro de la línea: `parseRoster` divide por
  /// delimitador y cualquier anotación acabaría dentro del programa del último
  /// estudiante. Las dudosas se nombran en el resumen, donde no estorban.
  String comoTexto() => filas
      .map(
        (f) => [
          f.code,
          f.fullName,
          f.email ?? '',
          f.program ?? '',
        ].where((campo) => campo.isNotEmpty).map(_sinDelimitador).join(';'),
      )
      .join('\n');

  /// Lo que se le dice al docente al volcar la lectura.
  String resumen() {
    final total = filas.length;
    if (total == 0) {
      return 'No se encontró ningún estudiante en el archivo. Revísalo o '
          'pega la lista como texto.';
    }
    final leidas = '$total ${total == 1 ? 'fila leída' : 'filas leídas'}';
    final dudosas = this.dudosas;
    if (dudosas.isEmpty) {
      return origen == 'pdf-texto'
          ? '$leidas. El PDF traía texto, así que no hubo reconocimiento que '
                'pueda fallar. Revisa la lista antes de matricular.'
          : '$leidas. Revisa la lista antes de matricular.';
    }
    final nombres = dudosas.take(3).map((f) => f.etiqueta).join(', ');
    final mas = dudosas.length > 3 ? '…' : '';
    return '$leidas, ${dudosas.length} dudosas: revisa $nombres$mas antes de '
        'matricular.';
  }
}

/// Qué decir cuando la lectura falla.
///
/// El 503 de esta ruta es el servicio de lectura caído, no el backend: el
/// texto genérico de un 5xx («el servidor tuvo un problema») mandaría a
/// reintentar algo que no va a cambiar, cuando lo útil es pegar la lista. Sin
/// respuesta (red o tiempo de espera) se dice que leer necesita conexión. El
/// resto —un 400 por tipo de archivo, un 422 con el motivo— llega con su
/// mensaje.
String mensajeDeFalloDeLectura({
  required int? status,
  required bool sinRespuesta,
  required String mensaje,
}) {
  if (sinRespuesta) {
    return 'Leer un archivo necesita conexión con el servidor. Puedes pegar '
        'la lista como texto, o intentarlo cuando vuelva la conexión.';
  }
  if (status == 503) {
    return 'El servicio de lectura no está disponible. Puedes pegar la lista '
        'como texto mientras tanto.';
  }
  return mensaje;
}

/// Un `;` dentro de un nombre partiría la línea en otra columna.
String _sinDelimitador(String campo) => campo.replaceAll(';', ' ').trim();
