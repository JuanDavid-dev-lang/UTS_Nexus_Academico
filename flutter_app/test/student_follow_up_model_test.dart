import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/features/activities/data/activity_models.dart';

void main() {
  test('interpreta el expediente sin recalcular sus indicadores', () {
    final file = StudentFollowUpFile.fromJson({
      'academic': [
        {'subjectName': 'Cálculo', 'period': '2026-1', 'currentGrade': 2.7, 'attendancePercentage': 68, 'risk': {'level': 'MEDIO', 'reasons': ['Bajo rendimiento']}}
      ],
      'followUp': {'open': {'id': '1'}},
      'timeline': {'items': [], 'total': 3},
    });
    expect(file.academic.single.currentGrade, 2.7);
    expect(file.academic.single.riskLevel, 'MEDIO');
    expect(file.hasOpenFollowUp, isTrue);
    expect(file.totalEvents, 3);
  });
}
