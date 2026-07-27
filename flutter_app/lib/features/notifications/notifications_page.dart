import 'package:flutter/material.dart';
import '../../core/services/api_client.dart';
import '../../core/services/notifications_repository.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  bool loading = true;
  List<Map<String, dynamic>> notifications = [];
  List<Map<String, dynamic>> risks = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    final repo = NotificationsRepository();
    final notif = await repo.list();
    final riskResp = await ApiClient.instance.get('/analytics/risks');
    final riskItems = (riskResp.data as Map)['items'] as List;
    setState(() {
      notifications = notif;
      risks = riskItems.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notificaciones')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text('Riesgo académico', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  ...risks.take(8).map(
                        (item) => Card(
                          child: ListTile(
                            leading: Icon(
                              item['level'] == 'HIGH' ? Icons.report : Icons.warning_amber,
                              color: item['level'] == 'HIGH' ? Colors.red : Colors.orange,
                            ),
                            title: Text('${item['fullName'] ?? ''}'),
                            subtitle: Text('Asistencia ${item['attendanceRate'] ?? 0}% • ${item['missed'] ?? 0} faltas'),
                            trailing: Text(item['level']?.toString() ?? ''),
                          ),
                        ),
                      ),
                  const SizedBox(height: 16),
                  Text('Notificaciones', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  ...notifications.map(
                    (item) => Card(
                      child: ListTile(
                        leading: const Icon(Icons.notifications_active_outlined),
                        title: Text(item['title']?.toString() ?? ''),
                        subtitle: Text(item['message']?.toString() ?? ''),
                        trailing: item['readAt'] == null
                            ? const Icon(Icons.circle, size: 10, color: Colors.green)
                            : const Icon(Icons.check),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
