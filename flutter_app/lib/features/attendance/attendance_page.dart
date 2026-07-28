import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/api_client.dart';
import '../../core/services/auth_controller.dart';

class AttendancePage extends ConsumerStatefulWidget {
  const AttendancePage({super.key});

  @override
  ConsumerState<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends ConsumerState<AttendancePage> {
  final _studentSearch = TextEditingController();
  String _period = '2026-1';
  String? _subjectId;
  int _durationMinutes = 90;
  DateTime _date = DateTime.now();
  bool _loading = false;
  List<Map<String, dynamic>> _students = [];
  List<Map<String, dynamic>> _subjects = [];
  List<Map<String, dynamic>> _attendance = [];
  final Map<String, bool> _presentByStudent = {};
  final Map<String, Map<String, dynamic>> _studentById = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final studentsResp = await ApiClient.instance.get('/students');
    final subjectsResp = await ApiClient.instance.get('/subjects');
    final items = (studentsResp.data as Map)['items'] as List;
    final subjects = (subjectsResp.data as Map)['items'] as List;
    final students = items.map((e) => Map<String, dynamic>.from(e as Map)).toList()
      ..sort((a, b) => (a['code'] ?? '').toString().compareTo((b['code'] ?? '').toString()));
    final allSubjects = subjects.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final filteredSubjects = allSubjects.where((s) => s['period']?.toString() == _period).toList();
    final subjectId = _subjectId ?? (filteredSubjects.isNotEmpty ? filteredSubjects.first['_id']?.toString() : null);
    final attendanceResp = await ApiClient.instance.get('/attendance?period=$_period${subjectId != null ? '&subjectId=$subjectId' : ''}');
    final attendanceItems = (attendanceResp.data as Map)['items'] as List;
    final attendance = attendanceItems.map((e) => Map<String, dynamic>.from(e as Map)).toList();

    _students = students;
    _subjects = filteredSubjects;
    _subjectId = subjectId;
    _attendance = attendance;
    _studentById.clear();
    for (final s in students) {
      _studentById[s['_id'].toString()] = s;
      _presentByStudent.putIfAbsent(s['_id'].toString(), () => true);
    }
    for (final row in attendance) {
      final id = row['studentId']?.toString();
      if (id != null) {
        _presentByStudent[id] = row['present'] != false;
      }
    }
    setState(() => _loading = false);
  }

  double get _attendancePercent {
    var total = 0;
    var present = 0;
    for (final row in _attendance) {
      final minutes = int.tryParse(row['durationMinutes']?.toString() ?? '90') ?? 90;
      total += minutes;
      if (row['present'] == true) present += minutes;
    }
    return total == 0 ? 0 : (present / total) * 100;
  }

  Future<void> _save() async {
    if (_subjectId == null) return;
    setState(() => _loading = true);
    final isoDate = DateTime(_date.year, _date.month, _date.day).toIso8601String();
    for (final student in _students) {
      final id = student['_id'].toString();
      await ApiClient.instance.post('/attendance', data: {
        'studentId': id,
        'subjectId': _subjectId,
        'teacherId': ref.read(authControllerProvider).user?.id ?? '',
        'period': _period,
        'date': isoDate,
        'durationMinutes': _durationMinutes,
        'present': _presentByStudent[id] ?? true,
        'notes': '',
      });
    }
    await _load();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Asistencia guardada')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final filteredStudents = _students.where((s) {
      final q = _studentSearch.text.trim().toLowerCase();
      if (q.isEmpty) return true;
      return (s['code'] ?? '').toString().toLowerCase().contains(q) || (s['fullName'] ?? '').toString().toLowerCase().contains(q);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Asistencia'),
        actions: [
          DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _period,
              items: const [
                DropdownMenuItem(value: '2026-1', child: Text('2026-1')),
                DropdownMenuItem(value: '2026-2', child: Text('2026-2')),
              ],
              onChanged: (value) async {
                _period = value ?? '2026-1';
                _subjectId = null;
                await _load();
                setState(() {});
              },
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      _chip('Clases: ${_attendance.length}'),
                      _chip('Asistencia: ${_attendancePercent.toStringAsFixed(1)}%'),
                      _chip('Duración: $_durationMinutes min'),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _subjectId,
                          items: _subjects
                              .map((s) => DropdownMenuItem(
                                    value: s['_id'].toString(),
                                    child: Text('${s['code'] ?? ''} - ${s['name'] ?? ''}'),
                                  ))
                              .toList(),
                          onChanged: (value) async {
                            _subjectId = value;
                            await _load();
                            setState(() {});
                          },
                          decoration: const InputDecoration(labelText: 'Materia'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          initialValue: _durationMinutes,
                          items: const [
                            DropdownMenuItem(value: 90, child: Text('90 min')),
                            DropdownMenuItem(value: 180, child: Text('180 min')),
                          ],
                          onChanged: (value) => setState(() => _durationMinutes = value ?? 90),
                          decoration: const InputDecoration(labelText: 'Duración'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _studentSearch,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(labelText: 'Buscar estudiante'),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Fecha'),
                          subtitle: Text(_date.toIso8601String().split('T').first),
                          trailing: const Icon(Icons.date_range),
                          onTap: () async {
                            final picked = await showDatePicker(
                              context: context,
                              firstDate: DateTime(2020),
                              lastDate: DateTime(2035),
                              initialDate: _date,
                            );
                            if (picked != null) setState(() => _date = picked);
                          },
                        ),
                      ),
                      FilledButton(onPressed: _save, child: const Text('Guardar asistencia')),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ...filteredStudents.map((student) {
                    final id = student['_id'].toString();
                    final present = _presentByStudent[id] ?? true;
                    return Card(
                      child: SwitchListTile(
                        title: Text(student['fullName']?.toString() ?? ''),
                        subtitle: Text('${student['code'] ?? ''} • ${student['program'] ?? ''}'),
                        value: present,
                        onChanged: (value) => setState(() => _presentByStudent[id] = value),
                      ),
                    );
                  }),
                  const SizedBox(height: 16),
                  Text('Historial reciente', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  ..._attendance.take(12).map((row) {
                    final student = _studentById[row['studentId']?.toString()] ?? {};
                    return Card(
                      child: ListTile(
                        leading: Icon(row['present'] == true ? Icons.check_circle : Icons.cancel, color: row['present'] == true ? Colors.green : Colors.red),
                        title: Text(student['fullName']?.toString() ?? 'Estudiante'),
                        subtitle: Text('${row['date']?.toString().split('T').first ?? ''} • ${row['durationMinutes'] ?? 90} min'),
                        trailing: Text(row['present'] == true ? 'Presente' : 'Falta'),
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }

  Widget _chip(String text) {
    return Chip(label: Text(text));
  }
}
