import '../../../core/network/api_client.dart';
import '../../../core/storage/offline_cache.dart';

class ScheduleRepository {
  Future<List<Map<String, dynamic>>> list() {
    return listaConCache('horarios', () async {
      final response = await ApiClient.instance.get('/schedules');
      final items = (response.data as Map)['items'] as List;
      return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    });
  }
}

