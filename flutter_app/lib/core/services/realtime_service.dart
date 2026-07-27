import 'package:socket_io_client/socket_io_client.dart' as io;
import 'dart:async';
import '../config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class RealtimeService {
  RealtimeService._();
  static final instance = RealtimeService._();

  io.Socket? _socket;
  final StreamController<Map<String, dynamic>> _events =
      StreamController.broadcast();
  String _wsBaseUrl = AppConfig.defaultWsBaseUrl;

  Stream<Map<String, dynamic>> get events => _events.stream;

  void setBaseUrl(String baseUrl) {
    _wsBaseUrl = AppConfig.normalizeWsBaseUrl(baseUrl);
  }

  void connect({required String token}) {
    _socket?.dispose();
    _socket = io.io(
      _wsBaseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          // El backend valida el JWT en el handshake (auth.token) y agrupa por salas.
          .setAuth({'token': token})
          .setExtraHeaders({'Authorization': 'Bearer $token'})
          .build(),
    );
    _socket?.onConnect((_) {});
    _socket?.on('sync:update', (data) {
      if (data is Map) {
        _events.add(Map<String, dynamic>.from(data));
      }
    });
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}

final realtimeEventsProvider = StreamProvider<Map<String, dynamic>>((ref) {
  return RealtimeService.instance.events;
});
