class DashboardSummary {
  final int totalStudents;
  final int totalSubjects;
  final double averageGrade;
  final double averageAttendance;
  final int approvedStudents;
  final int failedStudents;
  final int riskStudents;
  final int criticalSubjects;

  DashboardSummary({
    required this.totalStudents,
    required this.totalSubjects,
    required this.averageGrade,
    required this.averageAttendance,
    required this.approvedStudents,
    required this.failedStudents,
    required this.riskStudents,
    required this.criticalSubjects,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> json) {
    final s = Map<String, dynamic>.from(json['summary'] as Map);
    return DashboardSummary(
      totalStudents: (s['totalStudents'] ?? 0) as int,
      totalSubjects: (s['totalSubjects'] ?? 0) as int,
      averageGrade: (s['averageGrade'] ?? 0).toDouble(),
      averageAttendance: (s['averageAttendance'] ?? 0).toDouble(),
      approvedStudents: (s['approvedStudents'] ?? 0) as int,
      failedStudents: (s['failedStudents'] ?? 0) as int,
      riskStudents: (s['riskStudents'] ?? 0) as int,
      criticalSubjects: (s['criticalSubjects'] ?? 0) as int,
    );
  }
}
