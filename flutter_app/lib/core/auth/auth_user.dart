class AuthUser {
  final String id;
  final String email;
  final String role;
  final String fullName;
  final String? photoUrl;

  AuthUser({required this.id, required this.email, required this.role, required this.fullName, this.photoUrl});

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['_id']?.toString() ?? json['id'].toString(),
        email: json['email'] ?? '',
        role: json['role'] ?? 'PROFESSOR',
        fullName: json['fullName'] ?? '',
        photoUrl: json['photoUrl']?.toString(),
      );
}

