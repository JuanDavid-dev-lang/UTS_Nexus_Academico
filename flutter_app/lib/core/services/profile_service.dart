import 'package:dio/dio.dart';

import 'api_client.dart';

/// Perfil propio del docente.
///
/// Va contra `/professors/me` y no contra `/professors/:id`: en la ruta por id
/// el servidor tendría que confiar en que el cliente manda su propio
/// identificador, y esa confianza es justo lo que no debe existir.
class Profile {
  final String id;
  final String title;
  final String department;
  final String? photoUrl;
  final String? sede;
  final String? facultad;

  /// Abre la sección de trabajos de grado. Lo activa la administración.
  final bool esDirectorTrabajoGrado;

  const Profile({
    required this.id,
    required this.title,
    required this.department,
    this.photoUrl,
    this.sede,
    this.facultad,
    this.esDirectorTrabajoGrado = false,
  });

  factory Profile.fromJson(Map<String, dynamic> json) => Profile(
        id: json['_id']?.toString() ?? '',
        title: json['title']?.toString() ?? 'Docente',
        department: json['department']?.toString() ?? 'UTS',
        photoUrl: json['photoUrl']?.toString(),
        sede: json['sede']?.toString(),
        facultad: json['facultad']?.toString(),
        esDirectorTrabajoGrado: json['esDirectorTrabajoGrado'] == true,
      );
}

class ProfileService {
  final ApiClient _api;
  ProfileService([ApiClient? api]) : _api = api ?? ApiClient.instance;

  Future<Profile> me() async {
    final response = await _api.get('/professors/me');
    return Profile.fromJson(
      Map<String, dynamic>.from((response.data as Map)['item'] as Map),
    );
  }

  Future<Profile> update({
    String? fullName,
    String? title,
    String? department,
    String? photoUrl,
  }) async {
    final response = await _api.patch('/professors/me', data: {
      if (fullName != null) 'fullName': fullName,
      if (title != null) 'title': title,
      if (department != null) 'department': department,
      if (photoUrl != null) 'photoUrl': photoUrl,
    });
    return Profile.fromJson(
      Map<String, dynamic>.from((response.data as Map)['item'] as Map),
    );
  }

  /// Sube una imagen y devuelve la ruta con la que el servidor la sirve.
  ///
  /// Va por `dio` directamente con `FormData` porque el interceptor del cliente
  /// no debe fijar el `Content-Type`: el `boundary` del multipart lo pone dio y
  /// escribirlo a mano rompe el envío.
  Future<String> uploadImage(String filePath) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
    });
    final response = await _api.dio.post<Map<String, dynamic>>(
      '/uploads/image',
      data: form,
    );
    return (response.data?['file'] as Map)['url'].toString();
  }
}
