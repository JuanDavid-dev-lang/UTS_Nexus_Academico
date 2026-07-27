import 'dart:io';

class BackendBootstrap {
  static Future<bool> ensureRunning({Duration timeout = const Duration(seconds: 12)}) async {
    if (!Platform.isWindows && !Platform.isLinux && !Platform.isMacOS) {
      return true;
    }

    if (await _isHealthy()) {
      return true;
    }

    final server = _resolveServerFile();
    if (server == null || !server.existsSync()) {
      return false;
    }

    final node = _resolveNodeExe();
    if (node == null || !node.existsSync()) {
      return false;
    }

    try {
      await Process.start(
        node.path,
        [server.path],
        workingDirectory: server.parent.parent.path,
        mode: ProcessStartMode.detached,
      );
    } catch (_) {
      return false;
    }

    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      if (await _isHealthy()) {
        return true;
      }
      await Future.delayed(const Duration(milliseconds: 700));
    }
    return false;
  }

  static Future<bool> _isHealthy() async {
    try {
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 2);
      final request = await client.getUrl(Uri.parse('http://127.0.0.1:4000/health'));
      final response = await request.close();
      client.close(force: true);
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (_) {
      return false;
    }
  }

  static File? _resolveServerFile() {
    var dir = Directory.current;
    for (var i = 0; i < 8; i++) {
      final candidate = File('${dir.path}${Platform.pathSeparator}backend${Platform.pathSeparator}dist${Platform.pathSeparator}server.js');
      if (candidate.existsSync()) return candidate;
      if (dir.parent.path == dir.path) break;
      dir = dir.parent;
    }
    return null;
  }

  static File? _resolveNodeExe() {
    final candidates = <String>[
      r'C:\Program Files\nodejs\node.exe',
      r'C:\Program Files (x86)\nodejs\node.exe',
    ];
    for (final path in candidates) {
      final file = File(path);
      if (file.existsSync()) return file;
    }
    return null;
  }
}
