import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/network/realtime_service.dart';
import 'package:uts_academico/features/ai/ai_service.dart';

/// El chat mandaba el historial completo y el backend lo valida con `.max(20)`.
/// A partir de la pregunta 11 la petición se rechazaba con un 400 y el
/// asistente dejaba de responder, sin que el mensaje de error mencionara el
/// historial.
///
/// Es el fallo que vuelve solo: quitar el recorte no rompe nada visible hasta
/// la undécima pregunta, que ninguna prueba manual llega a hacer.
void main() {
  List<String> conversacion(int n) => List.generate(n, (i) => 'm$i');

  group('historialParaEnviar', () {
    test('deja pasar una conversación corta sin tocarla', () {
      final mensajes = conversacion(6);
      expect(historialParaEnviar(mensajes), mensajes);
    });

    test('nunca supera el tope que valida el backend', () {
      expect(historialParaEnviar(conversacion(200)).length, kTopeHistorial);
    });

    test('conserva los mensajes recientes, no los primeros', () {
      // Lo que da contexto a la pregunta actual es lo último que se dijo.
      final recortado = historialParaEnviar(conversacion(30));
      expect(recortado.first, 'm10');
      expect(recortado.last, 'm29');
    });

    test('en el límite exacto no recorta nada', () {
      final mensajes = conversacion(kTopeHistorial);
      expect(historialParaEnviar(mensajes), mensajes);
    });

    test('una conversación vacía no falla', () {
      expect(historialParaEnviar(<String>[]), isEmpty);
    });
  });

  /// El socket se suelta al pasar a segundo plano. Lo que no puede pasar es que
  /// `reanudar()` abra una conexión que nadie pidió: sin sesión iniciada no hay
  /// token, y el backend rechazaría el handshake una y otra vez.
  group('pausa del tiempo real', () {
    test('pausar sin conexión no deja nada a medias', () {
      final servicio = RealtimeService.instance;
      servicio.pausar();
      expect(servicio.estadoActual, RealtimeStatus.disconnected);
    });

    test('reanudar sin haber pausado no conecta nada', () {
      final servicio = RealtimeService.instance;
      servicio.reanudar();
      expect(servicio.estadoActual, RealtimeStatus.disconnected);
    });
  });
}
