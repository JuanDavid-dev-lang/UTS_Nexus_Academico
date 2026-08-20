import '../../../core/network/api_client.dart';
import '../../../core/storage/offline_cache.dart';

class NotificationsRepository {
  Future<List<Map<String, dynamic>>> list() {
    return listaConCache('notificaciones.lista', () async {
      final response = await ApiClient.instance.get('/notifications');
      final items = (response.data as Map)['items'] as List;
      return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    });
  }

  Future<void> markRead(String id) async {
    await ApiClient.instance.patch('/notifications/$id/read');
  }
}

