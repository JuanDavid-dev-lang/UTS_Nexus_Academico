import '../../../core/network/api_client.dart';

class NotificationsRepository {
  Future<List<Map<String, dynamic>>> list() async {
    final response = await ApiClient.instance.get('/notifications');
    final items = (response.data as Map)['items'] as List;
    return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> markRead(String id) async {
    await ApiClient.instance.patch('/notifications/$id/read');
  }
}

