class AuthUser {
  final String id;
  final String email;
  final String role;
  final String fullName;
  final String? photoUrl;

  /// Falta ver el aviso de uso y privacidad vigente (`/auth/me`). Un servidor
  /// anterior no manda el campo: entonces no hay aviso que enseñar.
  final bool avisoUsoPendiente;

  AuthUser({
    required this.id,
    required this.email,
    required this.role,
    required this.fullName,
    this.photoUrl,
    this.avisoUsoPendiente = false,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['_id']?.toString() ?? json['id'].toString(),
        email: json['email'] ?? '',
        role: json['role'] ?? 'PROFESSOR',
        fullName: json['fullName'] ?? '',
        photoUrl: json['photoUrl']?.toString(),
        avisoUsoPendiente: json['avisoUsoPendiente'] == true,
      );
}
