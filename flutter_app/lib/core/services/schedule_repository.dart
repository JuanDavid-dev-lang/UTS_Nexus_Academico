import 'api_client.dart';

class ScheduleRepository {
  Future<List<Map<String, dynamic>>> list() async {
    final response = await ApiClient.instance.get('/schedules');
    final items = (response.data as Map)['items'] as List;
    return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }
}

